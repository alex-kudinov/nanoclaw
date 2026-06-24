import { describe, it, expect } from 'vitest';

import { proposalText } from './proposal-render.js';
import type { OpenIncident } from './remediation.js';

function inc(over: Partial<OpenIncident> = {}): OpenIncident {
  return {
    id: 7,
    source: 'sweeper:trafft',
    severity: 'error',
    occurrences: 3,
    status: 'diagnosed',
    raw_context: {},
    remediation_class: 'config',
    diagnosis: 'token expired',
    proposed_fix: { kind: 'command', summary: 'rerun the sweep', command: 'echo hi' },
    confidence: 'high',
    cause_or_symptom: 'root_cause',
    evidence: ['trafft-sweeper.ts:88 — 401 on token refresh'],
    last_seen: '2026-06-23T00:00:00Z',
    ...over,
  };
}

describe('proposalText — trust-gated rendering', () => {
  it('trustworthy actionable command → :mag: header, apply CTA, evidence shown', () => {
    const t = proposalText(inc(), true);
    expect(t).toContain(':mag:');
    expect(t).toContain('react or reply to apply');
    expect(t).toContain('*Confidence:* high');
    expect(t).toContain('*Basis:* root_cause');
    expect(t).toContain('trafft-sweeper.ts:88');
    expect(t).not.toContain('Needs a human look');
  });

  it('trustworthy code_bug → auto-implement CTA (👍 path preserved)', () => {
    const t = proposalText(inc({ remediation_class: 'code_bug' }), false);
    expect(t).toContain('auto-implement');
    expect(t).not.toContain('Needs a human look');
  });

  it('untrustworthy (low confidence) → needs a human look, NO apply/implement CTA', () => {
    const t = proposalText(inc({ confidence: 'low' }), false);
    expect(t).toContain(':warning:');
    expect(t).toContain('Needs a human look');
    expect(t).toContain('investigate before acting');
    expect(t).not.toContain('to apply');
    expect(t).not.toContain('auto-implement');
  });

  it('untrustworthy (symptom) → needs a human look', () => {
    const t = proposalText(inc({ cause_or_symptom: 'symptom' }), false);
    expect(t).toContain('Needs a human look');
    expect(t).not.toContain('to apply');
  });
});
