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
