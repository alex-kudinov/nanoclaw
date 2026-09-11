import { z } from 'zod';
import {
  resolveAdyenEnvironment,
  type AdyenEnvironmentProfile,
} from './adyen-environment.js';
import { PaymentDomainError } from './payment-domain.js';

export const ADYEN_TEST_REFERENCE_PREFIX = resolveAdyenEnvironment({
  environment: 'test',
  liveEndpointPrefix: null,
}).referencePrefix;

export function adyenAttemptReference(
  attemptId: string,
  profile: Pick<AdyenEnvironmentProfile, 'referencePrefix'>,
  sessionSequence = 1,
): string {
  if (
    !z.uuid().safeParse(attemptId).success ||
    !Number.isSafeInteger(sessionSequence) ||
    sessionSequence < 1 ||
    sessionSequence > 3
  )
    throw new PaymentDomainError('invalid_attempt_identity');
  return `${profile.referencePrefix}${attemptId}${sessionSequence === 1 ? '' : `-s${sessionSequence}`}`;
}

export function adyenTestAttemptReference(attemptId: string): string {
  return adyenAttemptReference(attemptId, {
    referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
  });
}

export function parseAdyenAttemptReference(
  reference: string,
  profile: Pick<AdyenEnvironmentProfile, 'referencePrefix'>,
): string {
  if (!reference.startsWith(profile.referencePrefix))
    throw new PaymentDomainError('invalid_attempt_identity');
  const id = reference.slice(profile.referencePrefix.length);
  if (!z.uuid().safeParse(id).success)
    throw new PaymentDomainError('invalid_attempt_identity');
  return id;
}

export function parseAdyenPaymentOperationReference(
  reference: string,
  profile: Pick<AdyenEnvironmentProfile, 'referencePrefix'>,
): { attemptId: string; sessionSequence: number } {
  if (!reference.startsWith(profile.referencePrefix))
    throw new PaymentDomainError('invalid_attempt_identity');
  const value = reference.slice(profile.referencePrefix.length);
  const match = value.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-s([2-3]))?$/,
  );
  if (!match || !z.uuid().safeParse(match[1]).success)
    throw new PaymentDomainError('invalid_attempt_identity');
  return Object.freeze({
    attemptId: match[1].toLowerCase(),
    sessionSequence: match[2] === undefined ? 1 : Number(match[2]),
  });
}

export function parseAdyenTestAttemptReference(reference: string): string {
  return parseAdyenAttemptReference(reference, {
    referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
  });
}
