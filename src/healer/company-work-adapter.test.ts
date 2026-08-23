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
  runHealerCompanyWorkCycle,
  runHealerCompanyWorkAdapter,
  selectHealerResolutionCatalog,
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
    const disabled = resolveHealerCompanyWorkAdapterConfig({});
    expect(disabled).toEqual({
      enabled: false,
      active: false,
      valid: true,
      sourceKeys: [],
      maxItems: 1,
      configurationError: null,
    });
    expect(
      resolveHealerCompanyWorkAdapterConfig({
        COMPANY_HEALER_WORK_ENABLED: '1',
      }),
    ).toMatchObject({
      enabled: true,
      active: false,
      valid: false,
      configurationError: 'exactly_one_source_required',
    });

    const result = await runHealerCompanyWorkAdapter(
      buildHealerResolutionCatalog([row()], NOW),
      disabled,
    );
    expect(result).toMatchObject({ status: 'disabled', items: [] });
    expect(result.plan).toMatchObject({ dryRun: true, applyAvailable: false });
    expect(business.withAgentContext).not.toHaveBeenCalled();
  });

  it('requires one valid exact source and a hard maximum of one', () => {
    const active = resolveHealerCompanyWorkAdapterConfig({
      COMPANY_HEALER_WORK_ENABLED: '1',
      COMPANY_HEALER_WORK_SOURCE_KEYS: 'healer:abcdef1234567890',
      COMPANY_HEALER_WORK_MAX_ITEMS: '1',
    });
    expect(active).toMatchObject({
      enabled: true,
      active: true,
      valid: true,
      sourceKeys: ['healer:abcdef1234567890'],
      maxItems: 1,
      configurationError: null,
    });
    expect(
      resolveHealerCompanyWorkAdapterConfig({
        COMPANY_HEALER_WORK_ENABLED: '1',
        COMPANY_HEALER_WORK_SOURCE_KEYS:
          'healer:abcdef1234567890,healer:bbbbbbbbbbbbbbbb',
        COMPANY_HEALER_WORK_MAX_ITEMS: '2',
      }),
    ).toMatchObject({
      active: false,
      valid: false,
      configurationError: 'exactly_one_source_required',
    });
  });

  it('selects only the configured source and refuses a missing source', () => {
    const catalog = buildHealerResolutionCatalog(
      [row(), row({ id: '2', fingerprint: 'bbbbbbbbbbbbbbbb' })],
      NOW,
    );
    const config = resolveHealerCompanyWorkAdapterConfig({
      COMPANY_HEALER_WORK_ENABLED: '1',
      COMPANY_HEALER_WORK_SOURCE_KEYS: 'healer:bbbbbbbbbbbbbbbb',
      COMPANY_HEALER_WORK_MAX_ITEMS: '1',
    });
    expect(selectHealerResolutionCatalog(catalog, config)).toMatchObject({
      currentIncidents: 1,
      items: [{ key: 'healer:bbbbbbbbbbbbbbbb' }],
    });
    expect(() =>
      selectHealerResolutionCatalog(catalog, {
        ...config,
        sourceKeys: ['healer:cccccccccccccccc'],
      }),
    ).toThrow('configured_source_missing');
  });

  it('keeps the fast-cycle boundary content-free, isolated, and replay-aware', async () => {
    const config = resolveHealerCompanyWorkAdapterConfig({
      COMPANY_HEALER_WORK_ENABLED: '1',
      COMPANY_HEALER_WORK_SOURCE_KEYS: 'healer:abcdef1234567890',
      COMPANY_HEALER_WORK_MAX_ITEMS: '1',
    });
    const catalog = buildHealerResolutionCatalog([row()], NOW);
    const active = await runHealerCompanyWorkCycle({
      config,
      readCatalog: vi.fn().mockResolvedValue(catalog),
      runAdapter: vi.fn().mockResolvedValue({
        status: 'applied',
        plan: {} as never,
        items: [
          {
            sourceKey: 'healer:abcdef1234567890',
            operation: 'ensure_blocked',
            workItemId: '42',
            transitionApplied: true,
            observationApplied: true,
          },
        ],
      }),
    });
    expect(active).toEqual({
      mode: 'active',
      sourceCount: 1,
      attempted: 1,
      transitioned: 1,
      observations: 1,
      duplicates: 0,
      errorCode: null,
    });
    await expect(
      runHealerCompanyWorkCycle({
        config,
        readCatalog: vi.fn().mockRejectedValue(new Error('secret detail')),
      }),
    ).resolves.toEqual({
      mode: 'failed',
      sourceCount: 1,
      attempted: 0,
      transitioned: 0,
      observations: 0,
      duplicates: 0,
      errorCode: 'projection_failed',
    });
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
