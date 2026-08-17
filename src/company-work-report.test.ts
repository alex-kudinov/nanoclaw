import { describe, expect, it, vi } from 'vitest';

import {
  buildCompanyWorkExceptionReport,
  readCompanyWorkExceptionReportWithClient,
  safeReadCompanyWorkExceptionReport,
  type CompanyWorkExceptionReport,
  type CompanyWorkReportClient,
  type CompanyWorkReportRow,
} from './company-work-report.js';
import {
  formatCompanyWorkExceptionResult,
  parseCompanyWorkReportArgs,
} from './company-work-report-cli.js';

const NOW = new Date('2026-08-16T23:30:00.000Z');

function row(
  overrides: Partial<CompanyWorkReportRow> = {},
): CompanyWorkReportRow {
  return {
    id: '1',
    workflow_type: 'sales_email',
    source_system: 'sqlite_email_action',
    source_key: '11111111-1111-4111-8111-111111111111',
    party_id: '101',
    pipeline_entry_id: '201',
    completion_definition: 'gmail_ack_and_thread_close',
    stage: 'outcome_validated',
    disposition: 'completed',
    version: 7,
    block_code: null,
    failure_code: null,
    deadline_at: null,
    created_at: '2026-08-16T20:00:00.000Z',
    updated_at: '2026-08-16T21:00:00.000Z',
    last_transition_at: '2026-08-16T21:00:00.000Z',
    event_count: 8,
    event_version_count: 8,
    min_event_version: 0,
    max_event_version: 7,
    event_types: [
      'accepted',
      'sales_dispatched',
      'approval_requested',
      'approved',
      'mailman_dispatched',
      'action_claimed',
      'external_acknowledged',
      'outcome_validated',
    ],
    receipt_types: [
      'action_claim',
      'external_delivery',
      'operator_approval',
      'outcome_validation',
    ],
    latest_to_stage: 'outcome_validated',
    latest_to_disposition: 'completed',
    latest_occurred_at: '2026-08-16T21:00:00.000Z',
    total_available: 1,
    ...overrides,
  };
}

function report(rows: CompanyWorkReportRow[]): CompanyWorkExceptionReport {
  return buildCompanyWorkExceptionReport(rows, {
    now: NOW,
    staleAfterHours: 24,
  });
}

describe('company work exception reconciliation', () => {
  it('separates completed and healthy open work from exceptions', () => {
    const healthy = row({
      id: '2',
      source_key: '22222222-2222-4222-8222-222222222222',
      stage: 'action_claimed',
      disposition: 'open',
      version: 5,
      event_count: 6,
      event_version_count: 6,
      max_event_version: 5,
      event_types: row().event_types.slice(0, 6),
      receipt_types: ['action_claim', 'operator_approval'],
      latest_to_stage: 'action_claimed',
      latest_to_disposition: 'open',
      last_transition_at: '2026-08-16T23:20:00.000Z',
      latest_occurred_at: '2026-08-16T23:20:00.000Z',
      total_available: 2,
    });
    const result = report([row({ total_available: 2 }), healthy]);

    expect(result.summary).toMatchObject({
      completed: 1,
      healthyOpen: 1,
      exceptionItems: 0,
    });
    expect(result.exceptions).toEqual([]);
  });

  it('makes a named source gap critical without inferring later progress', () => {
    const result = report([
      row({
        stage: 'approved',
        disposition: 'failed',
        version: 4,
        failure_code: 'source_gap:mailman_dispatch_missing',
        event_count: 5,
        event_version_count: 5,
        max_event_version: 4,
        event_types: [
          'accepted',
          'sales_dispatched',
          'approval_requested',
          'approved',
          'failed',
        ],
        receipt_types: ['operator_approval'],
        latest_to_stage: 'approved',
        latest_to_disposition: 'failed',
      }),
    ]);

    expect(result.exceptions[0]).toMatchObject({
      stage: 'approved',
      disposition: 'failed',
      severity: 'critical',
    });
    expect(result.exceptions[0].reasons).toEqual(
      expect.arrayContaining([
        {
          kind: 'source_gap',
          code: 'source_gap:mailman_dispatch_missing',
        },
        {
          kind: 'failed',
          code: 'source_gap:mailman_dispatch_missing',
        },
      ]),
    );
  });

  it('reports waiting approval and staleness independently', () => {
    const result = report([
      row({
        stage: 'awaiting_approval',
        disposition: 'waiting',
        version: 2,
        event_count: 3,
        event_version_count: 3,
        max_event_version: 2,
        event_types: ['accepted', 'sales_dispatched', 'approval_requested'],
        receipt_types: [],
        latest_to_stage: 'awaiting_approval',
        latest_to_disposition: 'waiting',
        last_transition_at: '2026-08-14T22:00:00.000Z',
        latest_occurred_at: '2026-08-14T22:00:00.000Z',
      }),
    ]);

    expect(result.exceptions[0].severity).toBe('watch');
    expect(result.exceptions[0].reasons).toEqual(
      expect.arrayContaining([
        { kind: 'waiting_approval', code: 'awaiting_operator_approval' },
        { kind: 'stale', code: 'transition_age_exceeded' },
      ]),
    );
    expect(result.summary.byKind.waiting_approval).toBe(1);
    expect(result.summary.byKind.stale).toBe(1);
  });

  it('surfaces exact Gmail acknowledgment without closure as outcome missing', () => {
    const result = report([
      row({
        stage: 'external_acknowledged',
        disposition: 'open',
        version: 6,
        event_count: 7,
        event_version_count: 7,
        max_event_version: 6,
        event_types: row().event_types.slice(0, 7),
        receipt_types: [
          'action_claim',
          'external_delivery',
          'operator_approval',
        ],
        latest_to_stage: 'external_acknowledged',
        latest_to_disposition: 'open',
        last_transition_at: '2026-08-16T23:25:00.000Z',
        latest_occurred_at: '2026-08-16T23:25:00.000Z',
      }),
    ]);

    expect(result.exceptions[0]).toMatchObject({
      severity: 'attention',
      reasons: [
        { kind: 'outcome_missing', code: 'thread_closure_not_validated' },
      ],
    });
  });

  it('detects missing receipts, duplicate milestones, and event-chain gaps', () => {
    const result = report([
      row({
        receipt_types: [
          'action_claim',
          'external_delivery',
          'operator_approval',
        ],
        event_count: 9,
        event_version_count: 8,
        event_types: [...row().event_types, 'external_acknowledged'],
      }),
    ]);

    expect(result.exceptions[0].severity).toBe('critical');
    expect(result.exceptions[0].reasons).toEqual(
      expect.arrayContaining([
        { kind: 'missing_receipt', code: 'outcome_validation' },
        {
          kind: 'duplicate_fact',
          code: 'event:external_acknowledged',
        },
        {
          kind: 'event_chain_gap',
          code: 'event_versions_do_not_cover_item',
        },
      ]),
    );
  });

  it('reports elapsed deadlines and contains malformed timestamps', () => {
    const result = report([
      row({
        stage: 'accepted',
        disposition: 'open',
        version: 0,
        event_count: 1,
        event_version_count: 1,
        max_event_version: 0,
        event_types: ['accepted'],
        receipt_types: [],
        latest_to_stage: 'accepted',
        latest_to_disposition: 'open',
        deadline_at: '2026-08-16T23:00:00.000Z',
        last_transition_at: 'not-a-timestamp',
        latest_occurred_at: 'not-a-timestamp',
      }),
    ]);

    expect(result.exceptions[0].reasons).toEqual(
      expect.arrayContaining([
        {
          kind: 'contradictory_state',
          code: 'invalid_transition_timestamp',
        },
        { kind: 'deadline_overdue', code: 'deadline_elapsed' },
      ]),
    );
    expect(result.exceptions[0].ageMinutes).toBeNull();
  });

  it('validates a completed host-job run with job-specific milestones', () => {
    const result = report([
      row({
        workflow_type: 'host_job_run',
        source_system: 'sqlite_host_job_run',
        source_key: 'calendar-refresh:run-123',
        party_id: null,
        pipeline_entry_id: null,
        completion_definition: 'host_job_terminal_receipt',
        version: 2,
        event_count: 3,
        event_version_count: 3,
        max_event_version: 2,
        event_types: ['accepted', 'execution_started', 'outcome_validated'],
        receipt_types: ['outcome_validation'],
      }),
    ]);

    expect(result.exceptions).toEqual([]);
    expect(result.summary).toMatchObject({
      completed: 1,
      byWorkflow: { sales_email: 0, host_job_run: 1 },
    });
  });

  it('distinguishes receipt-backed job failure from a critical source gap', () => {
    const base = {
      workflow_type: 'host_job_run',
      source_system: 'sqlite_host_job_run',
      party_id: null,
      pipeline_entry_id: null,
      completion_definition: 'host_job_terminal_receipt',
      stage: 'execution_started',
      disposition: 'failed',
      version: 2,
      event_count: 3,
      event_version_count: 3,
      max_event_version: 2,
      latest_to_stage: 'execution_started',
      latest_to_disposition: 'failed',
    } as const;
    const result = report([
      row({
        ...base,
        id: '2',
        source_key: 'calendar-refresh:run-failed',
        failure_code: 'job_run:timeout',
        event_types: ['accepted', 'execution_started', 'execution_failed'],
        receipt_types: ['outcome_validation'],
        total_available: 2,
      }),
      row({
        ...base,
        id: '3',
        source_key: 'calendar-refresh:run-gap',
        failure_code: 'source_gap:terminal_fields_missing',
        event_types: ['accepted', 'execution_started', 'failed'],
        receipt_types: [],
        total_available: 2,
      }),
    ]);

    expect(result.exceptions).toHaveLength(2);
    expect(
      result.exceptions.find((item) => item.workItemId === '2'),
    ).toMatchObject({
      severity: 'attention',
      reasons: [{ kind: 'failed', code: 'job_run:timeout' }],
    });
    expect(
      result.exceptions.find((item) => item.workItemId === '3'),
    ).toMatchObject({
      severity: 'critical',
      reasons: expect.arrayContaining([
        {
          kind: 'source_gap',
          code: 'source_gap:terminal_fields_missing',
        },
      ]),
    });
  });
});

describe('company work report read boundary', () => {
  it('runs one bounded SELECT and clamps the caller limit', async () => {
    const querySpy = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query: querySpy } as unknown as CompanyWorkReportClient;

    await readCompanyWorkExceptionReportWithClient(client, {
      limit: 50_000,
      now: NOW,
    });

    const [sql, values] = querySpy.mock.calls[0];
    expect(sql).toContain('FROM business_v2.company_work_items');
    expect(sql).toContain('$2::text IS NULL');
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CALL)\b/i);
    expect(values).toEqual([500, null]);

    await readCompanyWorkExceptionReportWithClient(client, {
      workflow: 'host_job_run',
      limit: 10,
      now: NOW,
    });
    expect(querySpy.mock.calls[1][1]).toEqual([10, 'host_job_run']);
  });

  it('fails open with a content-free unavailable result', async () => {
    const result = await safeReadCompanyWorkExceptionReport(
      { now: NOW },
      async () => {
        throw new Error('secret database detail');
      },
    );

    expect(result).toEqual({
      status: 'unavailable',
      generatedAt: NOW.toISOString(),
      errorCode: 'ledger_query_failed',
    });
    expect(JSON.stringify(result)).not.toContain('secret database detail');
  });
});

describe('company work exception CLI', () => {
  it('parses only bounded read options', () => {
    expect(
      parseCompanyWorkReportArgs([
        '--json',
        '--limit',
        '25',
        '--stale-after-hours',
        '48',
        '--workflow',
        'host_job_run',
      ]),
    ).toEqual({
      json: true,
      limit: 25,
      staleAfterHours: 48,
      workflow: 'host_job_run',
    });
    expect(() => parseCompanyWorkReportArgs(['--apply'])).toThrow(
      'unknown argument: --apply',
    );
  });

  it('renders opaque exception identity without customer content', () => {
    const result = report([
      row({
        stage: 'approved',
        disposition: 'failed',
        version: 4,
        failure_code: 'source_gap:mailman_dispatch_missing',
        event_count: 5,
        event_version_count: 5,
        max_event_version: 4,
        event_types: [
          'accepted',
          'sales_dispatched',
          'approval_requested',
          'approved',
          'failed',
        ],
        receipt_types: ['operator_approval'],
        latest_to_stage: 'approved',
        latest_to_disposition: 'failed',
      }),
    ]);
    const rendered = formatCompanyWorkExceptionResult(result, false);

    expect(rendered).toContain('work=1');
    expect(rendered).toContain('source_gap:mailman_dispatch_missing');
    expect(rendered).not.toMatch(/subject|body|recipient|email=/i);
  });
});
