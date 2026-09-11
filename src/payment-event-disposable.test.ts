import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PaymentEventStore } from './payment-event-store.js';
import { PaymentAdmissionStore } from './payment-admission-store.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import {
  PaymentApiController,
  PaymentRequestLimiter,
} from './payment-api-controller.js';
import { PaymentSessionService } from './payment-session-service.js';
import { AdyenTestSessionAdapter } from './adyen-session-adapter.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { createPaymentAttempt, type PaymentScope } from './payment-domain.js';
import { standardWebhookSigningPayload } from './adyen-webhook.js';
import {
  ADYEN_TEST_REFERENCE_PREFIX,
  adyenTestAttemptReference,
} from './adyen-payment-identifiers.js';

const database = `nc_payment_event_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_event_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe database');
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
let pool: Pool, store: PaymentStore, events: PaymentEventStore;
let created = false;
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'fixture',
  store: 'fixture',
  endpointRegion: 'eu',
};
const key = randomBytes(32).toString('hex'),
  previous = randomBytes(32).toString('hex');
const config = {
  hmacKeys: [key, previous],
  merchantAccount: scope.merchant,
  storeReference: scope.store!,
  referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
  allowedEventCodes: ['AUTHORISATION'],
};
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const migration = sql('151_payment_event_ledger.sql'),
  rollback = sql('rollback_151_payment_event_ledger.sql');
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
async function attempt(overrides: Partial<PaymentScope> = {}, persist = true) {
  const now = Date.now() - 1000;
  const a = createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope: { ...scope, ...overrides },
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
  return persist ? store.acceptAttempt(a) : a;
}
function notification(
  attemptId: string,
  changes: Record<string, unknown> = {},
  signingKey = key,
) {
  const item = {
    pspReference: randomUUID().replaceAll('-', '').slice(0, 16),
    originalReference: '',
    merchantAccountCode: scope.merchant,
    merchantReference: adyenTestAttemptReference(attemptId),
    eventCode: 'AUTHORISATION',
    eventDate: new Date().toISOString(),
    success: 'true',
    amount: { value: 29900, currency: 'USD' },
    paymentMethod: 'visa',
    additionalData: {
      store: scope.store,
      shopperEmail: 'must-not-store@example.test',
    },
    ...changes,
  };
  const signature = createHmac('sha256', Buffer.from(signingKey, 'hex'))
    .update(standardWebhookSigningPayload(item as never))
    .digest('base64');
  return {
    NotificationRequestItem: {
      ...item,
      additionalData: { ...item.additionalData, hmacSignature: signature },
    },
  };
}
const payload = (...items: ReturnType<typeof notification>[]) => ({
  live: 'false',
  notificationItems: items,
});

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
  await pool.query(sql('149_payment_attempt_store.sql'));
  await pool.query(sql('150_payment_request_admission.sql'));
  await pool.query(migration);
  store = new PaymentStore(
    transaction,
    new PaymentPayloadVault('fixture', new Map([['fixture', randomBytes(32)]])),
  );
  events = new PaymentEventStore(transaction, scope, config);
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

describe('HMAC-admitted durable provider payment events', () => {
  it('deduplicates 25 deliveries into one event and one evidence version', async () => {
    const a = await attempt(),
      input = payload(notification(a.attemptId));
    const results = await Promise.all(
      Array.from({ length: 25 }, () => events.recordWebhook(input)),
    );
    expect(results.flat().filter((r) => r.result === 'recorded')).toHaveLength(
      1,
    );
    expect(results.flat().filter((r) => r.result === 'duplicate')).toHaveLength(
      24,
    );
    expect(
      (
        await pool.query(
          'SELECT version FROM business_v2.payment_checkout_evidence WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].version,
    ).toBe(1);
    expect(await events.readInternalEvidence(a.attemptId)).toMatchObject({
      state: 'authorization_recorded',
      settlement: 'unproven',
      fulfillment: 'not_evaluated',
      exceptions: [],
    });
    const persisted = JSON.stringify(
      (
        await pool.query(
          'SELECT fact FROM business_v2.payment_events WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows,
    );
    expect(persisted).not.toContain('must-not-store');
    expect(persisted).not.toContain('hmacSignature');
    expect(JSON.stringify(events)).not.toContain(key);
  });
  it('accepts a failed retry followed by a different successful PSP in either order', async () => {
    for (const reversed of [false, true]) {
      const a = await attempt();
      const items = [
        notification(a.attemptId, { success: 'false' }),
        notification(a.attemptId),
      ];
      if (reversed) items.reverse();
      await events.recordWebhook(payload(...items));
      const projection = await events.readInternalEvidence(a.attemptId);
      expect(projection?.state).toBe('authorization_recorded');
      expect(projection?.payments).toHaveLength(2);
      expect(projection?.exceptions).toEqual([]);
    }
  });
  it('holds multiple successful provider payments instead of silently fulfilling twice', async () => {
    const a = await attempt();
    const results = await events.recordWebhook(
      payload(notification(a.attemptId), notification(a.attemptId)),
    );
    expect(results[1].result).toBe('needs_review');
    expect(
      (await events.readInternalEvidence(a.attemptId))?.exceptions,
    ).toContain('multiple_successful_provider_payments');
    expect(
      (
        await pool.query(
          'SELECT reason FROM business_v2.payment_event_exceptions WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows,
    ).toContainEqual({ reason: 'financial_evidence_conflict' });
  });
  it('holds contradictory authorizations for the SAME PSP, while ignoring unsigned time changes', async () => {
    const a = await attempt(),
      item = notification(a.attemptId, { success: 'false' });
    await events.recordWebhook(payload(item));
    const dated = notification(a.attemptId, {
      pspReference: item.NotificationRequestItem.pspReference,
      success: 'false',
      eventDate: '2020-01-01T00:00:00Z',
    });
    expect((await events.recordWebhook(payload(dated)))[0].result).toBe(
      'duplicate',
    );
    const conflict = notification(a.attemptId, {
      pspReference: item.NotificationRequestItem.pspReference,
      success: 'true',
    });
    expect((await events.recordWebhook(payload(conflict)))[0].result).toBe(
      'needs_review',
    );
    expect(
      (await events.readInternalEvidence(a.attemptId))?.exceptions,
    ).toContain('operation_payload_conflict');
  });
  it('retains conflicting delivery payloads as exceptions without overwriting the original', async () => {
    const a = await attempt(),
      item = notification(a.attemptId);
    await events.recordWebhook(payload(item));
    const conflict = notification(a.attemptId, {
      pspReference: item.NotificationRequestItem.pspReference,
      amount: { value: 29800, currency: 'USD' },
    });
    expect((await events.recordWebhook(payload(conflict)))[0].result).toBe(
      'needs_review',
    );
    await events.recordWebhook(payload(item));
    const projection = await events.readInternalEvidence(a.attemptId);
    expect(projection?.state).toBe('needs_review');
    expect(projection?.exceptions).toContain('delivery_payload_conflict');
    expect(
      (
        await pool.query(
          'SELECT fact FROM business_v2.payment_events WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].fact.amount,
    ).toBe(29900);
  });
  it('records an unknown attempt exception but never creates an order from a webhook', async () => {
    const id = randomUUID(),
      item = notification(id);
    expect(await events.recordWebhook(payload(item))).toEqual([
      { result: 'needs_review', attemptId: null },
    ]);
    await events.recordWebhook(payload(item));
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_attempts WHERE attempt_id=$1',
          [id],
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_event_exceptions WHERE attempt_hint=$1',
          [id],
        )
      ).rows[0].count,
    ).toBe('1');
  });
  it('does not change a LIVE or other-scope checkout from a TEST event', async () => {
    const foreign = await attempt({ environment: 'live' });
    expect(
      await events.recordWebhook(payload(notification(foreign.attemptId))),
    ).toEqual([{ result: 'needs_review', attemptId: null }]);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_checkout_evidence WHERE attempt_id=$1',
          [foreign.attemptId],
        )
      ).rows[0].count,
    ).toBe('0');
    expect(await events.readInternalEvidence(foreign.attemptId)).toBeNull();
    expect(
      (
        await pool.query(
          'SELECT attempt_id,related_attempt_id,reason FROM business_v2.payment_event_exceptions WHERE attempt_hint=$1',
          [foreign.attemptId],
        )
      ).rows[0],
    ).toEqual({
      attempt_id: null,
      related_attempt_id: null,
      reason: 'scope_conflict',
    });
  });
  it('holds both same-scope checkouts on crossed PSP references without deadlock', async () => {
    const a = await attempt(),
      b = await attempt(),
      one = notification(a.attemptId),
      two = notification(b.attemptId);
    await events.recordWebhook(payload(one, two));
    const results = await Promise.all([
      events.recordWebhook(
        payload(
          notification(b.attemptId, {
            pspReference: one.NotificationRequestItem.pspReference,
          }),
        ),
      ),
      events.recordWebhook(
        payload(
          notification(a.attemptId, {
            pspReference: two.NotificationRequestItem.pspReference,
          }),
        ),
      ),
    ]);
    expect(results.flat().every((r) => r.result === 'needs_review')).toBe(true);
    expect((await events.readInternalEvidence(a.attemptId))?.state).toBe(
      'needs_review',
    );
    expect((await events.readInternalEvidence(b.attemptId))?.state).toBe(
      'needs_review',
    );
    expect(
      (
        await pool.query(
          'SELECT attempt_id FROM business_v2.payment_provider_references WHERE payment_reference=$1',
          [one.NotificationRequestItem.pspReference],
        )
      ).rows[0].attempt_id,
    ).toBe(a.attemptId);
  });
  it('rejects a tampered batch before any item is written and accepts the previous HMAC key', async () => {
    const a = await attempt(),
      valid = notification(a.attemptId),
      invalid = notification(a.attemptId);
    invalid.NotificationRequestItem.additionalData.hmacSignature = 'invalid';
    await expect(events.recordWebhook(payload(valid, invalid))).rejects.toThrow(
      'Invalid HMAC',
    );
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_events WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await events.recordWebhook(
          payload(notification(a.attemptId, {}, previous)),
        )
      )[0].result,
    ).toBe('recorded');
  });
  it('rejects wrong merchant/reference/event and records valid-HMAC amount/currency mismatches', async () => {
    const a = await attempt();
    for (const change of [
      { merchantAccountCode: 'wrong' },
      { merchantReference: 'wrong' },
      { eventCode: 'CAPTURE' },
    ]) {
      await expect(
        events.recordWebhook(payload(notification(a.attemptId, change))),
      ).rejects.toThrow();
    }
    for (const amount of [
      { value: 1, currency: 'USD' },
      { value: 29900, currency: 'EUR' },
    ]) {
      expect(
        (
          await events.recordWebhook(
            payload(notification(a.attemptId, { amount })),
          )
        )[0].result,
      ).toBe('needs_review');
    }
    expect(
      (await events.readInternalEvidence(a.attemptId))?.exceptions,
    ).toContain('amount_or_fact_conflict');
  });
  it('rolls back reference, event and projection together on a commit failure', async () => {
    const a = await attempt(),
      item = notification(a.attemptId);
    const failure: PaymentTransaction = (work) =>
      transaction(async (client) => {
        await work(client);
        throw new Error('injected event commit failure');
      });
    const failing = new PaymentEventStore(failure, scope, config);
    await expect(failing.recordWebhook(payload(item))).rejects.toThrow(
      'injected event commit failure',
    );
    for (const table of [
      'payment_provider_references',
      'payment_events',
      'payment_checkout_evidence',
    ]) {
      expect(
        (
          await pool.query(
            `SELECT count(*) FROM business_v2.${table} WHERE attempt_id=$1`,
            [a.attemptId],
          )
        ).rows[0].count,
      ).toBe('0');
    }
    expect((await events.recordWebhook(payload(item)))[0].result).toBe(
      'recorded',
    );
  });
  it('bounds evidence growth with a durable exception instead of unbounded work', async () => {
    const a = await attempt();
    for (let i = 0; i < 5; i++)
      await events.recordWebhook(
        payload(
          ...Array.from({ length: 20 }, () =>
            notification(a.attemptId, { success: 'false' }),
          ),
        ),
      );
    expect(
      (
        await events.recordWebhook(
          payload(notification(a.attemptId, { success: 'false' })),
        )
      )[0].result,
    ).toBe('needs_review');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_events WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].count,
    ).toBe('100');
    expect(
      (await events.readInternalEvidence(a.attemptId))?.exceptions,
    ).toContain('evidence_limit');
  }, 15000);
  it('enforces immutable/admin-only evidence and versioned projections', async () => {
    await expect(
      pool.query("UPDATE business_v2.payment_events SET fact='{}'::jsonb"),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query('DELETE FROM business_v2.payment_provider_references'),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query('DELETE FROM business_v2.payment_event_exceptions'),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query(
        'UPDATE business_v2.payment_checkout_evidence SET version=version',
      ),
    ).rejects.toThrow('version fence');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name LIKE 'payment_%' AND grantee<>'nanoclaw_admin'",
        )
      ).rows[0].count,
    ).toBe('0');
  });
  it('composes signed start, durable Session reuse, capability status and HMAC event confirmation', async () => {
    const a = await attempt({}, false);
    const caller = 'wordpress-test';
    const auth = new PaymentRequestAuthenticator(
      new Map([['fixture-internal', { caller, secret: randomBytes(32) }]]),
    );
    const policy = (who: string, value: typeof a) =>
      who === caller &&
      value.quote.authority === 'wordpress:test' &&
      JSON.stringify(value.scope) === JSON.stringify(scope);
    const admission = new PaymentAdmissionStore(
      transaction,
      auth,
      new PaymentPayloadVault(
        'cap-fixture',
        new Map([['cap-fixture', randomBytes(32)]]),
      ),
      policy,
    );
    let providerCalls = 0;
    const adapter = new AdyenTestSessionAdapter('fixture-api-key', (async (
      _url,
      options,
    ) => {
      providerCalls++;
      expect(
        (
          await pool.query(
            'SELECT count(*) FROM business_v2.payment_status_capabilities WHERE attempt_id=$1',
            [a.attemptId],
          )
        ).rows[0].count,
      ).toBe('1');
      return new Response(
        JSON.stringify({
          id: 'fixture-adyen-session',
          sessionData: 'fixture-private-session',
          expiresAt: JSON.parse(String(options?.body)).expiresAt,
        }),
        { status: 201 },
      );
    }) as typeof fetch);
    const routing = {
      scope,
      allowedOrigin: 'http://localhost:3000',
      returnPath: '/',
    };
    const sessions = new PaymentSessionService(store, adapter, routing, [
      'mcq-program-a-foundations:en',
    ]);
    const api = new PaymentApiController(
      caller,
      policy,
      new PaymentRequestLimiter(100, 8, 60000),
      { admission, store, sessions, events },
    );
    function wire(
      path:
        | '/internal/payments/sessions'
        | '/internal/payments/attempts'
        | '/internal/payments/status',
      command: Record<string, unknown>,
    ) {
      const body = Buffer.from(JSON.stringify(command));
      const envelope = auth.sign(
        {
          version: 1,
          keyId: 'fixture-internal',
          caller,
          method: 'POST',
          path,
          timestamp: Date.now(),
          nonce: randomUUID(),
          operationId: String(command.requestId),
        },
        body,
      );
      return Buffer.from(
        JSON.stringify({
          auth: envelope,
          payloadBase64: body.toString('base64'),
        }),
      );
    }
    const start = { requestId: randomUUID(), attempt: a };
    const transport = wire('/internal/payments/sessions', start);
    const first = await api.handle(
      'POST',
      '/internal/payments/sessions',
      transport,
    );
    expect(first.status).toBe(200);
    expect(first.body.state).toBe('checkout_ready');
    expect(first.headers['Cache-Control']).toBe('no-store');
    expect(
      (await api.handle('POST', '/internal/payments/sessions', transport))
        .status,
    ).toBe(409);
    const repeated = await api.handle(
      'POST',
      '/internal/payments/sessions',
      wire('/internal/payments/sessions', start),
    );
    expect(repeated.body.capability).toBe(first.body.capability);
    expect(providerCalls).toBe(1);
    const status = {
      requestId: randomUUID(),
      attemptId: a.attemptId,
      capability: first.body.capability,
    };
    expect(
      (
        await api.handle(
          'POST',
          '/internal/payments/status',
          wire('/internal/payments/status', status),
        )
      ).body.state,
    ).toBe('awaiting_payment');
    await events.recordWebhook(payload(notification(a.attemptId)));
    const confirmed = await api.handle(
      'POST',
      '/internal/payments/status',
      wire('/internal/payments/status', { ...status, requestId: randomUUID() }),
    );
    expect(confirmed.body).toEqual({
      attemptId: a.attemptId,
      state: 'confirming_payment',
    });
    expect(JSON.stringify(confirmed)).not.toContain('paymentReference');
    expect(JSON.stringify(confirmed)).not.toContain('fixture-private-session');
    const paused = new PaymentSessionService(store, adapter, routing, []);
    const freshApi = new PaymentApiController(
      caller,
      policy,
      new PaymentRequestLimiter(100, 8, 60000),
      { admission, store, sessions: paused, events },
    );
    const resumed = await freshApi.handle(
      'POST',
      '/internal/payments/attempts',
      wire('/internal/payments/attempts', {
        ...status,
        requestId: randomUUID(),
      }),
    );
    expect(resumed.status).toBe(200);
    expect(resumed.body.state).toBe('checkout_ready');
    expect(providerCalls).toBe(1);
    const foreign = await attempt();
    const denied = await api.handle(
      'POST',
      '/internal/payments/status',
      wire('/internal/payments/status', {
        ...status,
        requestId: randomUUID(),
        attemptId: foreign.attemptId,
      }),
    );
    expect(denied.status).toBe(401);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_operations WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].count,
    ).toBe('1');
  });
  it('refuses populated rollback then proves exact empty rollback/reapply', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(rollback)).rejects.toThrow(
        'rollback151 refused',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    await pool.query(
      'TRUNCATE business_v2.payment_checkout_evidence,business_v2.payment_event_exceptions,business_v2.payment_events,business_v2.payment_provider_references',
    );
    await pool.query(rollback);
    await pool.query(migration);
    await pool.query(rollback);
  });
});
