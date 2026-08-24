import { describe, expect, it, vi } from 'vitest';

import { resolveStripePaymentSource } from './stripe-payment-source.js';

describe('resolveStripePaymentSource', () => {
  it('uses a perimeter-bound payment intent without another provider call', async () => {
    const getCheckoutSession = vi.fn();
    const result = await resolveStripePaymentSource(
      {
        stripeId: 'pi_abc123',
        stripeAccount: 'heartbeat',
        eventType: 'payment_intent.succeeded',
        providerEventId: 'evt_abc123',
        refundId: null,
      },
      {
        getCheckoutSession,
        now: () => new Date('2026-08-24T03:00:00.000Z'),
      },
    );
    expect(getCheckoutSession).not.toHaveBeenCalled();
    expect(result).toEqual({
      stripeAccount: 'heartbeat',
      paymentIntentId: 'pi_abc123',
      sourceObjectId: 'pi_abc123',
      sourceEventId: 'evt_abc123',
      eventType: 'payment_intent.succeeded',
      observedAt: '2026-08-24T03:00:00.000Z',
      aliases: [
        { kind: 'payment_intent', id: 'pi_abc123' },
        { kind: 'event', id: 'evt_abc123' },
      ],
    });
  });

  it('resolves a checkout session to the canonical payment intent first', async () => {
    const getCheckoutSession = vi.fn(async () => ({
      payment_intent: { id: 'pi_from_checkout' },
    }));
    const result = await resolveStripePaymentSource(
      {
        stripeId: 'cs_test_checkout',
        stripeAccount: 'tandem',
        eventType: 'checkout.session.completed',
        providerEventId: null,
        refundId: null,
      },
      {
        getCheckoutSession,
        now: () => new Date('2026-08-24T03:00:00.000Z'),
      },
    );
    expect(getCheckoutSession).toHaveBeenCalledWith(
      'tandem',
      'cs_test_checkout',
    );
    expect(result.paymentIntentId).toBe('pi_from_checkout');
    expect(result.aliases).toEqual([
      { kind: 'payment_intent', id: 'pi_from_checkout' },
      { kind: 'checkout_session', id: 'cs_test_checkout' },
    ]);
  });

  it('binds exact refund and event aliases without customer content', async () => {
    const result = await resolveStripePaymentSource(
      {
        stripeId: 'pi_refund',
        stripeAccount: 'heartbeat',
        eventType: 'charge.refunded',
        providerEventId: 'evt_refund',
        refundId: 're_refund',
      },
      { now: () => new Date('2026-08-24T03:00:00.000Z') },
    );
    expect(result.aliases).toEqual([
      { kind: 'payment_intent', id: 'pi_refund' },
      { kind: 'event', id: 'evt_refund' },
      { kind: 'refund', id: 're_refund' },
    ]);
  });

  it('fails closed when checkout has no payment intent', async () => {
    await expect(
      resolveStripePaymentSource(
        {
          stripeId: 'cs_test_missing',
          stripeAccount: 'heartbeat',
          eventType: 'checkout.session.completed',
          providerEventId: null,
          refundId: null,
        },
        { getCheckoutSession: vi.fn(async () => ({ payment_intent: null })) },
      ),
    ).rejects.toThrow('no canonical payment intent');
  });
});
