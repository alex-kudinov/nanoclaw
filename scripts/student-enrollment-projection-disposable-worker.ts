import assert from 'node:assert/strict';
import os from 'node:os';
import { Pool } from 'pg';
import {
  ProjectionAcceptanceUncertainError,
  buildHeartbeatProjection,
  buildStudentRosterProjection,
  deliverProjection,
  rollbackProjection,
  type ProjectionEnvelope,
  type ProviderProjectionDriver,
  type SupervisionProjectionSubject,
} from '../src/student-enrollment-projection.js';
import {
  PgProjectionDeliveryLedger,
  claimNextProjection,
  queueProjection,
} from '../src/student-enrollment-projection-store.js';
import { assertEnrollmentStoreDatabase } from '../src/student-enrollment-store.js';

const database = process.argv[2];
assertEnrollmentStoreDatabase(database);
const pool = new Pool({
  database,
  host: '/tmp',
  port: 5432,
  user: os.userInfo().username,
  password: () => '',
  ssl: false,
  max: 6,
  options: '-c statement_timeout=15000',
  connectionTimeoutMillis: 3000,
});
const adminPool = {
  connect: async () => {
    const client = await pool.connect();
    await client.query('SET ROLE nanoclaw_admin');
    return client;
  },
};
const now = new Date().toISOString();
const later = (ms: number) => new Date(Date.parse(now) + ms).toISOString();
const sha = 'a'.repeat(64);

async function sql(statement: string, values: unknown[] = []) {
  const client = await adminPool.connect();
  try {
    return await client.query(statement, values);
  } finally {
    client.release();
  }
}

await sql(
  `
  INSERT INTO business_v2.student_enrollment_orders
    (order_key,source_channel,offer_key,bundle_key,bundle_version,payer_party_id,seat_count,
     financial_classification,state,policy_revision,evidence_sha256,effective_at,created_at,updated_at,updated_by)
  VALUES('order:synthetic:projection','website_stripe_checkout','supervision-inaugural',
    'bundle:supervision',1,1,1,'settled','materialized',1,$1,$2,$2,$2,'synthetic_admission');
  INSERT INTO business_v2.student_enrollment_seats
    (seat_key,order_id,seat_number,participant_party_id,participant_evidence_sha256,
     payer_relationship,state,created_at,updated_at,updated_by)
  SELECT 'seat:synthetic:projection',id,1,1,$1,'self_purchase_explicit','materialized',$2,$2,'synthetic_admission'
  FROM business_v2.student_enrollment_orders WHERE order_key='order:synthetic:projection';
  INSERT INTO business_v2.student_enrollments_v2
    (enrollment_key,order_id,seat_id,participant_party_id,offer_key,bundle_key,bundle_version,
     catalog_revision,state,effective_at,materialization_sha256,created_at,updated_at,updated_by)
  SELECT 'enrollment:synthetic:projection',o.id,s.id,1,'supervision-inaugural','bundle:supervision',1,
    1,'active',$2,$1,$2,$2,'synthetic_admission'
  FROM business_v2.student_enrollment_orders o JOIN business_v2.student_enrollment_seats s ON s.order_id=o.id
  WHERE o.order_key='order:synthetic:projection';
  INSERT INTO business_v2.student_component_entitlements
    (entitlement_key,enrollment_id,component_key,state,evidence_sha256,created_at,updated_at,updated_by)
  SELECT 'entitlement:synthetic:supervision',id,'supervision.course_access','included',$1,$2,$2,'synthetic_admission'
  FROM business_v2.student_enrollments_v2 WHERE enrollment_key='enrollment:synthetic:projection';
  INSERT INTO business_v2.student_class_assignments
    (assignment_key,enrollment_id,entitlement_id,delivery_block_key,state,schedule_evidence_sha256,
     starts_at,created_at,updated_at,updated_by)
  SELECT 'assignment:synthetic:2026-10-07',e.id,t.id,'supervision:2026-10-07','active',$1,
    '2026-10-07T14:00:00Z',$2,$2,'synthetic_admission'
  FROM business_v2.student_enrollments_v2 e JOIN business_v2.student_component_entitlements t ON t.enrollment_id=e.id
  WHERE e.enrollment_key='enrollment:synthetic:projection';`
    .replaceAll('$1', `'${sha}'`)
    .replaceAll('$2', `'${now}'`),
);

function subject(version: number): SupervisionProjectionSubject {
  return {
    offerKey: 'supervision-inaugural',
    offerVersion: 1,
    fundingStatus: 'settled',
    payerRelationship: 'self_purchase_explicit',
    sourceAdmissionAuthenticated: true,
    openBlockingExceptions: 0,
    enrollmentKey: 'enrollment:synthetic:projection',
    enrollmentVersion: 0,
    assignmentKey: 'assignment:synthetic:2026-10-07',
    assignmentVersion: version,
    participantKey: 'party:synthetic:1',
    participantEmail: 'synthetic@example.test',
    participantName: 'Synthetic Student',
    deliveryBlockKey: 'supervision:2026-10-07',
    deliveryStartsAt: '2026-10-07T14:00:00.000Z',
    courseAccessGroupKey: 'heartbeat:course-access:supervision',
    deliveryMarkerGroupKey: 'heartbeat:marker:supervision:2026-10-07',
  };
}

class Driver implements ProviderProjectionDriver {
  effects = new Map<string, { operationId: string; readback: unknown }>();
  failOnce = false;
  uncertain = false;
  constructor(readonly target: ProjectionEnvelope['target']) {}
  async findByIdempotencyKey(key: string) {
    return this.effects.get(key) ?? null;
  }
  async apply(envelope: ProjectionEnvelope) {
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error('synthetic definitive failure');
    }
    const operationId = `op:${envelope.idempotencyKey}`;
    this.effects.set(envelope.idempotencyKey, {
      operationId,
      readback: envelope.expectedReadback,
    });
    if (this.uncertain)
      throw new ProjectionAcceptanceUncertainError(
        'synthetic uncertain acceptance',
      );
    return { operationId };
  }
  async readback(envelope: ProjectionEnvelope) {
    return this.effects.get(envelope.idempotencyKey)?.readback ?? null;
  }
  async rollback(envelope: ProjectionEnvelope, operationId: string) {
    assert.equal(
      this.effects.get(envelope.idempotencyKey)?.operationId,
      operationId,
    );
    this.effects.delete(envelope.idempotencyKey);
  }
}

const roster0 = buildStudentRosterProjection(
  subject(0),
  'student_roster:synthetic:supervision',
);
const heartbeat0 = buildHeartbeatProjection(
  subject(0),
  'heartbeat:synthetic:community',
);
assert.equal(await queueProjection(adminPool, roster0, now), 'queued');
assert.equal(await queueProjection(adminPool, roster0, now), 'duplicate');
assert.equal(await queueProjection(adminPool, heartbeat0, now), 'queued');

const [claimA, claimB] = await Promise.all([
  claimNextProjection(adminPool, 'student_roster', now, later(60000)),
  claimNextProjection(adminPool, 'student_roster', now, later(60000)),
]);
const rosterClaim = claimA ?? claimB;
assert.ok(rosterClaim);
assert.equal([claimA, claimB].filter(Boolean).length, 1);
const rosterDriver = new Driver('student_roster');
assert.equal(
  await deliverProjection(
    rosterClaim.envelope,
    rosterDriver,
    new PgProjectionDeliveryLedger(adminPool, rosterClaim.leaseToken),
  ),
  'verified',
);

let heartbeatClaim = await claimNextProjection(
  adminPool,
  'heartbeat',
  now,
  later(60000),
);
assert.ok(heartbeatClaim);
const heartbeatDriver = new Driver('heartbeat');
heartbeatDriver.failOnce = true;
assert.equal(
  await deliverProjection(
    heartbeatClaim.envelope,
    heartbeatDriver,
    new PgProjectionDeliveryLedger(adminPool, heartbeatClaim.leaseToken),
  ),
  'retryable_failure',
);
heartbeatClaim = await claimNextProjection(
  adminPool,
  'heartbeat',
  now,
  later(60000),
);
assert.ok(heartbeatClaim);
assert.equal(
  await deliverProjection(
    heartbeatClaim.envelope,
    heartbeatDriver,
    new PgProjectionDeliveryLedger(adminPool, heartbeatClaim.leaseToken),
  ),
  'verified',
);

await sql(
  `UPDATE business_v2.student_class_assignments SET version=1,updated_at=$1 WHERE assignment_key='assignment:synthetic:2026-10-07'`,
  [now],
);
const roster1 = buildStudentRosterProjection(
  subject(1),
  'student_roster:synthetic:supervision',
);
assert.equal(await queueProjection(adminPool, roster1, now), 'queued');
const uncertainClaim = await claimNextProjection(
  adminPool,
  'student_roster',
  now,
  later(60000),
);
assert.ok(uncertainClaim);
const uncertainDriver = new Driver('student_roster');
uncertainDriver.uncertain = true;
assert.equal(
  await deliverProjection(
    uncertainClaim.envelope,
    uncertainDriver,
    new PgProjectionDeliveryLedger(adminPool, uncertainClaim.leaseToken),
  ),
  'held',
);
assert.equal(
  await claimNextProjection(adminPool, 'student_roster', now, later(70000)),
  null,
);

await sql(
  `UPDATE business_v2.student_class_assignments SET version=2,updated_at=$1 WHERE assignment_key='assignment:synthetic:2026-10-07'`,
  [now],
);
const roster2 = buildStudentRosterProjection(
  subject(2),
  'student_roster:synthetic:supervision',
);
await assert.rejects(
  () => queueProjection(adminPool, roster2, now),
  /projection_prior_delivery_unsettled/,
);
await sql(
  `UPDATE business_v2.student_projection_outbox SET state='verified',
     uncertain_acceptance=false,provider_operation_id=$1,
     last_readback_sha256=expected_readback_sha256,last_error_code=NULL,
     version=version+1,updated_at=$2
   WHERE target='student_roster' AND subject_version=1;
   UPDATE business_v2.student_enrollment_exceptions_v2 SET state='resolved',
     resolved_at=clock_timestamp(),resolution_sha256=$3,version=version+1,updated_by='synthetic_reconciler'
   WHERE reason_code='provider_acceptance_uncertain';`
    .replaceAll('$1', `'op:${roster1.idempotencyKey}'`)
    .replaceAll('$2', `'${now}'`)
    .replaceAll('$3', `'${sha}'`),
);
assert.equal(await queueProjection(adminPool, roster2, now), 'queued');
await assert.rejects(
  () => queueProjection(adminPool, roster1, now),
  /stale_projection_version/,
);
const rollbackClaim = await claimNextProjection(
  adminPool,
  'student_roster',
  now,
  later(70000),
);
assert.ok(rollbackClaim);
const rollbackDriver = new Driver('student_roster');
const rollbackLedger = new PgProjectionDeliveryLedger(
  adminPool,
  rollbackClaim.leaseToken,
);
assert.equal(
  await deliverProjection(
    rollbackClaim.envelope,
    rollbackDriver,
    rollbackLedger,
  ),
  'verified',
);
await rollbackProjection(
  rollbackClaim.envelope,
  `op:${rollbackClaim.envelope.idempotencyKey}`,
  rollbackDriver,
  rollbackLedger,
);

await sql(
  `UPDATE business_v2.student_class_assignments SET version=3,updated_at=$1 WHERE assignment_key='assignment:synthetic:2026-10-07'`,
  [now],
);
const roster3 = buildStudentRosterProjection(
  subject(3),
  'student_roster:synthetic:supervision',
);
assert.equal(await queueProjection(adminPool, roster3, now), 'queued');
const racingClaim = await claimNextProjection(
  adminPool,
  'student_roster',
  now,
  later(70000),
);
assert.ok(racingClaim);
const racingDriver = new Driver('student_roster');
const racingApply = racingDriver.apply.bind(racingDriver);
racingDriver.apply = async (envelope) => {
  const result = await racingApply(envelope);
  await sql(
    `UPDATE business_v2.student_class_assignments SET version=4,updated_at=$1 WHERE assignment_key='assignment:synthetic:2026-10-07'`,
    [now],
  );
  const next = buildStudentRosterProjection(
    subject(4),
    'student_roster:synthetic:supervision',
  );
  await assert.rejects(
    () => queueProjection(adminPool, next, now),
    /projection_prior_delivery_unsettled/,
  );
  return result;
};
assert.equal(
  await deliverProjection(
    racingClaim.envelope,
    racingDriver,
    new PgProjectionDeliveryLedger(adminPool, racingClaim.leaseToken),
  ),
  'held',
);

const heartbeat4 = buildHeartbeatProjection(
  subject(4),
  'heartbeat:synthetic:community',
);
assert.equal(await queueProjection(adminPool, heartbeat4, now), 'queued');
const leaseLossClaim = await claimNextProjection(
  adminPool,
  'heartbeat',
  now,
  later(70000),
);
assert.ok(leaseLossClaim);
const leaseLossDriver = new Driver('heartbeat');
const leaseLossApply = leaseLossDriver.apply.bind(leaseLossDriver);
leaseLossDriver.apply = async (envelope) => {
  const result = await leaseLossApply(envelope);
  await sql(
    `UPDATE business_v2.student_projection_outbox
     SET lease_token='synthetic-replacement-lease'
     WHERE target=$1 AND target_idempotency_key=$2`,
    [envelope.target, envelope.idempotencyKey],
  );
  return result;
};
assert.equal(
  await deliverProjection(
    leaseLossClaim.envelope,
    leaseLossDriver,
    new PgProjectionDeliveryLedger(adminPool, leaseLossClaim.leaseToken),
  ),
  'held',
);

const rows =
  await sql(`SELECT target,subject_version,state,attempt_count,uncertain_acceptance,
  provider_operation_id,last_readback_sha256 FROM business_v2.student_projection_outbox ORDER BY id`);
const receipts = await sql(
  `SELECT stage,outcome,result_code FROM business_v2.student_projection_receipts ORDER BY id`,
);
const exceptions = await sql(
  `SELECT reason_code,state,owner_role FROM business_v2.student_enrollment_exceptions_v2 ORDER BY id`,
);
const canonical =
  await sql(`SELECT o.financial_classification,o.state AS order_state,e.state AS enrollment_state,a.state AS assignment_state
  FROM business_v2.student_enrollment_orders o JOIN business_v2.student_enrollments_v2 e ON e.order_id=o.id
  JOIN business_v2.student_class_assignments a ON a.enrollment_id=e.id WHERE o.order_key='order:synthetic:projection'`);
assert.equal(canonical.rowCount, 1);
assert.deepEqual(canonical.rows[0], {
  financial_classification: 'settled',
  order_state: 'materialized',
  enrollment_state: 'active',
  assignment_state: 'active',
});
assert.equal(
  exceptions.rows.some(
    (r) =>
      r.reason_code === 'provider_acceptance_uncertain' &&
      r.owner_role === 'projection_worker',
  ),
  true,
);
assert.equal(
  exceptions.rows.some(
    (r) =>
      r.reason_code === 'subject_changed_after_apply' &&
      r.owner_role === 'projection_worker',
  ),
  true,
);
assert.equal(
  rows.rows.some(
    (r) =>
      r.target === 'heartbeat' &&
      r.subject_version === 4 &&
      r.state === 'held' &&
      r.uncertain_acceptance &&
      r.provider_operation_id === `op:${heartbeat4.idempotencyKey}`,
  ),
  true,
);
assert.equal(
  rows.rows.some(
    (r) =>
      r.target === 'heartbeat' &&
      r.attempt_count === 2 &&
      r.last_readback_sha256,
  ),
  true,
);
assert.equal(
  rows.rows.some((r) => r.subject_version === 1 && r.state === 'superseded'),
  true,
);
assert.equal(
  rows.rows.some((r) => r.subject_version === 2 && r.state === 'superseded'),
  true,
);
assert.equal(
  receipts.rows.some((r) => r.result_code === 'exact_readback'),
  true,
);

console.log(
  JSON.stringify({
    claimRace: { claimedOnce: true },
    retry: { heartbeatAttempts: 2, verified: true },
    uncertainAcceptance: { heldBeforeRetry: true, durableException: true },
    inFlightSupersession: { blocked: true, durableHeldEffect: true },
    postApplyLeaseLoss: { durableHeldEffect: true },
    idempotency: {
      duplicateQueueNoOp: true,
      providerEffects: rosterDriver.effects.size,
    },
    supersession: { version1Superseded: true },
    staleVersion: { refused: true },
    exactReadback: { receipt: true },
    rollback: { providerEffectRemoved: rollbackDriver.effects.size === 0 },
    partialFailure: {
      fundedOrderPreserved: true,
      enrollmentPreserved: true,
      assignmentPreserved: true,
    },
    counts: {
      projections: rows.rowCount,
      receipts: receipts.rowCount,
      exceptions: exceptions.rowCount,
    },
  }),
);
await pool.end();
