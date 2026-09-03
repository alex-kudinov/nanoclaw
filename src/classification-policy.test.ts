import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CLASSIFICATION_LABELS,
  canonicalClassificationLabel,
  classificationPolicyFor,
} from './classification-policy.js';

describe('classification policy', () => {
  it('routes support and refunds to Sales ownership', () => {
    expect(classificationPolicyFor('MrGru/student/support')?.disposition).toBe(
      'support',
    );
    expect(classificationPolicyFor('client/active')?.disposition).toBe(
      'support',
    );
    expect(classificationPolicyFor('financial/refund')?.disposition).toBe(
      'refund_support',
    );
  });

  it('makes non-actionable system mail explicit classify-only work', () => {
    for (const label of [
      'MrGru/notification/system',
      'MrGru/notification/monitoring',
      'MrGru/newsletter/general',
      'MrGru/spam',
    ]) {
      expect(classificationPolicyFor(label)?.disposition).toBe('classify_only');
    }
  });

  it('refuses labels outside the canonical contract', () => {
    expect(canonicalClassificationLabel('MrGru/student/made-up')).toBeNull();
    expect(CANONICAL_CLASSIFICATION_LABELS).toContain('MrGru/student/support');
  });
});
