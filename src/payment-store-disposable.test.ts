import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPaymentAttempt,
  decidePaymentOperationRecovery,
  type PaymentAttempt,
} from './payment-domain.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';
import {
  AdyenTestSessionAdapter,
  buildAdyenTestSessionRequest,
} from './adyen-session-adapter.js';
import { PaymentSessionService } from './payment-session-service.js';

// Explicit local socket and generated database only. No production env/config read.
const database = `nc_payment_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe disposable name');
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
let store: PaymentStore;
let created = false;
const vault = new PaymentPayloadVault(
  'fixture',
  new Map([['fixture', randomBytes(32)]]),
);
const migration = readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/149_payment_attempt_store.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_149_payment_attempt_store.sql',
    import.meta.url,
  ),
  'utf8',
);

function transaction(connectionPool: Pool): PaymentTransaction {
  return async (work) => {
    const client = await connectionPool.connect();
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
}

function attempt(
  paymentMethodCapabilities?: readonly ('card' | 'ach_direct_debit')[],
): PaymentAttempt {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope: {
      provider: 'adyen',
      environment: 'test',
      company: 'fixture',
      merchant: 'fixture',
      store: 'fixture',
      endpointRegion: 'eu',
    },
    ...(paymentMethodCapabilities ? { paymentMethodCapabilities } : {}),
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
}

async function prepared() {
  const a = attempt();
  await store.acceptAttempt(a);
  const input = {
    attemptId: a.attemptId,
    operationId: randomUUID(),
    idempotencyKey: randomUUID(),
    request: '{"amount":29900,"fixture":"private-request"}',
    retryWindowMs: 60000,
  };
  const operation = await store.prepareSession(input);
  return { a, input, operation };
}

beforeAll(async () => {
  const local = await maintenance.query('SELECT inet_server_addr() AS address');
  expect(local.rows[0].address).toBeNull();
  const role = await maintenance.query(
    "SELECT rolname FROM pg_roles WHERE rolname='nanoclaw_admin'",
  );
  expect(role.rows).toHaveLength(1); // Never create/change a cluster role.
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(migration);
  store = new PaymentStore(transaction(pool), vault);
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

describe('payment store on isolated real Postgres', () => {
  it('accepts 25 concurrent repeats as exactly one immutable attempt', async () => {
    const a = attempt();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => store.acceptAttempt(a)),
    );
    expect(results.every((value) => value.attemptId === a.attemptId)).toBe(
      true,
    );
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_attempts WHERE attempt_id=$1',
          [a.attemptId],
        )
      ).rows[0].count,
    ).toBe('1');
    await expect(
      store.acceptAttempt({ ...a, attemptId: randomUUID() }),
    ).rejects.toThrow('attempt_identity_conflict');
    await expect(
      store.acceptAttempt({ ...a, scope: { ...a.scope, environment: 'live' } }),
    ).rejects.toThrow('attempt_identity_conflict');
  });
  it('keeps 25 distinct checkouts independent', async () => {
    const inputs = Array.from({ length: 25 }, attempt);
    const results = await Promise.all(
      inputs.map((a) => store.acceptAttempt(a)),
    );
    expect(new Set(results.map((a) => a.attemptId)).size).toBe(25);
  });
  it('rejects new stale attempts but permits exact durable replay after expiry', async () => {
    const a = attempt();
    const expired = createPaymentAttempt({
      attemptId: a.attemptId,
      scope: a.scope,
      now: a.createdAt - 120000,
      quote: {
        ...a.quote,
        acceptedAt: a.createdAt - 120000,
        createdAt: a.createdAt - 120000,
        expiresAt: a.createdAt - 60000,
      },
    });
    await expect(store.acceptAttempt(expired)).rejects.toThrow(
      'quote_not_current_at_acceptance',
    );
    const soon = createPaymentAttempt({
      attemptId: randomUUID(),
      scope: a.scope,
      now: Date.now(),
      quote: { ...a.quote, quoteId: randomUUID(), expiresAt: Date.now() + 60 },
    });
    await store.acceptAttempt(soon);
    await delay(80);
    expect(await store.acceptAttempt(soon)).toEqual(soon);
  });
  it('commits exactly one operation and preparation receipt under 25 requests', async () => {
    const { input, operation } = await prepared();
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        store.prepareSession({ ...input, retryWindowMs: 120000 }),
      ),
    );
    expect(
      results.every((value) => value.retryUntil === operation.retryUntil),
    ).toBe(true);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_operation_receipts WHERE operation_id=$1',
          [input.operationId],
        )
      ).rows[0].count,
    ).toBe('1');
    for (const change of [
      { request: '{}' },
      { operationId: randomUUID() },
      { idempotencyKey: randomUUID() },
    ]) {
      await expect(
        store.prepareSession({ ...input, ...change }),
      ).rejects.toThrow('operation_prepare_conflict');
    }
  });
  it('does not dispatch unaccepted work and enforces global key uniqueness', async () => {
    await expect(store.acquireDispatch(randomUUID())).rejects.toThrow(
      'operation_not_found',
    );
    const { input } = await prepared();
    const a = attempt();
    await store.acceptAttempt(a);
    await expect(
      store.prepareSession({
        ...input,
        attemptId: a.attemptId,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('grants exactly one lease to 25 competing workers', async () => {
    const { input } = await prepared();
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        store.acquireDispatch(input.operationId),
      ),
    );
    expect(
      results.filter((result) => result.decision === 'dispatch'),
    ).toHaveLength(1);
    expect(results.filter((result) => result.decision === 'busy')).toHaveLength(
      24,
    );
    const lease = results.find((result) => result.decision === 'dispatch')!;
    expect(lease.request).toBe(input.request);
    const persisted = await pool.query(
      'SELECT version,lease_token FROM business_v2.payment_operations WHERE operation_id=$1',
      [input.operationId],
    );
    expect(persisted.rows[0]).toMatchObject({
      version: lease.version,
      lease_token: lease.leaseToken,
    });
  });
  it('rolls back operation and receipt together if the process fails before commit', async () => {
    const a = attempt();
    await store.acceptAttempt(a);
    const id = randomUUID();
    const failBeforeCommit: PaymentTransaction = (work) =>
      transaction(pool)(async (client) => {
        await work(client);
        throw new Error('injected failure before commit');
      });
    const failingStore = new PaymentStore(failBeforeCommit, vault);
    await expect(
      failingStore.prepareSession({
        attemptId: a.attemptId,
        operationId: id,
        idempotencyKey: id,
        request: '{}',
        retryWindowMs: 60000,
      }),
    ).rejects.toThrow('injected failure before commit');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_operations WHERE operation_id=$1',
          [id],
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.payment_operation_receipts WHERE operation_id=$1',
          [id],
        )
      ).rows[0].count,
    ).toBe('0');
    await expect(store.acquireDispatch(id)).rejects.toThrow(
      'operation_not_found',
    );
  });
  it('does not persist a result without its receipt when commit fails', async () => {
    const { input } = await prepared();
    const lease = await store.acquireDispatch(input.operationId);
    if (lease.decision !== 'dispatch') throw new Error('expected lease');
    const failingStore = new PaymentStore(
      (work) =>
        transaction(pool)(async (client) => {
          await work(client);
          throw new Error('injected result commit failure');
        }),
      vault,
    );
    await expect(
      failingStore.finishDispatch({
        operationId: input.operationId,
        leaseToken: lease.leaseToken,
        version: lease.version,
        result: 'session_available',
        response: 'fixture',
        sessionExpiresAt: Date.now() + 60000,
      }),
    ).rejects.toThrow('injected result commit failure');
    expect(
      (
        await pool.query(
          'SELECT state,version,encrypted_response FROM business_v2.payment_operations WHERE operation_id=$1',
          [input.operationId],
        )
      ).rows[0],
    ).toEqual({
      state: 'unknown',
      version: lease.version,
      encrypted_response: null,
    });
    await store.finishDispatch({
      operationId: input.operationId,
      leaseToken: lease.leaseToken,
      version: lease.version,
      result: 'unknown',
    });
    const again = await store.acquireDispatch(input.operationId);
    expect(again.decision).toBe('dispatch');
    if (again.decision === 'dispatch')
      expect(again.operation.idempotencyKey).toBe(input.idempotencyKey);
  });
  it('recovers the same bytes/key on a new connection and fences an expired worker', async () => {
    const { input } = await prepared();
    const old = await store.acquireDispatch(input.operationId, 1);
    if (old.decision !== 'dispatch') throw new Error('expected lease');
    await delay(15);
    const freshPool = new Pool({ ...config, database });
    try {
      const fresh = new PaymentStore(transaction(freshPool), vault);
      const next = await fresh.acquireDispatch(input.operationId);
      if (next.decision !== 'dispatch')
        throw new Error('expected recovery lease');
      expect(next.request).toBe(old.request);
      expect(next.operation.idempotencyKey).toBe(old.operation.idempotencyKey);
      expect(next.version).toBe(old.version + 1);
      await expect(
        store.finishDispatch({
          operationId: input.operationId,
          leaseToken: old.leaseToken,
          version: old.version,
          result: 'permanent_failure',
        }),
      ).rejects.toThrow('operation_lease_lost');
      await fresh.finishDispatch({
        operationId: input.operationId,
        leaseToken: next.leaseToken,
        version: next.version,
        result: 'session_available',
        response: 'sandbox-session-secret-fixture',
        sessionExpiresAt: Date.now() + 60000,
      });
      expect(await store.acquireDispatch(input.operationId)).toEqual({
        decision: 'reuse_session',
        response: 'sandbox-session-secret-fixture',
      });
      const rows = (
        await pool.query(
          'SELECT encrypted_request,encrypted_response FROM business_v2.payment_operations WHERE operation_id=$1',
          [input.operationId],
        )
      ).rows;
      expect(JSON.stringify(rows)).not.toContain('private-request');
      expect(JSON.stringify(rows)).not.toContain(
        'sandbox-session-secret-fixture',
      );
    } finally {
      await freshPool.end();
    }
  });
  it('reconciles after the original retry deadline without acquiring another lease', async () => {
    const a = attempt();
    await store.acceptAttempt(a);
    const id = randomUUID();
    await store.prepareSession({
      attemptId: a.attemptId,
      operationId: id,
      idempotencyKey: id,
      request: '{}',
      retryWindowMs: 1,
    });
    await delay(15);
    expect(await store.acquireDispatch(id)).toEqual({ decision: 'reconcile' });
  });
  it('stops a confirmed failure and records a receipt for every state version', async () => {
    const { input } = await prepared();
    const lease = await store.acquireDispatch(input.operationId);
    if (lease.decision !== 'dispatch') throw new Error('expected lease');
    await store.finishDispatch({
      operationId: input.operationId,
      leaseToken: lease.leaseToken,
      version: lease.version,
      result: 'permanent_failure',
    });
    expect(await store.acquireDispatch(input.operationId)).toEqual({
      decision: 'stop',
    });
    expect(
      (
        await pool.query(
          'SELECT kind FROM business_v2.payment_operation_receipts WHERE operation_id=$1 ORDER BY version',
          [input.operationId],
        )
      ).rows.map((row) => row.kind),
    ).toEqual(['prepared', 'claimed', 'permanent_failure']);
  });
  it('clamps session retries to the immutable quote expiry using the database clock', async () => {
    const a = attempt();
    await store.acceptAttempt(a);
    const id = randomUUID();
    const operation = await store.prepareSession({
      attemptId: a.attemptId,
      operationId: id,
      idempotencyKey: id,
      request: '{}',
      retryWindowMs: 86400000,
    });
    expect(operation.retryUntil).toBe(a.quote.expiresAt);
    expect(
      decidePaymentOperationRecovery({
        attempt: a,
        operation,
        requestFingerprint: operation.requestFingerprint,
        now: a.quote.expiresAt,
      }),
    ).toBe('reconcile');
    const replayed = await store.prepareSession({
      attemptId: a.attemptId,
      operationId: id,
      idempotencyKey: id,
      request: '{}',
      retryWindowMs: 2 * 86400000,
    });
    expect(replayed.retryUntil).toBe(a.quote.expiresAt);
  });
  it('enforces immutable database contracts and append-only receipts', async () => {
    const { input } = await prepared();
    await expect(
      pool.query(
        "UPDATE business_v2.payment_attempts SET contract='{}'::jsonb WHERE attempt_id=$1",
        [input.attemptId],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query(
        "UPDATE business_v2.payment_operations SET encrypted_request='changed',version=version+1 WHERE operation_id=$1",
        [input.operationId],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query(
        'UPDATE business_v2.payment_operations SET version=version WHERE operation_id=$1',
        [input.operationId],
      ),
    ).rejects.toThrow('version fence');
    await expect(
      pool.query(
        'DELETE FROM business_v2.payment_operation_receipts WHERE operation_id=$1',
        [input.operationId],
      ),
    ).rejects.toThrow('immutable');
  });
  it('leaves all new tables/functions admin-only', async () => {
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name LIKE 'payment_%' AND grantee<>'nanoclaw_admin'",
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='business_v2' AND routine_name LIKE 'fn_payment_%' AND grantee<>'nanoclaw_admin'",
        )
      ).rows[0].count,
    ).toBe('0');
  });
  it('stitches 25 checkout requests through one committed operation and one provider session', async () => {
    const a = attempt();
    let calls = 0;
    const adapter = new AdyenTestSessionAdapter('fixture-key', (async (
      _url,
      options,
    ) => {
      calls++;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='1000ms'");
        const committed = await client.query(
          'SELECT version FROM business_v2.payment_operations WHERE operation_id=$1 FOR UPDATE',
          [a.attemptId],
        );
        expect(committed.rows).toHaveLength(1); // Already committed; no network-time row lock.
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      await delay(20);
      const body = JSON.parse(String(options?.body));
      expect(body.amount).toEqual({ value: 29900, currency: 'USD' });
      return new Response(
        JSON.stringify({
          id: 'fixture-session',
          sessionData: 'fixture-data',
          expiresAt: body.expiresAt,
        }),
        { status: 201 },
      );
    }) as typeof fetch);
    const service = new PaymentSessionService(
      store,
      adapter,
      {
        scope: a.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      },
      ['mcq-program-a-foundations:en'],
    );
    const results = await Promise.all(
      Array.from({ length: 25 }, () => service.start(a)),
    );
    expect(calls).toBe(1);
    expect(results.some((result) => result.state === 'checkout_ready')).toBe(
      true,
    );
    const repeated = await Promise.all(
      Array.from({ length: 25 }, () => service.resume(a.attemptId)),
    );
    expect(repeated.every((result) => result.state === 'checkout_ready')).toBe(
      true,
    );
    expect(calls).toBe(1);
    await expect(service.resume(randomUUID())).rejects.toThrow(
      'attempt_not_found',
    );
    const paused = new PaymentSessionService(
      store,
      adapter,
      {
        scope: a.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      },
      [],
    );
    await expect(paused.start(a)).rejects.toThrow('offer_not_enabled');
    expect((await paused.resume(a.attemptId)).state).toBe('checkout_ready');
    expect(calls).toBe(1);

    const both = attempt(['card', 'ach_direct_debit']);
    const enabled = new PaymentSessionService(
      store,
      adapter,
      {
        scope: both.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      },
      ['mcq-program-a-foundations:en'],
      ['card', 'ach_direct_debit'],
    );
    expect((await enabled.start(both)).state).toBe('checkout_ready');
    const cardOnly = new PaymentSessionService(
      store,
      adapter,
      {
        scope: both.scope,
        allowedOrigin: 'https://changed.example.test',
        returnPath: '/changed',
      },
      [],
      ['card'],
    );
    expect(await cardOnly.resume(both.attemptId)).toMatchObject({
      state: 'checkout_ready',
      paymentMethodCapabilities: ['card', 'ach_direct_debit'],
    });
    expect(calls).toBe(2);
  });
  it('recovers a lost provider response using the same key with one logical session', async () => {
    const a = attempt();
    const keys: string[] = [];
    const providerSessions = new Map<string, string>();
    const adapter = new AdyenTestSessionAdapter('fixture-key', (async (
      _url,
      options,
    ) => {
      const key = new Headers(options?.headers).get('Idempotency-Key')!;
      keys.push(key);
      const body = JSON.parse(String(options?.body));
      if (!providerSessions.has(key))
        providerSessions.set(
          key,
          JSON.stringify({
            id: 'one-logical-session',
            sessionData: 'fixture-data',
            expiresAt: body.expiresAt,
          }),
        );
      if (keys.length === 1)
        throw new Error('injected response lost after provider acceptance');
      return new Response(providerSessions.get(key), { status: 201 });
    }) as typeof fetch);
    const service = new PaymentSessionService(
      store,
      adapter,
      {
        scope: a.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      },
      ['mcq-program-a-foundations:en'],
    );
    expect(await service.start(a)).toEqual({
      state: 'pending',
      paymentMethodCapabilities: ['card'],
    });
    expect((await service.resume(a.attemptId)).state).toBe('checkout_ready');
    expect(keys).toEqual([a.attemptId, a.attemptId]);
    expect(providerSessions.size).toBe(1);
  });
  it('separates new-attempt disablement from an explicit reconcile-only recovery stop', async () => {
    const a = attempt();
    await store.acceptAttempt(a);
    await store.prepareSession({
      attemptId: a.attemptId,
      operationId: a.attemptId,
      idempotencyKey: a.attemptId,
      request: buildAdyenTestSessionRequest(a, {
        scope: a.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      }),
      retryWindowMs: 60000,
    });
    let providerCalls = 0;
    const service = new PaymentSessionService(
      store,
      {
        create: async () => {
          providerCalls++;
          throw new Error('must not dispatch');
        },
      },
      {
        scope: a.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      },
      ['mcq-program-a-foundations:en'],
      ['card'],
      'reconcile_only',
    );
    await expect(service.start(attempt())).rejects.toThrow(
      'payment_dispatch_disabled',
    );
    expect(await service.resume(a.attemptId)).toEqual({
      state: 'reconciliation_required',
      paymentMethodCapabilities: ['card'],
    });
    expect(providerCalls).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT state,lease_token FROM business_v2.payment_operations WHERE operation_id=$1',
          [a.attemptId],
        )
      ).rows[0],
    ).toEqual({ state: 'dispatching', lease_token: null });
  });
  it('does not report ready after a result-persistence failure and safely recovers later', async () => {
    const a = attempt();
    let calls = 0,
      failWrite = true;
    const keys = new Set<string>();
    const adapter = new AdyenTestSessionAdapter('fixture-key', (async (
      _url,
      options,
    ) => {
      calls++;
      keys.add(new Headers(options?.headers).get('Idempotency-Key')!);
      return new Response(
        JSON.stringify({
          id: 'stable-session',
          sessionData: 'fixture-data',
          expiresAt: JSON.parse(String(options?.body)).expiresAt,
        }),
      );
    }) as typeof fetch);
    const failing = {
      acceptAttempt: store.acceptAttempt.bind(store),
      readAttempt: store.readAttempt.bind(store),
      prepareSession: store.prepareSession.bind(store),
      acquireDispatch: (id: string) => store.acquireDispatch(id, 20),
      finishDispatch: async (
        input: Parameters<PaymentStore['finishDispatch']>[0],
      ) => {
        if (failWrite && input.result === 'session_available') {
          failWrite = false;
          throw new Error('injected database unavailable');
        }
        return store.finishDispatch(input);
      },
    };
    const service = new PaymentSessionService(
      failing,
      adapter,
      {
        scope: a.scope,
        allowedOrigin: 'http://localhost:3000',
        returnPath: '/',
      },
      ['mcq-program-a-foundations:en'],
    );
    await expect(service.start(a)).rejects.toThrow(
      'injected database unavailable',
    );
    await delay(30);
    expect((await service.resume(a.attemptId)).state).toBe('checkout_ready');
    expect(calls).toBe(2);
    expect(keys.size).toBe(1);
  });
  it('refuses populated rollback, then proves empty rollback and reapply on synthetic-only data', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(rollback)).rejects.toThrow(
        'rollback 149 refused',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(
      Number(
        (await pool.query('SELECT count(*) FROM business_v2.payment_attempts'))
          .rows[0].count,
      ),
    ).toBeGreaterThan(0);
    // Only this generated, locally created fixture database can reach this line.
    await pool.query(
      'TRUNCATE business_v2.payment_operation_receipts,business_v2.payment_operations,business_v2.payment_attempts',
    );
    await pool.query(rollback);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='business_v2' AND c.relname LIKE 'payment_%'",
        )
      ).rows[0].count,
    ).toBe('0');
    await pool.query(migration);
    await pool.query(rollback);
  });
});
