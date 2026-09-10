import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  assertNativePilotEvidence,
  EnrollmentPilotRefusalError,
  STUDENT_ENROLLMENT_PILOT_POLICY,
  type NativeStripeEnrollmentEvidence,
} from './student-enrollment-production.js';

const activation = '2026-09-10T04:00:00.000Z';
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
const evidence: NativeStripeEnrollmentEvidence = {
  account: 'tandem',
  eventId: 'evt_pilot',
  eventType: 'payment_intent.succeeded',
  eventCreated: 1789012801,
  paymentIntentId: 'pi_pilot',
  paymentIntentCreated: 1789012800,
  paymentIntentStatus: 'succeeded',
  amountMinor: 399600,
  amountReceivedMinor: 399600,
  currency: 'usd',
  purchasePath: 'tandem_payment_intent',
  checkoutSessionId: null,
  checkoutPaymentStatus: null,
  checkoutMode: null,
  checkoutAmountMinor: null,
  discountMinor: 0,
  discountCount: 0,
  couponCode: null,
  pricingPolicy: 'standard',
  regionalPriceApplied: false,
  baseAmountMinor: 399600,
  originalAmountMinor: null,
  productId: null,
  priceId: null,
  quantity: 1,
  offerKey: 'supervision-inaugural',
  cohortProgram: 'supervision',
  cohortStart: '2026-10-07',
  chargeId: 'ch_pilot',
  chargePaid: true,
  chargeAmountMinor: 399600,
  chargeCurrency: 'usd',
  chargeDisputed: false,
  amountRefundedMinor: 0,
  invoiceId: null,
  termsAccepted: true,
  termsVersion: '2026-09-06',
  connectedAccountTransfer: false,
  participantPartyId: 42,
  participantEmail: 'student@example.com',
  participantName: 'Student Name',
  observedAt: '2026-09-10T04:00:02.000Z',
  evidenceSha256: 'a'.repeat(64),
};

describe('one-event production enrollment selector', () => {
  it('accepts only the exact future fully settled supervision pilot evidence', () => {
    expect(() =>
      assertNativePilotEvidence({ payload, source }, evidence, activation),
    ).not.toThrow();
  });

  it.each([
    ['wrong amount', { amountMinor: 399599 }],
    ['discount', { discountMinor: 1 }],
    ['coupon identity', { discountCount: 1, couponCode: 'PROMO' }],
    ['regional pricing', { regionalPriceApplied: true }],
    ['installment invoice', { invoiceId: 'in_pilot' }],
    ['refund', { amountRefundedMinor: 1 }],
    ['dispute', { chargeDisputed: true }],
    ['wrong offer', { offerKey: 'supervision-regular' }],
    ['wrong class', { cohortStart: '2027-01-01' }],
    ['unexpected direct-path price', { priceId: 'price_other' }],
    ['multiple seats', { quantity: 2 }],
    ['missing accepted terms', { termsAccepted: false }],
    ['connected transfer', { connectedAccountTransfer: true }],
  ])('refuses %s before a writer claim', (_label, change) => {
    expect(() =>
      assertNativePilotEvidence(
        { payload, source },
        { ...evidence, ...change } as NativeStripeEnrollmentEvidence,
        activation,
      ),
    ).toThrow(EnrollmentPilotRefusalError);
  });

  it('refuses events older than the release-bound activation epoch', () => {
    const old = { ...evidence, eventCreated: 1 };
    expect(() =>
      assertNativePilotEvidence(
        {
          payload: { ...payload, event_created: 1 },
          source,
        },
        old,
        activation,
      ),
    ).toThrow('event_identity_invalid');
  });

  it('keeps both real Stripe ingress paths on the shared host gate and protects direct roster mode', () => {
    const requestPath = fs.readFileSync('src/webhook-server.ts', 'utf8');
    const retryPath = fs.readFileSync('src/webhook-inbox-reaper.ts', 'utf8');
    const host = fs.readFileSync('src/stripe-payment-host.ts', 'utf8');
    const processor = fs.readFileSync(
      'tools/contador/process-payment.cjs',
      'utf8',
    );
    expect(requestPath).toContain('handleStripePayment(payload)');
    expect(retryPath).toContain('handleStripePayment(row.raw_body)');
    expect(host).toContain("['--accounting-only']");
    expect(processor).toContain("rosterMode = 'enrollment_owned'");
    expect(STUDENT_ENROLLMENT_PILOT_POLICY).toBe(
      'student_enrollment_supervision_inaugural_v1_one_event',
    );
  });
});
