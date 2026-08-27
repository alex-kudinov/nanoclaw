/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  contadorStripeIngressParityEnabled,
  fetchContadorStripeIngressSnapshot,
  getContadorStripeIngressParityHealth,
  reconcileContadorStripeIngressSnapshotsWithClient,
  resetContadorStripeIngressParityHealthForTests,
  runContadorStripeIngressParity,
  type ContadorStripeIngressSnapshot,
} from './contador-stripe-ingress-parity.js';

const NOW = '2026-08-27T18:00:00.000Z';

function snapshot(
  scope: 'heartbeat' | 'tandem',
  ids: string[],
): ContadorStripeIngressSnapshot {
  return {
    scope,
    accountId: scope === 'heartbeat' ? 'acct_heartbeat' : 'acct_tandem',
    observedAt: NOW,
    windowStartAt: '2026-08-24T18:00:01.000Z',
    rowsScanned: ids.length,
    succeededPaymentIntents: ids.map((id) => ({ id, createdAt: NOW })),
    complete: true,
  };
}

describe('Contador Stripe ingress provider snapshot', () => {
  it('double-reads one bounded account and discards non-succeeded rows', async () => {
    const getJson = vi.fn(async (_key: string, path: string) => {
      if (path === '/v1/account') return { id: 'acct_heartbeat' };
      return {
        data: [
          { id: 'pi_succeeded', status: 'succeeded', created: 1787850000 },
          {
            id: 'pi_failed',
            status: 'requires_payment_method',
            created: 1787850001,
          },
        ],
        has_more: false,
      };
    });
    const result = await fetchContadorStripeIngressSnapshot('heartbeat', NOW, {
      getJson,
      keyForScope: () => 'key',
    });
    expect(result).toMatchObject({
      scope: 'heartbeat',
      accountId: 'acct_heartbeat',
      rowsScanned: 2,
      complete: true,
      succeededPaymentIntents: [{ id: 'pi_succeeded' }],
    });
    expect(getJson).toHaveBeenCalledTimes(4);
    expect(
      getJson.mock.calls.filter(([, path]) =>
        String(path).startsWith('/v1/payment_intents?'),
      ),
    ).toHaveLength(2);
  });

  it('refuses content drift between the two complete reads', async () => {
    let paymentCalls = 0;
    const getJson = vi.fn(async (_key: string, path: string) => {
      if (path === '/v1/account') return { id: 'acct_heartbeat' };
      paymentCalls += 1;
      return {
        data: [
          {
            id: paymentCalls === 1 ? 'pi_first' : 'pi_second',
            status: 'succeeded',
            created: 1787850000,
          },
        ],
        has_more: false,
      };
    });
    await expect(
      fetchContadorStripeIngressSnapshot('heartbeat', NOW, {
        getJson,
        keyForScope: () => 'key',
      }),
    ).rejects.toThrow('stripe_ingress_snapshot_drift');
  });

  it('refuses duplicate IDs and bounded page/row overflow', async () => {
    const duplicate = vi.fn(async (_key: string, path: string) => {
      if (path === '/v1/account') return { id: 'acct_heartbeat' };
      return {
        data: [
          { id: 'pi_duplicate', status: 'succeeded', created: 1787850000 },
          { id: 'pi_duplicate', status: 'succeeded', created: 1787850000 },
        ],
        has_more: false,
      };
    });
    await expect(
      fetchContadorStripeIngressSnapshot('heartbeat', NOW, {
        getJson: duplicate,
        keyForScope: () => 'key',
      }),
    ).rejects.toThrow('stripe_ingress_payment_intent_duplicate');

    const pageCap = vi.fn(async (_key: string, path: string) => {
      if (path === '/v1/account') return { id: 'acct_heartbeat' };
      return {
        data: [{ id: 'pi_cursor', status: 'succeeded', created: 1787850000 }],
        has_more: true,
      };
    });
    await expect(
      fetchContadorStripeIngressSnapshot('heartbeat', NOW, {
        getJson: pageCap,
        keyForScope: () => 'key',
        maxPagesPerScope: 1,
      }),
    ).rejects.toThrow('stripe_ingress_page_cap_exceeded');

    const rowCap = vi.fn(async (_key: string, path: string) => {
      if (path === '/v1/account') return { id: 'acct_heartbeat' };
      return {
        data: [
          { id: 'pi_one', status: 'succeeded', created: 1787850000 },
          { id: 'pi_two', status: 'succeeded', created: 1787850001 },
        ],
        has_more: false,
      };
    });
    await expect(
      fetchContadorStripeIngressSnapshot('heartbeat', NOW, {
        getJson: rowCap,
        keyForScope: () => 'key',
        maxRowsPerScope: 1,
      }),
    ).rejects.toThrow('stripe_ingress_row_cap_exceeded');
  });

  it('refuses malformed succeeded rows', async () => {
    const getJson = vi.fn(async (_key: string, path: string) => {
      if (path === '/v1/account') return { id: 'acct_heartbeat' };
      return {
        data: [{ id: 'pi_bad_time', status: 'succeeded', created: null }],
        has_more: false,
      };
    });
    await expect(
      fetchContadorStripeIngressSnapshot('heartbeat', NOW, {
        getJson,
        keyForScope: () => 'key',
      }),
    ).rejects.toThrow('stripe_ingress_succeeded_row_invalid');
  });
});

describe('Contador Stripe ingress case reconciliation', () => {
  it('skips an exact existing case and creates one owned missing-ingress exception', async () => {
    let nextCaseId = 42;
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT c.id::text')) {
        return {
          rows: params[1] === 'pi_existing' ? [{ id: '9' }] : [],
        };
      }
      if (sql.includes('FROM business_v2.webhook_inbox')) {
        return { rows: [{ count: '0' }] };
      }
      if (
        sql.includes(
          'INSERT INTO business_v2.contador_payment_fulfillment_cases',
        )
      ) {
        return { rows: [{ id: String(nextCaseId++) }] };
      }
      return { rows: [] };
    });
    const result = await reconcileContadorStripeIngressSnapshotsWithClient({
      client: { query } as any,
      snapshots: [
        snapshot('heartbeat', ['pi_existing', 'pi_missing']),
        snapshot('tandem', []),
      ],
    });
    expect(result).toMatchObject({
      complete: true,
      heartbeat: {
        succeededPaymentIntents: 2,
        existingCases: 1,
        inboxWithoutCase: 0,
        exceptionsCreated: 1,
      },
      tandem: { exceptionsCreated: 0 },
      totalExceptionsCreated: 1,
    });
    const caseInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        'INSERT INTO business_v2.contador_payment_fulfillment_cases',
      ),
    );
    expect(caseInsert?.[1]).toEqual(
      expect.arrayContaining([
        'heartbeat',
        'pi_missing',
        'provider_delivery_missing',
      ]),
    );
    expect(
      query.mock.calls.filter(([sql]) =>
        String(sql).includes(
          'INSERT INTO business_v2.contador_payment_fulfillment_receipts',
        ),
      ),
    ).toHaveLength(6);
    expect(
      query.mock.calls
        .filter(([sql]) => String(sql).includes('pg_advisory_xact_lock'))
        .map(([, params]) => params?.[0]),
    ).toEqual(['heartbeat:pi_existing', 'heartbeat:pi_missing']);
  });

  it('classifies an inbox row without a case separately', async () => {
    const query = vi.fn(async (sql: string, _params: unknown[] = []) => {
      if (sql.includes('SELECT c.id::text')) return { rows: [] };
      if (sql.includes('FROM business_v2.webhook_inbox')) {
        return { rows: [{ count: '1' }] };
      }
      if (
        sql.includes(
          'INSERT INTO business_v2.contador_payment_fulfillment_cases',
        )
      ) {
        return { rows: [{ id: '44' }] };
      }
      return { rows: [] };
    });
    const result = await reconcileContadorStripeIngressSnapshotsWithClient({
      client: { query } as any,
      snapshots: [
        snapshot('heartbeat', ['pi_unadmitted']),
        snapshot('tandem', []),
      ],
    });
    expect(result.heartbeat.inboxWithoutCase).toBe(1);
    const caseInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        'INSERT INTO business_v2.contador_payment_fulfillment_cases',
      ),
    );
    expect(caseInsert?.[1]).toEqual(
      expect.arrayContaining(['provider_delivery_unadmitted']),
    );
  });

  it('fails closed on account-scope collision', async () => {
    const tandem = snapshot('tandem', []);
    tandem.accountId = 'acct_heartbeat';
    await expect(
      reconcileContadorStripeIngressSnapshotsWithClient({
        client: { query: vi.fn() } as any,
        snapshots: [snapshot('heartbeat', []), tandem],
      }),
    ).rejects.toThrow('stripe_ingress_account_scope_collision');
  });
});

describe('Contador Stripe ingress health', () => {
  beforeEach(() => resetContadorStripeIngressParityHealthForTests());

  it('is separately default-off', async () => {
    expect(contadorStripeIngressParityEnabled({})).toBe(false);
    expect(await runContadorStripeIngressParity({ env: {} })).toEqual(
      getContadorStripeIngressParityHealth(),
    );
    expect(getContadorStripeIngressParityHealth()).toMatchObject({
      enabled: false,
      status: 'disabled',
      consumerEnabled: false,
    });
  });

  it('reports only aggregate healthy results', async () => {
    const result = {
      complete: true as const,
      windowHours: 72 as const,
      heartbeat: {
        rowsScanned: 2,
        succeededPaymentIntents: 1,
        existingCases: 1,
        inboxWithoutCase: 0,
        exceptionsCreated: 0,
      },
      tandem: {
        rowsScanned: 2,
        succeededPaymentIntents: 2,
        existingCases: 1,
        inboxWithoutCase: 0,
        exceptionsCreated: 1,
      },
      totalExceptionsCreated: 1,
    };
    const health = await runContadorStripeIngressParity({
      env: { CONTADOR_STRIPE_INGRESS_PARITY_ENABLED: '1' },
      nowMs: Date.parse(NOW),
      fetchSnapshot: async (scope) => snapshot(scope, []),
      reconcile: async () => result,
    });
    expect(health).toMatchObject({
      enabled: true,
      status: 'healthy',
      result,
      errorCodes: [],
    });
    expect(JSON.stringify(health)).not.toMatch(/email|name|amount|currency/i);
  });

  it('degrades with a bounded provider error and retains no partial result', async () => {
    const health = await runContadorStripeIngressParity({
      env: { CONTADOR_STRIPE_INGRESS_PARITY_ENABLED: '1' },
      nowMs: Date.parse(NOW),
      fetchSnapshot: async () => {
        throw new Error('stripe_ingress_request_timeout');
      },
    });
    expect(health).toMatchObject({
      enabled: true,
      status: 'degraded',
      result: null,
      errorCodes: ['stripe_ingress_request_timeout'],
    });
  });
});
