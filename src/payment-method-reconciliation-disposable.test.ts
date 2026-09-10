import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { VerifiedAdyenTestSessionPayment } from './adyen-session-result-adapter.js';
import {
  ADYEN_TEST_REFERENCE_PREFIX,
  adyenTestAttemptReference,
} from './adyen-payment-identifiers.js';
import { standardWebhookSigningPayload } from './adyen-webhook.js';
import {
  createPaymentAttempt,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentMethodReconciliationStore } from './payment-method-reconciliation-store.js';
import { PaymentEventStore } from './payment-event-store.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';

const database = `nc_payment_reconciliation_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (
  !/^nc_payment_reconciliation_disposable_[0-9]+_[a-f0-9]{32}$/.test(database)
)
  throw new Error('unsafe disposable database');
const config = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 8,
};
const maintenance = new Pool({ ...config, database: 'postgres' });
let pool: Pool;
let created = false;
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'fixture',
  store: 'fixture',
  endpointRegion: 'eu',
};
const vault = new PaymentPayloadVault(
  'fixture',
  new Map([['fixture', randomBytes(32)]]),
);
const webhookKey = randomBytes(32).toString('hex');
let store: PaymentStore;
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

function attempt() {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: ['card', 'ach_direct_debit'],
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
}

async function persistedSession() {
  const a = attempt();
  await store.acceptAttempt(a);
  await store.prepareSession({
    attemptId: a.attemptId,
    operationId: a.attemptId,
    idempotencyKey: a.attemptId,
    request: JSON.stringify({ reference: `tandem-poc-tsv1-${a.attemptId}` }),
    retryWindowMs: 60000,
  });
  const lease = await store.acquireDispatch(a.attemptId);
  if (lease.decision !== 'dispatch') throw new Error('dispatch unavailable');
  const session = {
    id: `session-${a.attemptId}`,
    sessionData: 'private-fixture',
    expiresAt: new Date(a.quote.expiresAt).toISOString(),
  };
  await store.finishDispatch({
    operationId: a.attemptId,
    leaseToken: lease.leaseToken,
    version: lease.version,
    result: 'session_available',
    response: JSON.stringify(session),
    sessionExpiresAt: a.quote.expiresAt,
  });
  return { a, session };
}

function verified(
  a: ReturnType<typeof attempt>,
  sessionId: string,
  paymentReference = randomUUID().replaceAll('-', '').slice(0, 16),
  paymentMethod: 'card' | 'ach_direct_debit' = 'card',
): VerifiedAdyenTestSessionPayment {
  return {
    attemptId: a.attemptId,
    sessionId,
    paymentReference,
    paymentMethod,
    amount: a.quote.finalAmount,
    currency: a.quote.currency,
  };
}

function notification(
  attemptId: string,
  eventCode: string,
  input: {
    pspReference?: string;
    originalReference?: string;
    success?: string;
    paymentMethod?: string;
    eventDate?: string;
  } = {},
) {
  const item = {
    pspReference:
      input.pspReference ?? randomUUID().replaceAll('-', '').slice(0, 16),
    originalReference: input.originalReference ?? '',
    merchantAccountCode: scope.merchant,
    merchantReference: adyenTestAttemptReference(attemptId),
    eventCode,
    eventDate: input.eventDate ?? new Date().toISOString(),
    success: input.success ?? 'true',
    amount: { value: 29900, currency: 'USD' },
    paymentMethod: input.paymentMethod ?? 'visa',
    additionalData: { store: scope.store },
  };
  const signature = createHmac('sha256', Buffer.from(webhookKey, 'hex'))
    .update(standardWebhookSigningPayload(item as never))
    .digest('base64');
  return {
    NotificationRequestItem: {
      ...item,
      additionalData: { ...item.additionalData, hmacSignature: signature },
    },
  };
}

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() AS address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  for (const migration of [
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
  ])
    await pool.query(sql(migration));
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

describe('durable method reconciliation on disposable Postgres', () => {
  it('sanitizes unexpected repository errors at the public boundary', async () => {
    const service = new PaymentMethodReconciliationStore(
      transaction,
      vault,
      {
        readPersistedSession: async () => {
          throw new Error('private database detail');
        },
      },
      { verify: async () => Promise.reject(new Error('must not call')) },
      scope,
    );
    await expect(
      service.verify({
        operationId: randomUUID(),
        attemptId: randomUUID(),
        sessionResult: 'fixture',
      }),
    ).rejects.toThrow('payment_reconciliation_unavailable');
  });

  it('persists before one provider read and binds one method under concurrency', async () => {
    const { a, session } = await persistedSession();
    let calls = 0;
    const service = new PaymentMethodReconciliationStore(
      transaction,
      vault,
      store,
      {
        verify: async ({ sessionResult }) => {
          calls++;
          expect(
            (
              await pool.query(
                'SELECT count(*) FROM business_v2.payment_session_result_operations WHERE attempt_id=$1 AND result_sha256 IS NOT NULL',
                [a.attemptId],
              )
            ).rows[0].count,
          ).toBe('1');
          expect(sessionResult).toBe('private-browser-result');
          await delay(25);
          return verified(
            a,
            session.id,
            'ABCDEFGHIJKLMNOP',
            'ach_direct_debit',
          );
        },
      },
      scope,
    );
    const operationId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        service.verify({
          operationId,
          attemptId: a.attemptId,
          sessionResult: 'private-browser-result',
        }),
      ),
    );
    expect(calls).toBe(1);
    expect(
      results.filter((result) => result.state === 'verified'),
    ).toHaveLength(1);
    expect(await service.readBinding(a.attemptId)).toMatchObject({
      paymentReference: 'ABCDEFGHIJKLMNOP',
      paymentMethod: 'ach_direct_debit',
    });
    expect(
      (
        await pool.query(
          'SELECT encrypted_result FROM business_v2.payment_session_result_operations WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].encrypted_result,
    ).not.toContain('private-browser-result');
    expect(
      await service.verify({
        operationId,
        attemptId: a.attemptId,
        sessionResult: 'private-browser-result',
      }),
    ).toMatchObject({ state: 'verified' });
  });

  it('retries an unknown provider outcome only with the exact durable operation', async () => {
    const { a, session } = await persistedSession();
    let calls = 0;
    const service = new PaymentMethodReconciliationStore(
      transaction,
      vault,
      store,
      {
        verify: async () => {
          calls++;
          if (calls === 1)
            throw new PaymentDomainError('provider_outcome_unknown');
          return verified(a, session.id);
        },
      },
      scope,
    );
    const operationId = randomUUID();
    const input = {
      operationId,
      attemptId: a.attemptId,
      sessionResult: 'same-result',
    };
    expect(await service.verify(input)).toEqual({ state: 'pending' });
    expect(await service.verify(input)).toMatchObject({ state: 'verified' });
    await expect(
      service.verify({ ...input, sessionResult: 'changed' }),
    ).rejects.toThrow('session_result_operation_conflict');
    expect(calls).toBe(2);
  });

  it('holds provider conflicts and crossed payment references for review', async () => {
    const first = await persistedSession();
    const second = await persistedSession();
    const paymentReference = 'SAMEPAYMENTREF01';
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = (fixture: typeof first, conflict = false) =>
      new PaymentMethodReconciliationStore(
        transaction,
        vault,
        store,
        {
          verify: async () => {
            if (conflict)
              throw new PaymentDomainError('provider_session_result_conflict');
            arrivals++;
            if (arrivals === 2) release();
            await gate;
            return verified(fixture.a, fixture.session.id, paymentReference);
          },
        },
        scope,
      );
    const crossed = await Promise.all([
      service(first).verify({
        operationId: randomUUID(),
        attemptId: first.a.attemptId,
        sessionResult: 'first',
      }),
      service(second).verify({
        operationId: randomUUID(),
        attemptId: second.a.attemptId,
        sessionResult: 'second',
      }),
    ]);
    expect(crossed.map((result) => result.state).sort()).toEqual([
      'needs_review',
      'verified',
    ]);
    const third = await persistedSession();
    expect(
      await service(third, true).verify({
        operationId: randomUUID(),
        attemptId: third.a.attemptId,
        sessionResult: 'conflict',
      }),
    ).toEqual({ state: 'needs_review' });
  });

  it('serializes webhook-vs-method ownership for same and different PSPs', async () => {
    const eventStore = new PaymentEventStore(transaction, scope, {
      hmacKeys: [webhookKey],
      merchantAccount: scope.merchant,
      storeReference: scope.store!,
      referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
      allowedEventCodes: ['AUTHORISATION'],
    });
    const runRace = async (
      eventFixture: Awaited<ReturnType<typeof persistedSession>>,
      methodFixture: Awaited<ReturnType<typeof persistedSession>>,
      eventReference: string,
      methodReference: string,
    ) => {
      const methodStore = new PaymentMethodReconciliationStore(
        transaction,
        vault,
        store,
        {
          verify: async () =>
            verified(
              methodFixture.a,
              methodFixture.session.id,
              methodReference,
            ),
        },
        scope,
      );
      const [eventResult, methodResult] = await Promise.all([
        eventStore.recordWebhook({
          live: false,
          notificationItems: [
            notification(eventFixture.a.attemptId, 'AUTHORISATION', {
              pspReference: eventReference,
            }),
          ],
        }),
        methodStore.verify({
          operationId: randomUUID(),
          attemptId: methodFixture.a.attemptId,
          sessionResult: `result-${randomUUID()}`,
        }),
      ]);
      return [eventResult[0].result, methodResult.state].sort();
    };
    const first = await persistedSession();
    const second = await persistedSession();
    expect(
      await runRace(first, second, 'SHAREDPSPREF0001', 'SHAREDPSPREF0001'),
    ).toEqual(['needs_review', expect.stringMatching(/recorded|verified/)]);
    const sameAttempt = await persistedSession();
    expect(
      await runRace(
        sameAttempt,
        sameAttempt,
        'EVENTPSPREF00001',
        'METHODPSPREF0001',
      ),
    ).toEqual(['needs_review', expect.stringMatching(/recorded|verified/)]);
  });

  it('persists order-independent card/ACH child events without trusting unsigned method/date', async () => {
    const { a } = await persistedSession();
    const events = new PaymentEventStore(transaction, scope, {
      hmacKeys: [webhookKey],
      merchantAccount: scope.merchant,
      storeReference: scope.store!,
      referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
      allowedEventCodes: [
        'PENDING',
        'AUTHORISATION',
        'CAPTURE',
        'CAPTURE_FAILED',
        'CANCELLATION',
        'EXPIRE',
        'REFUND',
        'REFUND_FAILED',
        'REFUNDED_REVERSED',
        'CHARGEBACK',
        'CHARGEBACK_REVERSED',
      ],
      retainVerifiedOwnedUnsupported: true,
    });
    const payment = 'PAYMENTREF000001';
    const capture = 'CAPTUREREF000001';
    const refund = 'REFUNDREF0000001';
    const dispute = 'DISPUTEREF000001';
    const items = [
      notification(a.attemptId, 'PENDING', { pspReference: payment }),
      notification(a.attemptId, 'AUTHORISATION', { pspReference: payment }),
      notification(a.attemptId, 'CAPTURE', {
        pspReference: capture,
        originalReference: payment,
      }),
      notification(a.attemptId, 'CAPTURE_FAILED', {
        pspReference: capture,
        originalReference: payment,
      }),
      notification(a.attemptId, 'REFUND', {
        pspReference: refund,
        originalReference: payment,
      }),
      notification(a.attemptId, 'REFUND_FAILED', {
        pspReference: refund,
        originalReference: payment,
      }),
      notification(a.attemptId, 'CHARGEBACK', {
        pspReference: dispute,
        originalReference: payment,
      }),
    ];
    for (const item of [...items].reverse())
      await events.recordWebhook({ live: false, notificationItems: [item] });
    const evidence = await events.readInternalEvidence(a.attemptId);
    expect(evidence).toMatchObject({ state: 'payment_reversed' });
    expect(evidence?.payments[0].evidence).toMatchObject({
      pending: true,
      authorization: 'authorized',
      capturedAmount: 0,
      captureFailed: true,
      refundedAmount: 0,
      refundFailed: true,
      chargebackAmount: 29900,
    });
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_event_operations WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].count,
    ).toBe('5');

    const original = notification(a.attemptId, 'AUTHORISATION', {
      pspReference: payment,
      paymentMethod: 'ach',
      eventDate: '2026-01-01T00:00:00Z',
    });
    const changed = JSON.parse(JSON.stringify(original));
    changed.NotificationRequestItem.paymentMethod = 'scheme';
    changed.NotificationRequestItem.eventDate = '2030-01-01T00:00:00Z';
    expect(
      await events.recordWebhook({
        live: false,
        notificationItems: [changed],
      }),
    ).toEqual([{ result: 'duplicate', attemptId: a.attemptId }]);

    expect(
      await events.recordWebhook({
        live: false,
        notificationItems: [
          notification(a.attemptId, 'FUTURE_EVENT', {
            pspReference: 'FUTUREEVENT00001',
          }),
        ],
      }),
    ).toEqual([{ result: 'needs_review', attemptId: a.attemptId }]);
    expect(
      await events.recordWebhook({
        live: false,
        notificationItems: [
          notification(a.attemptId, 'CAPTURE', {
            pspReference: 'MALFORMEDCHILD01',
            originalReference: '',
          }),
        ],
      }),
    ).toEqual([{ result: 'needs_review', attemptId: a.attemptId }]);
    expect(
      (
        await pool.query(
          'SELECT reason,count(*)::text AS count FROM business_v2.payment_owned_event_exceptions WHERE attempt_hint=$1 GROUP BY reason ORDER BY reason',
          [a.attemptId],
        )
      ).rows,
    ).toEqual([
      { reason: 'financial_return', count: '1' },
      { reason: 'malformed_correlation', count: '1' },
      { reason: 'unsupported_event', count: '1' },
    ]);
  });

  it('enforces immutable/admin-only rows and guarded rollback/reapply', async () => {
    await expect(
      pool.query(
        "UPDATE business_v2.payment_method_bindings SET method='card'",
      ),
    ).rejects.toThrow('immutable');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name IN ('payment_session_result_operations','payment_session_result_receipts','payment_method_bindings','payment_event_operation_parents','payment_event_operations','payment_owned_event_exceptions') AND grantee<>'nanoclaw_admin'",
        )
      ).rows[0].count,
    ).toBe('0');
    await expect(
      pool.query(sql('rollback_152_payment_method_reconciliation.sql')),
    ).rejects.toThrow('rollback152 refused');
    await pool.query('ROLLBACK');
    await pool.query(
      'TRUNCATE business_v2.payment_owned_event_exceptions,business_v2.payment_event_operations,business_v2.payment_event_operation_parents,business_v2.payment_method_bindings,business_v2.payment_session_result_receipts,business_v2.payment_session_result_operations',
    );
    await pool.query(sql('rollback_152_payment_method_reconciliation.sql'));
    await pool.query(sql('152_payment_method_reconciliation.sql'));
  });
});
