import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  ensureCompanyConditionWorkItemWithClient,
  planCompanyConditionWorkTransition,
  transitionCompanyConditionWorkItemWithClient,
  type CompanyWorkLedgerClient,
  type CompanyWorkReceiptInput,
} from './company-work-ledger.js';

const HASH = 'a'.repeat(64);
const NOW = '2026-08-20T14:00:00.000Z';
const DEADLINE = '2026-08-22T14:00:00.000Z';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function conditionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '42',
    workflow_type: 'program_facts_drift',
    source_system: 'program_facts_detector',
    source_key: 'program-facts-v1',
    party_id: null,
    pipeline_entry_id: null,
    completion_definition: 'detector_clean_receipt',
    stage: 'accepted',
    disposition: 'open',
    version: 0,
    block_code: null,
    failure_code: null,
    deadline_at: DEADLINE,
    created_at: NOW,
    updated_at: NOW,
    last_transition_at: NOW,
    last_transition_by: 'program-facts-work:host',
    ...overrides,
  };
}

function clientWith(rows: QueryResult<QueryResultRow>[]) {
  const query = vi.fn();
  for (const value of rows) query.mockResolvedValueOnce(value);
  return { client: { query } as CompanyWorkLedgerClient, query };
}

function cleanReceipt(): CompanyWorkReceiptInput {
  return {
    type: 'outcome_validation',
    system: 'program_facts_detector',
    key: 'program-facts:run-2:clean:receipt',
    evidenceSha256: HASH,
    externalActionId: 'run-2',
    occurredAt: NOW,
  };
}

describe('program-facts condition state policy', () => {
  it('routes drift to owner review, closes only with clean evidence, and reopens recurrence', () => {
    const blocked = planCompanyConditionWorkTransition(
      { stage: 'accepted', disposition: 'open' },
      'blocked',
      {
        evidenceSha256: HASH,
        exceptionCode: 'fact_authority:owner_review_required',
      },
    );
    expect(blocked).toMatchObject({
      stage: 'accepted',
      disposition: 'blocked',
      blockCode: 'fact_authority:owner_review_required',
    });

    const closed = planCompanyConditionWorkTransition(
      blocked,
      'outcome_validated',
      {
        evidenceSha256: HASH,
        receipt: cleanReceipt(),
      },
    );
    expect(closed).toMatchObject({
      stage: 'outcome_validated',
      disposition: 'completed',
      requiredReceipt: 'outcome_validation',
    });

    expect(
      planCompanyConditionWorkTransition(closed, 'reopened', {
        evidenceSha256: HASH,
      }),
    ).toMatchObject({ stage: 'accepted', disposition: 'open' });
  });

  it('refuses auto-close without the exact detector receipt', () => {
    expect(() =>
      planCompanyConditionWorkTransition(
        { stage: 'accepted', disposition: 'blocked' },
        'outcome_validated',
        { evidenceSha256: HASH },
      ),
    ).toThrow(/outcome_validated/);
    expect(() =>
      planCompanyConditionWorkTransition(
        { stage: 'accepted', disposition: 'blocked' },
        'outcome_validated',
        {
          evidenceSha256: HASH,
          receipt: { ...cleanReceipt(), evidenceSha256: 'b'.repeat(64) },
        },
      ),
    ).toThrow(/outcome_validated/);
    expect(() =>
      planCompanyConditionWorkTransition(
        { stage: 'accepted', disposition: 'open' },
        'outcome_validated',
        { evidenceSha256: HASH, receipt: cleanReceipt() },
      ),
    ).toThrow(/outcome_validated/);
  });
});

describe('program-facts condition PostgreSQL store', () => {
  it('creates one non-Party item and accepted event', async () => {
    const { client, query } = clientWith([
      result([]),
      result([conditionRow()]),
      result([]),
    ]);
    const created = await ensureCompanyConditionWorkItemWithClient(client, {
      sourceSystem: 'program_facts_detector',
      sourceKey: 'program-facts-v1',
      sourceEventKey: 'program-facts:run-1:accepted',
      idempotencyKey: 'program-facts:run-1:accepted:create',
      actor: 'program-facts-work:host',
      evidenceSha256: HASH,
      occurredAt: NOW,
      deadlineAt: DEADLINE,
    });
    expect(created).toMatchObject({
      applied: true,
      item: {
        workflowType: 'program_facts_drift',
        completionDefinition: 'detector_clean_receipt',
        partyId: null,
        pipelineEntryId: null,
      },
    });
    expect(query.mock.calls[1][0]).toContain("VALUES ('program_facts_drift'");
    expect(query.mock.calls[2][0]).toContain("VALUES ($1, 0, 'accepted'");
  });

  it('writes a clean receipt and terminal transition from owner-blocked work', async () => {
    const receipt = cleanReceipt();
    const { client, query } = clientWith([
      result([]),
      result([
        conditionRow({
          disposition: 'blocked',
          version: 1,
          block_code: 'fact_authority:owner_review_required',
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
        conditionRow({
          stage: 'outcome_validated',
          disposition: 'completed',
          version: 2,
          block_code: null,
        }),
      ]),
      result([]),
    ]);
    const closed = await transitionCompanyConditionWorkItemWithClient(client, {
      workItemId: '42',
      expectedVersion: 1,
      eventType: 'outcome_validated',
      actor: 'program-facts-work:host',
      sourceSystem: 'program_facts_detector',
      sourceEventKey: 'program-facts:run-2:clean',
      idempotencyKey: 'program-facts:run-2:clean:transition',
      occurredAt: NOW,
      evidenceSha256: HASH,
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
});
