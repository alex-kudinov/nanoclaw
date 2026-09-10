import {
  PaymentDomainError,
  projectPaymentEvidence,
  validateAttempt,
  type PaymentFact,
  type PaymentEvidenceProjection,
} from './payment-domain.js';

export interface CheckoutPaymentEvidence {
  state:
    | 'no_payment_evidence'
    | 'authorization_recorded'
    | 'refused'
    | 'awaiting_prior_evidence'
    | 'needs_review';
  payments: Array<{
    paymentReference: string;
    evidence: PaymentEvidenceProjection;
  }>;
  exceptions: string[];
  settlement: 'unproven';
  fulfillment: 'not_evaluated';
}

/** A checkout/Session may contain refused retries under distinct PSP references. */
export function projectCheckoutPaymentEvidence(input: {
  attempt: unknown;
  facts: PaymentFact[];
}): CheckoutPaymentEvidence {
  const attempt = validateAttempt(input.attempt);
  if (!Array.isArray(input.facts) || input.facts.length > 1000)
    throw new PaymentDomainError('invalid_evidence_batch');
  const groups = new Map<string, PaymentFact[]>();
  for (const fact of input.facts) {
    if (!fact || typeof fact.paymentReference !== 'string')
      throw new PaymentDomainError('invalid_contract');
    groups.set(fact.paymentReference, [
      ...(groups.get(fact.paymentReference) ?? []),
      fact,
    ]);
  }
  const payments = [...groups.keys()]
    .sort()
    .map((paymentReference) => ({
      paymentReference,
      evidence: projectPaymentEvidence({
        attempt,
        paymentReference,
        facts: groups.get(paymentReference)!,
      }),
    }));
  const exceptions = new Set<string>();
  for (const payment of payments)
    for (const reason of payment.evidence.exceptions) exceptions.add(reason);
  const exposed = payments.filter(
    (p) =>
      p.evidence.authorization === 'authorized' ||
      p.evidence.capturedAmount > 0,
  );
  if (exposed.length > 1)
    exceptions.add('multiple_successful_provider_payments');
  const pending = payments.some(
    (p) =>
      p.evidence.evidenceState === 'awaiting_prior_evidence' ||
      p.evidence.authorization === 'unknown',
  );
  return {
    state: exceptions.size
      ? 'needs_review'
      : pending
        ? 'awaiting_prior_evidence'
        : exposed.length === 1
          ? 'authorization_recorded'
          : payments.length
            ? 'refused'
            : 'no_payment_evidence',
    payments,
    exceptions: [...exceptions].sort(),
    settlement: 'unproven',
    fulfillment: 'not_evaluated',
  };
}
