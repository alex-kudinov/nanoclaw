import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  CompanyWorkLedgerError,
  createCompanyWorkItemWithClient,
  fingerprintCompanyWorkTransition,
  planCompanyWorkTransition,
  transitionCompanyWorkItemWithClient,
  type CompanyWorkItem,
  type CompanyWorkLedgerClient,
  type CompanyWorkReceiptInput,
  type TransitionCompanyWorkItemInput,
} from './company-work-ledger.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const NOW = '2026-08-16T04:50:00.000Z';

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function row(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: '10',
    workflow_type: 'sales_email',
    source_system: 'gmail',
    source_key: 'gmail:message-1',
    party_id: '10136',
    pipeline_entry_id: '472',
    completion_definition: 'gmail_ack_and_thread_close',
    stage: 'accepted',
    disposition: 'open',
    version: 0,
    block_code: null,
    failure_code: null,
    deadline_at: null,
    created_at: NOW,
    updated_at: NOW,
    last_transition_at: NOW,
    last_transition_by: 'host:router',
    ...overrides,
  };
}

function item(overrides: Partial<CompanyWorkItem> = {}): CompanyWorkItem {
  return {
    id: '10',
    workflowType: 'sales_email',
    sourceSystem: 'gmail',
    sourceKey: 'gmail:message-1',
    partyId: '10136',
    pipelineEntryId: '472',
    completionDefinition: 'gmail_ack_and_thread_close',
    stage: 'accepted',
    disposition: 'open',
    version: 0,
    blockCode: null,
    failureCode: null,
    deadlineAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastTransitionAt: NOW,
    lastTransitionBy: 'host:router',
    ...overrides,
  };
}

function receipt(
  type: CompanyWorkReceiptInput['type'],
  evidenceSha256 = HASH_A,
): CompanyWorkReceiptInput {
  return {
    type,
    system: type === 'external_delivery' ? 'gmail' : 'host',
    key: `${type}:receipt-1`,
    evidenceSha256,
    externalActionId: 'action-123',
    occurredAt: NOW,
  };
}

function request(
  overrides: Partial<TransitionCompanyWorkItemInput> = {},
): TransitionCompanyWorkItemInput {
  return {
    workItemId: '10',
    expectedVersion: 0,
    eventType: 'sales_dispatched',
    actor: 'host:router',
    sourceSystem: 'host',
    sourceEventKey: 'dispatch:sales:1',
    idempotencyKey: 'ledger:dispatch:sales:1',
    occurredAt: NOW,
    ...overrides,
  };
}

function sequentialClient(results: QueryResult<QueryResultRow>[]): {
  client: CompanyWorkLedgerClient;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn();
  for (const result of results) query.mockResolvedValueOnce(result);
  return { client: { query } as CompanyWorkLedgerClient, query };
}

function expectLedgerError(
  fn: () => unknown,
  code: CompanyWorkLedgerError['code'],
): void {
  try {
    fn();
    throw new Error('expected CompanyWorkLedgerError');
  } catch (error) {
    expect(error).toBeInstanceOf(CompanyWorkLedgerError);
    expect((error as CompanyWorkLedgerError).code).toBe(code);
  }
}

describe('Company OS work-ledger state machine', () => {
  it('reaches completion only through every host-fact stage and exact receipts', () => {
    let current = item();
    const advance = (
      eventType: TransitionCompanyWorkItemInput['eventType'],
      options: Parameters<typeof planCompanyWorkTransition>[2] = {},
    ) => {
      const planned = planCompanyWorkTransition(current, eventType, options);
      current = item({
        ...current,
        stage: planned.stage,
        disposition: planned.disposition,
        blockCode: planned.blockCode,
        failureCode: planned.failureCode,
        version: current.version + 1,
      });
    };

    advance('sales_dispatched');
    advance('approval_requested', { evidenceSha256: HASH_A });
    advance('approved', { receipt: receipt('operator_approval') });
    advance('mailman_dispatched');
    advance('action_claimed', { receipt: receipt('action_claim') });
    advance('external_acknowledged', {
      evidenceSha256: HASH_A,
      receipt: receipt('external_delivery'),
    });
    advance('outcome_validated', {
      evidenceSha256: HASH_B,
      receipt: receipt('outcome_validation', HASH_B),
    });

    expect(current).toMatchObject({
      stage: 'outcome_validated',
      disposition: 'completed',
      version: 7,
    });
    expectLedgerError(
      () =>
        planCompanyWorkTransition(current, 'blocked', {
          exceptionCode: 'late-alert',
        }),
      'invalid_transition',
    );
  });

  it('preserves stage through block/failure and requires an explicit resume', () => {
    const waiting = item({
      stage: 'awaiting_approval',
      disposition: 'waiting',
      version: 2,
    });
    const blocked = planCompanyWorkTransition(waiting, 'blocked', {
      exceptionCode: 'approval-card-rejected',
    });
    expect(blocked).toMatchObject({
      stage: 'awaiting_approval',
      disposition: 'blocked',
      blockCode: 'approval-card-rejected',
    });
    expectLedgerError(
      () =>
        planCompanyWorkTransition(
          { stage: blocked.stage, disposition: blocked.disposition },
          'approved',
          { receipt: receipt('operator_approval') },
        ),
      'invalid_transition',
    );
    expect(
      planCompanyWorkTransition(
        { stage: blocked.stage, disposition: blocked.disposition },
        'resumed',
      ),
    ).toMatchObject({
      stage: 'awaiting_approval',
      disposition: 'waiting',
      blockCode: null,
    });

    const failed = planCompanyWorkTransition(item(), 'failed', {
      exceptionCode: 'dispatch-timeout',
    });
    expect(failed).toMatchObject({
      stage: 'accepted',
      disposition: 'failed',
      failureCode: 'dispatch-timeout',
    });
  });

  it('rejects skips, prose-shaped events, missing receipts, and receipt drift', () => {
    expectLedgerError(
      () =>
        planCompanyWorkTransition(item(), 'approved', {
          receipt: receipt('operator_approval'),
        }),
      'invalid_transition',
    );
    expectLedgerError(
      () =>
        planCompanyWorkTransition(
          item({ stage: 'awaiting_approval', disposition: 'waiting' }),
          'approved',
          {
            receipt: {
              ...receipt('operator_approval'),
              externalActionId: null,
            },
          },
        ),
      'invalid_transition',
    );
    expectLedgerError(
      () =>
        planCompanyWorkTransition(
          item(),
          'agent_reported_sent' as TransitionCompanyWorkItemInput['eventType'],
        ),
      'invalid_transition',
    );
    expectLedgerError(
      () =>
        planCompanyWorkTransition(
          item({ stage: 'action_claimed' }),
          'external_acknowledged',
          { evidenceSha256: HASH_A },
        ),
      'invalid_transition',
    );
    expectLedgerError(
      () =>
        planCompanyWorkTransition(
          item({ stage: 'action_claimed' }),
          'external_acknowledged',
          {
            evidenceSha256: HASH_A,
            receipt: receipt('external_delivery', HASH_B),
          },
        ),
      'invalid_transition',
    );
  });

  it('makes exact retries stable and material drift fingerprint differently', () => {
    const exact = request({
      expectedVersion: 4,
      eventType: 'external_acknowledged',
      evidenceSha256: HASH_A,
      receipt: receipt('external_delivery'),
    });
    expect(fingerprintCompanyWorkTransition(exact)).toBe(
      fingerprintCompanyWorkTransition({ ...exact }),
    );
    expect(fingerprintCompanyWorkTransition(exact)).not.toBe(
      fingerprintCompanyWorkTransition({ ...exact, actor: 'host:other' }),
    );
    expect(fingerprintCompanyWorkTransition(exact)).not.toBe(
      fingerprintCompanyWorkTransition({
        ...exact,
        receipt: receipt('external_delivery', HASH_B),
      }),
    );
  });
});

describe('Company OS PostgreSQL store', () => {
  it('creates the initial item and append-only accepted event atomically', async () => {
    const inserted = row();
    const { client, query } = sequentialClient([
      queryResult([]),
      queryResult([inserted]),
      queryResult([]),
    ]);
    const result = await createCompanyWorkItemWithClient(client, {
      sourceSystem: 'gmail',
      sourceKey: 'gmail:message-1',
      sourceEventKey: 'gmail:history-100:message-1',
      idempotencyKey: 'work:accept:message-1',
      partyId: '10136',
      pipelineEntryId: '472',
      actor: 'host:router',
      evidenceSha256: HASH_A,
      occurredAt: NOW,
    });

    expect(result).toMatchObject({ applied: true, duplicate: false });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain(
      'INSERT INTO business_v2.company_work_items',
    );
    expect(query.mock.calls[2][0]).toContain("VALUES ($1, 0, 'accepted'");
  });

  it('returns an exact committed retry without appending another event', async () => {
    const input = request();
    const eventFingerprint = fingerprintCompanyWorkTransition(input);
    const { client, query } = sequentialClient([
      queryResult([
        { work_item_id: '10', event_fingerprint: eventFingerprint },
      ]),
      queryResult([row({ stage: 'sales_dispatched', version: 1 })]),
    ]);
    const result = await transitionCompanyWorkItemWithClient(client, input);
    expect(result).toMatchObject({
      applied: false,
      duplicate: true,
      item: { stage: 'sales_dispatched', version: 1 },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails visibly when a duplicate identity carries different facts', async () => {
    const { client } = sequentialClient([
      queryResult([{ work_item_id: '10', event_fingerprint: HASH_B }]),
    ]);
    await expect(
      transitionCompanyWorkItemWithClient(client, request()),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('fails when idempotency and source-event identities resolve separately', async () => {
    const eventFingerprint = fingerprintCompanyWorkTransition(request());
    const { client } = sequentialClient([
      queryResult([
        { work_item_id: '10', event_fingerprint: eventFingerprint },
        { work_item_id: '11', event_fingerprint: eventFingerprint },
      ]),
    ]);
    await expect(
      transitionCompanyWorkItemWithClient(client, request()),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects a stale optimistic version before receipt or state writes', async () => {
    const { client, query } = sequentialClient([
      queryResult([]),
      queryResult([row({ stage: 'sales_dispatched', version: 3 })]),
    ]);
    await expect(
      transitionCompanyWorkItemWithClient(
        client,
        request({ expectedVersion: 2, eventType: 'approval_requested' }),
      ),
    ).rejects.toMatchObject({ code: 'stale_version' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('writes receipt, optimistic state, and event for one exact delivery ack', async () => {
    const externalReceipt = receipt('external_delivery');
    const input = request({
      expectedVersion: 5,
      eventType: 'external_acknowledged',
      evidenceSha256: HASH_A,
      receipt: externalReceipt,
    });
    const current = row({ stage: 'action_claimed', version: 5 });
    const updated = row({
      stage: 'external_acknowledged',
      version: 6,
      last_transition_by: input.actor,
    });
    const { client, query } = sequentialClient([
      queryResult([]),
      queryResult([current]),
      queryResult([
        {
          id: '88',
          work_item_id: '10',
          receipt_type: externalReceipt.type,
          receipt_system: externalReceipt.system,
          receipt_key: externalReceipt.key,
          evidence_sha256: externalReceipt.evidenceSha256,
          external_action_id: externalReceipt.externalActionId,
          occurred_at: externalReceipt.occurredAt,
        },
      ]),
      queryResult([updated]),
      queryResult([]),
    ]);

    const result = await transitionCompanyWorkItemWithClient(client, input);
    expect(result).toMatchObject({
      applied: true,
      duplicate: false,
      item: { stage: 'external_acknowledged', version: 6 },
    });
    expect(query.mock.calls[2][0]).toContain(
      'INSERT INTO business_v2.company_work_receipts',
    );
    expect(query.mock.calls[3][0]).toContain('WHERE id = $1 AND version = $8');
    expect(query.mock.calls[4][0]).toContain(
      'INSERT INTO business_v2.company_work_events',
    );
    expect(query.mock.calls[4][1][14]).toBe('88');
  });

  it('rejects content-shaped identifiers before touching PostgreSQL', async () => {
    const query = vi.fn();
    const client = { query } as CompanyWorkLedgerClient;
    await expect(
      createCompanyWorkItemWithClient(client, {
        sourceSystem: 'gmail',
        sourceKey: 'customer@example.com',
        sourceEventKey: 'gmail:event-1',
        idempotencyKey: 'work:event-1',
        partyId: '10136',
        pipelineEntryId: '472',
        actor: 'host:router',
        evidenceSha256: HASH_A,
        occurredAt: NOW,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(query).not.toHaveBeenCalled();
  });
});
