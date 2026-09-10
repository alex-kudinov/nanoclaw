import { z } from 'zod';
import { PaymentDomainError } from './payment-domain.js';

export const ADYEN_TEST_REFERENCE_PREFIX = 'tandem-poc-tsv1-';
export function adyenTestAttemptReference(attemptId: string): string {
  if (!z.uuid().safeParse(attemptId).success)
    throw new PaymentDomainError('invalid_attempt_identity');
  return `${ADYEN_TEST_REFERENCE_PREFIX}${attemptId}`;
}
export function parseAdyenTestAttemptReference(reference: string): string {
  if (!reference.startsWith(ADYEN_TEST_REFERENCE_PREFIX))
    throw new PaymentDomainError('invalid_attempt_identity');
  const id = reference.slice(ADYEN_TEST_REFERENCE_PREFIX.length);
  if (!z.uuid().safeParse(id).success)
    throw new PaymentDomainError('invalid_attempt_identity');
  return id;
}
