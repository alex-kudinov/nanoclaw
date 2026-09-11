import { createHash } from 'node:crypto';

import type { Pool } from 'pg';
import { z } from 'zod';

import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentMethodBinding } from './payment-method-reconciliation-store.js';
import { decidePaymentReadiness } from './payment-readiness.js';
import type { PaymentTransaction } from './payment-store.js';
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
  type ProjectionDatabaseGuard,
} from './student-enrollment-projection-store.js';
import type { WebsiteCheckoutEnrollmentResult } from './website-checkout-enrollment-adapter.js';

export const LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID =
  '4c54983c-0e7b-4dd0-aebc-0f0cb1c82298';
export const LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID =
  'abd312e4-b01a-4718-8918-f79d081753c0';
export const LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID =
  'f2a36eca-a017-4536-9b83-368f51219895';

const uuid = z.uuid();
const normalizedEmail = z
  .email()
  .transform((value) => value.trim().toLowerCase());
const foundUserSchema = z
  .object({
    id: uuid,
    email: normalizedEmail,
    name: z.string().min(1).max(300),
    role: z.string().min(1).max(100),
  })
  .passthrough();
const exactUserSchema = z
  .object({
    id: uuid,
    email: normalizedEmail,
    groups: z
      .array(z.object({ id: uuid, name: z.string().optional() }).passthrough())
      .max(500),
  })
  .passthrough();

export interface HeartbeatLiveAccessConfig {
  enabled: true;
  groupId: typeof LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID;
  courseId: typeof LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID;
  cohortId: typeof LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID;
  cardCaptureConfigurationEvidence: string;
}

export interface HeartbeatLiveToolboxRunner {
  run(
    tool:
      | 'heartbeat/find-user'
      | 'heartbeat/get-user'
      | 'heartbeat/create-user'
      | 'heartbeat/add-to-group',
    args: readonly string[],
  ): Promise<unknown>;
}

export type HeartbeatLiveEnrollmentAuthority = {
  enrollmentKey: string;
  enrollmentVersion: number;
  participantPartyId: string;
  email: string;
  name: string;
};

function held(
  enrollment: WebsiteCheckoutEnrollmentResult,
  reason: string,
): WebsiteCheckoutEnrollmentResult {
  return {
    ...enrollment,
    accessDelivery: 'held',
    reasons: [...new Set([...enrollment.reasons, reason])],
  };
}

export class HeartbeatLiveMembershipDriver implements ProviderProjectionDriver {
  readonly target = 'heartbeat' as const;

  constructor(
    private readonly authority: HeartbeatLiveEnrollmentAuthority,
    private readonly config: HeartbeatLiveAccessConfig,
    private readonly toolbox: HeartbeatLiveToolboxRunner,
    private readonly verifyAuthority: () => Promise<HeartbeatLiveEnrollmentAuthority>,
  ) {}

  private async find() {
    const current = await this.verifyAuthority();
    if (
      current.enrollmentKey !== this.authority.enrollmentKey ||
      current.participantPartyId !== this.authority.participantPartyId ||
      current.email !== this.authority.email
    )
      throw new Error('heartbeat_live_canonical_identity_changed');
    const value = await this.toolbox.run('heartbeat/find-user', [
      '--email',
      this.authority.email,
      '--instance',
      'main',
    ]);
    const users = z.array(foundUserSchema).max(2).parse(value);
    if (
      users.length > 1 ||
      users.some((user) => user.email !== this.authority.email)
    )
      throw new Error('heartbeat_live_identity_conflict');
    return users[0] ?? null;
  }

  private async exact(userId: string) {
    await this.verifyAuthority();
    const value = await this.toolbox.run('heartbeat/get-user', [
      '--user-id',
      userId,
      '--instance',
      'main',
    ]);
    const user = exactUserSchema.parse(value);
    if (user.id !== userId || user.email !== this.authority.email)
      throw new Error('heartbeat_live_identity_conflict');
    return user;
  }

  private hasGroup(user: z.infer<typeof exactUserSchema>): boolean {
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
      throw new Error('heartbeat_live_destination_conflict');
    const found = await this.find();
    if (!found) return null;
    const exact = await this.exact(found.id);
    return this.hasGroup(exact)
      ? {
          operationId: `heartbeat:main:user:${exact.id}:group:${this.config.groupId}`,
        }
      : null;
  }

  async apply(): Promise<{ operationId: string }> {
    let found = await this.find();
    let providerWriteMayHaveSucceeded = false;
    if (!found) {
      try {
        await this.verifyAuthority();
        const created = foundUserSchema.parse(
          await this.toolbox.run('heartbeat/create-user', [
            '--email',
            this.authority.email,
            '--name',
            this.authority.name,
            '--role',
            'User',
            '--group-ids',
            this.config.groupId,
            '--instance',
            'main',
          ]),
        );
        providerWriteMayHaveSucceeded = true;
        if (created.email !== this.authority.email)
          throw new Error('heartbeat_live_identity_conflict');
        found = created;
      } catch {
        throw new ProjectionAcceptanceUncertainError();
      }
    }
    try {
      let exact = await this.exact(found.id);
      if (!this.hasGroup(exact)) {
        await this.verifyAuthority();
        await this.toolbox.run('heartbeat/add-to-group', [
          '--group-id',
          this.config.groupId,
          '--emails',
          this.authority.email,
          '--instance',
          'main',
        ]);
        providerWriteMayHaveSucceeded = true;
        exact = await this.exact(found.id);
      }
      return {
        operationId: `heartbeat:main:user:${exact.id}:group:${this.config.groupId}`,
      };
    } catch (error) {
      if (providerWriteMayHaveSucceeded)
        throw new ProjectionAcceptanceUncertainError();
      throw error;
    }
  }

  async readback(envelope: ProjectionEnvelope): Promise<unknown> {
    const found = await this.find();
    if (!found) return { ...envelope.expectedReadback, membership: 'absent' };
    const exact = await this.exact(found.id);
    return {
      ...envelope.expectedReadback,
      identity: exact.email === this.authority.email ? 'verified' : 'conflict',
      membership: this.hasGroup(exact) ? 'verified' : 'absent',
    };
  }

  async rollback(): Promise<void> {
    throw new Error('heartbeat_live_membership_rollback_not_authorized');
  }
}

/**
 * Production-shaped English access delivery. Construction is possible only for
 * an explicitly enabled fixture/runtime; the production config defaults it off.
 */
export class WebsiteCheckoutHeartbeatLiveDelivery {
  private readonly scopeHash: string;

  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly caller: 'tandem-wordpress-live',
    scope: PaymentScope,
    private readonly config: HeartbeatLiveAccessConfig,
    private readonly toolbox: HeartbeatLiveToolboxRunner,
    private readonly databaseGuard: ProjectionDatabaseGuard,
    private readonly transaction: PaymentTransaction,
  ) {
    if (
      !config.enabled ||
      config.groupId !== LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID ||
      config.courseId !== LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID ||
      config.cohortId !== LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID ||
      !config.cardCaptureConfigurationEvidence ||
      caller !== 'tandem-wordpress-live' ||
      scope.environment !== 'live' ||
      scope.provider !== 'adyen' ||
      scope.store === null ||
      !pool ||
      !toolbox ||
      typeof databaseGuard !== 'function' ||
      typeof transaction !== 'function'
    )
      throw new PaymentDomainError(
        'invalid_heartbeat_live_delivery_configuration',
      );
    this.scopeHash = paymentScopeFingerprint(scope);
  }

  private async recordPaymentReviewException(attemptId: string): Promise<void> {
    await this.transaction(async (client) => {
      const result = await client.query<{
        enrollment_key: string;
        payment_projection_version: number;
      }>(
        `SELECT e.enrollment_key,pe.version payment_projection_version
         FROM business_v2.payment_enrollment_admissions a
         JOIN business_v2.student_enrollments_v2 e
           ON e.enrollment_key=a.enrollment_key AND e.state='active'
         JOIN business_v2.payment_checkout_evidence pe
           ON pe.attempt_id=a.attempt_id
         WHERE a.scope_sha256=$1 AND a.checkout_caller=$2 AND a.attempt_id=$3`,
        [this.scopeHash, this.caller, attemptId],
      );
      if (result.rowCount === 0) return;
      if (result.rowCount !== 1)
        throw new PaymentDomainError('heartbeat_live_admission_conflict');
      const now = new Date().toISOString();
      const exceptionKey = `exception:website-checkout-live-payment-review:${attemptId}:v${result.rows[0].payment_projection_version}`;
      const evidenceSha256 = projectionHash({
        scope: this.scopeHash,
        caller: this.caller,
        attemptId,
        paymentProjectionVersion: result.rows[0].payment_projection_version,
        reason: 'adverse_payment_evidence_after_enrollment',
      });
      await client.query(
        `INSERT INTO business_v2.student_enrollment_exceptions_v2
         (exception_key,subject_type,subject_key,reason_code,state,severity,
          owner_role,evidence_sha256,first_seen_at,last_seen_at,review_at,updated_by)
         VALUES($1,'enrollment',$2,'adverse_payment_evidence','open','high',
           'finance_operator',$3,$4,$4,$4,'website_checkout_heartbeat_live')
         ON CONFLICT(exception_key) DO NOTHING`,
        [exceptionKey, result.rows[0].enrollment_key, evidenceSha256, now],
      );
    });
  }

  private async authority(
    attemptId: string,
  ): Promise<HeartbeatLiveEnrollmentAuthority> {
    const client = await this.pool.connect();
    try {
      await this.databaseGuard(client);
      const result = await client.query(
        `SELECT e.enrollment_key,e.version enrollment_version,
          e.participant_party_id::text,lower(p.primary_email::text) primary_email,
          p.display_name,a.contract,pe.projection,pe.version projection_version,
          mb.payment_reference,mb.method,mb.evidence_sha256,mb.operation_id
          ,EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions re
            WHERE re.attempt_id=a.attempt_id) retry_exception
         FROM business_v2.payment_enrollment_admissions ea
         JOIN business_v2.payment_attempts a ON a.attempt_id=ea.attempt_id
         JOIN business_v2.student_enrollments_v2 e
           ON e.enrollment_key=ea.enrollment_key AND e.state='active'
         JOIN business_v2.student_component_entitlements ce
           ON ce.enrollment_key=e.enrollment_key AND ce.state='included'
             AND ce.component_key='mcs.foundations'
         JOIN business_v2.parties p
           ON p.id=e.participant_party_id AND p.merged_into IS NULL
             AND p.party_type='person' AND p.primary_email IS NOT NULL
         JOIN business_v2.payment_checkout_evidence pe ON pe.attempt_id=a.attempt_id
         JOIN business_v2.payment_method_bindings mb
           ON mb.scope_sha256=ea.scope_sha256 AND mb.attempt_id=a.attempt_id
         WHERE ea.scope_sha256=$1 AND ea.checkout_caller=$2 AND ea.attempt_id=$3
           AND ea.offer_key='mcq-program-a-foundations'
           AND ea.content_locale='en-US'`,
        [this.scopeHash, this.caller, attemptId],
      );
      if (result.rowCount !== 1)
        throw new PaymentDomainError(
          'heartbeat_live_enrollment_identity_missing',
        );
      const row = result.rows[0];
      const attempt = validateAttempt(row.contract);
      if (
        paymentScopeFingerprint(attempt.scope) !== this.scopeHash ||
        attempt.quote.offerKey !== 'mcq-program-a-foundations' ||
        attempt.quote.locale !== 'en-US' ||
        row.method !== 'card'
      )
        throw new PaymentDomainError('heartbeat_live_admission_conflict');
      if (row.retry_exception === true)
        throw new PaymentDomainError('heartbeat_live_payment_not_eligible');
      const method: PaymentMethodBinding = {
        attemptId,
        paymentReference: row.payment_reference,
        paymentMethod: row.method,
        evidenceSha256: row.evidence_sha256,
      };
      const readiness = decidePaymentReadiness({
        attempt,
        evidence: row.projection as CheckoutPaymentEvidence,
        methodBinding: method,
        receivedFunds: null,
        policy: {
          achAccess: 'verified_acceptance_provisional',
          achCertificate: 'received_funds_required',
          cardAccess: 'verified_authorization_and_auto_capture',
          cardCaptureConfigurationEvidence:
            this.config.cardCaptureConfigurationEvidence,
        },
        accessAlreadyGranted: false,
      });
      if (readiness.courseAccess !== 'eligible')
        throw new PaymentDomainError('heartbeat_live_payment_not_eligible');
      return {
        enrollmentKey: row.enrollment_key,
        enrollmentVersion: Number(row.enrollment_version),
        participantPartyId: row.participant_party_id,
        email: normalizedEmail.parse(row.primary_email),
        name: z.string().trim().min(1).max(300).parse(row.display_name),
      };
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
    let authority: HeartbeatLiveEnrollmentAuthority;
    try {
      authority = await this.authority(attemptId);
    } catch (error) {
      if (
        error instanceof PaymentDomainError &&
        error.code === 'heartbeat_live_payment_not_eligible'
      ) {
        await this.recordPaymentReviewException(attemptId);
        return held(enrollment, 'heartbeat_access_held_for_payment_review');
      }
      throw error;
    }
    const expectedReadback = {
      schemaVersion: 1,
      kind: 'heartbeat_live_membership',
      participantPartyId: authority.participantPartyId,
      participantEmailSha256: createHash('sha256')
        .update(authority.email)
        .digest('hex'),
      groupId: this.config.groupId,
      courseId: this.config.courseId,
      cohortId: this.config.cohortId,
      identity: 'verified',
      membership: 'verified',
      learnerLoginProof: 'not_verified',
    };
    const envelope: ProjectionEnvelope = {
      target: 'heartbeat',
      subjectType: 'enrollment',
      subjectKey: authority.enrollmentKey,
      subjectVersion: authority.enrollmentVersion,
      destinationKey: `heartbeat:main:group:${this.config.groupId}`,
      idempotencyKey: `website_checkout_heartbeat_live:${authority.enrollmentKey}:${this.config.groupId}`,
      payload: expectedReadback,
      payloadSha256: projectionHash(expectedReadback),
      expectedReadback,
      expectedReadbackSha256: projectionHash(expectedReadback),
    };
    const now = new Date().toISOString();
    try {
      await queueProjection(this.pool, envelope, now, this.databaseGuard);
      const claimed = await claimProjection(
        this.pool,
        envelope,
        now,
        new Date(Date.now() + 30000).toISOString(),
        true,
        this.databaseGuard,
      );
      if (claimed) {
        await deliverProjection(
          claimed.envelope,
          new HeartbeatLiveMembershipDriver(
            authority,
            this.config,
            this.toolbox,
            () => this.authority(attemptId),
          ),
          new PgProjectionDeliveryLedger(
            this.pool,
            claimed.leaseToken,
            'website_checkout_heartbeat_live',
            this.databaseGuard,
          ),
        );
      }
      const projection = await readProjectionState(
        this.pool,
        envelope,
        this.databaseGuard,
      );
      if (projection.state === 'verified') {
        return {
          ...enrollment,
          accessDelivery: 'membership_verified',
          reasons: [
            ...new Set([
              ...enrollment.reasons,
              'heartbeat_membership_verified_login_not_proven',
            ]),
          ],
        };
      }
      return held(
        enrollment,
        projection.lastErrorCode === 'provider_acceptance_uncertain'
          ? 'heartbeat_membership_acceptance_uncertain'
          : 'heartbeat_membership_delivery_held',
      );
    } catch {
      throw new PaymentDomainError('heartbeat_live_projection_delivery_failed');
    }
  }
}
