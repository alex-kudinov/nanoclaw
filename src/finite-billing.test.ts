import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  runFiniteBillingSweep,
  validateFiniteBillingActivation,
  verifyFiniteBillingRelay,
  type FiniteChargeCommand,
} from './finite-billing.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function activation() {
  const contractId = randomUUID(),
    principal = randomUUID();
  const obligations = [1, 2, 3].map((ordinal) => ({
    obligationId: randomUUID(),
    ordinal,
    amountCents: 90000,
    currency: 'USD',
    dueAt: `2026-0${ordinal}-15T16:00:00.000Z`,
  }));
  const schedule = {
    schemaVersion: 1 as const,
    contractId,
    billingPrincipalId: principal,
    productId: 'test-product',
    paymentOptionId: 'plan-monthly-3',
    kind: 'finite_installments' as const,
    cadence: 'monthly' as const,
    timezone: 'America/Chicago' as const,
    count: 3,
    totalCents: 270000,
    currency: 'USD',
    acceptedAt: '2026-01-15T16:00:00.000Z',
    obligations,
  };
  const disclosure =
    'By choosing installments, you authorize Tandem Coaching to securely store this payment method with our payment processor and automatically charge the exact displayed schedule.';
  return {
    schemaVersion: 1 as const,
    kind: 'activation' as const,
    deliveryId: randomUUID(),
    sentAt: '2026-01-15T15:59:00.000Z',
    environment: 'test' as const,
    contract: {
      ...schedule,
      scheduleSha256: digest(schedule),
      disclosure,
      disclosureSha256: createHash('sha256').update(disclosure).digest('hex'),
      selectionMethod: 'payment_option_and_submit' as const,
    },
    binding: {
      bindingId: randomUUID(),
      state: 'active' as const,
      evidenceSha256: 'a'.repeat(64),
      brand: 'visa',
      lastFour: '4242',
    },
    firstPayment: {
      submissionId: randomUUID(),
      orderId: randomUUID(),
      pspReference: 'TEST-PSP-1',
      amountCents: 90000,
      currency: 'USD',
      paidAt: '2026-01-15T16:00:00.000Z',
    },
  };
}

describe('finite billing contracts', () => {
  it('accepts exactly N ordered obligations and rejects amount drift', () => {
    const value = activation();
    expect(
      validateFiniteBillingActivation(value).contract.obligations,
    ).toHaveLength(3);
    value.contract.obligations[2].amountCents = 89999;
    expect(() => validateFiniteBillingActivation(value)).toThrow();
  });
  it('verifies exact bytes and rejects stale or changed signatures', () => {
    const value = activation();
    const body = Buffer.from(JSON.stringify(value));
    const secret = 'x'.repeat(32);
    const signature = createHmac('sha256', secret)
      .update(
        `tandem-commerce-billing-v1\n${createHash('sha256').update(body).digest('hex')}`,
      )
      .digest('hex');
    const verified = verifyFiniteBillingRelay({
      rawBody: body,
      signature,
      secret,
      now: Date.parse(value.sentAt),
    });
    expect(verified.kind).toBe('activation');
    if (verified.kind !== 'activation') throw new Error('wrong relay kind');
    expect(verified.contract.contractId).toBe(value.contract.contractId);
    expect(() =>
      verifyFiniteBillingRelay({
        rawBody: Buffer.from(body.toString() + ' '),
        signature,
        secret,
        now: Date.parse(value.sentAt),
      }),
    ).toThrow('finite_billing_signature_invalid');
  });
  it('dispatches one claimed obligation and preserves unknown outcomes', async () => {
    const command: FiniteChargeCommand = {
      schemaVersion: 1,
      commandId: randomUUID(),
      contractId: randomUUID(),
      obligationId: randomUUID(),
      bindingId: randomUUID(),
      ordinal: 2,
      count: 3,
      amountCents: 90000,
      currency: 'USD',
      attemptOrdinal: 0,
      idempotencyKey: 'fixed-key',
      expiresAt: '2026-02-15T16:05:00.000Z',
    };
    const recordDispatch = vi.fn();
    const store = {
      claimDue: vi.fn().mockResolvedValue(command),
      recordDispatch,
    } as any;
    const result = await runFiniteBillingSweep({
      store,
      charge: async () => {
        throw new Error('timeout');
      },
      now: new Date('2026-02-15T16:00:00.000Z'),
    });
    expect(result.state).toBe('unknown');
    expect(recordDispatch).toHaveBeenCalledWith(command, 'unknown');
    const migration = readFileSync(
      new URL(
        '../data/business/migrations/nanoclaw-v2/171_finite_billing_contracts.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toContain(
      "'claimed','awaiting_provider','dispatch_unknown','paid'",
    );
  });
});
