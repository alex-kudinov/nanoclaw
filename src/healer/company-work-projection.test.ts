import { describe, expect, it } from 'vitest';

import {
  buildHealerCompanyWorkPlan,
  formatHealerCompanyWorkPlan,
  type ExistingHealerWorkItem,
} from './company-work-projection.js';
import {
  buildHealerResolutionCatalog,
  type HealerResolutionSourceRow,
} from './resolution-catalog.js';

const NOW = '2026-08-23T00:00:00.000Z';

function row(
  overrides: Partial<HealerResolutionSourceRow> = {},
): HealerResolutionSourceRow {
  return {
    id: '1',
    source: 'job:example',
    fingerprint: 'abcdef1234567890',
    severity: 'error',
    status: 'needs_human',
    occurrences: 2,
    first_seen: '2026-08-22T00:00:00.000Z',
    last_seen: '2026-08-22T23:50:00.000Z',
    updated_at: '2026-08-22T23:50:00.000Z',
    remediation_class: 'config',
    diagnosis: 'Config mismatch.',
    proposed_kind: 'diff',
    proposed_summary: 'Restore the reviewed value.',
    confidence: 'medium',
    cause_or_symptom: 'root_cause',
    evidence: ['config source mismatch'],
    applied_action_kind: null,
    outcome: 'escalated',
    ...overrides,
  };
}

function existing(
  overrides: Partial<ExistingHealerWorkItem> = {},
): ExistingHealerWorkItem {
  return {
    sourceKey: 'healer:abcdef1234567890',
    disposition: 'blocked',
    version: 2,
    resolutionFingerprint: 'a'.repeat(64),
    blockCode: 'healer:review-low-trust-or-manual-fix',
    ...overrides,
  };
}

describe('healer Company Work dry-run plan', () => {
  it('plans one stable blocked item for a new pending decision', () => {
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    const plan = buildHealerCompanyWorkPlan(catalog);

    expect(plan).toMatchObject({
      dryRun: true,
      applyAvailable: false,
      requiredSchema: {
        workflowType: 'healer_resolution',
        completionDefinition: 'healer_resolution_receipt',
      },
      summary: { ensure_blocked: 1 },
    });
    expect(plan.items[0]).toMatchObject({
      sourceSystem: 'healer_resolution_catalog',
      sourceKey: 'healer:abcdef1234567890',
      operation: 'ensure_blocked',
      blockCode: 'healer:review-low-trust-or-manual-fix',
      decisionOwner: 'unassigned',
    });
  });

  it('deduplicates exact replay and updates changed evidence', () => {
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    const fingerprint = catalog.items[0].resolutionFingerprint;
    const exact = buildHealerCompanyWorkPlan(catalog, [
      existing({ resolutionFingerprint: fingerprint }),
    ]);
    const changed = buildHealerCompanyWorkPlan(catalog, [existing()]);

    expect(exact.summary.no_op).toBe(1);
    expect(changed.summary.update_blocked).toBe(1);
  });

  it('reopens a terminal item when the same incident needs a new decision', () => {
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    const plan = buildHealerCompanyWorkPlan(catalog, [
      existing({ disposition: 'completed' }),
    ]);
    expect(plan.summary.reopen_blocked).toBe(1);
  });

  it('closes only existing work on verified recovery or named rejection', () => {
    const verified = buildHealerResolutionCatalog(
      [row({ status: 'resolved', outcome: 'verified_fixed' })],
      NOW,
    );
    const rejected = buildHealerResolutionCatalog(
      [
        row({
          status: 'wont_fix',
          applied_action_kind: 'proposal_rejected',
        }),
      ],
      NOW,
    );
    expect(buildHealerCompanyWorkPlan(verified).summary.no_op).toBe(1);
    expect(
      buildHealerCompanyWorkPlan(verified, [existing()]).summary.close_verified,
    ).toBe(1);
    expect(
      buildHealerCompanyWorkPlan(rejected, [existing()]).summary
        .close_decided_no_action,
    ).toBe(1);
  });

  it('holds a blocked item while the healer resumes monitoring', () => {
    const catalog = buildHealerResolutionCatalog(
      [row({ status: 'remediating', updated_at: '2026-08-22T23:55:00.000Z' })],
      NOW,
    );
    const plan = buildHealerCompanyWorkPlan(catalog, [existing()]);
    expect(plan.summary.hold_for_verification).toBe(1);
  });

  it('refuses ambiguous duplicate existing source identities', () => {
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    expect(() =>
      buildHealerCompanyWorkPlan(catalog, [existing(), existing()]),
    ).toThrow('duplicate existing healer work source');
  });

  it('formats a content-minimized plan with no proposed solution text', () => {
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    const text = formatHealerCompanyWorkPlan(
      buildHealerCompanyWorkPlan(catalog),
    );
    expect(text).toContain('DRY-RUN ONLY apply_available=false');
    expect(text).toContain('[ensure_blocked]');
    expect(text).not.toContain('Restore the reviewed value');
  });
});
