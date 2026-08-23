import { beforeEach, describe, expect, it, vi } from 'vitest';

const business = vi.hoisted(() => ({ withAgentContext: vi.fn() }));
const ledger = vi.hoisted(() => ({
  ensure: vi.fn(),
  readExisting: vi.fn(),
  recordObservation: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('../business-db.js', () => ({
  withAgentContext: business.withAgentContext,
}));
vi.mock('./company-work-ledger.js', () => ({
  ensureHealerWorkItemWithClient: ledger.ensure,
  readExistingHealerWorkItemsWithClient: ledger.readExisting,
  recordHealerObservationWithClient: ledger.recordObservation,
  transitionHealerWorkItemWithClient: ledger.transition,
}));

import {
  applyHealerCompanyWorkCatalogWithClient,
  resolveHealerCompanyWorkAdapterConfig,
  runHealerCompanyWorkAdapter,
} from './company-work-adapter.js';
import {
  buildHealerResolutionCatalog,
  type HealerResolutionSourceRow,
} from './resolution-catalog.js';

const NOW = '2026-08-23T14:00:00.000Z';

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
    first_seen: '2026-08-23T12:00:00.000Z',
    last_seen: NOW,
    updated_at: NOW,
    remediation_class: 'config',
    diagnosis: 'Config mismatch.',
    proposed_kind: 'diff',
    proposed_summary: 'Restore the reviewed value.',
    confidence: 'medium',
    cause_or_symptom: 'root_cause',
    evidence: ['config source mismatch'],
    applied_action_kind: null,
    decision_actor: null,
    outcome: 'escalated',
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: '42',
    workflowType: 'healer_resolution',
    sourceSystem: 'healer_resolution_catalog',
    sourceKey: 'healer:abcdef1234567890',
    partyId: null,
    pipelineEntryId: null,
    completionDefinition: 'healer_resolution_receipt',
    stage: 'accepted',
    disposition: 'blocked',
    version: 1,
    blockCode: 'healer:review-low-trust-or-manual-fix',
    failureCode: null,
    deadlineAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastTransitionAt: NOW,
    lastTransitionBy: 'healer-resolution-work:host',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ledger.readExisting.mockResolvedValue([]);
  ledger.recordObservation.mockResolvedValue(true);
});

describe('healer Company Work host adapter', () => {
  it('defaults off and does not open a database transaction', async () => {
    expect(resolveHealerCompanyWorkAdapterConfig({})).toEqual({
      enabled: false,
    });
    expect(
      resolveHealerCompanyWorkAdapterConfig({
        COMPANY_HEALER_WORK_ENABLED: '1',
      }),
    ).toEqual({ enabled: true });

    const result = await runHealerCompanyWorkAdapter(
      buildHealerResolutionCatalog([row()], NOW),
      { enabled: false },
    );
    expect(result).toMatchObject({ status: 'disabled', items: [] });
    expect(result.plan).toMatchObject({ dryRun: true, applyAvailable: false });
    expect(business.withAgentContext).not.toHaveBeenCalled();
  });

  it('opens and blocks one new pending decision, then records minimized evidence', async () => {
    ledger.ensure.mockResolvedValue({
      item: item({ disposition: 'open', version: 0, blockCode: null }),
      applied: true,
      duplicate: false,
    });
    ledger.transition.mockResolvedValue({
      item: item(),
      applied: true,
      duplicate: false,
    });
    const client = { query: vi.fn() };
    const result = await applyHealerCompanyWorkCatalogWithClient(
      client as never,
      buildHealerResolutionCatalog([row()], NOW),
    );

    expect(result.items[0]).toMatchObject({
      operation: 'ensure_blocked',
      workItemId: '42',
      transitionApplied: true,
      observationApplied: true,
    });
    expect(ledger.ensure).toHaveBeenCalledOnce();
    expect(ledger.transition).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ eventType: 'blocked', expectedVersion: 0 }),
    );
    expect(ledger.recordObservation).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ id: '42' }),
      expect.objectContaining({
        decisionOwner: 'unassigned',
        evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        resolutionFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it('treats exact replay as observation-level no-op without another transition', async () => {
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    ledger.readExisting.mockResolvedValue([
      {
        item: item(),
        sourceKey: item().sourceKey,
        disposition: 'blocked',
        version: 1,
        resolutionFingerprint: catalog.items[0].resolutionFingerprint,
        blockCode: item().blockCode,
      },
    ]);
    ledger.recordObservation.mockResolvedValue(false);

    const result = await applyHealerCompanyWorkCatalogWithClient(
      { query: vi.fn() } as never,
      catalog,
    );
    expect(result.items[0]).toMatchObject({
      operation: 'no_op',
      transitionApplied: false,
      observationApplied: false,
    });
    expect(ledger.transition).not.toHaveBeenCalled();
  });

  it('closes no-action work only with a named-decision receipt', async () => {
    ledger.readExisting.mockResolvedValue([
      {
        item: item(),
        sourceKey: item().sourceKey,
        disposition: 'blocked',
        version: 1,
        resolutionFingerprint: 'a'.repeat(64),
        blockCode: item().blockCode,
      },
    ]);
    ledger.transition.mockResolvedValue({
      item: item({
        stage: 'outcome_validated',
        disposition: 'completed',
        version: 2,
        blockCode: null,
      }),
      applied: true,
      duplicate: false,
    });

    await applyHealerCompanyWorkCatalogWithClient(
      { query: vi.fn() } as never,
      buildHealerResolutionCatalog(
        [
          row({
            status: 'wont_fix',
            applied_action_kind: 'proposal_rejected',
            decision_actor: 'operator-1',
          }),
        ],
        NOW,
      ),
    );

    expect(ledger.transition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'outcome_validated',
        receipt: expect.objectContaining({
          system: 'healer_named_decision',
          externalActionId: expect.stringMatching(
            /^healer-decision:[0-9a-f]{64}$/,
          ),
        }),
      }),
    );
  });

  it('reopens recurrence before returning the same item to blocked owner work', async () => {
    ledger.readExisting.mockResolvedValue([
      {
        item: item({
          stage: 'outcome_validated',
          disposition: 'completed',
          version: 2,
          blockCode: null,
        }),
        sourceKey: item().sourceKey,
        disposition: 'completed',
        version: 2,
        resolutionFingerprint: 'a'.repeat(64),
        blockCode: null,
      },
    ]);
    ledger.transition
      .mockResolvedValueOnce({
        item: item({ disposition: 'open', version: 3, blockCode: null }),
        applied: true,
        duplicate: false,
      })
      .mockResolvedValueOnce({
        item: item({ version: 4 }),
        applied: true,
        duplicate: false,
      });

    await applyHealerCompanyWorkCatalogWithClient(
      { query: vi.fn() } as never,
      buildHealerResolutionCatalog([row()], NOW),
    );
    expect(
      ledger.transition.mock.calls.map((call) => call[1].eventType),
    ).toEqual(['reopened', 'blocked']);
  });
});
