import { describe, it, expect } from 'vitest';

import { isTrustworthy } from './trust.js';

describe('isTrustworthy — the 👍 gate (design §5)', () => {
  it('trusts a high-confidence root-cause diagnosis', () => {
    expect(
      isTrustworthy({
        confidence: 'high',
        cause_or_symptom: 'root_cause',
        review: { refuted: false, reason: 'evidence confirmed' },
      }),
    ).toBe(true);
  });
  it('trusts a medium-confidence root-cause diagnosis', () => {
    expect(
      isTrustworthy({
        confidence: 'medium',
        cause_or_symptom: 'root_cause',
        review: { refuted: false, reason: 'evidence confirmed' },
      }),
    ).toBe(true);
  });
  it('distrusts low confidence even at the root cause', () => {
    expect(
      isTrustworthy({
        confidence: 'low',
        cause_or_symptom: 'root_cause',
        review: { refuted: false, reason: 'evidence confirmed' },
      }),
    ).toBe(false);
  });
  it('distrusts a symptom-level cause even at high confidence', () => {
    expect(
      isTrustworthy({
        confidence: 'high',
        cause_or_symptom: 'symptom',
        review: { refuted: false, reason: 'evidence confirmed' },
      }),
    ).toBe(false);
  });
  it('distrusts an unknown cause', () => {
    expect(
      isTrustworthy({
        confidence: 'high',
        cause_or_symptom: 'unknown',
        review: { refuted: false, reason: 'evidence confirmed' },
      }),
    ).toBe(false);
  });

  it('distrusts missing, refuting, failed, or unparsable adversarial review', () => {
    const evidence = {
      confidence: 'high' as const,
      cause_or_symptom: 'root_cause' as const,
    };
    expect(isTrustworthy(evidence)).toBe(false);
    expect(
      isTrustworthy({
        ...evidence,
        review: { refuted: true, reason: 'the evidence is a symptom' },
      }),
    ).toBe(false);
    expect(
      isTrustworthy({
        ...evidence,
        review: { refuted: false, reason: 'refuter unavailable' },
      }),
    ).toBe(false);
    expect(
      isTrustworthy({
        ...evidence,
        review: { refuted: false, reason: 'unparseable refutation' },
      }),
    ).toBe(false);
  });
  it('distrusts missing trust fields (un-investigated)', () => {
    expect(isTrustworthy({})).toBe(false);
    expect(isTrustworthy({ confidence: null, cause_or_symptom: null })).toBe(
      false,
    );
  });
});
