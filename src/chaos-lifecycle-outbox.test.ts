/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const withAgentContextMock = vi.fn();
const readEnvFileMock = vi.fn();
const getAllRegisteredGroupsMock = vi.fn();

vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => queryMock(...args),
  withAgentContext: (...args: any[]) => withAgentContextMock(...args),
}));
vi.mock('./env.js', () => ({
  readEnvFile: (...args: any[]) => readEnvFileMock(...args),
}));
vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nc-test/data' }));
vi.mock('./db.js', () => ({
  getAllRegisteredGroups: (...args: any[]) =>
    getAllRegisteredGroupsMock(...args),
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  enqueueStripeLifecycleFact,
  runChaosLifecycleOutbox,
} from './chaos-lifecycle-outbox.js';

beforeEach(() => {
  vi.restoreAllMocks();
  queryMock.mockReset();
  withAgentContextMock.mockReset();
  readEnvFileMock.mockReset();
  getAllRegisteredGroupsMock.mockReset();
});

describe('enqueueStripeLifecycleFact', () => {
  it('persists the canonical purchase without email or name', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '42', inserted: true }] });
    const result = await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_completed',
      account: 'heartbeat',
      canonical_transaction_id: 'pi_canonical123',
      provider_event_id: 'evt_provider123',
      provider_object_id: 'cs_received123',
      occurred_at: '2026-08-12T12:00:00.000Z',
      amount_cents: 99500,
      currency: 'usd',
      payment_status: 'paid',
    });
    expect(result).toEqual({ enqueued: true, id: 42 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('chaos_lifecycle_outbox');
    expect(params).toContain('stripe-heartbeat');
    expect(params).toContain('pi_canonical123');
    expect(JSON.stringify(params)).not.toMatch(/email|name/i);
  });

  it('does not enqueue unpaid/ineligible facts', async () => {
    await expect(
      enqueueStripeLifecycleFact({
        eligible: false,
        event_name: 'purchase_completed',
        account: 'tandem',
        canonical_transaction_id: null,
        occurred_at: '2026-08-12T12:00:00.000Z',
      }),
    ).resolves.toEqual({ enqueued: false, id: null });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('keys each refund on its re_ id while retaining the original pi_', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '9', inserted: true }] });
    await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_refunded',
      account: 'tandem',
      source_event_id: 're_partial123',
      canonical_transaction_id: 'pi_original123',
      occurred_at: '2026-08-12T13:00:00.000Z',
      refunded_amount_cents: 2500,
      original_amount_cents: 10000,
      currency: 'USD',
      is_partial: true,
    });
    const params = queryMock.mock.calls[0][1];
    expect(params).toContain('re_partial123');
    expect(params).toContain('pi_original123');
    expect(params).toContain(2500);
  });

  it('persists a validated canonical product slug from PaymentIntent metadata', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '11', inserted: true }] });
    await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_completed',
      account: 'tandem',
      canonical_transaction_id: 'pi_meta123',
      canonical_product_slug: 'mcq-program-a-foundations',
      occurred_at: '2026-08-16T12:00:00.000Z',
      amount_cents: 29900,
      currency: 'usd',
      payment_status: 'succeeded',
    });
    const params = queryMock.mock.calls[0][1] as unknown[];
    const properties = JSON.parse(params[9] as string);
    expect(properties.canonical_product_slug).toBe('mcq-program-a-foundations');
  });

  it('fails closed: drops an invalid canonical product slug rather than persisting arbitrary text', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '12', inserted: true }] });
    await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_completed',
      account: 'tandem',
      canonical_transaction_id: 'pi_meta456',
      canonical_product_slug: '<script>alert(1)</script>',
      occurred_at: '2026-08-16T12:00:00.000Z',
      amount_cents: 29900,
      currency: 'usd',
      payment_status: 'succeeded',
    });
    const params = queryMock.mock.calls[0][1] as unknown[];
    const properties = JSON.parse(params[9] as string);
    expect(properties.canonical_product_slug).toBeUndefined();
  });

  it('fails closed: drops a missing/blank canonical product slug (Heartbeat has no Tandem metadata)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '13', inserted: true }] });
    await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_completed',
      account: 'heartbeat',
      canonical_transaction_id: 'pi_hb123',
      occurred_at: '2026-08-16T12:00:00.000Z',
      amount_cents: 9900,
      currency: 'usd',
      payment_status: 'succeeded',
    });
    const params = queryMock.mock.calls[0][1] as unknown[];
    const properties = JSON.parse(params[9] as string);
    expect(properties.canonical_product_slug).toBeUndefined();
  });

  // The Checkout and PaymentIntent halves of one purchase — and any retry —
  // collide on the same (source_system, source_event_id) key and hit the
  // ON CONFLICT path. This asserts the SQL/parameter contract boundary the JS
  // layer controls: an upgrade path keyed on the incoming properties actually
  // carrying the validated slug, and a preserve/non-erasure path that never
  // does a blind `properties = EXCLUDED.properties` overwrite.
  it('on conflict, upgrades the stored slug only when the incoming call carries a validated one, and never erases it otherwise', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '14', inserted: false }] });

    await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_completed',
      account: 'tandem',
      canonical_transaction_id: 'pi_twin123',
      canonical_product_slug: 'acc-full',
      occurred_at: '2026-08-16T12:00:00.000Z',
      amount_cents: 29900,
      currency: 'usd',
      payment_status: 'succeeded',
    });
    const upgradeSql = queryMock.mock.calls[0][0] as string;
    const upgradeProperties = JSON.parse(
      (queryMock.mock.calls[0][1] as unknown[])[9] as string,
    );
    // Upgrade path: this call's properties carry the key the SQL branches on.
    expect(upgradeProperties.canonical_product_slug).toBe('acc-full');
    expect(upgradeSql).toContain(
      "EXCLUDED.properties ? 'canonical_product_slug'",
    );
    expect(upgradeSql).toContain('jsonb_set');
    expect(upgradeSql).not.toContain('properties = EXCLUDED.properties');

    await enqueueStripeLifecycleFact({
      eligible: true,
      event_name: 'purchase_completed',
      account: 'tandem',
      canonical_transaction_id: 'pi_twin123',
      occurred_at: '2026-08-16T12:00:05.000Z',
      amount_cents: 29900,
      currency: 'usd',
      payment_status: 'succeeded',
    });
    const preserveSql = queryMock.mock.calls[1][0] as string;
    const preserveProperties = JSON.parse(
      (queryMock.mock.calls[1][1] as unknown[])[9] as string,
    );
    // Non-erasure path: this call's properties carry no slug key at all, so
    // the same static SQL's ELSE branch keeps the existing row's properties
    // (including whatever slug the first call upgraded it to) untouched.
    expect(preserveProperties.canonical_product_slug).toBeUndefined();
    expect(preserveSql).toBe(upgradeSql);
  });
});

describe('runChaosLifecycleOutbox', () => {
  it('is a no-op behind the default-off kill switch', async () => {
    readEnvFileMock.mockReturnValue({ CHAOS_LIFECYCLE_ENABLED: 'false' });
    await expect(runChaosLifecycleOutbox()).resolves.toEqual({
      status: 'disabled',
      processed: 0,
      sent: 0,
      retried: 0,
      deadLettered: 0,
    });
  });

  it('resolves email transiently, sends once, and marks the row sent', async () => {
    readEnvFileMock.mockReturnValue({
      CHAOS_LIFECYCLE_ENABLED: 'true',
      CHAOS_LIFECYCLE_URL: 'https://example.test/lifecycle',
      CHAOS_WEBHOOK_SECRET: 'test-secret',
    });
    const row = {
      id: 7,
      event_name: 'purchase_completed',
      source_system: 'stripe-heartbeat',
      source_event_id: 'pi_canonical123',
      canonical_transaction_id: 'pi_canonical123',
      provider_event_ids: ['evt_123'],
      provider_object_ids: ['cs_123'],
      occurred_at: '2026-08-12T12:00:00.000Z',
      amount_cents: 99500,
      currency: 'USD',
      properties: { account: 'heartbeat' },
      attempts: 0,
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValue({ rows: [] }),
    };
    withAgentContextMock.mockImplementation(async (_name: string, fn: any) =>
      fn(client),
    );
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            email: 'person@example.com',
            product_name: 'Coaching Tools Mastery',
            product_id: 'prod_123',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(runChaosLifecycleOutbox()).resolves.toMatchObject({
      status: 'success',
      processed: 1,
      sent: 1,
    });
    const request = fetchMock.mock.calls[0][1]!;
    const body = JSON.parse(String(request.body));
    expect(body.identity.email).toBe('person@example.com');
    expect(body.product_slug).toBe('coaching-tools-mastery');
    expect(request.headers).toMatchObject({
      'X-Chaos-Token': 'test-secret',
    });
    expect(queryMock.mock.calls.at(-1)![0]).toContain("status='sent'");
  });

  it('prefers the persisted validated canonical slug over the name-derived fallback', async () => {
    readEnvFileMock.mockReturnValue({
      CHAOS_LIFECYCLE_ENABLED: 'true',
      CHAOS_LIFECYCLE_URL: 'https://example.test/lifecycle',
      CHAOS_WEBHOOK_SECRET: 'test-secret',
    });
    const row = {
      id: 8,
      event_name: 'purchase_completed',
      source_system: 'stripe-tandem',
      source_event_id: 'pi_meta123',
      canonical_transaction_id: 'pi_meta123',
      provider_event_ids: ['evt_meta'],
      provider_object_ids: ['pi_meta123'],
      occurred_at: '2026-08-16T12:00:00.000Z',
      amount_cents: 29900,
      currency: 'USD',
      // A name that would otherwise map to 'unmapped-stripe-product' via
      // safeProductSlug — proves the persisted slug wins, not just that both
      // happen to agree.
      properties: {
        account: 'tandem',
        canonical_product_slug: 'mcq-program-a-foundations',
      },
      attempts: 0,
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValue({ rows: [] }),
    };
    withAgentContextMock.mockImplementation(async (_name: string, fn: any) =>
      fn(client),
    );
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            email: 'buyer@example.com',
            product_name: 'Invoice #tca-371 (retail price, unmapped)',
            product_id: '',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(runChaosLifecycleOutbox()).resolves.toMatchObject({
      status: 'success',
      sent: 1,
    });
    const request = fetchMock.mock.calls[0][1]!;
    const body = JSON.parse(String(request.body));
    expect(body.product_slug).toBe('mcq-program-a-foundations');
  });

  it('fails closed to the name-derived slug when the persisted slug is invalid', async () => {
    readEnvFileMock.mockReturnValue({
      CHAOS_LIFECYCLE_ENABLED: 'true',
      CHAOS_LIFECYCLE_URL: 'https://example.test/lifecycle',
      CHAOS_WEBHOOK_SECRET: 'test-secret',
    });
    const row = {
      id: 9,
      event_name: 'purchase_completed',
      source_system: 'stripe-tandem',
      source_event_id: 'pi_bad123',
      canonical_transaction_id: 'pi_bad123',
      provider_event_ids: [],
      provider_object_ids: ['pi_bad123'],
      occurred_at: '2026-08-16T12:00:00.000Z',
      amount_cents: 29900,
      currency: 'USD',
      // Simulates a stale/tampered row — never trust properties blindly even
      // though enqueue already validated at write time.
      properties: { account: 'tandem', canonical_product_slug: 'DROP TABLE' },
      attempts: 0,
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValue({ rows: [] }),
    };
    withAgentContextMock.mockImplementation(async (_name: string, fn: any) =>
      fn(client),
    );
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            email: 'buyer@example.com',
            product_name: 'Supervision Inaugural',
            product_id: 'prod_sup',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(runChaosLifecycleOutbox()).resolves.toMatchObject({
      status: 'success',
      sent: 1,
    });
    const request = fetchMock.mock.calls[0][1]!;
    const body = JSON.parse(String(request.body));
    expect(body.product_slug).toBe('supervision-inaugural');
  });

  it('alerts chief exactly once when a row becomes dead-lettered', async () => {
    readEnvFileMock.mockReturnValue({
      CHAOS_LIFECYCLE_ENABLED: 'true',
      CHAOS_LIFECYCLE_URL: 'https://example.test/lifecycle',
      CHAOS_WEBHOOK_SECRET: 'test-secret',
    });
    getAllRegisteredGroupsMock.mockReturnValue({
      'chief@example.test': { folder: 'chief' },
    });
    const row = {
      id: 19,
      event_name: 'purchase_refunded',
      source_system: 'stripe-tandem',
      source_event_id: 're_dead123',
      canonical_transaction_id: 'pi_original123',
      provider_event_ids: ['evt_dead123'],
      provider_object_ids: ['re_dead123'],
      occurred_at: '2026-08-12T12:00:00.000Z',
      amount_cents: 2500,
      currency: 'USD',
      properties: { account: 'tandem' },
      attempts: 7,
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValue({ rows: [] }),
    };
    withAgentContextMock.mockImplementation(async (_name: string, fn: any) =>
      fn(client),
    );
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const fs = await import('fs');
    vi.spyOn(fs.default, 'mkdirSync').mockImplementation(() => undefined);
    const writeSpy = vi
      .spyOn(fs.default, 'writeFileSync')
      .mockImplementation(() => undefined);

    await expect(runChaosLifecycleOutbox()).resolves.toMatchObject({
      processed: 1,
      deadLettered: 1,
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(String(writeSpy.mock.calls[0][1])).toContain(
      'CHAOS-LIFECYCLE-DEAD-LETTER',
    );
    expect(String(writeSpy.mock.calls[0][1])).toContain('purchase_refunded');
  });
});
