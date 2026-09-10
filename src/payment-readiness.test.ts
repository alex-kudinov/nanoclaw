import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import { createPaymentAttempt } from './payment-domain.js';
import type { PaymentMethodBinding } from './payment-method-reconciliation-store.js';
import {
  decidePaymentReadiness,
  type TrustedReceivedFundsEvidence,
} from './payment-readiness.js';

const now = Date.now();
const attempt = createPaymentAttempt({
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
const policy = {
  achAccess: 'verified_acceptance_provisional',
  achCertificate: 'received_funds_required',
  cardAccess: 'disabled',
  cardCaptureConfigurationEvidence: null,
} as const;
const trusted = (value: unknown) => value as TrustedReceivedFundsEvidence;
function evidence(
  changes: Record<string, unknown> = {},
): CheckoutPaymentEvidence {
  return {
    state: 'authorization_recorded',
    payments: [
      {
        paymentReference: 'ABCDEFGHIJKLMNOP',
        evidence: {
          pending: false,
          authorization: 'authorized',
          capturedAmount: 0,
          captureFailed: false,
          refundedAmount: 0,
          refundFailed: false,
          refundReversedAmount: 0,
          chargebackAmount: 0,
          chargebackReversedAmount: 0,
          canceled: false,
          expired: false,
          evidenceState: 'consistent',
          exceptions: [],
          settlement: 'unproven',
          fulfillment: 'not_evaluated',
          ...changes,
        },
      },
    ],
    exceptions: [],
    settlement: 'unproven',
    fulfillment: 'not_evaluated',
  };
}
function binding(method: 'card' | 'ach_direct_debit'): PaymentMethodBinding {
  return {
    attemptId: attempt.attemptId,
    paymentReference: 'ABCDEFGHIJKLMNOP',
    paymentMethod: method,
    evidenceSha256: 'a'.repeat(64),
  };
}

describe('method-specific access and certificate financial gates', () => {
  it('keeps missing provider method verification durably non-actionable', () => {
    expect(
      decidePaymentReadiness({
        attempt,
        evidence: evidence(),
        methodBinding: null,
        receivedFunds: null,
        policy,
        accessAlreadyGranted: false,
      }),
    ).toMatchObject({
      paymentMethod: 'unverified',
      courseAccess: 'blocked',
      certificateFinancialClearance: 'blocked',
      reasons: ['method_verification_pending'],
      emitsAction: false,
    });
  });

  it('allows provisional ACH access but not certificate clearance from authorization', () => {
    expect(
      decidePaymentReadiness({
        attempt,
        evidence: evidence(),
        methodBinding: binding('ach_direct_debit'),
        receivedFunds: null,
        policy,
        accessAlreadyGranted: false,
      }),
    ).toMatchObject({
      courseAccess: 'eligible',
      certificateFinancialClearance: 'blocked',
      settlement: 'unproven',
      emitsAction: false,
    });
  });

  it('clears only ACH certificate finance with exact trusted received-funds evidence', () => {
    const receipt = {
      attemptId: attempt.attemptId,
      paymentReference: 'ABCDEFGHIJKLMNOP',
      source: 'adyen_settlement_report',
      receiptReference: 'settlement:fixture',
      evidenceSha256: 'b'.repeat(64),
      amount: 29900,
      currency: 'USD',
    };
    expect(
      decidePaymentReadiness({
        attempt,
        evidence: evidence(),
        methodBinding: binding('ach_direct_debit'),
        receivedFunds: trusted(receipt),
        policy,
        accessAlreadyGranted: false,
      }).certificateFinancialClearance,
    ).toBe('cleared');
    for (const receivedFunds of [
      { ...receipt, amount: 1 },
      { ...receipt, currency: 'CAD' },
      { ...receipt, paymentReference: 'OTHER' },
      { ...receipt, source: 'elapsed_time' },
    ])
      expect(
        decidePaymentReadiness({
          attempt,
          evidence: evidence(),
          methodBinding: binding('ach_direct_debit'),
          receivedFunds: trusted(receivedFunds),
          policy,
          accessAlreadyGranted: false,
        }).certificateFinancialClearance,
      ).toBe('blocked');
  });

  it('preserves existing access but removes clearance after a return/refund/conflict', () => {
    for (const changed of [
      { chargebackAmount: 29900 },
      { chargebackReversedAmount: 29900 },
      { refundedAmount: 29900 },
      { evidenceState: 'conflict' },
    ]) {
      const decision = decidePaymentReadiness({
        attempt,
        evidence: evidence(changed),
        methodBinding: binding('ach_direct_debit'),
        receivedFunds: null,
        policy,
        accessAlreadyGranted: true,
      });
      expect(decision).toMatchObject({
        courseAccess: 'preserve_existing',
        certificateFinancialClearance: 'blocked',
        emitsAction: false,
      });
    }
  });

  it('distinguishes a refused payment from acceptance still pending', () => {
    for (const [authorization, reason] of [
      ['unknown', 'verified_acceptance_pending'],
      ['refused', 'payment_refused'],
    ] as const)
      expect(
        decidePaymentReadiness({
          attempt,
          evidence: evidence({ authorization }),
          methodBinding: binding('ach_direct_debit'),
          receivedFunds: null,
          policy,
          accessAlreadyGranted: false,
        }).reasons,
      ).toContain(reason);
  });

  it('keeps card access blocked until explicit automatic-capture proof', () => {
    expect(
      decidePaymentReadiness({
        attempt,
        evidence: evidence({ capturedAmount: 29900 }),
        methodBinding: binding('card'),
        receivedFunds: null,
        policy,
        accessAlreadyGranted: false,
      }).courseAccess,
    ).toBe('blocked');
    expect(
      decidePaymentReadiness({
        attempt,
        evidence: evidence(),
        methodBinding: binding('card'),
        receivedFunds: null,
        policy: {
          ...policy,
          cardAccess: 'verified_authorization_and_auto_capture',
          cardCaptureConfigurationEvidence: 'merchant-config:test-readback',
        },
        accessAlreadyGranted: false,
      }),
    ).toMatchObject({
      courseAccess: 'eligible',
      certificateFinancialClearance: 'not_evaluated',
      settlement: 'unproven',
      emitsAction: false,
    });
  });
});
