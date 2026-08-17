import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createCompanyJobWorkItemWithClient,
  fingerprintCompanyJobWorkTransition,
  planCompanyJobWorkTransition,
  transitionCompanyJobWorkItemWithClient,
  type CompanyWorkLedgerClient,
  type TransitionCompanyJobWorkItemInput,
} from './company-work-ledger.js';

const HASH_A = 'a'.repeat(64);
const NOW = '2026-08-16T20:00:00.000Z';
const LATER = '2026-08-16T20:01:00.000Z';
const DEADLINE = '2026-08-16T20:10:00.000Z';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function jobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '900',
    workflow_type: 'host_job_run',
    source_system: 'sqlite_host_job_run',
    source_key: 'calendar-refresh:run-123',
    party_id: null,
    pipeline_entry_id: null,
    completion_definition: 'host_job_terminal_receipt',
    stage: 'accepted',
    disposition: 'open',
    version: 0,
    block_code: null,
    failure_code: null,
    deadline_at: DEADLINE,
    created_at: NOW,
    updated_at: NOW,
    last_transition_at: NOW,
    last_transition_by: 'company-job-work-shadow:host',
    ...overrides,
  };
}

function clientWith(rows: QueryResult<QueryResultRow>[]) {
  const query = vi.fn();
  for (const value of rows) query.mockResolvedValueOnce(value);
  return { client: { query } as CompanyWorkLedgerClient, query };
}

function terminalRequest(
  overrides: Partial<TransitionCompanyJobWorkItemInput> = {},
): TransitionCompanyJobWorkItemInput {
  return {
    workItemId: '900',
    expectedVersion: 1,
    eventType: 'outcome_validated',
    actor: 'company-job-work-shadow:host',
    sourceSystem: 'sqlite_host_job_run',
    sourceEventKey: 'job-run:run-123:outcome-validated',
    idempotencyKey: 'company-job-shadow:v1:run-123:outcome-validated',
    occurredAt: LATER,
    evidenceSha256: HASH_A,
    receipt: {
      type: 'outcome_validation',
      system: 'sqlite_job_run_logs',
      key: 'job-run:run-123:terminal-receipt',
      evidenceSha256: HASH_A,
      externalActionId: 'run-123',
      occurredAt: LATER,
    },
    ...overrides,
  };
}

describe('Company OS host-job transition policy', () => {
  it('requires start evidence and an exact terminal receipt for success', () => {
    const started = planCompanyJobWorkTransition(
      { stage: 'accepted', disposition: 'open' },
      'execution_started',
      { evidenceSha256: HASH_A },
    );
    expect(started).toMatchObject({
      stage: 'execution_started',
      disposition: 'open',
    });

    const terminal = terminalRequest();
    const completed = planCompanyJobWorkTransition(
      started,
      terminal.eventType,
      {
        evidenceSha256: terminal.evidenceSha256,
        receipt: terminal.receipt,
      },
    );
    expect(completed).toMatchObject({
      stage: 'outcome_validated',
      disposition: 'completed',
      requiredReceipt: 'outcome_validation',
    });
  });

  it('distinguishes a terminal execution failure from a source gap', () => {
    const receipt = terminalRequest().receipt;
    expect(
      planCompanyJobWorkTransition(
        { stage: 'accepted', disposition: 'open' },
        'execution_failed',
        {
          evidenceSha256: HASH_A,
          exceptionCode: 'job_run:dispatch_error',
          receipt,
        },
      ),
    ).toMatchObject({
      stage: 'accepted',
      disposition: 'failed',
      failureCode: 'job_run:dispatch_error',
      requiredReceipt: 'outcome_validation',
    });
    expect(
      planCompanyJobWorkTransition(
        { stage: 'execution_started', disposition: 'open' },
        'failed',
        {
          evidenceSha256: HASH_A,
          exceptionCode: 'source_gap:terminal_fields_missing',
        },
      ),
    ).toMatchObject({
      stage: 'execution_started',
      disposition: 'failed',
      requiredReceipt: null,
    });
  });

  it('rejects success without start and failures without their exact receipt', () => {
    expect(() =>
      planCompanyJobWorkTransition(
        { stage: 'accepted', disposition: 'open' },
        'outcome_validated',
        { evidenceSha256: HASH_A, receipt: terminalRequest().receipt },
      ),
    ).toThrow(/accepted\/open/);
    expect(() =>
      planCompanyJobWorkTransition(
        { stage: 'execution_started', disposition: 'open' },
        'execution_failed',
        { evidenceSha256: HASH_A, exceptionCode: 'job_run:timeout' },
      ),
    ).toThrow(/requires an exact outcome_validation receipt/);
  });
});

describe('Company OS host-job PostgreSQL store', () => {
  it('creates a non-Party run item and its accepted event atomically', async () => {
    const { client, query } = clientWith([
      result([]),
      result([jobRow()]),
      result([]),
    ]);
    const created = await createCompanyJobWorkItemWithClient(client, {
      sourceSystem: 'sqlite_host_job_run',
      sourceKey: 'calendar-refresh:run-123',
      sourceEventKey: 'job-run:run-123:accepted',
      idempotencyKey: 'company-job-shadow:v1:run-123:accepted',
      actor: 'company-job-work-shadow:host',
      evidenceSha256: HASH_A,
      occurredAt: NOW,
      deadlineAt: DEADLINE,
    });

    expect(created).toMatchObject({
      applied: true,
      duplicate: false,
      item: {
        workflowType: 'host_job_run',
        partyId: null,
        pipelineEntryId: null,
        completionDefinition: 'host_job_terminal_receipt',
      },
    });
    expect(query.mock.calls[1][0]).toContain("VALUES ('host_job_run'");
    expect(query.mock.calls[1][0]).toContain('NULL, NULL');
    expect(query.mock.calls[2][0]).toContain("VALUES ($1, 0, 'accepted'");
  });

  it('writes one terminal receipt, optimistic state, and event', async () => {
    const input = terminalRequest();
    const receipt = input.receipt!;
    const { client, query } = clientWith([
      result([]),
      result([jobRow({ stage: 'execution_started', version: 1 })]),
      result([
        {
          id: '901',
          work_item_id: '900',
          receipt_type: receipt.type,
          receipt_system: receipt.system,
          receipt_key: receipt.key,
          evidence_sha256: receipt.evidenceSha256,
          external_action_id: receipt.externalActionId,
          occurred_at: receipt.occurredAt,
        },
      ]),
      result([
        jobRow({
          stage: 'outcome_validated',
          disposition: 'completed',
          version: 2,
          last_transition_at: LATER,
        }),
      ]),
      result([]),
    ]);

    const completed = await transitionCompanyJobWorkItemWithClient(
      client,
      input,
    );
    expect(completed).toMatchObject({
      applied: true,
      item: {
        stage: 'outcome_validated',
        disposition: 'completed',
        version: 2,
      },
    });
    expect(query.mock.calls[2][0]).toContain('company_work_receipts');
    expect(query.mock.calls[3][0]).toContain('version = version + 1');
    expect(query.mock.calls[4][1][14]).toBe('901');
  });

  it('returns an exact duplicate terminal fact without another write', async () => {
    const input = terminalRequest();
    const fingerprint = fingerprintCompanyJobWorkTransition(input);
    const { client, query } = clientWith([
      result([{ work_item_id: '900', event_fingerprint: fingerprint }]),
      result([
        jobRow({
          stage: 'outcome_validated',
          disposition: 'completed',
          version: 2,
        }),
      ]),
    ]);
    await expect(
      transitionCompanyJobWorkItemWithClient(client, input),
    ).resolves.toMatchObject({ applied: false, duplicate: true });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects a deadline that cannot detect a stale run before SQL', async () => {
    const query = vi.fn();
    await expect(
      createCompanyJobWorkItemWithClient({ query } as CompanyWorkLedgerClient, {
        sourceSystem: 'sqlite_host_job_run',
        sourceKey: 'calendar-refresh:run-123',
        sourceEventKey: 'job-run:run-123:accepted',
        idempotencyKey: 'company-job-shadow:v1:run-123:accepted',
        actor: 'company-job-work-shadow:host',
        evidenceSha256: HASH_A,
        occurredAt: NOW,
        deadlineAt: NOW,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(query).not.toHaveBeenCalled();
  });
});
