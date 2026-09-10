import { z } from 'zod';

import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import { PaymentDomainError, validateAttempt } from './payment-domain.js';
import type { PaymentMethodBinding } from './payment-method-reconciliation-store.js';

const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const receivedFundsSchema = z
  .object({
    attemptId: z.uuid(),
    paymentReference: ref,
    source: z.literal('adyen_settlement_report'),
    receiptReference: ref,
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export type ReceivedFundsEvidence = z.infer<typeof receivedFundsSchema>;
declare const trustedReceivedFunds: unique symbol;
/** Construct only inside a future authenticated host settlement repository. */
export type TrustedReceivedFundsEvidence = ReceivedFundsEvidence & {
  readonly [trustedReceivedFunds]: true;
};

export interface PaymentReadinessPolicy {
  achAccess: 'verified_acceptance_provisional';
  achCertificate: 'received_funds_required';
  cardAccess: 'disabled' | 'verified_authorization_and_auto_capture';
  cardCaptureConfigurationEvidence: string | null;
}

export interface PaymentReadinessDecision {
  paymentMethod: 'card' | 'ach_direct_debit' | 'unverified';
  courseAccess: 'blocked' | 'eligible' | 'preserve_existing';
  certificateFinancialClearance: 'blocked' | 'cleared' | 'not_evaluated';
  reasons: string[];
  settlement: 'unproven' | 'received_funds_verified';
  emitsAction: false;
}

/** Pure evidence gate only. It cannot grant/revoke access or issue a certificate. */
export function decidePaymentReadiness(input: {
  attempt: unknown;
  evidence: CheckoutPaymentEvidence;
  methodBinding: PaymentMethodBinding | null;
  receivedFunds: TrustedReceivedFundsEvidence | null;
  policy: PaymentReadinessPolicy;
  accessAlreadyGranted: boolean;
}): PaymentReadinessDecision {
  const attempt = validateAttempt(input.attempt);
  if (
    input.policy.achAccess !== 'verified_acceptance_provisional' ||
    input.policy.achCertificate !== 'received_funds_required' ||
    !['disabled', 'verified_authorization_and_auto_capture'].includes(
      input.policy.cardAccess,
    ) ||
    (input.policy.cardCaptureConfigurationEvidence !== null &&
      !ref.safeParse(input.policy.cardCaptureConfigurationEvidence).success)
  )
    throw new PaymentDomainError('invalid_payment_readiness_policy');
  const blocked = (
    method: PaymentReadinessDecision['paymentMethod'],
    reasons: string[],
    preserve = false,
  ): PaymentReadinessDecision => ({
    paymentMethod: method,
    courseAccess:
      preserve && input.accessAlreadyGranted ? 'preserve_existing' : 'blocked',
    certificateFinancialClearance:
      method === 'card' ? 'not_evaluated' : 'blocked',
    reasons: [...new Set(reasons)].sort(),
    settlement: 'unproven',
    emitsAction: false,
  });
  const binding = input.methodBinding;
  if (!binding) return blocked('unverified', ['method_verification_pending']);
  if (binding.attemptId !== attempt.attemptId)
    return blocked('unverified', ['method_binding_conflict']);
  const payment = input.evidence.payments.find(
    (candidate) => candidate.paymentReference === binding.paymentReference,
  );
  if (!payment)
    return blocked(binding.paymentMethod, [
      input.evidence.payments.some(
        (candidate) => candidate.evidence.authorization === 'authorized',
      )
        ? 'method_binding_conflict'
        : 'payment_evidence_pending',
    ]);
  const financial = payment.evidence;
  const adverse =
    input.evidence.state === 'needs_review' ||
    financial.evidenceState === 'conflict' ||
    financial.chargebackAmount > 0 ||
    financial.chargebackReversedAmount > 0 ||
    financial.refundedAmount > 0 ||
    financial.refundReversedAmount > 0 ||
    financial.refundFailed ||
    financial.captureFailed ||
    financial.canceled ||
    financial.expired;
  if (adverse)
    return blocked(
      binding.paymentMethod,
      ['adverse_or_conflicting_payment_evidence'],
      true,
    );
  if (financial.authorization === 'refused')
    return blocked(binding.paymentMethod, ['payment_refused']);
  if (financial.authorization !== 'authorized')
    return blocked(binding.paymentMethod, ['verified_acceptance_pending']);

  if (binding.paymentMethod === 'card') {
    if (
      input.policy.cardAccess !== 'verified_authorization_and_auto_capture' ||
      input.policy.cardCaptureConfigurationEvidence === null
    )
      return blocked('card', ['card_capture_configuration_unverified']);
    return {
      paymentMethod: 'card',
      courseAccess: 'eligible',
      certificateFinancialClearance: 'not_evaluated',
      reasons: ['card_policy_requires_separate_existing_certificate_rules'],
      settlement: 'unproven',
      emitsAction: false,
    };
  }

  const received = receivedFundsSchema.safeParse(input.receivedFunds);
  const receivedMatches =
    received.success &&
    received.data.attemptId === attempt.attemptId &&
    received.data.paymentReference === binding.paymentReference &&
    received.data.amount === attempt.quote.finalAmount &&
    received.data.currency === attempt.quote.currency;
  return {
    paymentMethod: 'ach_direct_debit',
    courseAccess: 'eligible',
    certificateFinancialClearance: receivedMatches ? 'cleared' : 'blocked',
    reasons: receivedMatches
      ? ['ach_return_risk_accepted', 'received_funds_verified']
      : ['ach_return_risk_accepted', 'certificate_received_funds_pending'],
    settlement: receivedMatches ? 'received_funds_verified' : 'unproven',
    emitsAction: false,
  };
}
