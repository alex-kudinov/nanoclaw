import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADYEN_TEST_REFERENCE_PREFIX,
  adyenTestAttemptReference,
} from './adyen-payment-identifiers.js';
import { standardWebhookSigningPayload } from './adyen-webhook.js';
import { createPaymentAttempt, type PaymentScope } from './payment-domain.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';
import {
  createPaymentTestRuntime,
  type PaymentTestRuntimeConfig,
} from './payment-test-runtime.js';

const database = `nc_payment_runtime_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_runtime_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe disposable name');
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 8,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let server: Server;
let baseUrl: string;
let runtime: ReturnType<typeof createPaymentTestRuntime>;
let runtimeConfig: PaymentTestRuntimeConfig;
let created = false;
let providerCalls = 0;
let resultCalls = 0;
const providerSessions = new Map<
  string,
  {
    reference: string;
    paymentReference: string;
    amount: { value: number; currency: string };
  }
>();
const caller = 'wordpress-test';
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'fixture-merchant',
  store: 'fixture-store',
  endpointRegion: 'eu',
};
const requestSecret = randomBytes(32);
const requestKeys = new Map([
  ['fixture-request', { caller, secret: requestSecret }],
]);
const signer = new PaymentRequestAuthenticator(requestKeys);
const webhookKey = randomBytes(32).toString('hex');
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

function attempt(changes: { country?: string; capabilities?: unknown } = {}) {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: changes.capabilities ?? [
      'card',
      'ach_direct_debit',
    ],
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture',
      bundleVersion: 'fixture',
      deliveryVersion: 'fixture',
      locale: 'en',
      country: changes.country ?? 'US',
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
      expiresAt: now + 5 * 60 * 1000,
    },
  });
}
const pspForAttempt = (attemptId: string) =>
  attemptId.replaceAll('-', '').slice(0, 16);

type Path =
  | '/internal/payments/sessions'
  | '/internal/payments/attempts'
  | '/internal/payments/returns'
  | '/internal/payments/status';

function wire(path: Path, command: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(command));
  return JSON.stringify({
    auth: signer.sign(
      {
        version: 1,
        keyId: 'fixture-request',
        caller,
        method: 'POST',
        path,
        timestamp: Date.now(),
        nonce: randomUUID(),
        operationId: String(command.requestId),
      },
      body,
    ),
    payloadBase64: body.toString('base64'),
  });
}

async function post(
  path: Path,
  command: Record<string, unknown>,
  targetBaseUrl = baseUrl,
) {
  const response = await fetch(`${targetBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: wire(path, command),
  });
  return { response, body: (await response.json()) as Record<string, unknown> };
}

function webhook(attemptId: string, pspReference?: string) {
  const item = {
    pspReference: pspReference ?? randomUUID().replaceAll('-', '').slice(0, 16),
    originalReference: '',
    merchantAccountCode: scope.merchant,
    merchantReference: adyenTestAttemptReference(attemptId),
    eventCode: 'AUTHORISATION',
    eventDate: new Date().toISOString(),
    success: 'true',
    amount: { value: 29900, currency: 'USD' },
    paymentMethod: 'visa',
    additionalData: { store: scope.store },
  };
  const signature = createHmac('sha256', Buffer.from(webhookKey, 'hex'))
    .update(standardWebhookSigningPayload(item as never))
    .digest('base64');
  return {
    live: 'false',
    notificationItems: [
      {
        NotificationRequestItem: {
          ...item,
          additionalData: {
            ...item.additionalData,
            hmacSignature: signature,
          },
        },
      },
    ],
  };
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
  pool = new Pool({ ...pgConfig, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  for (const migration of [
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
  ])
    await pool.query(sql(migration));
  await pool.query(`CREATE TABLE business_v2.payment_enrollment_admissions (
    attempt_id uuid PRIMARY KEY REFERENCES business_v2.payment_attempts(attempt_id),
    scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
    method_operation_id uuid NOT NULL
      REFERENCES business_v2.payment_session_result_operations(operation_id)
  );
  ALTER TABLE business_v2.payment_enrollment_admissions OWNER TO nanoclaw_admin`);
  await pool.query(sql('157_payment_webhook_method_evidence.sql'));
  await pool.query(sql('159_payment_terminal_card_retry.sql'));
  runtimeConfig = {
    mode: 'test',
    caller,
    scope,
    quoteAuthorities: ['wordpress:test'],
    recoveryOfferLocales: ['mcq-program-a-foundations:en'],
    newAttemptOfferLocales: ['mcq-program-a-foundations:en'],
    paymentMethodCapabilities: ['card', 'ach_direct_debit'],
    recoveryMode: 'dispatch',
    requestKeys,
    payloadKeyId: 'fixture-payload',
    payloadKeys: new Map([['fixture-payload', randomBytes(32)]]),
    returnBindingKey: randomBytes(32),
    adyenApiKey: 'fixture-api-key',
    sessionRouting: {
      allowedOrigin: 'http://localhost:3000',
      returnPath: '/checkout/return',
    },
    webhook: {
      hmacKeys: [webhookKey],
      merchantAccount: scope.merchant,
      storeReference: scope.store!,
      referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
      allowedEventCodes: ['AUTHORISATION'],
    },
    limits: {
      requestsPerWindow: 100,
      maxActive: 8,
      windowMs: 60000,
      maxBodyBytes: 100000,
      bodyReadTimeoutMs: 5000,
    },
  };
  runtime = createPaymentTestRuntime(runtimeConfig, {
    transaction,
    providerTransport: (async (url, init) => {
      if (init?.method === 'GET') {
        resultCalls++;
        const parsed = new URL(url);
        const sessionId = decodeURIComponent(
          parsed.pathname.slice(parsed.pathname.lastIndexOf('/') + 1),
        );
        const stored = providerSessions.get(sessionId);
        return new Response(
          JSON.stringify({
            id: sessionId,
            status: 'completed',
            reference: stored?.reference,
            payments: stored
              ? [
                  {
                    pspReference: stored.paymentReference,
                    reference: stored.reference,
                    resultCode: 'Authorised',
                    amount: stored.amount,
                    paymentMethod: { type: 'ach' },
                  },
                ]
              : [],
          }),
        );
      }
      providerCalls++;
      const request = JSON.parse(String(init?.body));
      expect(request.allowedPaymentMethods).toEqual(['scheme', 'ach']);
      const sessionId = `fixture-session-${providerCalls}`;
      providerSessions.set(sessionId, {
        reference: request.reference,
        paymentReference: pspForAttempt(
          String(request.reference).slice(ADYEN_TEST_REFERENCE_PREFIX.length),
        ),
        amount: request.amount,
      });
      return new Response(
        JSON.stringify({
          id: sessionId,
          sessionData: 'fixture-private-session',
          expiresAt: request.expiresAt,
        }),
        { status: 201 },
      );
    }) as typeof fetch,
  });
  server = createServer(runtime.http.handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 20000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  );
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
        if (Date.now() >= deadline)
          throw new Error('disposable connection drain failed');
        await delay(20);
      }
      await maintenance.query(`DROP DATABASE "${database}"`);
    }
  } finally {
    await maintenance.end();
  }
});

describe('explicit TEST payment runtime on disposable Postgres 149-151', () => {
  it('has no LIVE or implicit database composition path', () => {
    expect(() =>
      createPaymentTestRuntime(
        {
          ...runtimeConfig,
          scope: { ...scope, environment: 'live' },
        },
        { transaction },
      ),
    ).toThrow('invalid_payment_runtime_configuration');
    expect(() =>
      createPaymentTestRuntime(runtimeConfig, {
        transaction: undefined as unknown as PaymentTransaction,
      }),
    ).toThrow('invalid_payment_runtime_configuration');
    expect(() =>
      createPaymentTestRuntime(
        {
          ...runtimeConfig,
          newAttemptOfferLocales: ['unregistered:en'],
        },
        { transaction },
      ),
    ).toThrow('invalid_payment_runtime_configuration');
  });

  it('persists card/ACH capabilities, reuses one Session and exposes minimized status', async () => {
    const a = attempt();
    const requestId = randomUUID();
    const first = await post('/internal/payments/sessions', {
      requestId,
      attempt: a,
    });
    expect(first.response.status).toBe(200);
    expect(first.body).toMatchObject({
      state: 'checkout_ready',
      attemptId: a.attemptId,
      paymentMethodCapabilities: ['card', 'ach_direct_debit'],
    });
    const second = await post('/internal/payments/sessions', {
      requestId,
      attempt: a,
    });
    expect(second.body.capability).toBe(first.body.capability);
    expect(providerCalls).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT contract->'paymentMethodCapabilities' AS methods FROM business_v2.payment_attempts WHERE attempt_id=$1",
          [a.attemptId],
        )
      ).rows[0].methods,
    ).toEqual(['card', 'ach_direct_debit']);

    const statusCommand = {
      requestId: randomUUID(),
      attemptId: a.attemptId,
      capability: first.body.capability,
    };
    expect(
      (await post('/internal/payments/status', statusCommand)).body,
    ).toEqual({ attemptId: a.attemptId, state: 'awaiting_payment' });

    const webhookDisabled = createPaymentTestRuntime(
      { ...runtimeConfig, webhook: null },
      {
        transaction,
        providerTransport: (async () => {
          throw new Error('status must not call the provider');
        }) as typeof fetch,
      },
    );
    const webhookDisabledServer = createServer(webhookDisabled.http.handle);
    await new Promise<void>((resolve, reject) => {
      webhookDisabledServer.once('error', reject);
      webhookDisabledServer.listen(0, '127.0.0.1', resolve);
    });
    const webhookDisabledAddress = webhookDisabledServer.address();
    if (!webhookDisabledAddress || typeof webhookDisabledAddress === 'string')
      throw new Error('no webhook-disabled address');
    try {
      expect(
        (
          await post(
            '/internal/payments/status',
            { ...statusCommand, requestId: randomUUID() },
            `http://127.0.0.1:${webhookDisabledAddress.port}`,
          )
        ).body,
      ).toEqual({ attemptId: a.attemptId, state: 'awaiting_payment' });
      expect(() => webhookDisabled.recordWebhook({})).toThrow(
        'payment_webhook_unconfigured',
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        webhookDisabledServer.close((error) =>
          error ? reject(error) : resolve(),
        ),
      );
    }
    const returned = await post('/internal/payments/returns', {
      ...statusCommand,
      requestId: randomUUID(),
      sessionResult: 'private-browser-result',
    });
    expect(returned.body).toEqual({
      attemptId: a.attemptId,
      state: 'confirming_payment',
    });
    expect(resultCalls).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT method,payment_reference FROM business_v2.payment_method_bindings WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0],
    ).toEqual({
      method: 'ach_direct_debit',
      payment_reference: pspForAttempt(a.attemptId),
    });
    expect(
      await runtime.recordWebhook(
        webhook(a.attemptId, pspForAttempt(a.attemptId)),
      ),
    ).toEqual([{ result: 'recorded', attemptId: a.attemptId }]);
    const confirmed = await post('/internal/payments/status', {
      ...statusCommand,
      requestId: randomUUID(),
    });
    expect(confirmed.body).toMatchObject({
      attemptId: a.attemptId,
      state: 'confirming_payment',
      confirmation: {
        schemaVersion: 1,
        offerKey: 'mcq-program-a-foundations',
        amount: 29900,
        currency: 'USD',
        paymentStatus: 'authorized',
        paymentReference: expect.stringMatching(/^TCA-[A-F0-9]{12}$/),
      },
    });
    expect(JSON.stringify(confirmed.body)).not.toContain(
      'fixture-private-session',
    );

    const rollback = createPaymentTestRuntime(
      {
        ...runtimeConfig,
        newAttemptOfferLocales: [],
        paymentMethodCapabilities: ['card'],
        sessionRouting: {
          allowedOrigin: 'https://changed.example.test',
          returnPath: '/changed',
        },
      },
      {
        transaction,
        providerTransport: (async () => {
          throw new Error('stored Session must not be recreated');
        }) as typeof fetch,
      },
    );
    const rollbackServer = createServer(rollback.http.handle);
    await new Promise<void>((resolve, reject) => {
      rollbackServer.once('error', reject);
      rollbackServer.listen(0, '127.0.0.1', resolve);
    });
    const rollbackAddress = rollbackServer.address();
    if (!rollbackAddress || typeof rollbackAddress === 'string')
      throw new Error('no rollback address');
    const rollbackBase = `http://127.0.0.1:${rollbackAddress.port}`;
    try {
      const lostAckRecovery = await post(
        '/internal/payments/sessions',
        { requestId, attempt: a },
        rollbackBase,
      );
      expect(lostAckRecovery.body).toMatchObject({
        state: 'checkout_ready',
        capability: first.body.capability,
        paymentMethodCapabilities: ['card', 'ach_direct_debit'],
      });
      expect(providerCalls).toBe(1);
      const resumed = await post(
        '/internal/payments/attempts',
        {
          ...statusCommand,
          requestId: randomUUID(),
        },
        rollbackBase,
      );
      expect(resumed.body).toMatchObject({
        state: 'checkout_ready',
        paymentMethodCapabilities: ['card', 'ach_direct_debit'],
      });
      expect(
        (
          await post(
            '/internal/payments/status',
            { ...statusCommand, requestId: randomUUID() },
            rollbackBase,
          )
        ).body,
      ).toMatchObject({
        attemptId: a.attemptId,
        state: 'confirming_payment',
        confirmation: {
          schemaVersion: 1,
          offerKey: 'mcq-program-a-foundations',
          amount: 29900,
          currency: 'USD',
          paymentStatus: 'authorized',
          paymentReference: expect.stringMatching(/^TCA-[A-F0-9]{12}$/),
        },
      });
      const blocked = await post(
        '/internal/payments/sessions',
        { requestId: randomUUID(), attempt: attempt() },
        rollbackBase,
      );
      expect(blocked.response.status).toBe(403);
      expect(blocked.body).toEqual({ error: 'checkout_unavailable' });
    } finally {
      await new Promise<void>((resolve, reject) =>
        rollbackServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('keeps an event-first different-PSP reconciliation conflict sticky in status', async () => {
    const a = attempt();
    const started = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: a,
    });
    expect(started.response.status).toBe(200);
    await runtime.recordWebhook(webhook(a.attemptId, 'DIFFERENTPSP001'));
    const returned = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: a.attemptId,
      capability: started.body.capability,
      sessionResult: 'different-psp-result',
    });
    expect(returned.body).toEqual({
      attemptId: a.attemptId,
      state: 'needs_review',
    });
    const status = await post('/internal/payments/status', {
      requestId: randomUUID(),
      attemptId: a.attemptId,
      capability: started.body.capability,
    });
    expect(status.body).toEqual({
      attemptId: a.attemptId,
      state: 'needs_review',
    });
  });

  it('rejects ACH outside US/PR before persisting an attempt', async () => {
    const a = attempt({ country: 'CA', capabilities: ['ach_direct_debit'] });
    const result = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: a,
    });
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({ error: 'checkout_unavailable' });
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_attempts WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].count,
    ).toBe('0');
  });
});
