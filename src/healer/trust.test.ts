import { describe, it, expect } from 'vitest';

import { isTrustworthy } from './trust.js';

describe('isTrustworthy — the 👍 gate (design §5)', () => {
  it('trusts a high-confidence root-cause diagnosis', () => {
    expect(isTrustworthy({ confidence: 'high', cause_or_symptom: 'root_cause' })).toBe(true);
  });
  it('trusts a medium-confidence root-cause diagnosis', () => {
    expect(isTrustworthy({ confidence: 'medium', cause_or_symptom: 'root_cause' })).toBe(true);
  });
  it('distrusts low confidence even at the root cause', () => {
    expect(isTrustworthy({ confidence: 'low', cause_or_symptom: 'root_cause' })).toBe(false);
  });
  it('distrusts a symptom-level cause even at high confidence', () => {
    expect(isTrustworthy({ confidence: 'high', cause_or_symptom: 'symptom' })).toBe(false);
  });
  it('distrusts an unknown cause', () => {
    expect(isTrustworthy({ confidence: 'high', cause_or_symptom: 'unknown' })).toBe(false);
  });
  it('distrusts missing trust fields (un-investigated)', () => {
    expect(isTrustworthy({})).toBe(false);
    expect(isTrustworthy({ confidence: null, cause_or_symptom: null })).toBe(false);
  });
});
