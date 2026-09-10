import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { guardEnrollmentStore } from './student-enrollment-store-mapping.js';
import {
  STUDENT_PROJECTION_TARGETS,
  projectionHash,
  type ProjectionDeliveryLedger,
  type ProjectionEnvelope,
  type StudentProjectionTarget,
} from './student-enrollment-projection.js';

export interface ClaimedProjection {
  envelope: ProjectionEnvelope;
  projectionVersion: number;
  leaseToken: string;
  attemptCount: number;
}

function assertTarget(
  target: string,
): asserts target is StudentProjectionTarget {
  if (!(STUDENT_PROJECTION_TARGETS as readonly string[]).includes(target))
    throw new Error('invalid_projection_target');
}

async function transaction<T>(
  pool: Pick<Pool, 'connect'>,
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await guardEnrollmentStore(client);
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const result = await body(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* discard below */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function queueProjection(
  pool: Pick<Pool, 'connect'>,
  envelope: ProjectionEnvelope,
  now: string,
): Promise<'queued' | 'duplicate'> {
  assertTarget(envelope.target);
  if (projectionHash(envelope.payload) !== envelope.payloadSha256)
    throw new Error('projection_payload_hash_mismatch');
  if (
    projectionHash(envelope.expectedReadback) !==
    envelope.expectedReadbackSha256
  )
    throw new Error('projection_expected_hash_mismatch');
  return transaction(pool, async (client) => {
    const current = await client.query(
      `SELECT version FROM business_v2.student_class_assignments
       WHERE assignment_key=$1 FOR UPDATE`,
      [envelope.subjectKey],
    );
    if (current.rowCount !== 1) throw new Error('projection_subject_not_found');
    if (current.rows[0].version !== envelope.subjectVersion)
      throw new Error('stale_projection_version');
    const existing = await client.query(
      `SELECT payload_sha256, expected_readback_sha256, destination_key
       FROM business_v2.student_projection_outbox
       WHERE target=$1 AND target_idempotency_key=$2 FOR UPDATE`,
      [envelope.target, envelope.idempotencyKey],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (
        row.payload_sha256 !== envelope.payloadSha256 ||
        row.expected_readback_sha256 !== envelope.expectedReadbackSha256 ||
        row.destination_key !== envelope.destinationKey
      )
        throw new Error('projection_idempotency_conflict');
      return 'duplicate';
    }
    const unsettled = await client.query(
      `SELECT state FROM business_v2.student_projection_outbox
       WHERE target=$1 AND subject_type=$2 AND subject_key=$3
         AND subject_version < $4 AND state IN ('claimed','applied','held')
       FOR UPDATE`,
      [
        envelope.target,
        envelope.subjectType,
        envelope.subjectKey,
        envelope.subjectVersion,
      ],
    );
    if (unsettled.rowCount)
      throw new Error('projection_prior_delivery_unsettled');
    const superseded = await client.query(
      `UPDATE business_v2.student_projection_outbox
       SET state='superseded', lease_token=NULL, lease_expires_at=NULL,
           uncertain_acceptance=false, version=version+1, updated_at=$5
       WHERE target=$1 AND subject_type=$2 AND subject_key=$3
         AND subject_version < $4 AND state IN ('queued','failed','verified')
       RETURNING id`,
      [
        envelope.target,
        envelope.subjectType,
        envelope.subjectKey,
        envelope.subjectVersion,
        now,
      ],
    );
    const key = `projection:${envelope.idempotencyKey}`;
    await client.query(
      `INSERT INTO business_v2.student_projection_outbox
       (projection_key,target,subject_type,subject_key,subject_version,state,
        payload_sha256,expected_readback_sha256,payload_json,created_at,updated_at,
        target_idempotency_key,destination_key,supersedes_outbox_id)
       VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8::jsonb,$9,$9,$10,$11,$12)`,
      [
        key,
        envelope.target,
        envelope.subjectType,
        envelope.subjectKey,
        envelope.subjectVersion,
        envelope.payloadSha256,
        envelope.expectedReadbackSha256,
        JSON.stringify(envelope.payload),
        now,
        envelope.idempotencyKey,
        envelope.destinationKey,
        superseded.rows[0]?.id ?? null,
      ],
    );
    return 'queued';
  });
}

export async function claimNextProjection(
  pool: Pick<Pool, 'connect'>,
  target: StudentProjectionTarget,
  now: string,
  leaseExpiresAt: string,
): Promise<ClaimedProjection | null> {
  assertTarget(target);
  return transaction(pool, async (client) => {
    await client.query(
      `UPDATE business_v2.student_projection_outbox o
       SET state='superseded', lease_token=NULL, lease_expires_at=NULL,
           uncertain_acceptance=false, version=o.version+1, updated_at=$2
       FROM business_v2.student_class_assignments a
       WHERE o.target=$1 AND o.subject_type='assignment'
         AND o.subject_key=a.assignment_key AND o.subject_version <> a.version
         AND o.state IN ('queued','failed')`,
      [target, now],
    );
    const selected = await client.query(
      `SELECT o.* FROM business_v2.student_projection_outbox o
       WHERE o.target=$1 AND o.uncertain_acceptance=false
         AND (o.state IN ('queued','failed') OR
              (o.state='claimed' AND o.lease_expires_at <= $2))
       ORDER BY o.subject_version DESC, o.id
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [target, now],
    );
    if (!selected.rowCount) return null;
    const leaseToken = randomUUID();
    const updated = await client.query(
      `UPDATE business_v2.student_projection_outbox
       SET state='claimed', lease_token=$2, lease_expires_at=$3,
           attempt_count=attempt_count+1, version=version+1, updated_at=$4
       WHERE id=$1 RETURNING *`,
      [selected.rows[0].id, leaseToken, leaseExpiresAt, now],
    );
    const row = updated.rows[0];
    const payload = row.payload_json as Record<string, unknown>;
    return {
      envelope: {
        target: row.target,
        subjectType: row.subject_type,
        subjectKey: row.subject_key,
        subjectVersion: row.subject_version,
        destinationKey: row.destination_key,
        idempotencyKey: row.target_idempotency_key,
        payload,
        payloadSha256: row.payload_sha256,
        expectedReadback: payload,
        expectedReadbackSha256: row.expected_readback_sha256,
      },
      projectionVersion: row.version,
      leaseToken,
      attemptCount: row.attempt_count,
    };
  });
}

export class PgProjectionDeliveryLedger implements ProjectionDeliveryLedger {
  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly leaseToken: string,
    private readonly actor = 'synthetic_projection_worker',
  ) {}

  private async row(client: PoolClient, envelope: ProjectionEnvelope) {
    const result = await client.query(
      `SELECT o.*, a.version AS current_subject_version
       FROM business_v2.student_projection_outbox o
       JOIN business_v2.student_class_assignments a ON a.assignment_key=o.subject_key
       WHERE o.target=$1 AND o.target_idempotency_key=$2 FOR UPDATE`,
      [envelope.target, envelope.idempotencyKey],
    );
    if (result.rowCount !== 1) throw new Error('projection_not_found');
    return result.rows[0];
  }

  async isCurrent(envelope: ProjectionEnvelope): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const row = await this.row(client, envelope);
      return (
        row.state === 'claimed' &&
        row.lease_token === this.leaseToken &&
        row.subject_version === row.current_subject_version &&
        !row.uncertain_acceptance
      );
    });
  }

  private async receipt(
    envelope: ProjectionEnvelope,
    stage: 'accepted' | 'readback' | 'final',
    outcome: 'verified' | 'failed' | 'held' | 'superseded',
    code: string,
    evidenceSha256: string,
    update: string,
    values: unknown[],
  ): Promise<void> {
    const now = new Date().toISOString();
    await transaction(this.pool, async (client) => {
      const row = await this.row(client, envelope);
      if (row.lease_token !== this.leaseToken)
        throw new Error('projection_lease_lost');
      await client.query(update, [...values, row.id, this.leaseToken, now]);
      await client.query(
        `INSERT INTO business_v2.student_projection_receipts
         (receipt_key,outbox_id,subject_version,stage,outcome,result_code,
          evidence_sha256,actor,occurred_at,recorded_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) ON CONFLICT(receipt_key) DO NOTHING`,
        [
          `receipt:${envelope.idempotencyKey}:${stage}:${code}`,
          row.id,
          envelope.subjectVersion,
          stage,
          outcome,
          code,
          evidenceSha256,
          this.actor,
          now,
        ],
      );
    });
  }

  async recordAccepted(envelope: ProjectionEnvelope, operationId: string) {
    await this.receipt(
      envelope,
      'accepted',
      'verified',
      'provider_accepted',
      projectionHash({ operationId }),
      `UPDATE business_v2.student_projection_outbox SET provider_operation_id=$1,
       state='claimed', version=version+1, updated_at=$4
       WHERE id=$2 AND lease_token=$3`,
      [operationId],
    );
  }
  async recordVerified(
    envelope: ProjectionEnvelope,
    operationId: string,
    readbackSha256: string,
  ) {
    await this.receipt(
      envelope,
      'readback',
      'verified',
      'exact_readback',
      readbackSha256,
      `UPDATE business_v2.student_projection_outbox SET provider_operation_id=$1,
       last_readback_sha256=$2,state='verified',lease_token=NULL,lease_expires_at=NULL,
       version=version+1,updated_at=$5 WHERE id=$3 AND lease_token=$4`,
      [operationId, readbackSha256],
    );
  }
  async recordRetryableFailure(envelope: ProjectionEnvelope, code: string) {
    await this.receipt(
      envelope,
      'final',
      'failed',
      code,
      projectionHash({ code }),
      `UPDATE business_v2.student_projection_outbox SET state='failed',last_error_code=$1,
       lease_token=NULL,lease_expires_at=NULL,version=version+1,updated_at=$4
       WHERE id=$2 AND lease_token=$3`,
      [code],
    );
  }
  async recordHeldException(
    envelope: ProjectionEnvelope,
    code: string,
    evidenceSha256: string,
    operationId?: string,
  ) {
    await this.receipt(
      envelope,
      'final',
      'held',
      code,
      evidenceSha256,
      `UPDATE business_v2.student_projection_outbox SET state='held',last_error_code=$1,
       provider_operation_id=COALESCE($2,provider_operation_id),
       uncertain_acceptance=($1='provider_acceptance_uncertain'),lease_token=NULL,
       lease_expires_at=NULL,version=version+1,updated_at=$5
       WHERE id=$3 AND lease_token=$4`,
      [code, operationId ?? null],
    );
    const now = new Date().toISOString();
    await transaction(this.pool, async (client) => {
      const row = await this.row(client, envelope);
      await client.query(
        `INSERT INTO business_v2.student_enrollment_exceptions_v2
         (exception_key,subject_type,subject_key,reason_code,state,severity,owner_role,
          evidence_sha256,first_seen_at,last_seen_at,review_at,updated_by)
         VALUES($1,'projection',$2,$3,'open','high','projection_worker',$4,$5,$5,$5,$6)
         ON CONFLICT(exception_key) DO UPDATE SET occurrence_count=business_v2.student_enrollment_exceptions_v2.occurrence_count+1,
           last_seen_at=EXCLUDED.last_seen_at,version=business_v2.student_enrollment_exceptions_v2.version+1`,
        [
          `exception:${envelope.idempotencyKey}:${code}`,
          row.projection_key,
          code,
          evidenceSha256,
          now,
          this.actor,
        ],
      );
    });
  }
  async recordPostApplyUncertain(
    envelope: ProjectionEnvelope,
    code: 'subject_changed_after_apply' | 'delivery_receipt_uncertain',
    evidenceSha256: string,
    operationId: string,
  ) {
    const now = new Date().toISOString();
    await transaction(this.pool, async (client) => {
      const row = await this.row(client, envelope);
      if (row.state === 'verified' && row.provider_operation_id === operationId)
        return;
      if (row.state === 'superseded')
        throw new Error('post_apply_projection_already_superseded');
      if (
        row.provider_operation_id &&
        row.provider_operation_id !== operationId
      )
        throw new Error('provider_operation_id_conflict');
      await client.query(
        `UPDATE business_v2.student_projection_outbox SET state='held',
         provider_operation_id=$2,last_error_code=$3,uncertain_acceptance=true,
         lease_token=NULL,lease_expires_at=NULL,version=version+1,updated_at=$4
         WHERE id=$1`,
        [row.id, operationId, code, now],
      );
      await client.query(
        `INSERT INTO business_v2.student_projection_receipts
         (receipt_key,outbox_id,subject_version,stage,outcome,result_code,
          evidence_sha256,actor,occurred_at,recorded_at)
         VALUES($1,$2,$3,'final','held',$4,$5,$6,$7,$7)
         ON CONFLICT(receipt_key) DO NOTHING`,
        [
          `receipt:${envelope.idempotencyKey}:final:${code}`,
          row.id,
          envelope.subjectVersion,
          code,
          evidenceSha256,
          this.actor,
          now,
        ],
      );
      await client.query(
        `INSERT INTO business_v2.student_enrollment_exceptions_v2
         (exception_key,subject_type,subject_key,reason_code,state,severity,owner_role,
          evidence_sha256,first_seen_at,last_seen_at,review_at,updated_by)
         VALUES($1,'projection',$2,$3,'open','high','projection_worker',$4,$5,$5,$5,$6)
         ON CONFLICT(exception_key) DO UPDATE SET occurrence_count=business_v2.student_enrollment_exceptions_v2.occurrence_count+1,
           last_seen_at=EXCLUDED.last_seen_at,version=business_v2.student_enrollment_exceptions_v2.version+1`,
        [
          `exception:${envelope.idempotencyKey}:${code}`,
          row.projection_key,
          code,
          evidenceSha256,
          now,
          this.actor,
        ],
      );
    });
  }
  async recordRolledBack(envelope: ProjectionEnvelope, operationId: string) {
    await transaction(this.pool, async (client) => {
      const row = await this.row(client, envelope);
      if (row.provider_operation_id !== operationId)
        throw new Error('rollback_operation_mismatch');
      await client.query(
        `UPDATE business_v2.student_projection_outbox SET state='superseded',
         lease_token=NULL,lease_expires_at=NULL,uncertain_acceptance=false,
         last_error_code='rolled_back',version=version+1,updated_at=$2 WHERE id=$1`,
        [row.id, new Date().toISOString()],
      );
    });
  }
}
