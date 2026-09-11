import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createPaymentAttempt, type PaymentScope } from './payment-domain.js';
import { PaymentPromotionConsumptionReceiptReader } from './payment-promotion-consumption-receipt.js';
import type { PaymentTransaction } from './payment-store.js';

const caller = 'tandem-wordpress-test';
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'test-company',
  merchant: 'test-merchant',
  store: 'test-store-reference',
  endpointRegion: 'eu',
};

function attempt(regionalOnly: boolean) {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: ['card'],
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture-catalog',
      bundleVersion: 'fixture-bundle',
      deliveryVersion: 'fixture-delivery',
      locale: 'en-US',
      country: 'US',
      payerReference: null,
      participantReference: null,
      currency: 'USD',
      originalAmount: 29900,
      discountAmount: regionalOnly ? 10000 : 0,
      finalAmount: regionalOnly ? 19900 : 29900,
      discountPolicyReference: regionalOnly ? 'regional-policy-v1' : null,
      redemptionReference: null,
      paymentOption: 'one_time',
      termsVersion: 'terms-v1',
      consentReceipt: 'consent-v1',
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 300000,
    },
  });
}

function promotionAttempt(
  redemptionReference: string | null,
  discountPolicyReference = 'promotion:mcs-promo-v1-005',
) {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: ['card'],
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture-catalog',
      bundleVersion: 'fixture-bundle',
      deliveryVersion: 'fixture-delivery',
      locale: 'en-US',
      country: 'US',
      payerReference: null,
      participantReference: null,
      currency: 'USD',
      originalAmount: 29900,
      discountAmount: 2990,
      finalAmount: 26910,
      discountPolicyReference,
      redemptionReference,
      paymentOption: 'one_time',
      termsVersion: 'terms-v1',
      consentReceipt: 'consent-v1',
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 300000,
    },
  });
}

describe('promotion consumption receipt absence', () => {
  it.each([
    ['no promotion', false],
    ['regional-only discount', true],
  ] as const)(
    'returns null for %s without a redemption',
    async (_name, regional) => {
      const value = attempt(regional);
      const query = vi.fn(async () => ({
        rowCount: 1,
        rows: [{ contract: value }],
      }));
      const transaction: PaymentTransaction = async (work) =>
        work({ query } as unknown as PoolClient);
      const reader = new PaymentPromotionConsumptionReceiptReader(
        transaction,
        caller,
        scope,
        ['mcs-promo-v1-005'],
      );
      expect(
        await reader.read(value.attemptId, {
          disposition: 'accepted',
          orderKey: 'fixture-order',
          canonicalEnrollment: 'materialized',
          accessDelivery: 'not_requested',
          certificateFinancialClearance: 'not_evaluated',
          currentPaymentState: 'eligible',
          reasons: [],
          evidenceReference: `enrollment-admission:v1:${'a'.repeat(64)}`,
        }),
      ).toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['unlimited promotion', null],
    ['limited promotion', 'promotion-reservation:v1:fixture'],
  ] as const)(
    'issues one stable verifier for %s after card admission',
    async (_name, redemption) => {
      const value = promotionAttempt(redemption);
      const financialAdmissionReceipt = `enrollment-admission:v1:${'a'.repeat(64)}`;
      const attemptOperationId = randomUUID();
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ contract: value }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              evidence_reference: financialAdmissionReceipt,
              payment_method: 'card',
              attempt_operation_id: attemptOperationId,
            },
          ],
        });
      const transaction: PaymentTransaction = async (work) =>
        work({ query } as unknown as PoolClient);
      const reader = new PaymentPromotionConsumptionReceiptReader(
        transaction,
        caller,
        scope,
        ['mcs-promo-v1-005'],
      );
      const enrollment = {
        disposition: 'accepted' as const,
        orderKey: 'fixture-order',
        canonicalEnrollment: 'materialized' as const,
        accessDelivery: 'not_requested' as const,
        certificateFinancialClearance: 'not_evaluated' as const,
        currentPaymentState: 'eligible' as const,
        reasons: [],
        evidenceReference: financialAdmissionReceipt,
      };
      const first = await reader.read(value.attemptId, enrollment);
      expect(first).toMatchObject({
        schemaVersion: 1,
        kind: 'promotion_consumption',
        caller,
        operationId: attemptOperationId,
        quoteId: value.quote.quoteId,
        quoteFingerprint: value.quoteFingerprint,
        source: scope,
        attemptId: value.attemptId,
        policyReference: 'mcs-promo-v1-005',
        financialEvidenceClass: 'adyen_card_authorization_v1',
        financialAdmissionReceipt,
      });
      expect(first?.receiptReference).toMatch(
        /^promotion-consumption:v1:[a-f0-9]{64}$/,
      );
    },
  );

  it('extracts one promotion from a composite regional policy reference', async () => {
    const value = promotionAttempt(
      null,
      'regional:latam-resident-v1/promotion:mcs-promo-v1-005',
    );
    const financialAdmissionReceipt = `enrollment-admission:v1:${'a'.repeat(64)}`;
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ contract: value }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            evidence_reference: financialAdmissionReceipt,
            payment_method: 'card',
            attempt_operation_id: randomUUID(),
          },
        ],
      });
    const transaction: PaymentTransaction = async (work) =>
      work({ query } as unknown as PoolClient);
    const receipt = await new PaymentPromotionConsumptionReceiptReader(
      transaction,
      caller,
      scope,
      ['mcs-promo-v1-005'],
    ).read(value.attemptId, {
      disposition: 'accepted',
      orderKey: 'fixture-order',
      canonicalEnrollment: 'materialized',
      accessDelivery: 'not_requested',
      certificateFinancialClearance: 'not_evaluated',
      currentPaymentState: 'eligible',
      reasons: [],
      evidenceReference: financialAdmissionReceipt,
    });
    expect(receipt?.policyReference).toBe('mcs-promo-v1-005');
  });

  it.each([
    'promotion:unknown-policy',
    'promotion:mcs-promo-v1-005/promotion:mcs-promo-v1-005',
  ])(
    'fails preflight for untrusted promotion composition %s',
    async (policy) => {
      const value = promotionAttempt(null, policy);
      const query = vi.fn(async () => ({
        rowCount: 1,
        rows: [{ contract: value }],
      }));
      const transaction: PaymentTransaction = async (work) =>
        work({ query } as unknown as PoolClient);
      await expect(
        new PaymentPromotionConsumptionReceiptReader(
          transaction,
          caller,
          scope,
          ['mcs-promo-v1-005'],
        ).preflight(value.attemptId),
      ).rejects.toThrow('promotion_receipt_unavailable');
    },
  );
});
