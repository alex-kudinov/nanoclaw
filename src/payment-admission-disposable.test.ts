import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PaymentAdmissionStore } from './payment-admission-store.js';
import {
  PaymentRequestAuthenticator,
  type PaymentRequestEnvelope,
} from './payment-request-auth.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';
import { createPaymentAttempt } from './payment-domain.js';

const database = `nc_payment_admission_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_admission_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe database name');
const config = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 30,
};
const maintenance = new Pool({ ...config, database: 'postgres' });
let pool: Pool, store: PaymentStore, admission: PaymentAdmissionStore;
let created = false;
const scope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'fixture',
  store: 'fixture',
  endpointRegion: 'eu',
} as const;
const vault = new PaymentPayloadVault(
  'fixture',
  new Map([['fixture', randomBytes(32)]]),
);
const auth = new PaymentRequestAuthenticator(
  new Map([
    ['test', { caller: 'wordpress-test', secret: randomBytes(32) }],
    ['other', { caller: 'other', secret: randomBytes(32) }],
  ]),
);
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const migration = sql('150_payment_request_admission.sql');
const rollback = sql('rollback_150_payment_request_admission.sql');
const transaction: PaymentTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE nanoclaw_admin');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
function request(
  operationId = randomUUID(),
  caller = 'wordpress-test',
  path: PaymentRequestEnvelope['path'] = '/internal/payments/sessions',
) {
  const body = Buffer.from('{"fixture":"payment-request"}');
  const expected = { caller, method: 'POST', path };
  const envelope = auth.sign(
    {
      version: 1,
      keyId: caller === 'other' ? 'other' : 'test',
      caller,
      method: 'POST',
      path,
      timestamp: Date.now(),
      operationId,
      nonce: randomUUID(),
    },
    body,
  );
  return { body, expected, envelope };
}
async function admitted(operationId = randomUUID(), caller = 'wordpress-test') {
  const r = request(operationId, caller);
  return admission.admit(r.envelope, r.body, r.expected);
}
async function attempt() {
  const now = Date.now() - 1000;
  const a = createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture',
      bundleVersion: 'fixture',
      deliveryVersion: 'fixture',
      locale: 'en',
      country: 'US',
      payerReference: null,
      participantReference: null,
      currency: 'USD',
      originalAmount: 29900,
      discountAmount: 0,
      finalAmount: 29900,
      discountPolicyReference: null,
      redemptionReference: null,
      paymentOption: 'one_time',
      termsVersion: 'fixture',
      consentReceipt: 'fixture',
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 60000,
    },
  });
  return store.acceptAttempt(a);
}

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() AS address')).rows[0]
      .address,
  ).toBeNull();
  expect(
    (
      await maintenance.query(
        "SELECT rolname FROM pg_roles WHERE rolname='nanoclaw_admin'",
      )
    ).rows,
  ).toHaveLength(1);
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(sql('149_payment_attempt_store.sql'));
  await pool.query(migration);
  store = new PaymentStore(transaction, vault);
  admission = new PaymentAdmissionStore(
    transaction,
    auth,
    vault,
    (caller, a) =>
      caller === 'wordpress-test' &&
      a.quote.authority === 'wordpress:test' &&
      JSON.stringify(a.scope) === JSON.stringify(scope),
  );
}, 15000);
afterAll(async () => {
  await pool?.end();
  try {
    if (created) {
      // pg-pool.end can resolve before server-side sockets finish closing.
      // Wait for our connections to drain; never terminate them underneath pg.
      const deadline = Date.now() + 5000;
      while (
        (
          await maintenance.query(
            'SELECT count(*) FROM pg_stat_activity WHERE datname=$1',
            [database],
          )
        ).rows[0].count !== '0'
      ) {
        if (Date.now() >= deadline)
          throw new Error('disposable connection drain failed');
        await delay(20);
      }
      await maintenance.query(`DROP DATABASE "${database}"`);
      expect(
        (
          await maintenance.query(
            'SELECT datname FROM pg_database WHERE datname=$1',
            [database],
          )
        ).rows,
      ).toHaveLength(0);
    }
  } finally {
    await maintenance.end();
  }
});

describe('durable payment request and status admission', () => {
  it('admits exactly one of 25 signed nonce replays', async () => {
    const r = request();
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        admission.admit(r.envelope, r.body, r.expected),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(24);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason.code).toBe('internal_request_replayed');
  });
  it('does not write nonce evidence for an invalid signature/body', async () => {
    const before = (
      await pool.query(
        'SELECT count(*) FROM business_v2.payment_request_nonces',
      )
    ).rows[0].count;
    const r = request();
    await expect(
      admission.admit(r.envelope, Buffer.from('changed'), r.expected),
    ).rejects.toThrow('internal_request_denied');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_request_nonces',
        )
      ).rows[0].count,
    ).toBe(before);
  });
  it('requires a committed authentic receipt before issuing a capability', async () => {
    const a = await attempt(),
      r = request();
    const uncommitted = auth.verify(r.envelope, r.body, r.expected);
    await expect(
      admission.issueStatusCapability(uncommitted, a.attemptId),
    ).rejects.toThrow('request_admission_required');
  });
  it('issues one encrypted capability under 25 concurrent retries and cannot extend expiry', async () => {
    const a = await attempt(),
      operationId = randomUUID();
    const receipts = await Promise.all(
      Array.from({ length: 25 }, () => admitted(operationId)),
    );
    const caps = await Promise.all(
      receipts.map((r) => admission.issueStatusCapability(r, a.attemptId)),
    );
    expect(new Set(caps.map((c) => c.token)).size).toBe(1);
    expect(new Set(caps.map((c) => c.id)).size).toBe(1);
    expect(await admission.permitsStatus(caps[0].token, a.attemptId)).toBe(
      true,
    );
    const again = await admission.issueStatusCapability(
      await admitted(operationId),
      a.attemptId,
      86400000,
    );
    expect(again).toEqual(caps[0]);
    const row = (
      await pool.query(
        'SELECT token_sha256,encrypted_token FROM business_v2.payment_status_capabilities WHERE capability_id=$1',
        [caps[0].id],
      )
    ).rows[0];
    expect(JSON.stringify(row)).not.toContain(caps[0].token);
    expect(row.token_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects guessed IDs, altered tokens, different orders and wrong caller scope', async () => {
    const a = await attempt(),
      b = await attempt();
    const receipt = await admitted();
    const cap = await admission.issueStatusCapability(receipt, a.attemptId);
    expect(await admission.permitsStatus(cap.token, b.attemptId)).toBe(false);
    expect(await admission.permitsStatus(a.attemptId, a.attemptId)).toBe(false);
    expect(
      await admission.permitsStatus(`pcap_${'a'.repeat(43)}`, a.attemptId),
    ).toBe(false);
    await expect(
      admission.issueStatusCapability(receipt, b.attemptId),
    ).rejects.toThrow('capability_operation_conflict');
    await expect(
      admission.issueStatusCapability(
        await admitted(randomUUID(), 'other'),
        a.attemptId,
      ),
    ).rejects.toThrow('capability_scope_denied');
  });
  it('expires capabilities using DB time and will not replay an expired token as usable', async () => {
    const a = await attempt(),
      receipt = await admitted();
    const cap = await admission.issueStatusCapability(receipt, a.attemptId, 1);
    await delay(15);
    expect(await admission.permitsStatus(cap.token, a.attemptId)).toBe(false);
    await expect(
      admission.issueStatusCapability(receipt, a.attemptId),
    ).rejects.toThrow('capability_unavailable');
  });
  it('records revocation once, immediately denies the bearer, and refuses another caller', async () => {
    const a = await attempt(),
      receipt = await admitted();
    const cap = await admission.issueStatusCapability(receipt, a.attemptId);
    await expect(
      admission.revokeStatusCapability(
        await admitted(randomUUID(), 'other'),
        cap.id,
        'security',
      ),
    ).rejects.toThrow('capability_scope_denied');
    const revoke = await admitted();
    await admission.revokeStatusCapability(revoke, cap.id, 'security');
    await admission.revokeStatusCapability(revoke, cap.id, 'security');
    expect(await admission.permitsStatus(cap.token, a.attemptId)).toBe(false);
    await expect(
      admission.issueStatusCapability(receipt, a.attemptId),
    ).rejects.toThrow('capability_unavailable');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_status_revocations WHERE capability_id=$1',
          [cap.id],
        )
      ).rows[0].count,
    ).toBe('1');
  });
  it('keeps replay/capability/revocation evidence immutable and admin-only', async () => {
    await expect(
      pool.query('DELETE FROM business_v2.payment_request_nonces'),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query(
        'UPDATE business_v2.payment_status_capabilities SET expires_at=expires_at+1',
      ),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query('DELETE FROM business_v2.payment_status_revocations'),
    ).rejects.toThrow('immutable');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name LIKE 'payment_%' AND grantee<>'nanoclaw_admin'",
        )
      ).rows[0].count,
    ).toBe('0');
  });
  it('refuses populated rollback; proves empty rollback/reapply on its own synthetic DB', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(rollback)).rejects.toThrow(
        'rollback 150 refused',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*) FROM business_v2.payment_request_nonces',
          )
        ).rows[0].count,
      ),
    ).toBeGreaterThan(0);
    await pool.query(
      'TRUNCATE business_v2.payment_status_revocations,business_v2.payment_status_capabilities,business_v2.payment_request_nonces',
    );
    await pool.query(rollback);
    await pool.query(migration);
    await pool.query(rollback);
  });
});
