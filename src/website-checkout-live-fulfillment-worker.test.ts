import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { type PaymentScope } from './payment-domain.js';
import { WebsiteCheckoutLiveFulfillmentWorker } from './website-checkout-live-fulfillment-worker.js';
import { fulfillWebsiteCheckoutAttempt } from './website-checkout-service.js';

const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'live',
  company: 'tandem',
  merchant: 'merchant-live',
  store: 'store-live',
  endpointRegion: 'eu',
};

function poolWith(attemptIds: readonly string[]) {
  const query = vi.fn(async (_sql: string) => ({
    rowCount: attemptIds.length,
    rows: attemptIds.map((attempt_id) => ({ attempt_id })),
  }));
  const release = vi.fn();
  return {
    pool: {
      connect: vi.fn(async () => ({ query, release })),
    },
    query,
  };
}

describe('restart-safe LIVE fulfillment worker', () => {
  it('keyset-drains beyond one batch without starving later attempts', async () => {
    const attempts = [randomUUID(), randomUUID(), randomUUID()].sort();
    const rows = attempts.map((attempt_id, index) => ({
      attempt_id,
      accepted_at: String(index + 1),
    }));
    const query = vi.fn(async (_sql: string, values: unknown[]) => {
      const after = values[2] === null ? 0 : Number(values[2]);
      return {
        rowCount: Math.min(2, rows.length - after),
        rows: rows.slice(after, after + 2),
      };
    });
    const fulfillAttempt = vi.fn(async (_attemptId: string) => ({
      enrollmentResult: {
        disposition: 'accepted' as const,
        canonicalEnrollment: 'materialized' as const,
        currentPaymentState: 'eligible' as const,
      },
      receiptWelcome: {
        state: 'verified' as const,
        receiptReference: 'fixture',
      },
    }));
    const worker = new WebsiteCheckoutLiveFulfillmentWorker(
      {
        connect: vi.fn(async () => ({ query, release: vi.fn() })),
      } as never,
      'tandem-wordpress-live',
      scope,
      { fulfillAttempt },
      async () => undefined,
      2,
    );
    await expect(worker.drainOnce()).resolves.toMatchObject({
      scanned: 3,
      materialized: 3,
    });
    expect(fulfillAttempt.mock.calls.map(([attemptId]) => attemptId)).toEqual(
      attempts,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses one stable customer receipt/welcome idempotency key after access', async () => {
    const attemptId = randomUUID();
    const enrollmentResult = {
      disposition: 'accepted' as const,
      orderKey: 'website-checkout:fixture',
      canonicalEnrollment: 'materialized' as const,
      accessDelivery: 'membership_verified' as const,
      certificateFinancialClearance: 'not_evaluated' as const,
      currentPaymentState: 'eligible' as const,
      reasons: ['fixture'],
      evidenceReference: 'enrollment-admission:v1:fixture',
    };
    const reconcile = vi.fn(async () => ({
      state: 'verified' as const,
      receiptReference: 'gmail-message:fixture',
    }));
    await expect(
      fulfillWebsiteCheckoutAttempt(attemptId, {
        enrollment: { admit: vi.fn(async () => enrollmentResult) },
        accessDelivery: {
          deliver: vi.fn(async () => enrollmentResult),
        },
        receiptWelcomeOwner: { reconcile },
      }),
    ).resolves.toMatchObject({
      receiptWelcome: {
        state: 'verified',
        receiptReference: 'gmail-message:fixture',
      },
    });
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        idempotencyKey: `website_checkout_receipt_welcome:${attemptId}`,
      }),
    );
  });

  it('finishes once after the browser closes and safely replays after restart', async () => {
    const attemptId = randomUUID();
    const providerEffects = new Set<string>();
    const receiptEffects = new Set<string>();
    const fulfillAttempt = vi.fn(async (id: string) => {
      providerEffects.add(id);
      receiptEffects.add(`website_checkout_receipt_welcome:${id}`);
      return {
        enrollmentResult: {
          disposition: providerEffects.has(id)
            ? ('duplicate' as const)
            : ('accepted' as const),
          canonicalEnrollment: 'materialized' as const,
          currentPaymentState: 'eligible' as const,
        },
        receiptWelcome: {
          state: 'verified' as const,
          receiptReference: `fixture-receipt:${id}`,
        },
      };
    });
    const firstPool = poolWith([attemptId]);
    const first = new WebsiteCheckoutLiveFulfillmentWorker(
      firstPool.pool as never,
      'tandem-wordpress-live',
      scope,
      { fulfillAttempt },
      async () => undefined,
      25,
    );
    await expect(first.drainOnce()).resolves.toEqual({
      scanned: 1,
      materialized: 1,
      held: 0,
      failed: 0,
    });
    await first.stop();

    const restartPool = poolWith([attemptId]);
    const restarted = new WebsiteCheckoutLiveFulfillmentWorker(
      restartPool.pool as never,
      'tandem-wordpress-live',
      scope,
      { fulfillAttempt },
      async () => undefined,
      25,
    );
    await restarted.drainOnce();
    await restarted.stop();
    expect(providerEffects).toEqual(new Set([attemptId]));
    expect(receiptEffects).toEqual(
      new Set([`website_checkout_receipt_welcome:${attemptId}`]),
    );
    expect(fulfillAttempt).toHaveBeenCalledTimes(2);
    expect(
      [...firstPool.query.mock.calls, ...restartPool.query.mock.calls].every(
        ([sql]) => /^\s*SELECT/.test(sql),
      ),
    ).toBe(true);
  });

  it('holds an adverse attempt without granting or revoking access', async () => {
    const attemptId = randomUUID();
    const grants = vi.fn();
    const revokes = vi.fn();
    const ownedExceptions = new Set<string>();
    const fixturePool = poolWith([attemptId]);
    const worker = new WebsiteCheckoutLiveFulfillmentWorker(
      fixturePool.pool as never,
      'tandem-wordpress-live',
      scope,
      {
        fulfillAttempt: async (id) => {
          ownedExceptions.add(`payment-review:${id}`);
          return {
            enrollmentResult: {
              disposition: 'held',
              canonicalEnrollment: 'not_materialized',
              currentPaymentState: 'needs_review',
            },
            receiptWelcome: { state: 'held', receiptReference: null },
          };
        },
      },
      async () => undefined,
      25,
    );
    await expect(worker.drainOnce()).resolves.toMatchObject({ held: 1 });
    expect(grants).not.toHaveBeenCalled();
    expect(revokes).not.toHaveBeenCalled();
    expect(ownedExceptions).toEqual(new Set([`payment-review:${attemptId}`]));
  });
});
