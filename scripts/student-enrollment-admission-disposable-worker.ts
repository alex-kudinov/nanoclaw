import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  createEnrollmentAdmission,
  claimEnrollmentWriter,
} from '../src/student-enrollment-admission.js';
import {
  assertEnrollmentStoreDatabase,
  EnrollmentCommitUncertainError,
} from '../src/student-enrollment-store.js';
import {
  ENROLLMENT_STORE_TABLES,
  loadEnrollmentStore,
} from '../src/student-enrollment-store-mapping.js';
import { bookkeeperContractHash as hash } from '../src/bookkeeper-enrollment-contract.js';
import {
  admissionFixture,
  signAdmissionFixtures,
} from './enrollment-admission-fixtures.mjs';

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
const admin = {
  connect: async () => {
    const c = await pool.connect();
    await c.query('SET ROLE nanoclaw_admin');
    return c;
  },
};
const now = Date.now(),
  at = new Date(now).toISOString();
const adyenScope = `adyen:${'d'.repeat(64)}`;
const adyenRegistration = {
  channel: 'website_checkout' as const,
  sourceType: 'adyen_payment_acceptance_v1' as const,
  scope: adyenScope,
  objectType: 'payment' as const,
};
const adyenSource = {
  scope: adyenScope,
  objectType: 'payment',
  objectId: 'ABCDEF0123456789',
  sourceType: 'adyen_payment_acceptance_v1',
} as const;
const lock = `LOCK TABLE ${ENROLLMENT_STORE_TABLES.map((t) => 'business_v2.' + t).join(',')} IN SHARE ROW EXCLUSIVE MODE`;
const sourceKey = (f: ReturnType<typeof admissionFixture>) =>
  hash([
    f.envelope.funding.source.scope,
    f.envelope.funding.source.objectType,
    f.envelope.funding.source.objectId,
  ]);
const service = (
  f: ReturnType<typeof admissionFixture>,
  policyKey = 'policy:synthetic',
) =>
  createEnrollmentAdmission({
    issuers: f.issuers,
    catalog: f.catalog,
    clock: f.clock,
    policyKey,
  });
function fixture(
  label: string,
  participant = 2,
  origin:
    | 'provider_event'
    | 'provider_read'
    | 'operator_decision' = 'provider_event',
) {
  const f = admissionFixture(label, now, origin);
  f.envelope.seats[0].participantPartyId = participant;
  f.statements = signAdmissionFixtures(f.envelope, f.issuers, now);
  return f;
}
async function query(sql: string, values: unknown[] = []) {
  const c = await admin.connect();
  try {
    return await c.query(sql, values);
  } finally {
    c.release();
  }
}
async function snapshot() {
  const c = await admin.connect();
  try {
    await c.query('BEGIN');
    await c.query(lock);
    const state = await loadEnrollmentStore(c);
    await c.query('COMMIT');
    return state.state;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function legacy(f: ReturnType<typeof fixture>) {
  const c = await admin.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await c.query(lock);
    const allowed = await claimEnrollmentWriter(
      c,
      f.envelope.funding.source,
      f.envelope.channel,
      'legacy',
      'policy:synthetic',
      hash(f.envelope),
      'legacy:synthetic',
      at,
    );
    if (allowed)
      await c.query(
        'INSERT INTO business_v2.fixture_legacy_effects(source_key) VALUES($1) ON CONFLICT DO NOTHING',
        [sourceKey(f)],
      );
    await c.query('COMMIT');
    return allowed;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
const summary: Record<string, unknown> = {};
try {
  await query(
    `INSERT INTO business_v2.academy_delivery_blocks
    (delivery_block_key,component_key,source_scope,source_object_id,starts_at,ends_at,timezone,session_set_sha256,schedule_evidence_sha256,state,version,created_at,updated_at,updated_by)
    VALUES('class:admission','component:admission','calendar:synthetic','event:synthetic',$1,$2,'UTC',repeat('a',64),repeat('a',64),'scheduled',0,$3,$3,'synthetic')`,
    [
      new Date(now + 86400000).toISOString(),
      new Date(now + 30 * 86400000).toISOString(),
      at,
    ],
  );
  await query(
    `INSERT INTO business_v2.academy_seat_pools(pool_key,delivery_block_id,capacity,operational_state,configuration_evidence_sha256,version,created_at,updated_at,updated_by)
    SELECT 'pool:admission',id,100,'open',repeat('a',64),0,$1,$1,'synthetic' FROM business_v2.academy_delivery_blocks WHERE delivery_block_key='class:admission'`,
    [at],
  );
  await query(
    `INSERT INTO business_v2.academy_seat_pool_offers(mapping_key,pool_id,offer_key,catalog_revision,state,version,evidence_sha256,created_at,updated_at,updated_by)
    SELECT 'mapping:admission',id,'offer:admission',1,'active',0,repeat('a',64),$1,$1,'synthetic' FROM business_v2.academy_seat_pools WHERE pool_key='pool:admission'`,
    [at],
  );
  await query(
    'CREATE TABLE business_v2.fixture_legacy_effects(source_key text PRIMARY KEY)',
  );

  const event = fixture('event', 2);
  const gate = service(event);
  const cert = gate.verify(event.envelope, event.statements);
  const first = await gate.admit(admin, cert);
  assert.equal(first.disposition, 'accepted');
  const firstHash = hash(await snapshot());
  assert.equal((await gate.admit(admin, cert)).disposition, 'duplicate');
  assert.equal(hash(await snapshot()), firstHash);
  assert(
    Object.values(first.enrollment.evidence).some(
      (e) => e.evidenceType === 'authenticated_provider_event',
    ),
  );
  assert(
    Object.values(first.enrollment.evidence).some(
      (e) => e.evidenceType === 'authenticated_operator_decision',
    ),
  );
  summary.authenticated = true;
  summary.replay = true;
  event.envelope.intakeKey = 'intake:event_alias';
  event.envelope.sourceAlias = event.envelope.funding.aliases[0];
  const alias = await gate.admit(
    admin,
    gate.verify(event.envelope, event.statements),
  );
  assert.equal(alias.orderKey, first.orderKey);
  assert.equal(
    Object.values(alias.enrollment.enrollments).filter(
      (e) => e.orderKey === first.orderKey,
    ).length,
    1,
  );
  summary.aliases = true;

  const read = fixture('read', 3, 'provider_read');
  const readGate = service(read);
  const readResult = await readGate.admit(
    admin,
    readGate.verify(read.envelope, read.statements),
  );
  assert.equal(readResult.disposition, 'accepted');
  assert(
    Object.values(readResult.enrollment.evidence).some(
      (e) => e.evidenceType === 'authenticated_provider_read',
    ),
  );
  const operator = fixture('operator', 4, 'operator_decision');
  const operatorGate = service(operator);
  assert.equal(
    (
      await operatorGate.admit(
        admin,
        operatorGate.verify(operator.envelope, operator.statements),
      )
    ).disposition,
    'accepted',
  );

  const old = fixture('legacy', 5);
  assert.equal(await legacy(old), true);
  const oldGate = service(old);
  const blocked = await oldGate.admit(
    admin,
    oldGate.verify(old.envelope, old.statements),
  );
  assert.equal(blocked.disposition, 'held');
  assert(
    Object.values(blocked.enrollment.exceptions).some(
      (e) =>
        e.reasonCode === 'writer_ownership_conflict' &&
        e.ownerRole === 'owner_admin',
    ),
  );
  assert.equal(
    Object.values(blocked.enrollment.enrollments).filter(
      (e) => e.orderKey === 'bookkeeper:' + sourceKey(old),
    ).length,
    0,
  );
  assert.equal(
    (
      await query(
        'SELECT count(*)::int n FROM business_v2.fixture_legacy_effects WHERE source_key=$1',
        [sourceKey(old)],
      )
    ).rows[0].n,
    1,
  );
  summary.legacyBlocked = true;
  const correction = fixture('legacy', 5, 'operator_decision');
  correction.envelope.channel = 'migration_or_correction';
  correction.issuers[0].issuerId = 'issuer:correction-finance';
  correction.issuers[1].issuerId = 'issuer:correction-operator';
  correction.issuers.forEach((i) => {
    i.channels = ['migration_or_correction'];
  });
  correction.statements = signAdmissionFixtures(
    correction.envelope,
    correction.issuers,
    now,
  );
  const correctionGate = service(correction);
  const correctionResult = await correctionGate.admit(
    admin,
    correctionGate.verify(correction.envelope, correction.statements),
  );
  assert.equal(correctionResult.disposition, 'held');
  assert.deepEqual(
    correctionResult.enrollment.enrollments,
    blocked.enrollment.enrollments,
  );
  assert.deepEqual(
    correctionResult.enrollment.entitlements,
    blocked.enrollment.entitlements,
  );
  assert.deepEqual(
    correctionResult.enrollment.assignments,
    blocked.enrollment.assignments,
  );
  assert.deepEqual(
    correctionResult.enrollment.projections,
    blocked.enrollment.projections,
  );
  assert.deepEqual(correctionResult.capacity, blocked.capacity);
  assert(
    Object.values(correctionResult.enrollment.exceptions).some(
      (e) => e.reasonCode === 'correction_requires_resolution',
    ),
  );
  assert.equal(
    Object.values(correctionResult.enrollment.enrollments).filter(
      (e) => e.orderKey === 'bookkeeper:' + sourceKey(correction),
    ).length,
    0,
  );
  assert.equal(
    (
      await query(
        'SELECT writer FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
        [sourceKey(correction)],
      )
    ).rows[0].writer,
    'legacy',
  );
  assert.equal(
    (
      await query(
        'SELECT count(*)::int n FROM business_v2.fixture_legacy_effects WHERE source_key=$1',
        [sourceKey(correction)],
      )
    ).rows[0].n,
    1,
  );
  summary.correctionReviewOnly = true;
  assert.equal(await legacy(fixture('event')), false);

  const race = fixture('race', 6);
  const raceGate = service(race);
  const raceCert = raceGate.verify(race.envelope, race.statements);
  const [newResult, oldWon] = await Promise.all([
    raceGate.admit(admin, raceCert),
    legacy(race),
  ]);
  const newCount = Object.values(
    (await snapshot()).enrollment.enrollments,
  ).filter((e) => e.orderKey === 'bookkeeper:' + sourceKey(race)).length;
  const oldCount = (
    await query(
      'SELECT count(*)::int n FROM business_v2.fixture_legacy_effects WHERE source_key=$1',
      [sourceKey(race)],
    )
  ).rows[0].n;
  assert.equal(newCount + oldCount, 1);
  assert.equal(newResult.disposition, oldWon ? 'held' : 'accepted');
  summary.dualWriterRace = true;

  const fail = fixture('rollback', 7);
  const failGate = service(fail);
  const failCert = failGate.verify(fail.envelope, fail.statements);
  const beforeFail = hash(await snapshot());
  await query(`CREATE FUNCTION business_v2.fixture_fail_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic admission failure'; END $$;
    CREATE TRIGGER fixture_fail_admission BEFORE INSERT ON business_v2.student_projection_outbox FOR EACH ROW EXECUTE FUNCTION business_v2.fixture_fail_admission()`);
  await assert.rejects(
    () => failGate.admit(admin, failCert),
    /synthetic admission failure/,
  );
  assert.equal(hash(await snapshot()), beforeFail);
  assert.equal(
    (
      await query(
        'SELECT count(*)::int n FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
        [sourceKey(fail)],
      )
    ).rows[0].n,
    0,
  );
  await query(
    'DROP TRIGGER fixture_fail_admission ON business_v2.student_projection_outbox; DROP FUNCTION business_v2.fixture_fail_admission()',
  );
  assert.equal((await failGate.admit(admin, failCert)).disposition, 'accepted');
  summary.atomicRollback = true;
  for (const [label, table, assignment, error] of [
    [
      'receipt_corrupt',
      'student_enrollment_authenticated_receipts',
      "NEW.body_sha256:=repeat('b',64)",
      'authenticated_receipt_readback_mismatch',
    ],
    [
      'claim_corrupt',
      'student_enrollment_writer_claims',
      "NEW.claimed_by:='synthetic-corrupt'",
      'writer_claim_readback_mismatch',
    ],
  ]) {
    const f = fixture(label, 5);
    const g = service(f);
    const c = g.verify(f.envelope, f.statements);
    const before = hash(await snapshot());
    await query(`CREATE FUNCTION business_v2.fixture_corrupt_control() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${assignment}; RETURN NEW; END $$;
      CREATE TRIGGER fixture_corrupt_control BEFORE INSERT ON business_v2.${table} FOR EACH ROW EXECUTE FUNCTION business_v2.fixture_corrupt_control()`);
    await assert.rejects(() => g.admit(admin, c), new RegExp(error));
    assert.equal(hash(await snapshot()), before);
    assert.equal(
      (
        await query(
          'SELECT count(*)::int n FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
          [sourceKey(f)],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await query(
          'SELECT count(*)::int n FROM business_v2.student_enrollment_authenticated_receipts WHERE source_key=$1',
          [sourceKey(f)],
        )
      ).rows[0].n,
      0,
    );
    await query(
      `DROP TRIGGER fixture_corrupt_control ON business_v2.${table}; DROP FUNCTION business_v2.fixture_corrupt_control()`,
    );
  }
  summary.controlReadback = true;

  const ack = fixture('ack', 8);
  const ackGate = service(ack);
  const ackCert = ackGate.verify(ack.envelope, ack.statements);
  let lost = false;
  const uncertain = {
    connect: async () => {
      const c = await admin.connect();
      return new Proxy(c, {
        get(t, k) {
          if (k === 'query')
            return async (...args: unknown[]) => {
              const r = await (t.query as Function).apply(t, args);
              if (args[0] === 'COMMIT' && !lost) {
                lost = true;
                throw new Error('synthetic lost ack');
              }
              return r;
            };
          const v = Reflect.get(t, k);
          return typeof v === 'function' ? v.bind(t) : v;
        },
      }) as PoolClient;
    },
  };
  await assert.rejects(
    () => ackGate.admit(uncertain, ackCert),
    EnrollmentCommitUncertainError,
  );
  const afterAck = hash(await snapshot());
  assert.equal((await ackGate.admit(admin, ackCert)).disposition, 'duplicate');
  assert.equal(hash(await snapshot()), afterAck);
  summary.uncertainCommit = true;

  const exp = fixture('expiry', 9);
  const expGate = service(exp);
  const expCert = expGate.verify(exp.envelope, exp.statements);
  const delayed = {
    connect: async () => {
      const c = await admin.connect();
      exp.setClock(now + 300001);
      return c;
    },
  };
  await assert.rejects(
    () => expGate.admit(delayed, expCert),
    /admission_expired_or_future/,
  );
  assert.equal(
    (
      await query(
        'SELECT count(*)::int n FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
        [sourceKey(exp)],
      )
    ).rows[0].n,
    0,
  );
  summary.expiredBeforeWrite = true;

  const grant = fixture('owner_grant', 10, 'operator_decision');
  grant.envelope.channel = 'scholarship';
  grant.envelope.funding.source = {
    scope: 'owner:synthetic',
    objectType: 'grant',
    objectId: 'grant_auth',
  };
  grant.envelope.sourceAlias = grant.envelope.funding.source;
  grant.envelope.funding.aliases = [];
  grant.envelope.funding.status = 'grant';
  grant.envelope.funding.amountMinor = null;
  grant.envelope.funding.currency = null;
  grant.envelope.funding.payerPartyId = null;
  grant.envelope.commercial.totalMinor = null;
  grant.envelope.commercial.currency = null;
  grant.envelope.seats[0].payerRelationship = 'not_applicable';
  for (const issuer of grant.issuers) {
    issuer.channels = ['scholarship'];
    issuer.role = 'owner_admin';
    issuer.sourceScopes = ['owner:synthetic'];
  }
  grant.statements = signAdmissionFixtures(grant.envelope, grant.issuers, now);
  const grantGate = service(grant);
  const granted = await grantGate.admit(
    admin,
    grantGate.verify(grant.envelope, grant.statements),
  );
  assert.equal(granted.disposition, 'accepted');
  assert.equal(
    granted.enrollment.orders[granted.orderKey].financialClassification,
    'not_applicable',
  );
  summary.authenticatedGrant = true;

  const adyenSourceKey = hash([
    adyenSource.scope,
    adyenSource.objectType,
    adyenSource.objectId,
  ]);
  const unregisteredClient = await admin.connect();
  try {
    await unregisteredClient.query('BEGIN');
    await assert.rejects(
      () =>
        claimEnrollmentWriter(
          unregisteredClient,
          adyenSource,
          'website_checkout',
          'enrollment',
          'policy:synthetic',
          'd'.repeat(64),
          'website-checkout-enrollment-adapter:host',
          at,
        ),
      /noncanonical_writer_source/,
    );
    await unregisteredClient.query('ROLLBACK');
  } finally {
    unregisteredClient.release();
  }
  assert.equal(
    (
      await query(
        'SELECT count(*)::int n FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
        [adyenSourceKey],
      )
    ).rows[0].n,
    0,
  );
  summary.unregisteredWebsiteWriterRejected = true;

  const registeredClient = await admin.connect();
  try {
    await registeredClient.query('BEGIN');
    assert.equal(
      await claimEnrollmentWriter(
        registeredClient,
        adyenSource,
        'website_checkout',
        'enrollment',
        'policy:synthetic',
        'd'.repeat(64),
        'website-checkout-enrollment-adapter:host',
        at,
        [adyenRegistration],
      ),
      true,
    );
    await registeredClient.query('COMMIT');
  } finally {
    registeredClient.release();
  }
  assert.equal(
    (
      await query(
        `SELECT count(*)::int n FROM business_v2.student_enrollment_writer_claims
         WHERE source_key=$1 AND source_scope=$2 AND source_object_type='payment'
           AND source_object_id=$3 AND writer='enrollment'`,
        [adyenSourceKey, adyenScope, adyenSource.objectId],
      )
    ).rows[0].n,
    1,
  );
  summary.registeredWebsiteWriterClaim = true;

  const sponsor = fixture('sponsor', 9, 'operator_decision');
  sponsor.envelope.channel = 'sponsored_cohort';
  sponsor.issuers.forEach((i) => {
    i.channels = ['sponsored_cohort'];
  });
  sponsor.envelope.commercial.seatCount = 2;
  sponsor.envelope.seats.push({
    participantPartyId: null,
    payerRelationship: 'unknown',
    proofKey: null,
    assignment: {
      poolKey: 'pool:admission',
      componentKey: 'component:admission',
      proofKey: 'proof:class:2',
    },
  });
  sponsor.statements = signAdmissionFixtures(
    sponsor.envelope,
    sponsor.issuers,
    now,
  );
  const sponsorGate = service(sponsor);
  const sponsored = await sponsorGate.admit(
    admin,
    sponsorGate.verify(sponsor.envelope, sponsor.statements),
  );
  assert.equal(sponsored.disposition, 'held');
  assert.deepEqual(
    Object.values(sponsored.enrollment.seats)
      .filter((s) => s.orderKey === sponsored.orderKey)
      .map((s) => s.state)
      .sort(),
    ['materialized', 'unassigned'],
  );
  summary.partialSponsor = true;

  const changedPolicy = service(event, 'policy:changed');
  const oldState = await snapshot();
  const policyResult = await changedPolicy.admit(
    admin,
    changedPolicy.verify(event.envelope, event.statements),
  );
  assert.equal(policyResult.disposition, 'held');
  assert.deepEqual(
    policyResult.enrollment.projections,
    oldState.enrollment.projections,
  );
  summary.policyConflict = true;
  const receiptChange = structuredClone(event.envelope);
  receiptChange.intakeKey = 'intake:receipt_conflict';
  receiptChange.funding.amountMinor = 12000;
  receiptChange.commercial.totalMinor = 12000;
  const altered = signAdmissionFixtures(receiptChange, event.issuers, now);
  const alteredBody = JSON.parse(altered[0].body);
  alteredBody.receiptId = JSON.parse(event.statements[0].body).receiptId;
  altered[0].body = JSON.stringify(alteredBody);
  altered[0].signature = createHmac('sha256', event.issuers[0].key)
    .update(altered[0].body)
    .digest('hex');
  const beforeReceipts = (
    await query(
      'SELECT count(*)::int n FROM business_v2.student_enrollment_authenticated_receipts',
    )
  ).rows[0].n;
  const receiptResult = await gate.admit(
    admin,
    gate.verify(receiptChange, altered),
  );
  assert.equal(receiptResult.disposition, 'held');
  assert(
    Object.values(receiptResult.enrollment.exceptions).some(
      (e) => e.reasonCode === 'authenticated_receipt_conflict',
    ),
  );
  assert.equal(
    (
      await query(
        'SELECT count(*)::int n FROM business_v2.student_enrollment_authenticated_receipts',
      )
    ).rows[0].n,
    beforeReceipts,
  );
  assert.deepEqual(
    receiptResult.enrollment.projections,
    policyResult.enrollment.projections,
  );
  summary.receiptConflict = true;
  await assert.rejects(
    () =>
      query(
        "UPDATE business_v2.student_enrollment_authenticated_receipts SET role='owner_admin'",
      ),
    /append-only synthetic relation/,
  );
  const badAlias = fixture('invalid');
  badAlias.envelope.funding.source = {
    scope: 'stripe:tandem',
    objectType: 'checkout_session',
    objectId: 'cs_invalid',
  };
  await assert.rejects(() => legacy(badAlias), /noncanonical_writer_source/);

  const canonicalData = JSON.stringify((await snapshot()).enrollment);
  for (const f of [event, read, operator, old, race, fail, ack])
    for (const issuer of f.issuers)
      assert(!canonicalData.includes(Buffer.from(issuer.key).toString('hex')));
  for (const statement of event.statements)
    assert(!canonicalData.includes(statement.signature));
  summary.noSecretsStored = true;
  const rollback = fs.readFileSync(
    path.resolve(
      'data/business/migrations/nanoclaw-v2/rollback_147_student_enrollment_writer_claims.sql',
    ),
    'utf8',
  );
  const rc = await admin.connect();
  try {
    await assert.rejects(
      () => rc.query(rollback),
      /refusing writer-claim rollback/,
    );
    await rc.query('ROLLBACK');
  } finally {
    rc.release();
  }
  summary.rollbackRefused = true;
  await query(
    `INSERT INTO business_v2.student_enrollment_orders
     (order_key,source_channel,offer_key,bundle_key,bundle_version,payer_party_id,
      seat_count,financial_classification,state,policy_revision,evidence_sha256,
      effective_at,created_at,updated_at,updated_by)
     VALUES('fixture:rollback153','website_checkout',NULL,NULL,NULL,NULL,1,
      'provider_accepted_provisional','needs_offer',1,repeat('d',64),NULL,$1,$1,
      'migration153:fixture')`,
    [at],
  );
  const rollback153 = fs.readFileSync(
    path.resolve(
      'data/business/migrations/nanoclaw-v2/rollback_153_website_checkout_provisional_finance.sql',
    ),
    'utf8',
  );
  const rc153 = await admin.connect();
  try {
    await assert.rejects(
      () => rc153.query(rollback153),
      /rollback153 refused: website checkout finance state exists/,
    );
    await rc153.query('ROLLBACK');
  } finally {
    rc153.release();
  }
  summary.provisionalRollbackRefused = true;
  summary.nonAdminGrants = (
    await query(
      "SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name IN ('student_enrollment_writer_claims','student_enrollment_authenticated_receipts') AND grantee NOT IN ('nanoclaw_admin',current_user)",
    )
  ).rows[0].n;
  assert.equal(summary.nonAdminGrants, 0);
  process.stdout.write(JSON.stringify(summary) + '\n');
} finally {
  await pool.end();
}
