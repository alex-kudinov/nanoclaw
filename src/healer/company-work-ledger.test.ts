import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { CompanyWorkLedgerClient } from '../company-work-ledger.js';
import type { HealerCompanyWorkPlanItem } from './company-work-projection.js';
import {
  ensureHealerWorkItemWithClient,
  planHealerCompanyWorkTransition,
  readExistingHealerWorkItemsWithClient,
  recordHealerObservationWithClient,
  transitionHealerWorkItemWithClient,
} from './company-work-ledger.js';

const NOW = '2026-08-23T14:00:00.000Z';
const RESOLUTION = 'a'.repeat(64);
const EVIDENCE = 'b'.repeat(64);

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '42',
    workflow_type: 'healer_resolution',
    source_system: 'healer_resolution_catalog',
    source_key: 'healer:abcdef1234567890',
    party_id: null,
    pipeline_entry_id: null,
    completion_definition: 'healer_resolution_receipt',
    stage: 'accepted',
    disposition: 'open',
    version: 0,
    block_code: null,
    failure_code: null,
    deadline_at: null,
    created_at: NOW,
    updated_at: NOW,
    last_transition_at: NOW,
    last_transition_by: 'healer-resolution-work:host',
    ...overrides,
  };
}

function plan(
  overrides: Partial<HealerCompanyWorkPlanItem> = {},
): HealerCompanyWorkPlanItem {
  return {
    contractVersion: 1,
    sourceSystem: 'healer_resolution_catalog',
    sourceKey: 'healer:abcdef1234567890',
    workflowType: 'healer_resolution',
    completionDefinition: 'healer_resolution_receipt',
    operation: 'ensure_blocked',
    expectedVersion: null,
    resolutionFingerprint: RESOLUTION,
    evidenceSha256: EVIDENCE,
    resolutionDisposition: 'pending_decision',
    blockCode: 'healer:review-low-trust-or-manual-fix',
    decisionCode: 'review_low_trust_or_manual_fix',
    decisionOwner: 'unassigned',
    decisionActorSha256: null,
    closureCondition: 'Named owner decision or verified recovery.',
    observedAt: NOW,
    ...overrides,
  };
}

function sequentialClient(results: QueryResult<QueryResultRow>[]) {
  const query = vi.fn();
  for (const value of results) query.mockResolvedValueOnce(value);
  return { client: { query } as CompanyWorkLedgerClient, query };
}

describe('healer Company Work lifecycle policy', () => {
  const receipt = {
    type: 'outcome_validation' as const,
    system: 'healer_verified_recovery',
    key: 'healer-receipt:verified-1',
    evidenceSha256: RESOLUTION,
    externalActionId: `healer-verification:${RESOLUTION}`,
    occurredAt: NOW,
  };

  it('supports blocked evidence updates, exact closure, and recurrence reopening', () => {
    expect(
      planHealerCompanyWorkTransition(
        { stage: 'accepted', disposition: 'blocked' },
        'blocked',
        { blockCode: 'healer:review-low-trust-or-manual-fix' },
      ),
    ).toMatchObject({ stage: 'accepted', disposition: 'blocked' });
    expect(
      planHealerCompanyWorkTransition(
        { stage: 'accepted', disposition: 'blocked' },
        'outcome_validated',
        { evidenceSha256: RESOLUTION, receipt },
      ),
    ).toMatchObject({
      stage: 'outcome_validated',
      disposition: 'completed',
    });
    expect(
      planHealerCompanyWorkTransition(
        { stage: 'outcome_validated', disposition: 'completed' },
        'reopened',
      ),
    ).toMatchObject({ stage: 'accepted', disposition: 'open' });
  });

  it('refuses closure without matching receipt evidence', () => {
    expect(() =>
      planHealerCompanyWorkTransition(
        { stage: 'accepted', disposition: 'blocked' },
        'outcome_validated',
        { evidenceSha256: RESOLUTION },
      ),
    ).toThrow(/outcome_validated/);
    expect(() =>
      planHealerCompanyWorkTransition(
        { stage: 'accepted', disposition: 'blocked' },
        'outcome_validated',
        {
          evidenceSha256: RESOLUTION,
          receipt: { ...receipt, evidenceSha256: EVIDENCE },
        },
      ),
    ).toThrow(/outcome_validated/);
  });
});

describe('healer Company Work PostgreSQL writer', () => {
  it('fails closed on unsupported existing dispositions', async () => {
    const { client } = sequentialClient([
      result([
        {
          ...row({ disposition: 'failed', failure_code: 'source_gap:test' }),
          resolution_fingerprint: RESOLUTION,
        },
      ]),
    ]);
    await expect(readExistingHealerWorkItemsWithClient(client)).rejects.toThrow(
      /unsupported disposition failed/,
    );
  });

  it('creates one opaque non-Party work item and accepted event', async () => {
    const { client, query } = sequentialClient([result([row()]), result([])]);
    const created = await ensureHealerWorkItemWithClient(client, plan());

    expect(created).toMatchObject({
      applied: true,
      item: {
        workflowType: 'healer_resolution',
        completionDefinition: 'healer_resolution_receipt',
        partyId: null,
        pipelineEntryId: null,
      },
    });
    expect(query.mock.calls[0][0]).toContain("VALUES ('healer_resolution'");
    expect(query.mock.calls[1][0]).toContain("VALUES ($1, 0, 'accepted'");
  });

  it('writes an exact verified receipt before terminal closure', async () => {
    const receipt = {
      type: 'outcome_validation' as const,
      system: 'healer_verified_recovery',
      key: 'healer-receipt:verified-1',
      evidenceSha256: RESOLUTION,
      externalActionId: `healer-verification:${RESOLUTION}`,
      occurredAt: NOW,
    };
    const { client, query } = sequentialClient([
      result([]),
      result([
        row({
          disposition: 'blocked',
          version: 1,
          block_code: 'healer:review-low-trust-or-manual-fix',
        }),
      ]),
      result([
        {
          id: '77',
          work_item_id: '42',
          receipt_type: receipt.type,
          receipt_system: receipt.system,
          receipt_key: receipt.key,
          evidence_sha256: receipt.evidenceSha256,
          external_action_id: receipt.externalActionId,
          occurred_at: receipt.occurredAt,
        },
      ]),
      result([
        row({
          stage: 'outcome_validated',
          disposition: 'completed',
          version: 2,
        }),
      ]),
      result([]),
    ]);

    const closed = await transitionHealerWorkItemWithClient(client, {
      workItemId: '42',
      expectedVersion: 1,
      eventType: 'outcome_validated',
      plan: plan({
        operation: 'close_verified',
        expectedVersion: 1,
        resolutionDisposition: 'verified_fixed',
        blockCode: null,
        decisionCode: null,
        decisionOwner: null,
      }),
      receipt,
    });

    expect(closed.item).toMatchObject({
      stage: 'outcome_validated',
      disposition: 'completed',
      version: 2,
    });
    expect(query.mock.calls[2][0]).toContain('company_work_receipts');
    expect(query.mock.calls[4][1][14]).toBe('77');
  });

  it('records minimized observations and validates exact replay', async () => {
    const pending = plan();
    const workItem = {
      id: '42',
      workflowType: 'healer_resolution' as const,
      sourceSystem: pending.sourceSystem,
      sourceKey: pending.sourceKey,
      partyId: null,
      pipelineEntryId: null,
      completionDefinition: 'healer_resolution_receipt' as const,
      stage: 'accepted' as const,
      disposition: 'blocked' as const,
      version: 1,
      blockCode: pending.blockCode,
      failureCode: null,
      deadlineAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      lastTransitionAt: NOW,
      lastTransitionBy: 'healer-resolution-work:host',
    };
    const { client, query } = sequentialClient([result([{ id: '5' }])]);
    await expect(
      recordHealerObservationWithClient(client, workItem, pending),
    ).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain(
      'company_healer_resolution_observations',
    );
    expect(query.mock.calls[0][1]).not.toContain(pending.closureCondition);
  });
});
