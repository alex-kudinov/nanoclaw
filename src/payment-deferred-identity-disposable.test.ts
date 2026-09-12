import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPaymentAttempt,
  paymentScopeFingerprint,
} from './payment-domain.js';
import { createPaymentIdentityTestRuntime } from './payment-identity-test-runtime.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';

const database = `nc_deferred_identity_${process.pid}_${randomUUID().replaceAll('-', '')}`;
const maintenance = new Pool({
  host: '/tmp',
  database: 'postgres',
  user: userInfo().username,
});
let pool: Pool;
let server: Server;
let baseUrl = '';
let runtime: ReturnType<typeof createPaymentIdentityTestRuntime>;
let created = false;
const caller = 'tandem-wordpress-live';
const scope = {
  provider: 'adyen' as const,
  environment: 'test' as const,
  company: 'company',
  merchant: 'merchant',
  store: 'store',
  endpointRegion: 'eu',
};
const requestSecret = randomBytes(32);
const requestKeys = new Map([['request', { caller, secret: requestSecret }]]);
const authenticator = new PaymentRequestAuthenticator(requestKeys);
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const transaction: PaymentTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
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

function command(seed: string) {
  return {
    schemaVersion: 1,
    requestId: `${seed}0000000-0000-4000-8000-000000000001`,
    preparationId: `${seed}0000000-0000-4000-8000-000000000002`,
    intentId: `${seed}0000000-0000-4000-8000-000000000003`,
    offerKey: 'mcq-program-a-foundations',
    purchaseRelationship: 'self' as const,
    payer: {
      role: 'payer' as const,
      candidate: {
        firstName: 'Repeat',
        lastName: 'Buyer',
        email: 'repeat-buyer@example.test',
      },
    },
    participant: { role: 'participant' as const, sameAs: 'payer' as const },
  };
}

async function resolve(value: ReturnType<typeof command>) {
  const body = Buffer.from(JSON.stringify(value));
  const auth = authenticator.sign(
    {
      version: 1,
      keyId: 'request',
      caller,
      method: 'POST',
      path: '/internal/payments/identity/resolve',
      timestamp: Date.now(),
      nonce: randomUUID(),
      operationId: value.requestId,
    },
    body,
  );
  const response = await fetch(
    `${baseUrl}/internal/payments/identity/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth, payloadBase64: body.toString('base64') }),
    },
  );
  expect(response.status).toBe(200);
  const outer = (await response.json()) as { payloadBase64: string };
  return JSON.parse(Buffer.from(outer.payloadBase64, 'base64').toString('utf8'))
    .identityPreparationReceipt as {
    payerReference: string;
    participantReference: string;
  };
}

async function acceptAttempt(
  seed: string,
  receipt: Awaited<ReturnType<typeof resolve>>,
) {
  const now = Date.now();
  const attempt = createPaymentAttempt({
    attemptId: `${seed}0000000-0000-4000-8000-000000000004`,
    now,
    scope,
    paymentMethodCapabilities: ['card'],
    quote: {
      schemaVersion: 1,
      quoteId: `${seed}0000000-0000-4000-8000-000000000005`,
      authority: 'wordpress',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'catalog-v1',
      bundleVersion: 'bundle-v1',
      deliveryVersion: 'delivery-v1',
      locale: 'en-US',
      country: 'US',
      payerReference: receipt.payerReference,
      participantReference: receipt.participantReference,
      currency: 'USD',
      originalAmount: 29900,
      discountAmount: 0,
      finalAmount: 29900,
      discountPolicyReference: null,
      redemptionReference: null,
      paymentOption: 'one_time',
      termsVersion: 'terms-v1',
      consentReceipt: 'consent-v1',
      acceptedAt: now - 1,
      createdAt: now,
      expiresAt: now + 60_000,
    },
  });
  await pool.query(
    `INSERT INTO business_v2.payment_attempts
     (attempt_id,scope_sha256,quote_id,contract) VALUES($1,$2,$3,$4::jsonb)`,
    [
      attempt.attemptId,
      paymentScopeFingerprint(scope),
      attempt.quote.quoteId,
      JSON.stringify(attempt),
    ],
  );
  return attempt.attemptId;
}

beforeAll(async () => {
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({
    host: '/tmp',
    database,
    user: userInfo().username,
    options: '-c search_path=pg_catalog',
  });
  await pool.query('CREATE EXTENSION citext');
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  for (const migration of [
    '01_extensions.sql',
    '02_lookups.sql',
    '03_parties.sql',
    '04_roles.sql',
    '05_engagements.sql',
    '06_programs.sql',
    '07_pipeline.sql',
    '08_interactions.sql',
    '09_documents.sql',
    '10_outbox.sql',
    '11_helpers.sql',
    '12_triggers.sql',
    '13_views.sql',
    '14_grants.sql',
    '16_cutover_helpers.sql',
    '137_relationship_context_dark.sql',
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '154_payment_identity_preparation.sql',
    '161_payment_checkout_billing_profile.sql',
    '165_deferred_checkout_identity.sql',
  ])
    await pool.query(sql(migration));
  runtime = createPaymentIdentityTestRuntime(
    {
      mode: 'test',
      caller,
      scope,
      requestKeys,
      payloadKeyId: 'payload',
      payloadKeys: new Map([['payload', randomBytes(32)]]),
      responseKeyId: 'response',
      responseKey: { caller, secret: randomBytes(32) },
      identitySecret: 'i'.repeat(32),
      identityTokenSecret: randomBytes(32),
      identityReferenceSecret: randomBytes(32),
      deferMaterialization: true,
      limits: {
        requestsPerWindow: 100,
        maxActive: 8,
        windowMs: 60_000,
        maxBodyBytes: 100_000,
        bodyReadTimeoutMs: 1_000,
      },
    },
    { transaction },
  );
  server = createServer(runtime.http.handle);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('listener unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()));
  if (pool) await pool.end();
  if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
  await maintenance.end();
});

describe('deferred checkout identity', () => {
  it('creates no Party before payment and creates a distinct Party for each confirmed purchase', async () => {
    for (const seed of ['1', '2']) {
      const value = command(seed);
      const receipt = await resolve(value);
      expect(await resolve(value)).toEqual(receipt);
      expect(
        (await pool.query('SELECT count(*)::int n FROM business_v2.parties'))
          .rows[0].n,
      ).toBe(Number(seed) - 1);
      const stored = await pool.query(
        `SELECT i.payer_party_id,p.encrypted_payload
         FROM business_v2.payment_identity_preparations i
         JOIN business_v2.payment_checkout_submission_payloads p USING(caller,preparation_id)
         WHERE i.preparation_id=$1`,
        [value.preparationId],
      );
      expect(stored.rows[0].payer_party_id).toBeNull();
      expect(stored.rows[0].encrypted_payload).not.toContain(
        'repeat-buyer@example.test',
      );
      expect(stored.rows).toHaveLength(1);
      const attemptId = await acceptAttempt(seed, receipt);
      await transaction((client) =>
        runtime.materializeForAttempt(client, attemptId),
      );
      await transaction((client) =>
        runtime.materializeForAttempt(client, attemptId),
      );
      expect(
        (await pool.query('SELECT count(*)::int n FROM business_v2.parties'))
          .rows[0].n,
      ).toBe(Number(seed));
      expect(
        (
          await pool.query(
            'SELECT count(*)::int n FROM business_v2.payment_checkout_submission_payloads WHERE preparation_id=$1',
            [value.preparationId],
          )
        ).rows[0].n,
      ).toBe(0);
    }
  });

  it('purges a failed submission without creating a Party', async () => {
    const value = command('3');
    const receipt = await resolve(value);
    const attemptId = await acceptAttempt('3', receipt);
    expect(
      await transaction((client) => runtime.purgeForAttempt(client, attemptId)),
    ).toBe(true);
    expect(
      (await pool.query('SELECT count(*)::int n FROM business_v2.parties'))
        .rows[0].n,
    ).toBe(2);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_checkout_submission_payloads WHERE preparation_id=$1',
          [value.preparationId],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
