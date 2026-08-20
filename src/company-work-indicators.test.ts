import { describe, expect, it, vi } from 'vitest';

import {
  buildCompanyWorkIndicatorReport,
  readCompanyWorkIndicatorReportWithClient,
  safeReadCompanyWorkIndicatorReport,
  type CompanyWorkIndicatorAggregateRow,
  type CompanyWorkIndicatorClient,
} from './company-work-indicators.js';
import {
  formatCompanyWorkIndicatorResult,
  parseCompanyWorkIndicatorArgs,
} from './company-work-indicators-cli.js';

const NOW = new Date('2026-08-20T20:00:00.000Z');

function aggregate(
  overrides: Partial<CompanyWorkIndicatorAggregateRow> = {},
): CompanyWorkIndicatorAggregateRow {
  return {
    accepted_items: 15,
    completed_items: 13,
    invalid_items: 0,
    latency_sample_size: 13,
    p50_latency_ms: 60_000,
    p95_latency_ms: 180_000,
    max_latency_ms: 240_000,
    customer_visible_items: 13,
    quality_assessed_items: 0,
    quality_adverse_items: 0,
    quality_invalid_items: 0,
    ...overrides,
  };
}

describe('company work service indicators', () => {
  it('builds accepted/completed and latency measures from aggregate evidence', () => {
    const report = buildCompanyWorkIndicatorReport(aggregate(), {
      now: NOW,
      windowDays: 30,
    });

    expect(report).toMatchObject({
      contractVersion: 2,
      status: 'ok',
      generatedAt: NOW.toISOString(),
      workflow: 'sales_email',
      window: {
        startAt: '2026-07-21T20:00:00.000Z',
        endAt: NOW.toISOString(),
        days: 30,
      },
      acceptedVersusCompleted: {
        evidence: 'accepted_and_outcome_validated_events',
        accepted: 15,
        completed: 13,
        incomplete: 2,
        completionRate: 0.8667,
      },
      completionLatencyMs: {
        evidence: 'accepted_to_outcome_validated_events',
        sampleSize: 13,
        p50: 60_000,
        p95: 180_000,
        max: 240_000,
      },
    });
    expect(report.customerVisibleDefectReversal).toEqual({
      status: 'unavailable',
      numerator: null,
      denominator: null,
      rate: null,
      assessed: 0,
      required: 13,
      missing: 13,
      reason: 'outcome_quality_receipt_coverage_incomplete',
    });
  });

  it('reports an empty window without dividing by zero or inventing latency', () => {
    const report = buildCompanyWorkIndicatorReport(
      aggregate({
        accepted_items: 0,
        completed_items: 0,
        latency_sample_size: 0,
        p50_latency_ms: null,
        p95_latency_ms: null,
        max_latency_ms: null,
        customer_visible_items: 0,
      }),
      { now: NOW },
    );

    expect(report.acceptedVersusCompleted).toMatchObject({
      accepted: 0,
      completed: 0,
      incomplete: 0,
      completionRate: null,
    });
    expect(report.completionLatencyMs).toMatchObject({
      sampleSize: 0,
      p50: null,
      p95: null,
      max: null,
    });
    expect(report.customerVisibleDefectReversal).toEqual({
      status: 'unavailable',
      numerator: null,
      denominator: null,
      rate: null,
      assessed: 0,
      required: 0,
      missing: 0,
      reason: 'no_customer_visible_outcomes_in_window',
    });
  });

  it('publishes the adverse rate only with complete receipt coverage', () => {
    const report = buildCompanyWorkIndicatorReport(
      aggregate({
        quality_assessed_items: 13,
        quality_adverse_items: 2,
      }),
      { now: NOW },
    );

    expect(report.customerVisibleDefectReversal).toEqual({
      status: 'available',
      evidence: 'current_quality_receipt_per_external_acknowledgement',
      numerator: 2,
      denominator: 13,
      rate: 0.1538,
      assessed: 13,
      missing: 0,
    });
  });

  it('withholds even a known adverse numerator while coverage is partial', () => {
    const report = buildCompanyWorkIndicatorReport(
      aggregate({
        quality_assessed_items: 5,
        quality_adverse_items: 2,
      }),
      { now: NOW },
    );

    expect(report.customerVisibleDefectReversal).toEqual({
      status: 'unavailable',
      numerator: null,
      denominator: null,
      rate: null,
      assessed: 5,
      required: 13,
      missing: 8,
      reason: 'outcome_quality_receipt_coverage_incomplete',
    });
  });

  it('fails closed when ledger aggregates are malformed', async () => {
    const result = await safeReadCompanyWorkIndicatorReport(
      { now: NOW },
      async (options) =>
        buildCompanyWorkIndicatorReport(
          aggregate({ invalid_items: 1 }),
          options,
        ),
    );

    expect(result).toEqual({
      contractVersion: 2,
      status: 'unavailable',
      generatedAt: NOW.toISOString(),
      workflow: 'sales_email',
      window: {
        startAt: '2026-07-21T20:00:00.000Z',
        endAt: NOW.toISOString(),
        days: 30,
      },
      errorCode: 'ledger_quality_failed',
    });
  });

  it('fails closed on contradictory quality-receipt aggregates', async () => {
    const result = await safeReadCompanyWorkIndicatorReport(
      { now: NOW },
      async (options) =>
        buildCompanyWorkIndicatorReport(
          aggregate({
            quality_assessed_items: 13,
            quality_adverse_items: 14,
          }),
          options,
        ),
    );

    expect(result).toMatchObject({
      contractVersion: 2,
      status: 'unavailable',
      errorCode: 'ledger_quality_failed',
    });
  });

  it('uses one bounded aggregate SELECT and no mutation statement', async () => {
    const querySpy = vi.fn().mockResolvedValue({ rows: [aggregate()] });
    const client = { query: querySpy } as unknown as CompanyWorkIndicatorClient;

    const report = await readCompanyWorkIndicatorReportWithClient(client, {
      now: NOW,
      windowDays: 7,
    });

    const [sql, values] = querySpy.mock.calls[0];
    expect(sql).toContain("i.workflow_type = 'sales_email'");
    expect(sql).toContain("e.event_type = 'accepted'");
    expect(sql).toContain("e.event_type = 'outcome_validated'");
    expect(sql).toContain("e.event_type = 'external_acknowledged'");
    expect(sql).toContain('business_v2.company_work_outcome_quality_receipts');
    expect(sql).toContain('successor.supersedes_receipt_id = q.id');
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CALL)\b/i);
    expect(values).toEqual([
      '2026-08-13T20:00:00.000Z',
      '2026-08-20T20:00:00.000Z',
    ]);
    expect(report.window.days).toBe(7);
  });

  it('contains query failures without leaking their details', async () => {
    const result = await safeReadCompanyWorkIndicatorReport(
      { now: NOW },
      async () => {
        throw new Error('secret database detail');
      },
    );

    expect(result).toMatchObject({
      status: 'unavailable',
      errorCode: 'ledger_query_failed',
    });
    expect(JSON.stringify(result)).not.toContain('secret database detail');
  });
});

describe('company work service indicator CLI', () => {
  it('accepts only bounded read arguments', () => {
    expect(
      parseCompanyWorkIndicatorArgs(['--json', '--window-days', '90']),
    ).toEqual({ json: true, windowDays: 90 });
    expect(() =>
      parseCompanyWorkIndicatorArgs(['--window-days', '366']),
    ).toThrow('--window-days cannot exceed 365');
    expect(() => parseCompanyWorkIndicatorArgs(['--apply'])).toThrow(
      'unknown argument: --apply',
    );
  });

  it('renders aggregate-only output and the honest evidence gap', () => {
    const result = buildCompanyWorkIndicatorReport(aggregate(), {
      now: NOW,
    });
    const output = formatCompanyWorkIndicatorResult(result, true);

    expect(output).toContain('"accepted": 15');
    expect(output).toContain('outcome_quality_receipt_coverage_incomplete');
    expect(output).not.toMatch(
      /workItemId|sourceKey|partyId|pipelineEntryId|messageId/i,
    );
  });
});
