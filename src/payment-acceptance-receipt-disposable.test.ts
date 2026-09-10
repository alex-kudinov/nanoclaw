import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PaymentAdmissionStore } from './payment-admission-store.js';
import { createPaymentAttempt, type PaymentScope } from './payment-domain.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import { PaymentAttemptAcceptanceReceiptReader } from './payment-signed-response-controller.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';

const database = `nc_payment_receipt_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_receipt_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe disposable database');
const config = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 4,
};
const maintenance = new Pool({ ...config, database: 'postgres' });
let pool: Pool;
let created = false;
let store: PaymentStore;
const caller = 'tandem-wordpress-test';
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'test-company',
  merchant: 'test-merchant',
  store: 'test-store',
  endpointRegion: 'eu',
};
const vault = new PaymentPayloadVault(
  'fixture',
  new Map([['fixture', randomBytes(32)]]),
);
const auth = new PaymentRequestAuthenticator(
  new Map([['request', { caller, secret: randomBytes(32) }]]),
);
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
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(sql('149_payment_attempt_store.sql'));
  await pool.query(sql('150_payment_request_admission.sql'));
  store = new PaymentStore(transaction, vault);
}, 15000);

afterAll(async () => {
  await pool?.end();
  try {
    if (created) {
      const deadline = Date.now() + 5000;
      while (
        (
          await maintenance.query(
            'SELECT count(*) FROM pg_stat_activity WHERE datname=$1',
            [database],
          )
        ).rows[0].count !== '0'
      ) {
        if (Date.now() >= deadline) throw new Error('connection drain failed');
        await delay(20);
      }
      await maintenance.query(`DROP DATABASE "${database}"`);
    }
  } finally {
    await maintenance.end();
  }
});

describe('durable attempt acceptance receipt readback', () => {
  it('derives one stable receipt only after attempt, operation and caller binding exist', async () => {
    const now = Date.now() - 1000;
    const attempt = createPaymentAttempt({
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
        locale: 'en-US',
        country: 'US',
        payerReference: null,
        participantReference: null,
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 1000,
        finalAmount: 28900,
        discountPolicyReference: 'mcs-promo-v1-005',
        redemptionReference: 'promotion-redemption:fixture',
        paymentOption: 'one_time',
        termsVersion: 'fixture',
        consentReceipt: 'fixture',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 60000,
      },
    });
    const operationId = randomUUID();
    await store.acceptAttempt(attempt);
    await store.prepareSession({
      attemptId: attempt.attemptId,
      operationId: attempt.attemptId,
      idempotencyKey: attempt.attemptId,
      request: '{"fixture":"durable-provider-request"}',
      retryWindowMs: 60000,
    });
    const body = Buffer.from(
      JSON.stringify({ requestId: operationId, attempt }),
    );
    const expected = {
      caller,
      method: 'POST',
      path: '/internal/payments/sessions',
    } as const;
    const envelope = auth.sign(
      {
        version: 1,
        keyId: 'request',
        caller,
        method: 'POST',
        path: expected.path,
        timestamp: Date.now(),
        nonce: randomUUID(),
        operationId,
      },
      body,
    );
    const admission = new PaymentAdmissionStore(
      transaction,
      auth,
      vault,
      (who, value) => who === caller && value.attemptId === attempt.attemptId,
    );
    const admitted = await admission.admit(envelope, body, expected);
    await admission.issueStatusCapability(admitted, attempt.attemptId);
    const reader = new PaymentAttemptAcceptanceReceiptReader(
      transaction,
      caller,
      scope,
    );
    const first = await reader.read({
      attemptId: attempt.attemptId,
      operationId,
    });
    expect(first).toMatchObject({
      schemaVersion: 1,
      kind: 'attempt_acceptance',
      receiptReference: `attempt-acceptance:${attempt.attemptId}:${operationId}`,
      caller,
      operationId,
      quoteId: attempt.quote.quoteId,
      quoteFingerprint: attempt.quoteFingerprint,
      source: scope,
      attemptId: attempt.attemptId,
      discountPolicyReference: 'mcs-promo-v1-005',
    });
    expect(
      await reader.read({ attemptId: attempt.attemptId, operationId }),
    ).toEqual(first);
    expect(
      await reader.read({
        attemptId: attempt.attemptId,
        operationId: randomUUID(),
      }),
    ).toBeNull();
    const secondOperationId = randomUUID();
    const secondBody = Buffer.from(
      JSON.stringify({ requestId: secondOperationId, attempt }),
    );
    const secondEnvelope = auth.sign(
      {
        version: 1,
        keyId: 'request',
        caller,
        method: 'POST',
        path: expected.path,
        timestamp: Date.now(),
        nonce: randomUUID(),
        operationId: secondOperationId,
      },
      secondBody,
    );
    const secondAdmission = await admission.admit(
      secondEnvelope,
      secondBody,
      expected,
    );
    await admission.issueStatusCapability(secondAdmission, attempt.attemptId);
    const secondReceipt = await reader.read({
      attemptId: attempt.attemptId,
      operationId: secondOperationId,
    });
    expect(secondReceipt?.receiptReference).toBe(
      `attempt-acceptance:${attempt.attemptId}:${secondOperationId}`,
    );
    expect(secondReceipt?.receiptReference).not.toBe(first?.receiptReference);
    expect(
      await new PaymentAttemptAcceptanceReceiptReader(
        transaction,
        'other-caller',
        scope,
      ).read({ attemptId: attempt.attemptId, operationId }),
    ).toBeNull();
  });
});
