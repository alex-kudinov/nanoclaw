import { describe, expect, it, vi } from 'vitest';

import { createStripeEnrollmentEvidenceResolver } from './student-enrollment-stripe-evidence.js';
import { assertNativePilotEvidence } from './student-enrollment-production.js';

const payload = {
  account: 'tandem',
  event_type: 'payment_intent.succeeded',
  event_id: 'evt_pilot',
  event_created: 1789012801,
  stripe_id: 'pi_pilot',
  payment_intent_id: 'pi_pilot',
};
const source = {
  stripeAccount: 'tandem' as const,
  paymentIntentId: 'pi_pilot',
  sourceObjectId: 'pi_pilot',
  sourceEventId: 'evt_pilot',
  eventType: 'payment_intent.succeeded',
  observedAt: '2026-09-10T04:00:01.000Z',
  aliases: [{ kind: 'payment_intent' as const, id: 'pi_pilot' }],
};

function stripeGet(path: string) {
  if (path.startsWith('/v1/payment_intents/'))
    return Promise.resolve({
      id: 'pi_pilot',
      created: 1789012800,
      status: 'succeeded',
      amount: 399600,
      amount_received: 399600,
      currency: 'usd',
      invoice: null,
      customer: { email: 'Student@Example.com', name: 'Student Name' },
      transfer_data: null,
      on_behalf_of: null,
      metadata: {
        product: 'supervision-inaugural',
        cohort_program: 'supervision',
        cohort_start: '2026-10-07',
        email: 'Student@Example.com',
        name: 'Student Name',
        tandem_party_id: '42',
        terms_accepted: 'true',
        terms_version: '2026-09-06',
        base_amount: '399600',
        regional_price_applied: 'false',
        pricing_policy: 'standard',
      },
      latest_charge: {
        id: 'ch_pilot',
        paid: true,
        amount: 399600,
        currency: 'usd',
        disputed: false,
        amount_refunded: 0,
        metadata: {},
      },
    });
  if (path.startsWith('/v1/checkout/sessions/cs_live_pilot?'))
    return Promise.resolve({
      id: 'cs_live_pilot',
      payment_intent: 'pi_pilot',
      payment_status: 'paid',
      mode: 'payment',
      amount_total: 399600,
      total_details: { amount_discount: 0 },
      discounts: [],
      customer_details: {
        email: 'Student@Example.com',
        name: 'Student Name',
      },
      metadata: {},
    });
  if (path.includes('/line_items'))
    return Promise.resolve({
      has_more: false,
      data: [
        {
          quantity: 1,
          price: {
            id: 'price_1Tvz3MA7hTBWpVVqhF708kPv',
            product: { id: 'prod_UvqkpUONPWr8Bo' },
          },
        },
      ],
    });
  throw new Error(`unexpected path ${path}`);
}

describe('native Stripe enrollment evidence resolver', () => {
  it('reloads exact provider objects and resolves one canonical Party', async () => {
    const get = vi.fn(stripeGet);
    const resolve = createStripeEnrollmentEvidenceResolver(
      { query: vi.fn() } as never,
      {
        stripeGet: get,
        resolveParty: vi.fn(async () => 42),
        clock: () => 1789012802000,
      },
    );
    const evidence = await resolve({ payload, source });
    expect(evidence).toMatchObject({
      paymentIntentId: 'pi_pilot',
      purchasePath: 'tandem_payment_intent',
      checkoutSessionId: null,
      participantPartyId: 42,
      participantEmail: 'student@example.com',
      offerKey: 'supervision-inaugural',
      quantity: 1,
    });
    expect(get).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('/v1/payment_intents/pi_pilot'),
    );
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to infer a participant when canonical Party resolution fails', async () => {
    const resolve = createStripeEnrollmentEvidenceResolver(
      { query: vi.fn() } as never,
      {
        stripeGet,
        resolveParty: vi.fn(async () => null),
      },
    );
    const unresolved = await resolve({ payload, source });
    expect(unresolved.participantPartyId).toBe(0);
    expect(() =>
      assertNativePilotEvidence(
        { payload, source },
        unresolved,
        '2026-09-10T04:00:00.000Z',
      ),
    ).toThrow('participant_identity_unresolved');
  });

  it('also binds the exact Checkout Session alias when that native event is used', async () => {
    const resolve = createStripeEnrollmentEvidenceResolver(
      { query: vi.fn() } as never,
      {
        stripeGet,
        resolveParty: vi.fn(async () => 42),
      },
    );
    const checkoutSource = {
      ...source,
      sourceObjectId: 'cs_live_pilot',
      eventType: 'checkout.session.completed',
    };
    const checkoutPayload = {
      ...payload,
      event_type: 'checkout.session.completed',
      stripe_id: 'cs_live_pilot',
    };
    await expect(
      resolve({ payload: checkoutPayload, source: checkoutSource }),
    ).resolves.toMatchObject({
      purchasePath: 'stripe_checkout_session',
      checkoutSessionId: 'cs_live_pilot',
      productId: 'prod_UvqkpUONPWr8Bo',
      priceId: 'price_1Tvz3MA7hTBWpVVqhF708kPv',
    });
  });
});
