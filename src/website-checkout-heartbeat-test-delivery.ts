import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import type { Pool } from 'pg';
import { z } from 'zod';

import {
  paymentScopeFingerprint,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';
import {
  ProjectionAcceptanceUncertainError,
  deliverProjection,
  projectionHash,
  type ExistingProjectionEffect,
  type ProjectionEnvelope,
  type ProviderProjectionDriver,
} from './student-enrollment-projection.js';
import {
  PgProjectionDeliveryLedger,
  claimProjection,
  queueProjection,
  readProjectionState,
} from './student-enrollment-projection-store.js';
import type { WebsiteCheckoutEnrollmentResult } from './website-checkout-enrollment-adapter.js';

const uuid = z.uuid();
const email = z.email().transform((value) => value.trim().toLowerCase());
const toolResult = z
  .object({ ok: z.literal(true), data: z.unknown() })
  .strict();
const userSchema = z
  .object({
    id: uuid,
    email,
    groups: z
      .array(z.object({ id: uuid, name: z.string().optional() }).passthrough())
      .max(500),
  })
  .passthrough();

export interface HeartbeatTestAccessConfig {
  enabled: boolean;
  email: string;
  userId: string;
  groupId: string;
  courseId: string;
  cohortId: string;
}

export interface HeartbeatToolboxRunner {
  run(
    tool:
      | 'heartbeat/find-user'
      | 'heartbeat/get-user'
      | 'heartbeat/create-user'
      | 'heartbeat/add-to-group',
    args: readonly string[],
  ): Promise<unknown>;
}

export function holdDisabledHeartbeatTestDelivery(
  enrollment: WebsiteCheckoutEnrollmentResult,
): WebsiteCheckoutEnrollmentResult {
  if (
    enrollment.canonicalEnrollment !== 'materialized' ||
    !['accepted', 'duplicate'].includes(enrollment.disposition)
  )
    return enrollment;
  return {
    ...enrollment,
    accessDelivery: 'held',
    reasons: [
      ...new Set([
        ...enrollment.reasons,
        'heartbeat_membership_delivery_disabled',
      ]),
    ],
  };
}

/** Registered toolbox CLI only; it inherits the bizmgr environment without reading it. */
export class RegisteredHeartbeatToolboxRunner implements HeartbeatToolboxRunner {
  async run(
    tool:
      | 'heartbeat/find-user'
      | 'heartbeat/get-user'
      | 'heartbeat/create-user'
      | 'heartbeat/add-to-group',
    args: readonly string[],
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        '/Users/xbohdpukc/dev/toolbox/bin/tool',
        ['run', tool, '--json', '--', ...args],
        {
          cwd: '/Users/xbohdpukc/dev/bizmgr',
          env: process.env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderrBytes = 0;
      let hardKill: NodeJS.Timeout | undefined;
      const terminate = () => {
        if (!child.pid) return;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          return;
        }
        hardKill = setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            /* process group already exited */
          }
        }, 1000);
        hardKill.unref();
      };
      const timer = setTimeout(terminate, 30000);
      timer.unref();
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (Buffer.byteLength(stdout) > 256 * 1024) terminate();
      });
      child.stderr.on('data', (chunk) => {
        stderrBytes += Buffer.byteLength(chunk);
        if (stderrBytes > 64 * 1024) terminate();
      });
      child.once('error', () => {
        clearTimeout(timer);
        if (hardKill) clearTimeout(hardKill);
        reject(new Error('heartbeat_toolbox_unavailable'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (hardKill) clearTimeout(hardKill);
        if (code !== 0) return reject(new Error('heartbeat_toolbox_failed'));
        try {
          resolve(toolResult.parse(JSON.parse(stdout)).data);
        } catch {
          reject(new Error('heartbeat_toolbox_invalid_response'));
        }
      });
    });
  }
}

function operationId(config: HeartbeatTestAccessConfig): string {
  return `heartbeat:main:user:${config.userId}:group:${config.groupId}`;
}

function expected(config: HeartbeatTestAccessConfig, partyId: string) {
  return {
    schemaVersion: 1,
    kind: 'heartbeat_test_membership',
    participantPartyId: partyId,
    participantEmailSha256: createHash('sha256')
      .update(config.email)
      .digest('hex'),
    heartbeatUserId: config.userId,
    groupId: config.groupId,
    courseId: config.courseId,
    cohortId: config.cohortId,
    membership: 'verified',
    learnerLoginProof: 'not_verified',
  };
}

class HeartbeatTestMembershipDriver implements ProviderProjectionDriver {
  readonly target = 'heartbeat' as const;
  constructor(
    private readonly config: HeartbeatTestAccessConfig,
    private readonly toolbox: HeartbeatToolboxRunner,
    private readonly verifyCanonicalIdentity: () => Promise<void>,
  ) {}

  private async user() {
    await this.verifyCanonicalIdentity();
    const value = await this.toolbox.run('heartbeat/get-user', [
      '--user-id',
      this.config.userId,
      '--instance',
      'main',
    ]);
    const user = userSchema.parse(value);
    if (user.id !== this.config.userId || user.email !== this.config.email)
      throw new Error('heartbeat_test_identity_conflict');
    return user;
  }

  private hasGroup(user: z.infer<typeof userSchema>): boolean {
    return user.groups.some((group) => group.id === this.config.groupId);
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    destinationKey: string,
  ): Promise<ExistingProjectionEffect | null> {
    if (
      idempotencyKey.length < 1 ||
      destinationKey !== `heartbeat:main:group:${this.config.groupId}`
    )
      throw new Error('heartbeat_test_destination_conflict');
    return this.hasGroup(await this.user())
      ? { operationId: operationId(this.config) }
      : null;
  }

  async apply(): Promise<{ operationId: string }> {
    if (this.hasGroup(await this.user()))
      return { operationId: operationId(this.config) };
    try {
      await this.toolbox.run('heartbeat/add-to-group', [
        '--group-id',
        this.config.groupId,
        '--emails',
        this.config.email,
        '--instance',
        'main',
      ]);
    } catch {
      throw new ProjectionAcceptanceUncertainError();
    }
    return { operationId: operationId(this.config) };
  }

  async readback(envelope: ProjectionEnvelope): Promise<unknown> {
    const user = await this.user();
    return {
      ...envelope.expectedReadback,
      membership: this.hasGroup(user) ? 'verified' : 'absent',
    };
  }

  async rollback(): Promise<void> {
    throw new Error('heartbeat_test_membership_rollback_not_authorized');
  }
}

export class WebsiteCheckoutHeartbeatTestDelivery {
  private readonly scopeHash: string;
  private readonly config: HeartbeatTestAccessConfig;

  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly caller: string,
    scope: PaymentScope,
    config: HeartbeatTestAccessConfig,
    private readonly toolbox: HeartbeatToolboxRunner,
  ) {
    const parsed = z
      .object({
        enabled: z.literal(true),
        email: z.literal('test@tandemcoach.co'),
        userId: z.literal('97f4285a-18d4-44a9-961d-17e582aa278f'),
        groupId: z.literal('4c54983c-0e7b-4dd0-aebc-0f0cb1c82298'),
        courseId: z.literal('abd312e4-b01a-4718-8918-f79d081753c0'),
        cohortId: z.literal('f2a36eca-a017-4536-9b83-368f51219895'),
      })
      .strict()
      .safeParse(config);
    if (
      !parsed.success ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      scope.environment !== 'test' ||
      scope.provider !== 'adyen' ||
      scope.store === null ||
      !pool ||
      !toolbox
    )
      throw new PaymentDomainError(
        'invalid_heartbeat_test_delivery_configuration',
      );
    this.scopeHash = paymentScopeFingerprint(scope);
    this.config = Object.freeze(parsed.data);
  }

  private async verifyCanonicalIdentity(
    enrollmentKey: string,
    partyId: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const current = await client.query(
        `SELECT lower(p.primary_email::text) primary_email
         FROM business_v2.student_enrollments_v2 e
         JOIN business_v2.parties p
           ON p.id=e.participant_party_id AND p.merged_into IS NULL
         WHERE e.enrollment_key=$1 AND e.participant_party_id=$2
           AND e.state='active'`,
        [enrollmentKey, partyId],
      );
      if (
        current.rowCount !== 1 ||
        current.rows[0].primary_email !== this.config.email
      )
        throw new PaymentDomainError('heartbeat_test_participant_denied');
    } finally {
      client.release();
    }
  }

  async deliver(
    attemptId: string,
    enrollment: WebsiteCheckoutEnrollmentResult,
  ): Promise<WebsiteCheckoutEnrollmentResult> {
    if (
      enrollment.canonicalEnrollment !== 'materialized' ||
      !['accepted', 'duplicate'].includes(enrollment.disposition)
    )
      return enrollment;
    const client = await this.pool.connect();
    let row: {
      enrollment_key: string;
      version: number;
      participant_party_id: string;
      primary_email: string;
    };
    try {
      const result = await client.query(
        `SELECT e.enrollment_key,e.version,e.participant_party_id::text,
          lower(p.primary_email::text) primary_email
         FROM business_v2.payment_enrollment_admissions a
         JOIN business_v2.student_enrollments_v2 e
           ON e.enrollment_key=a.enrollment_key AND e.state='active'
         JOIN business_v2.parties p
           ON p.id=e.participant_party_id AND p.merged_into IS NULL
         WHERE a.scope_sha256=$1 AND a.checkout_caller=$2 AND a.attempt_id=$3`,
        [this.scopeHash, this.caller, attemptId],
      );
      if (result.rowCount !== 1)
        throw new PaymentDomainError(
          'heartbeat_test_enrollment_identity_missing',
        );
      row = result.rows[0];
    } finally {
      client.release();
    }
    if (row.primary_email !== this.config.email)
      throw new PaymentDomainError('heartbeat_test_participant_denied');
    const payload = expected(this.config, row.participant_party_id);
    const driver = new HeartbeatTestMembershipDriver(
      this.config,
      this.toolbox,
      () =>
        this.verifyCanonicalIdentity(
          row.enrollment_key,
          row.participant_party_id,
        ),
    );
    const envelope: ProjectionEnvelope = {
      target: 'heartbeat',
      subjectType: 'enrollment',
      subjectKey: row.enrollment_key,
      subjectVersion: row.version,
      destinationKey: `heartbeat:main:group:${this.config.groupId}`,
      idempotencyKey: `website_checkout_heartbeat_test:${row.enrollment_key}:${this.config.groupId}`,
      payload,
      payloadSha256: projectionHash(payload),
      expectedReadback: payload,
      expectedReadbackSha256: projectionHash(payload),
    };
    const now = new Date().toISOString();
    try {
      await queueProjection(this.pool, envelope, now);
    } catch {
      throw new PaymentDomainError('heartbeat_test_projection_queue_failed');
    }
    let claimed;
    try {
      claimed = await claimProjection(
        this.pool,
        envelope,
        now,
        new Date(Date.now() + 30000).toISOString(),
        true,
      );
    } catch {
      throw new PaymentDomainError('heartbeat_test_projection_claim_failed');
    }
    if (claimed) {
      try {
        await deliverProjection(
          claimed.envelope,
          driver,
          new PgProjectionDeliveryLedger(
            this.pool,
            claimed.leaseToken,
            'website_checkout_heartbeat_test',
          ),
        );
      } catch {
        throw new PaymentDomainError(
          'heartbeat_test_projection_delivery_failed',
        );
      }
    }
    let projection;
    try {
      projection = await readProjectionState(this.pool, envelope);
    } catch {
      throw new PaymentDomainError('heartbeat_test_projection_readback_failed');
    }
    const accessDelivery =
      projection.state === 'verified'
        ? 'membership_verified'
        : projection.state === 'held'
          ? 'held'
          : 'queued';
    const accessReason =
      accessDelivery === 'membership_verified'
        ? 'heartbeat_membership_verified'
        : accessDelivery === 'queued'
          ? 'heartbeat_membership_delivery_queued'
          : projection.lastErrorCode === 'provider_acceptance_uncertain'
            ? 'heartbeat_membership_acceptance_uncertain'
            : projection.lastErrorCode === 'provider_readback_unavailable'
              ? 'heartbeat_membership_readback_unavailable'
              : projection.lastErrorCode === 'exact_readback_mismatch'
                ? 'heartbeat_membership_readback_mismatch'
                : 'heartbeat_membership_delivery_held';
    return {
      ...enrollment,
      accessDelivery,
      reasons: [...new Set([...enrollment.reasons, accessReason])],
    };
  }
}
