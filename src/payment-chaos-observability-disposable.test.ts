import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PaymentChaosObservabilityStore } from './payment-chaos-observability.js';
import type { PaymentScope } from './payment-domain.js';
import { paymentScopeFingerprint } from './payment-domain.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import type { PaymentTransaction } from './payment-store.js';

const database = `nc_payment_chaos_${randomUUID().replaceAll('-', '')}`;
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 4,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let created = false;
let store: PaymentChaosObservabilityStore;
const attemptId = randomUUID();
const otherProductAttemptId = randomUUID();
const operationId = randomUUID();
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'live',
  company: 'fixture-company',
  merchant: 'fixture-merchant',
  store: 'fixture-store',
  endpointRegion: 'eu',
};
const scopeHash = paymentScopeFingerprint(scope);
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const transaction: PaymentTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE nanoclaw_admin');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...pgConfig, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(`
    CREATE FUNCTION business_v2.fn_payment_store_immutable() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END $$;
    CREATE TABLE business_v2.payment_attempts(
      attempt_id uuid PRIMARY KEY,scope_sha256 text NOT NULL,contract jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_operations(
      operation_id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts,
      session_sequence integer NOT NULL);
    CREATE TABLE business_v2.payment_operation_receipts(
      operation_id uuid NOT NULL REFERENCES business_v2.payment_operations,
      version integer NOT NULL,kind text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_session_terminal_nonpayment_receipts(
      receipt_sha256 text PRIMARY KEY,scope_sha256 text NOT NULL,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts,
      session_sequence integer NOT NULL,terminal_status text NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_events(
      scope_sha256 text NOT NULL,payload_sha256 text NOT NULL,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts,
      session_sequence integer NOT NULL,fact jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_event_exceptions(
      exception_sha256 text PRIMARY KEY,scope_sha256 text NOT NULL,attempt_hint uuid,
      attempt_id uuid,related_attempt_id uuid,reason text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_owned_event_exceptions(
      exception_sha256 text PRIMARY KEY,scope_sha256 text NOT NULL,attempt_hint uuid,
      reason text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_session_retry_exceptions(
      exception_sha256 text PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts,
      session_sequence integer NOT NULL,reason text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE business_v2.payment_enrollment_admissions(
      scope_sha256 text NOT NULL,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts,
      admission_evidence_sha256 text NOT NULL,state text NOT NULL,materialized_at bigint NOT NULL);
    CREATE TABLE business_v2.payment_checkout_admission_evidence(
      scope_sha256 text NOT NULL,caller text NOT NULL,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts,
      identity_preparation_id uuid NOT NULL);
    CREATE TABLE business_v2.payment_checkout_attribution_admissions(
      scope_sha256 text NOT NULL,caller text NOT NULL,attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts);
    ALTER TABLE business_v2.payment_attempts OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_operations OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_operation_receipts OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_session_terminal_nonpayment_receipts OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_events OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_event_exceptions OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_owned_event_exceptions OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_session_retry_exceptions OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_enrollment_admissions OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_checkout_admission_evidence OWNER TO nanoclaw_admin;
    ALTER TABLE business_v2.payment_checkout_attribution_admissions OWNER TO nanoclaw_admin;
  `);
  await pool.query(sql('160_payment_chaos_observability.sql'));
  await pool.query(
    `INSERT INTO business_v2.payment_attempts(attempt_id,scope_sha256,contract)
     VALUES($1,$2,$3::jsonb)`,
    [
      attemptId,
      scopeHash,
      JSON.stringify({
        quoteFingerprint: 'q'.repeat(64),
        quote: { offerKey: 'mcq-program-a-foundations' },
      }),
    ],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_attempts(attempt_id,scope_sha256,contract)
     VALUES($1,$2,$3::jsonb)`,
    [
      otherProductAttemptId,
      scopeHash,
      JSON.stringify({
        quoteFingerprint: 'z'.repeat(64),
        quote: { offerKey: 'unrelated-offer' },
      }),
    ],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_operations(operation_id,attempt_id,session_sequence)
     VALUES($1,$2,1)`,
    [operationId, attemptId],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_operation_receipts(operation_id,version,kind)
     VALUES($1,0,'prepared'),($1,1,'session_available')`,
    [operationId],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_events(scope_sha256,payload_sha256,attempt_id,session_sequence,fact)
     VALUES($1,$2,$3,1,'{"kind":"authorization","success":"true"}'::jsonb)`,
    [scopeHash, 'e'.repeat(64), attemptId],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_enrollment_admissions
       (scope_sha256,attempt_id,admission_evidence_sha256,state,materialized_at)
     VALUES($1,$2,$3,'provisional_materialized',extract(epoch from clock_timestamp())*1000)`,
    [scopeHash, attemptId, 'a'.repeat(64)],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_checkout_admission_evidence
       (scope_sha256,caller,attempt_id,identity_preparation_id)
     VALUES($1,'tandem-wordpress-live',$2,$3)`,
    [scopeHash, attemptId, randomUUID()],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_checkout_attribution_admissions
       (scope_sha256,caller,attempt_id)
     VALUES($1,'tandem-wordpress-live',$2)`,
    [scopeHash, attemptId],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_checkout_admission_evidence
       (scope_sha256,caller,attempt_id,identity_preparation_id)
     VALUES($1,'tandem-wordpress-live',$2,$3)`,
    [scopeHash, otherProductAttemptId, randomUUID()],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_checkout_attribution_admissions
       (scope_sha256,caller,attempt_id)
     VALUES($1,'tandem-wordpress-live',$2)`,
    [scopeHash, otherProductAttemptId],
  );
  await pool.query(
    `INSERT INTO business_v2.payment_owned_event_exceptions
       (exception_sha256,scope_sha256,attempt_hint,reason)
     VALUES($1,$2,$3,'malformed_correlation')`,
    ['f'.repeat(64), scopeHash, randomUUID()],
  );
  store = new PaymentChaosObservabilityStore(
    transaction,
    'tandem-wordpress-live',
    scope,
    new PaymentPayloadVault('fixture', new Map([['fixture', randomBytes(32)]])),
  );
}, 15000);

afterAll(async () => {
  await pool?.end();
  if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
  await maintenance.end();
});

describe('payment Chaos disposable projection', () => {
  it('projects committed attempt/session/authorization/admission exactly once', async () => {
    await expect(store.projectCommitted(20)).resolves.toBe(5);
    await expect(store.projectCommitted(20)).resolves.toBe(0);
    const rows = await pool.query(
      `SELECT event_name,action,outcome,reason_code,session_sequence,
        source_event_sha256,origin_reference FROM business_v2.payment_chaos_observability_outbox
       ORDER BY action`,
    );
    expect(rows.rows).toHaveLength(5);
    expect(
      rows.rows.every(
        (value) => value.origin_reference !== otherProductAttemptId,
      ),
    ).toBe(true);
    expect(rows.rows.map((value) => value.action)).toEqual([
      'attempt_accepted',
      'authorization_verified',
      'purchase_admitted',
      'session_ready',
      'session_requested',
    ]);
    expect(
      rows.rows.find((value) => value.action === 'purchase_admitted'),
    ).toMatchObject({
      event_name: 'purchase_completed',
      outcome: 'verified',
    });
    expect(
      rows.rows.every((value) =>
        /^[a-f0-9]{64}$/.test(value.source_event_sha256),
      ),
    ).toBe(true);
    const receipts = await pool.query(
      `SELECT kind,outcome_code,count(*)::int count
       FROM business_v2.payment_chaos_observability_receipts
       GROUP BY kind,outcome_code`,
    );
    expect(receipts.rows).toEqual([
      { kind: 'queued', outcome_code: 'projected', count: 5 },
    ]);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM business_v2.payment_chaos_observability_outbox
           WHERE source_kind='owned_event_exception'`,
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('retains projected evidence and refuses populated rollback', async () => {
    await pool.query(
      `INSERT INTO business_v2.payment_chaos_observability_outbox
       (source_event_sha256,scope_sha256,attempt_id,source_kind,
        origin_reference,origin_version,event_name,action,outcome,reason_code,
        session_sequence,evidence_class,occurred_at)
       VALUES($1,$2,$3,'attempt','other-scope',0,'checkout_started',
        'attempt_accepted','started','none',1,'signed_private_request',
        '2000-01-01T00:00:00Z')`,
      ['9'.repeat(64), '8'.repeat(64), attemptId],
    );
    const [claimed] = await store.claim(1);
    expect(claimed).toMatchObject({
      scope_sha256: scopeHash,
      attempts: 1,
      lease_token: expect.any(String),
    });
    await expect(
      store.markFailed(claimed, 'transport_error', null),
    ).resolves.toBe(false);
    expect(
      (
        await pool.query(
          `SELECT status,attempts,last_error_code
           FROM business_v2.payment_chaos_observability_outbox WHERE id=$1`,
          [claimed.id],
        )
      ).rows[0],
    ).toEqual({
      status: 'failed',
      attempts: 1,
      last_error_code: 'transport_error',
    });
    expect(
      (
        await pool.query(
          `SELECT kind FROM business_v2.payment_chaos_observability_receipts
           WHERE outbox_id=$1 ORDER BY recorded_at,kind`,
          [claimed.id],
        )
      ).rows
        .map((value) => value.kind)
        .sort(),
    ).toEqual(['claimed', 'failed', 'queued']);
    await expect(
      pool.query(
        `UPDATE business_v2.payment_chaos_observability_outbox
         SET action='session_failed' WHERE action='session_ready'`,
      ),
    ).rejects.toThrow('payment observability immutable evidence');
    await expect(
      pool.query(sql('rollback_160_payment_chaos_observability.sql')),
    ).rejects.toThrow('payment observability rollback refused');
    expect(
      (
        await pool.query(
          'SELECT count(*)::int count FROM business_v2.payment_chaos_observability_outbox',
        )
      ).rows[0].count,
    ).toBe(6);
  });
});
