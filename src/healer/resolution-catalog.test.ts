import { describe, expect, it, vi } from 'vitest';

import {
  buildHealerResolutionCatalog,
  formatHealerResolutionCatalog,
  readHealerResolutionCatalog,
  type HealerResolutionSourceRow,
} from './resolution-catalog.js';

const GENERATED_AT = '2026-08-23T00:00:00.000Z';

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
    last_seen: '2026-08-22T02:00:00.000Z',
    updated_at: '2026-08-22T02:00:00.000Z',
    remediation_class: 'config',
    diagnosis: 'Configuration drift blocks the job.',
    proposed_kind: 'diff',
    proposed_summary: 'Restore the reviewed configuration value.',
    confidence: 'medium',
    cause_or_symptom: 'root_cause',
    evidence: ['config.ts:12 differs from the installed value'],
    applied_action_kind: null,
    decision_actor: null,
    outcome: 'escalated',
    ...overrides,
  };
}

describe('healer resolution catalog', () => {
  it('turns hidden manual, approval, recurrence, and external states into decisions', () => {
    const catalog = buildHealerResolutionCatalog(
      [
        row(),
        row({
          id: '2',
          fingerprint: 'bbbbbbbbbbbbbbbb',
          status: 'awaiting_approval',
        }),
        row({
          id: '3',
          fingerprint: 'cccccccccccccccc',
          status: 'recurring',
        }),
        row({
          id: '4',
          fingerprint: 'dddddddddddddddd',
          status: 'wont_fix',
          applied_action_kind: null,
        }),
      ],
      GENERATED_AT,
    );

    expect(catalog.summary.pendingDecision).toBe(4);
    expect(catalog.items.map(({ decisionCode }) => decisionCode)).toEqual(
      expect.arrayContaining([
        'review_low_trust_or_manual_fix',
        'approve_proposed_fix',
        'select_next_action_after_recurrence',
        'confirm_external_or_no_fix_disposition',
      ]),
    );
    expect(
      catalog.items.every(
        ({ decisionOwner }) => decisionOwner === 'unassigned',
      ),
    ).toBe(true);
  });

  it('distinguishes verified recovery and a named no-action decision', () => {
    const catalog = buildHealerResolutionCatalog(
      [
        row({ status: 'resolved', outcome: 'verified_fixed' }),
        row({
          id: '2',
          fingerprint: 'bbbbbbbbbbbbbbbb',
          status: 'wont_fix',
          applied_action_kind: 'proposal_rejected',
          decision_actor: 'operator-1',
        }),
      ],
      GENERATED_AT,
    );

    expect(catalog.summary).toMatchObject({
      pendingDecision: 0,
      verifiedFixed: 1,
      decidedNoAction: 1,
    });
    expect(catalog.items.map(({ disposition }) => disposition)).toEqual([
      'verified_fixed',
      'decided_no_action',
    ]);
  });

  it('keeps an anonymous rejection pending instead of inventing a decision receipt', () => {
    const catalog = buildHealerResolutionCatalog(
      [
        row({
          status: 'wont_fix',
          applied_action_kind: 'proposal_rejected',
          decision_actor: null,
        }),
      ],
      GENERATED_AT,
    );

    expect(catalog.items[0]).toMatchObject({
      disposition: 'pending_decision',
      decisionCode: 'confirm_external_or_no_fix_disposition',
      decisionActorSha256: null,
    });
  });

  it('drops a stale decision actor after a rejected incident re-enters monitoring', () => {
    const catalog = buildHealerResolutionCatalog(
      [
        row({
          status: 'diagnosed',
          remediation_class: 'transient',
          applied_action_kind: 'proposal_rejected',
          decision_actor: 'operator-1',
        }),
      ],
      GENERATED_AT,
    );

    expect(catalog.items[0]).toMatchObject({
      disposition: 'monitoring',
      decisionActorSha256: null,
    });
  });

  it('deduplicates replay by fingerprint and prefers the current open incarnation', () => {
    const resolved = row({
      id: '9',
      status: 'resolved',
      outcome: 'verified_fixed',
      updated_at: '2026-08-23T00:00:00.000Z',
    });
    const reopened = row({
      id: '10',
      status: 'needs_human',
      outcome: 'escalated',
      updated_at: '2026-08-22T23:00:00.000Z',
    });
    const first = buildHealerResolutionCatalog(
      [resolved, reopened, reopened],
      GENERATED_AT,
    );
    const reordered = buildHealerResolutionCatalog(
      [reopened, resolved, reopened],
      GENERATED_AT,
    );

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      scannedRows: 3,
      currentIncidents: 1,
      deduplicatedRows: 2,
    });
    expect(first.items[0]).toMatchObject({
      incidentId: '10',
      disposition: 'pending_decision',
    });
  });

  it('redacts and bounds visible summaries while exposing only evidence metadata', () => {
    const secret = `Bearer ${'a'.repeat(20)}`;
    const catalog = buildHealerResolutionCatalog(
      [
        row({
          diagnosis: `Token failed: ${secret}`,
          proposed_summary: `Replace secret=${'x'.repeat(600)}`,
          evidence: [`api_key=${'y'.repeat(40)}`],
        }),
      ],
      GENERATED_AT,
    );
    const item = catalog.items[0];

    expect(item.diagnosisSummary).toContain('Bearer <redacted>');
    expect(item.proposedResolution).not.toContain('x'.repeat(20));
    expect(item.proposedResolution?.length).toBeLessThanOrEqual(500);
    expect(item).toMatchObject({ evidenceCount: 1 });
    expect(item.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(item)).not.toContain('api_key');
  });

  it('fails unknown states into a visible pending decision', () => {
    const catalog = buildHealerResolutionCatalog(
      [row({ status: 'mystery_state' })],
      GENERATED_AT,
    );
    expect(catalog.items[0]).toMatchObject({
      disposition: 'pending_decision',
      decisionCode: 'review_unknown_incident_state',
    });
  });

  it('surfaces an unrouted diagnosis and stale intermediate state', () => {
    const catalog = buildHealerResolutionCatalog(
      [
        row({ status: 'diagnosed', remediation_class: 'config' }),
        row({
          id: '2',
          fingerprint: 'bbbbbbbbbbbbbbbb',
          status: 'investigating',
          updated_at: '2026-08-22T22:00:00.000Z',
        }),
      ],
      '2026-08-23T00:00:00.000Z',
    );
    expect(catalog.items.map(({ decisionCode }) => decisionCode)).toEqual(
      expect.arrayContaining([
        'review_unrouted_diagnosis',
        'review_stale_lifecycle_state',
      ]),
    );
  });

  it('reads only minimized fields through one bounded read query', async () => {
    const runQuery = vi.fn().mockResolvedValue({ rows: [row()] });
    const catalog = await readHealerResolutionCatalog({
      limit: 25,
      generatedAt: GENERATED_AT,
      runQuery,
    });
    const [sql, params] = runQuery.mock.calls[0];

    expect(params).toEqual([25]);
    expect(sql).toContain('row_number() OVER');
    expect(sql).toContain("proposed_fix->>'summary'");
    expect(sql).not.toMatch(
      /raw_context|command|diff|investigation_log|proposal_ts|thread_ts/,
    );
    expect(catalog.summary.pendingDecision).toBe(1);
  });

  it('formats an owner-readable pending-decision list without raw evidence', () => {
    const catalog = buildHealerResolutionCatalog([row()], GENERATED_AT);
    const text = formatHealerResolutionCatalog(catalog);

    expect(text).toContain('pending_decision=1');
    expect(text).toContain('[PENDING] key=healer:abcdef1234567890');
    expect(text).toContain(
      'proposed=Restore the reviewed configuration value.',
    );
    expect(text).not.toContain('config.ts:12 differs');
  });
});
