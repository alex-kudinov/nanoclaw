import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ADYEN_TEST_REFERENCE_PREFIX,
  adyenAttemptReference,
  parseAdyenAttemptReference,
  parseAdyenPaymentOperationReference,
} from './adyen-payment-identifiers.js';

const profile = { referencePrefix: ADYEN_TEST_REFERENCE_PREFIX };

describe('versioned Adyen Session-operation correlation', () => {
  it('preserves the legacy first reference and round-trips only sequences 1-3', () => {
    const attemptId = randomUUID();
    expect(adyenAttemptReference(attemptId, profile, 1)).toBe(
      `${ADYEN_TEST_REFERENCE_PREFIX}${attemptId}`,
    );
    expect(
      parseAdyenPaymentOperationReference(
        adyenAttemptReference(attemptId, profile, 1),
        profile,
      ),
    ).toEqual({ attemptId, sessionSequence: 1 });
    expect(
      parseAdyenPaymentOperationReference(
        adyenAttemptReference(attemptId, profile, 2),
        profile,
      ),
    ).toEqual({ attemptId, sessionSequence: 2 });
    expect(
      parseAdyenPaymentOperationReference(
        adyenAttemptReference(attemptId, profile, 3),
        profile,
      ),
    ).toEqual({ attemptId, sessionSequence: 3 });
    expect(
      parseAdyenAttemptReference(
        adyenAttemptReference(attemptId, profile),
        profile,
      ),
    ).toBe(attemptId);
  });

  it.each(['-s0', '-s1', '-s4', '-S2', '-s02', '-x2', '/s2', '-s2-extra'])(
    'rejects unowned suffix %s',
    (suffix) => {
      expect(() =>
        parseAdyenPaymentOperationReference(
          `${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}${suffix}`,
          profile,
        ),
      ).toThrow('invalid_attempt_identity');
    },
  );
});
