import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import {
  persistEnrollmentIngress,
  assertEnrollmentStoreDatabase,
  EnrollmentCommitUncertainError,
} from '../src/student-enrollment-store.js';
import {
  loadEnrollmentStore,
  persistEnrollmentStore,
  ENROLLMENT_STORE_TABLES,
} from '../src/student-enrollment-store-mapping.js';
import {
  enrollmentIngressProofPayload,
  type EnrollmentIngressEnvelope,
  type EnrollmentIngressAuthority,
  type EnrollmentIngressProof,
} from '../src/student-enrollment-ingress.js';
import { bookkeeperContractHash as hash } from '../src/bookkeeper-enrollment-contract.js';
import {
  registerDeliveryBlock,
  configureSeatPool,
  mapOfferToSeatPool,
  joinWaitlist,
  stageWaitlistOffer,
} from '../src/academy-capacity.js';
import {
  attachEnrollmentEvidence,
  recordProjectionReadback,
} from '../src/student-enrollment-foundation.js';

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
    const c = await pool.connect();
    await c.query('SET ROLE nanoclaw_admin');
    return c;
  },
};
const now = new Date().toISOString(),
  start = new Date(Date.parse(now) + 86400000).toISOString(),
  end = new Date(Date.parse(now) + 30 * 86400000).toISOString();
const sha = 'a'.repeat(64);
const lock = () =>
  `LOCK TABLE ${ENROLLMENT_STORE_TABLES.map((t) => 'business_v2.' + t).join(',')} IN SHARE ROW EXCLUSIVE MODE`;
async function snapshot() {
  const c = await adminPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(lock());
    const s = await loadEnrollmentStore(c);
    await c.query('COMMIT');
    return s;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function query(sql: string, args: unknown[] = []) {
  const c = await adminPool.connect();
  try {
    return await c.query(sql, args);
  } finally {
    c.release();
  }
}
function request(
  label: string,
  identity = label,
  participant = 2,
): EnrollmentIngressEnvelope {
  const source = {
    scope: 'stripe:tandem',
    objectType: 'payment_intent',
    objectId: `pi_${identity}`,
  };
  return {
    version: 1,
    intakeKey: `intake:${identity}`,
    channel: 'manual_stripe_payment',
    sourceAlias: source,
    funding: {
      source,
      aliases: [
        {
          scope: 'stripe:tandem',
          objectType: 'checkout_session',
          objectId: `cs_${identity}`,
        },
      ],
      status: 'settled',
      amountMinor: 10000,
      currency: 'USD',
      payerPartyId: 1,
      effectiveAt: now,
      proofKey: 'proof:funding',
    },
    commercial: {
      offerKey: `offer:${label}`,
      seatCount: 1,
      totalMinor: 10000,
      currency: 'USD',
      proofKey: 'proof:commercial',
    },
    seats: [
      {
        participantPartyId: participant,
        payerRelationship: 'separate_payer',
        proofKey: 'proof:person:1',
        assignment: {
          poolKey: `pool:${label}`,
          componentKey: 'synthetic.module',
          proofKey: 'proof:class:1',
        },
      },
    ],
  };
}
function authority(e: EnrollmentIngressEnvelope): EnrollmentIngressAuthority {
  const make = (
    purpose: EnrollmentIngressProof['purpose'],
    key: string,
    role: EnrollmentIngressProof['role'],
    index = 0,
  ): EnrollmentIngressProof => ({
    proofKey: key,
    purpose,
    role,
    actor: `synthetic:${role}`,
    observedAt: now,
    payloadSha256: hash(enrollmentIngressProofPayload(e, purpose, index)),
  });
  const grant = e.channel === 'scholarship';
  return {
    proofs: [
      make(
        'funding',
        e.funding.proofKey,
        grant ? 'owner_admin' : 'finance_operator',
      ),
      make(
        'commercial',
        e.commercial.proofKey,
        grant ? 'owner_admin' : 'enrollment_operator',
      ),
      ...e.seats.flatMap((s, i) => [
        ...(s.proofKey
          ? [make('participant', s.proofKey, 'enrollment_operator', i)]
          : []),
        ...(s.assignment
          ? [
              make(
                'assignment',
                s.assignment.proofKey,
                'enrollment_operator',
                i,
              ),
            ]
          : []),
      ]),
    ],
    catalog: {
      occurredAt: now,
      partyIds: [1, 2, 3, 4],
      offers: [
        {
          offerKey: e.commercial.offerKey!,
          bundleKey: 'bundle:synthetic',
          bundleVersion: 1,
          catalogRevision: 1,
          evidenceSha256: sha,
          components: [
            {
              componentKey: 'synthetic.module',
              state: 'included',
              requiresAssignment: true,
            },
          ],
        },
      ],
    },
  };
}
async function apply(e: EnrollmentIngressEnvelope) {
  return persistEnrollmentIngress(adminPool, e, authority(e));
}
const summary: Record<string, unknown> = {};
try {
  // Synthetic fixtures and mapping proof remain inside the same guarded database.
  const c = await adminPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(lock());
    const before = await loadEnrollmentStore(c);
    let capacity = before.state.capacity;
    for (const label of [
      'roundtrip',
      'race',
      'alias',
      'rollback',
      'ack',
      'sponsor',
      'conflict',
      'grant',
      'hold',
      'metadata',
      'waitlist',
    ]) {
      capacity = registerDeliveryBlock(capacity, {
        deliveryBlockKey: `class:${label}`,
        componentKey: 'synthetic.module',
        sourceScope: 'calendar:synthetic',
        sourceObjectId: label,
        startsAt: start,
        endsAt: end,
        timezone: 'UTC',
        sessionSetSha256: sha,
        scheduleEvidenceSha256: sha,
        state: 'scheduled',
        version: 0,
        actor: 'synthetic',
        occurredAt: now,
      });
      capacity = configureSeatPool(capacity, {
        poolKey: `pool:${label}`,
        deliveryBlockKey: `class:${label}`,
        capacity: label === 'race' ? 1 : 10,
        operationalState: 'open',
        closeReason: null,
        version: 0,
        evidenceSha256: sha,
        actor: 'synthetic',
        occurredAt: now,
      });
      capacity = mapOfferToSeatPool(capacity, {
        mappingKey: `mapping:${label}`,
        poolKey: `pool:${label}`,
        offerKey: `offer:${label}`,
        catalogRevision: 1,
        state: 'active',
        version: 0,
        evidenceSha256: sha,
        expectedPoolVersion: 0,
        actor: 'synthetic',
        occurredAt: now,
      });
    }
    capacity = joinWaitlist(capacity, {
      entryKey: 'waitlist:synthetic',
      poolKey: 'pool:waitlist',
      expectedPoolVersion: capacity.seatPools['pool:waitlist'].version,
      offerKey: 'offer:waitlist',
      catalogRevision: 1,
      participantPartyId: 4,
      contactReferenceSha256: sha,
      sequenceNumber: 1,
      actor: 'synthetic',
      joinedAt: now,
    });
    capacity = stageWaitlistOffer(capacity, before.state.enrollment, {
      poolKey: 'pool:waitlist',
      expectedPoolVersion: capacity.seatPools['pool:waitlist'].version,
      waitlistOfferKey: 'waitlist-offer:synthetic',
      reservationKey: 'waitlist-reservation:synthetic',
      reservationIdempotencyKey: 'waitlist-reservation:synthetic',
      expiresAt: new Date(Date.parse(now) + 3600000).toISOString(),
      evidenceSha256: sha,
      actor: 'synthetic',
      occurredAt: now,
    });
    await persistEnrollmentStore(c, before, {
      enrollment: before.state.enrollment,
      capacity,
    });
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }

  const input = request('roundtrip');
  const accepted = await apply(input);
  assert.equal(accepted.disposition, 'accepted');
  const beforeRetry = hash((await snapshot()).state);
  const duplicate = await apply(input);
  assert.equal(duplicate.disposition, 'duplicate');
  assert.equal(hash((await snapshot()).state), beforeRetry);
  assert.equal(Object.values(accepted.enrollment.obligations).length, 1);
  assert.equal(Object.values(accepted.enrollment.projections).length, 1);
  assert(
    Object.values(accepted.enrollment.evidence).some(
      (x) => x.evidenceType === 'ingress_funding',
    ),
  );
  summary.roundtrip = { accepted: true, replayed: true, unchanged: true };
  assert.equal(
    accepted.enrollment.history.filter((x) => x.subjectType === 'evidence')
      .length,
    Object.keys(accepted.enrollment.evidence).length,
  );
  assert(
    accepted.enrollment.history
      .filter((x) => x.subjectType === 'evidence')
      .every((x) => accepted.enrollment.evidence[x.subjectKey]),
  );
  const receiptClient = await adminPool.connect();
  try {
    await receiptClient.query('BEGIN');
    await receiptClient.query(lock());
    const before = await loadEnrollmentStore(receiptClient);
    const projection = Object.values(before.state.enrollment.projections)[0];
    let enrollment = recordProjectionReadback(before.state.enrollment, {
      projectionKey: projection.projectionKey,
      expectedProjectionVersion: projection.version,
      receiptKey: 'receipt:synthetic-exact',
      subjectVersion: projection.subjectVersion,
      readbackSha256: projection.expectedReadbackSha256,
      actor: 'synthetic-readback',
      occurredAt: now,
      recordedAt: now,
    });
    const sourceReferenceKey = Object.keys(enrollment.sourceReferences).find(
      (k) => enrollment.sourceReferences[k].sourceObjectId === 'pi_roundtrip',
    )!;
    enrollment = attachEnrollmentEvidence(enrollment, {
      evidenceKey: 'evidence:linked-synthetic',
      subjectType: 'order',
      subjectKey: accepted.orderKey,
      evidenceType: 'synthetic_receipt',
      sourceReferenceKey,
      evidenceSha256: sha,
      observedAt: now,
      recordedAt: now,
      recordedBy: 'synthetic',
    });
    await persistEnrollmentStore(receiptClient, before, {
      enrollment,
      capacity: before.state.capacity,
    });
    await receiptClient.query('COMMIT');
  } catch (e) {
    await receiptClient.query('ROLLBACK');
    throw e;
  } finally {
    receiptClient.release();
  }
  const all = (await snapshot()).state;
  assert.equal(Object.keys(all.enrollment.receipts).length, 1);
  assert.equal(Object.keys(all.capacity.waitlistOffers).length, 1);
  assert(
    all.enrollment.evidence['evidence:linked-synthetic'].sourceReferenceKey,
  );
  summary.fullMapping = {
    syntheticReceipt: true,
    linkedEvidence: true,
    waitlist: true,
  };

  const race = await Promise.all([
    apply(request('race', 'race_a', 2)),
    apply(request('race', 'race_b', 3)),
  ]);
  assert.deepEqual(race.map((x) => x.disposition).sort(), ['accepted', 'held']);
  const occupancy = await query(
    "SELECT occupied,committed,available FROM business_v2.v_academy_seat_pool_occupancy WHERE pool_key='pool:race'",
  );
  assert.deepEqual(occupancy.rows[0], {
    occupied: 1,
    committed: 1,
    available: 0,
  });
  summary.race = occupancy.rows[0];

  const same = request('alias');
  const second = structuredClone(same);
  second.intakeKey = 'intake:alias_event';
  second.sourceAlias = second.funding.aliases[0];
  const aliases = await Promise.all([apply(same), apply(second)]);
  assert.equal(aliases[0].orderKey, aliases[1].orderKey);
  const aliasCount = await query(
    'SELECT count(*)::int n FROM business_v2.student_enrollments_v2 e JOIN business_v2.student_enrollment_orders o ON o.id=e.order_id WHERE o.order_key=$1',
    [aliases[0].orderKey],
  );
  assert.equal(aliasCount.rows[0].n, 1);
  summary.aliasRace = { orders: 1, enrollments: 1 };

  const rollback = request('rollback');
  const beforeRollback = hash((await snapshot()).state);
  await query(`CREATE FUNCTION business_v2.fixture_fail_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic forced persistence failure'; END $$;
    CREATE TRIGGER fixture_fail_projection BEFORE INSERT ON business_v2.student_projection_outbox FOR EACH ROW EXECUTE FUNCTION business_v2.fixture_fail_projection()`);
  await assert.rejects(
    () => apply(rollback),
    /synthetic forced persistence failure/,
  );
  assert.equal(hash((await snapshot()).state), beforeRollback);
  await query(
    'DROP TRIGGER fixture_fail_projection ON business_v2.student_projection_outbox; DROP FUNCTION business_v2.fixture_fail_projection()',
  );
  assert.equal((await apply(rollback)).disposition, 'accepted');
  summary.rollback = { noPartialRows: true, retryAccepted: true };

  const ack = request('ack');
  let lost = false;
  const uncertainPool = {
    connect: async () => {
      const client = await adminPool.connect();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return async (...args: unknown[]) => {
              const result = await (target.query as Function).apply(
                target,
                args,
              );
              if (args[0] === 'COMMIT' && !lost) {
                lost = true;
                throw new Error('synthetic lost acknowledgement');
              }
              return result;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as PoolClient;
    },
  };
  await assert.rejects(
    () => persistEnrollmentIngress(uncertainPool, ack, authority(ack)),
    EnrollmentCommitUncertainError,
  );
  const afterUnknown = hash((await snapshot()).state);
  assert.equal((await apply(ack)).disposition, 'duplicate');
  assert.equal(hash((await snapshot()).state), afterUnknown);
  summary.uncertainCommit = { reportedUnknown: true, retryDuplicate: true };

  const sponsor = request('sponsor');
  sponsor.channel = 'sponsored_cohort';
  sponsor.commercial.seatCount = 2;
  sponsor.seats.push({
    participantPartyId: null,
    payerRelationship: 'unknown',
    proofKey: null,
    assignment: {
      poolKey: 'pool:sponsor',
      componentKey: 'synthetic.module',
      proofKey: 'proof:class:2',
    },
  });
  const sponsored = await apply(sponsor);
  assert.equal(sponsored.disposition, 'held');
  const sponsorRows = Object.values(sponsored.enrollment.seats).filter(
    (x) => x.orderKey === sponsored.orderKey,
  );
  assert.deepEqual(sponsorRows.map((x) => x.state).sort(), [
    'materialized',
    'unassigned',
  ]);
  summary.sponsor = { materialized: 1, unassigned: 1 };

  const conflict = request('conflict');
  const valid = await apply(conflict);
  conflict.intakeKey = 'intake:conflict_two';
  conflict.seats[0].participantPartyId = 3;
  const held = await apply(conflict);
  assert.equal(held.disposition, 'held');
  const projection = Object.values(held.enrollment.projections).find(
    (x) =>
      x.subjectKey ===
      Object.values(valid.enrollment.enrollments).find(
        (x) => x.orderKey === valid.orderKey,
      )!.enrollmentKey,
  )!;
  assert.equal(projection.state, 'held');
  assert.equal(projection.version, 1);
  const savedProjection = (
    await query(
      'SELECT state,version FROM business_v2.student_projection_outbox WHERE projection_key=$1',
      [projection.projectionKey],
    )
  ).rows[0];
  assert.deepEqual(savedProjection, { state: 'held', version: 1 });
  summary.projectionVersion = savedProjection;

  const grant = request('grant');
  grant.channel = 'scholarship';
  grant.funding.source = {
    scope: 'owner:synthetic',
    objectType: 'grant',
    objectId: 'grant_A',
  };
  grant.sourceAlias = grant.funding.source;
  grant.funding.aliases = [];
  grant.funding.status = 'grant';
  grant.funding.payerPartyId = null;
  grant.funding.amountMinor = null;
  grant.funding.currency = null;
  grant.commercial.totalMinor = null;
  grant.commercial.currency = null;
  grant.seats[0].payerRelationship = 'not_applicable';
  assert.equal((await apply(grant)).disposition, 'accepted');
  summary.grant = { accepted: true };

  const heldInput = request('hold');
  const missingProof = authority(heldInput);
  missingProof.proofs = [];
  const quarantine = await persistEnrollmentIngress(
    adminPool,
    heldInput,
    missingProof,
  );
  assert.equal(quarantine.disposition, 'held');
  assert.equal(
    (await persistEnrollmentIngress(adminPool, heldInput, missingProof))
      .disposition,
    'duplicate',
  );
  summary.quarantine = { durable: true, replayed: true };

  // PostgreSQL-only delivery columns are preserved; active leases fail closed.
  const metadata = await apply(request('metadata'));
  const p = Object.values(metadata.enrollment.projections).find(
    (x) =>
      x.subjectKey ===
      Object.values(metadata.enrollment.enrollments).find(
        (x) => x.orderKey === metadata.orderKey,
      )!.enrollmentKey,
  )!;
  await query(
    'UPDATE business_v2.student_projection_outbox SET attempt_count=7,last_error_code=$1 WHERE projection_key=$2',
    ['synthetic_retry', p.projectionKey],
  );
  const metadataChange = request('metadata');
  metadataChange.intakeKey = 'intake:metadata_update';
  metadataChange.seats[0].participantPartyId = 3;
  await apply(metadataChange);
  assert.deepEqual(
    (
      await query(
        'SELECT attempt_count,last_error_code FROM business_v2.student_projection_outbox WHERE projection_key=$1',
        [p.projectionKey],
      )
    ).rows[0],
    { attempt_count: 7, last_error_code: 'synthetic_retry' },
  );
  await query(
    "UPDATE business_v2.student_projection_outbox SET state='claimed',lease_token='synthetic',lease_expires_at=now()+interval '1 hour' WHERE projection_key=$1",
    [p.projectionKey],
  );
  await assert.rejects(
    () => apply(request('metadata')),
    /store_projection_lease_active/,
  );
  await query(
    "UPDATE business_v2.student_projection_outbox SET state='held',lease_token=NULL,lease_expires_at=NULL WHERE projection_key=$1",
    [p.projectionKey],
  );
  summary.deliveryColumns = { preserved: true, activeLeaseRefused: true };

  const c2 = await adminPool.connect();
  try {
    await c2.query('BEGIN');
    await c2.query(lock());
    const snap = await loadEnrollmentStore(c2);
    const changed = structuredClone(snap.state);
    delete changed.enrollment.orders[Object.keys(changed.enrollment.orders)[0]];
    await assert.rejects(
      () => persistEnrollmentStore(c2, snap, changed),
      /store_deletion_or_duplicate_refused/,
    );
    await c2.query('ROLLBACK');
    await c2.query('BEGIN');
    await c2.query(lock());
    const stale = await loadEnrollmentStore(c2);
    const staleAfter = structuredClone(stale.state);
    staleAfter.capacity.seatPools['pool:metadata'].capacity += 1;
    staleAfter.capacity.seatPools['pool:metadata'].version += 1;
    await c2.query(
      "UPDATE business_v2.academy_seat_pools SET version=version+1 WHERE pool_key='pool:metadata'",
    );
    await assert.rejects(
      () => persistEnrollmentStore(c2, stale, staleAfter),
      /store_compare_and_swap_failed/,
    );
    await c2.query('ROLLBACK');
    summary.staleVersion = { refused: true };
    await c2.query('BEGIN');
    await c2.query(lock());
    const before = await loadEnrollmentStore(c2);
    const edited = structuredClone(before.state);
    Object.values(edited.enrollment.evidence)[0].evidenceSha256 = 'b'.repeat(
      64,
    );
    await assert.rejects(
      () => persistEnrollmentStore(c2, before, edited),
      /store_append_only_conflict/,
    );
    await c2.query('ROLLBACK');
  } finally {
    c2.release();
  }
  summary.appendOnly = { deleteRefused: true, evidenceRewriteRefused: true };

  const rollbackSql = fs.readFileSync(
    path.resolve(
      'data/business/migrations/nanoclaw-v2/rollback_146_student_enrollment_store_contract.sql',
    ),
    'utf8',
  );
  const rollbackClient = await adminPool.connect();
  try {
    await assert.rejects(
      () => rollbackClient.query(rollbackSql),
      /refusing projection-version rollback/,
    );
    await rollbackClient.query('ROLLBACK');
  } finally {
    rollbackClient.release();
  }
  const grants = (
    await query(
      `SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='business_v2'
    AND table_name=ANY($1::text[]) AND grantee NOT IN ('nanoclaw_admin',current_user)`,
      [[...ENROLLMENT_STORE_TABLES]],
    )
  ).rows[0].n;
  assert.equal(grants, 0);
  summary.schema = {
    tables: ENROLLMENT_STORE_TABLES.length,
    nonAdminGrants: grants,
    populatedRollbackRefused: true,
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
} finally {
  await pool.end();
}
