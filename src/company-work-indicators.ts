/**
 * Aggregate-only Company OS service indicators for the Sales email workflow.
 *
 * The durable Company Work ledger is the authority for accepted and
 * outcome-validated timestamps. This module performs one bounded read and
 * emits no work-item identity or customer content. It publishes a customer-
 * visible defect/reversal rate only when every exact Gmail-acknowledged
 * outcome has one current canonical quality receipt; internal workflow states
 * are never treated as customer evidence.
 */

import type { QueryResult, QueryResultRow } from 'pg';

import { query } from './business-db.js';

export const COMPANY_WORK_INDICATOR_CONTRACT_VERSION = 2 as const;
export const DEFAULT_COMPANY_WORK_INDICATOR_WINDOW_DAYS = 30;
export const MAX_COMPANY_WORK_INDICATOR_WINDOW_DAYS = 365;

export interface CompanyWorkIndicatorClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface CompanyWorkIndicatorAggregateRow extends QueryResultRow {
  accepted_items: number;
  completed_items: number;
  invalid_items: number;
  latency_sample_size: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  max_latency_ms: number | null;
  customer_visible_items: number;
  quality_assessed_items: number;
  quality_adverse_items: number;
  quality_invalid_items: number;
}

export interface CompanyWorkIndicatorOptions {
  now?: Date;
  windowDays?: number;
}

export interface CompanyWorkIndicatorReport {
  contractVersion: typeof COMPANY_WORK_INDICATOR_CONTRACT_VERSION;
  status: 'ok';
  generatedAt: string;
  workflow: 'sales_email';
  window: {
    startAt: string;
    endAt: string;
    days: number;
  };
  acceptedVersusCompleted: {
    evidence: 'accepted_and_outcome_validated_events';
    accepted: number;
    completed: number;
    incomplete: number;
    completionRate: number | null;
  };
  completionLatencyMs: {
    evidence: 'accepted_to_outcome_validated_events';
    sampleSize: number;
    p50: number | null;
    p95: number | null;
    max: number | null;
  };
  customerVisibleDefectReversal:
    | {
        status: 'available';
        evidence: 'current_quality_receipt_per_external_acknowledgement';
        numerator: number;
        denominator: number;
        rate: number;
        assessed: number;
        missing: 0;
      }
    | {
        status: 'unavailable';
        numerator: null;
        denominator: null;
        rate: null;
        assessed: number;
        required: number;
        missing: number;
        reason:
          | 'no_customer_visible_outcomes_in_window'
          | 'outcome_quality_receipt_coverage_incomplete';
      };
}

export interface CompanyWorkIndicatorUnavailable {
  contractVersion: typeof COMPANY_WORK_INDICATOR_CONTRACT_VERSION;
  status: 'unavailable';
  generatedAt: string;
  workflow: 'sales_email';
  window: {
    startAt: string;
    endAt: string;
    days: number;
  };
  errorCode: 'ledger_query_failed' | 'ledger_quality_failed';
}

export type CompanyWorkIndicatorResult =
  | CompanyWorkIndicatorReport
  | CompanyWorkIndicatorUnavailable;

const READ_INDICATORS_SQL = `
WITH item_facts AS (
  SELECT i.id,
         i.stage,
         i.disposition,
         count(*) FILTER (WHERE e.event_type = 'accepted')::integer
           AS accepted_event_count,
         min(e.occurred_at) FILTER (WHERE e.event_type = 'accepted')
           AS accepted_at,
         count(*) FILTER (WHERE e.event_type = 'outcome_validated')::integer
           AS outcome_event_count,
         min(e.occurred_at) FILTER (WHERE e.event_type = 'outcome_validated')
           AS outcome_at,
         count(*) FILTER (
           WHERE e.event_type = 'external_acknowledged'
         )::integer AS external_ack_event_count,
         min(e.work_item_version) FILTER (
           WHERE e.event_type = 'external_acknowledged'
         )::integer AS external_ack_event_version
    FROM business_v2.company_work_items i
    JOIN business_v2.company_work_events e ON e.work_item_id = i.id
   WHERE i.workflow_type = 'sales_email'
   GROUP BY i.id, i.stage, i.disposition
), cohort AS (
  SELECT *,
         accepted_event_count = 1
         AND outcome_event_count = 1
         AND outcome_at >= accepted_at
         AND stage = 'outcome_validated'
         AND disposition = 'completed' AS valid_completion,
         accepted_event_count <> 1
         OR outcome_event_count > 1
         OR external_ack_event_count > 1
         OR (outcome_event_count = 1 AND outcome_at < accepted_at)
         OR (outcome_event_count = 1 AND external_ack_event_count <> 1)
         OR ((stage = 'outcome_validated') <> (disposition = 'completed'))
         OR ((outcome_event_count = 1) <>
             (stage = 'outcome_validated' AND disposition = 'completed'))
           AS invalid_item
    FROM item_facts
   WHERE accepted_at >= $1::timestamptz
     AND accepted_at < $2::timestamptz
), latency_facts AS (
  SELECT *,
         extract(epoch FROM (outcome_at - accepted_at)) * 1000
           AS latency_ms
    FROM cohort
), quality_heads AS (
  SELECT q.*
    FROM business_v2.company_work_outcome_quality_receipts q
   WHERE NOT EXISTS (
     SELECT 1
       FROM business_v2.company_work_outcome_quality_receipts successor
      WHERE successor.supersedes_receipt_id = q.id
   )
), quality_facts AS (
  SELECT l.*,
         q.current_receipt_count,
         q.valid_current_receipt_count,
         q.adverse_current_receipt_count
    FROM latency_facts l
   CROSS JOIN LATERAL (
     SELECT count(*)::integer AS current_receipt_count,
            count(*) FILTER (
              WHERE h.delivery_event_version = l.external_ack_event_version
            )::integer AS valid_current_receipt_count,
            count(*) FILTER (
              WHERE h.delivery_event_version = l.external_ack_event_version
                AND h.assessment <> 'clean'
            )::integer AS adverse_current_receipt_count
       FROM quality_heads h
      WHERE h.work_item_id = l.id
   ) q
)
SELECT count(*)::integer AS accepted_items,
       count(*) FILTER (WHERE valid_completion)::integer AS completed_items,
       count(*) FILTER (WHERE invalid_item)::integer AS invalid_items,
       count(*) FILTER (WHERE valid_completion)::integer
         AS latency_sample_size,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)
         FILTER (WHERE valid_completion)::float8 AS p50_latency_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
         FILTER (WHERE valid_completion)::float8 AS p95_latency_ms,
       max(latency_ms) FILTER (WHERE valid_completion)::float8
         AS max_latency_ms,
       count(*) FILTER (
         WHERE external_ack_event_count = 1
       )::integer AS customer_visible_items,
       count(*) FILTER (
         WHERE external_ack_event_count = 1
           AND current_receipt_count = 1
           AND valid_current_receipt_count = 1
       )::integer AS quality_assessed_items,
       count(*) FILTER (
         WHERE external_ack_event_count = 1
           AND current_receipt_count = 1
           AND valid_current_receipt_count = 1
           AND adverse_current_receipt_count = 1
       )::integer AS quality_adverse_items,
       count(*) FILTER (
         WHERE current_receipt_count > 1
            OR current_receipt_count <> valid_current_receipt_count
            OR adverse_current_receipt_count > valid_current_receipt_count
            OR (
              external_ack_event_count <> 1 AND current_receipt_count > 0
            )
       )::integer AS quality_invalid_items
  FROM quality_facts
`;

class CompanyWorkIndicatorQualityError extends Error {
  constructor() {
    super('ledger_quality_failed');
    this.name = 'CompanyWorkIndicatorQualityError';
  }
}

export function normalizeCompanyWorkIndicatorWindowDays(
  value: number | undefined,
): number {
  if (value === undefined) return DEFAULT_COMPANY_WORK_INDICATOR_WINDOW_DAYS;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_COMPANY_WORK_INDICATOR_WINDOW_DAYS
  ) {
    throw new Error(
      `windowDays must be an integer from 1 to ${MAX_COMPANY_WORK_INDICATOR_WINDOW_DAYS}`,
    );
  }
  return value;
}

function reportWindow(options: CompanyWorkIndicatorOptions): {
  generatedAt: string;
  startAt: string;
  endAt: string;
  days: number;
} {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('now must be valid');
  const days = normalizeCompanyWorkIndicatorWindowDays(options.windowDays);
  const endAt = now.toISOString();
  const startAt = new Date(now.getTime() - days * 86_400_000).toISOString();
  return { generatedAt: endAt, startAt, endAt, days };
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function latency(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new CompanyWorkIndicatorQualityError();
  }
  return Math.round(value);
}

export function buildCompanyWorkIndicatorReport(
  row: CompanyWorkIndicatorAggregateRow | undefined,
  options: CompanyWorkIndicatorOptions = {},
): CompanyWorkIndicatorReport {
  const window = reportWindow(options);
  const accepted = nonnegativeInteger(row?.accepted_items);
  const completed = nonnegativeInteger(row?.completed_items);
  const invalid = nonnegativeInteger(row?.invalid_items);
  const sampleSize = nonnegativeInteger(row?.latency_sample_size);
  const customerVisible = nonnegativeInteger(row?.customer_visible_items);
  const qualityAssessed = nonnegativeInteger(row?.quality_assessed_items);
  const qualityAdverse = nonnegativeInteger(row?.quality_adverse_items);
  const qualityInvalid = nonnegativeInteger(row?.quality_invalid_items);
  if (
    accepted === null ||
    completed === null ||
    invalid === null ||
    sampleSize === null ||
    customerVisible === null ||
    qualityAssessed === null ||
    qualityAdverse === null ||
    qualityInvalid === null ||
    invalid !== 0 ||
    qualityInvalid !== 0 ||
    completed > accepted ||
    sampleSize !== completed ||
    customerVisible > accepted ||
    qualityAssessed > customerVisible ||
    qualityAdverse > qualityAssessed
  ) {
    throw new CompanyWorkIndicatorQualityError();
  }

  const p50 = latency(row?.p50_latency_ms);
  const p95 = latency(row?.p95_latency_ms);
  const max = latency(row?.max_latency_ms);
  if (
    (sampleSize === 0 && (p50 !== null || p95 !== null || max !== null)) ||
    (sampleSize > 0 && (p50 === null || p95 === null || max === null)) ||
    (p50 !== null && p95 !== null && max !== null && (p50 > p95 || p95 > max))
  ) {
    throw new CompanyWorkIndicatorQualityError();
  }

  return {
    contractVersion: COMPANY_WORK_INDICATOR_CONTRACT_VERSION,
    status: 'ok',
    generatedAt: window.generatedAt,
    workflow: 'sales_email',
    window: {
      startAt: window.startAt,
      endAt: window.endAt,
      days: window.days,
    },
    acceptedVersusCompleted: {
      evidence: 'accepted_and_outcome_validated_events',
      accepted,
      completed,
      incomplete: accepted - completed,
      completionRate:
        accepted === 0 ? null : Number((completed / accepted).toFixed(4)),
    },
    completionLatencyMs: {
      evidence: 'accepted_to_outcome_validated_events',
      sampleSize,
      p50,
      p95,
      max,
    },
    customerVisibleDefectReversal:
      customerVisible === 0
        ? {
            status: 'unavailable',
            numerator: null,
            denominator: null,
            rate: null,
            assessed: qualityAssessed,
            required: 0,
            missing: 0,
            reason: 'no_customer_visible_outcomes_in_window',
          }
        : qualityAssessed < customerVisible
          ? {
              status: 'unavailable',
              numerator: null,
              denominator: null,
              rate: null,
              assessed: qualityAssessed,
              required: customerVisible,
              missing: customerVisible - qualityAssessed,
              reason: 'outcome_quality_receipt_coverage_incomplete',
            }
          : {
              status: 'available',
              evidence: 'current_quality_receipt_per_external_acknowledgement',
              numerator: qualityAdverse,
              denominator: customerVisible,
              rate: Number((qualityAdverse / customerVisible).toFixed(4)),
              assessed: qualityAssessed,
              missing: 0,
            },
  };
}

export async function readCompanyWorkIndicatorReportWithClient(
  client: CompanyWorkIndicatorClient,
  options: CompanyWorkIndicatorOptions = {},
): Promise<CompanyWorkIndicatorReport> {
  const window = reportWindow(options);
  const result = await client.query<CompanyWorkIndicatorAggregateRow>(
    READ_INDICATORS_SQL,
    [window.startAt, window.endAt],
  );
  if (result.rows.length !== 1) throw new CompanyWorkIndicatorQualityError();
  return buildCompanyWorkIndicatorReport(result.rows[0], {
    now: new Date(window.generatedAt),
    windowDays: window.days,
  });
}

export async function readCompanyWorkIndicatorReport(
  options: CompanyWorkIndicatorOptions = {},
): Promise<CompanyWorkIndicatorReport> {
  return readCompanyWorkIndicatorReportWithClient({ query }, options);
}

/** Operator reporting must never affect the email observation/execution path. */
export async function safeReadCompanyWorkIndicatorReport(
  options: CompanyWorkIndicatorOptions = {},
  reader: (
    options: CompanyWorkIndicatorOptions,
  ) => Promise<CompanyWorkIndicatorReport> = readCompanyWorkIndicatorReport,
): Promise<CompanyWorkIndicatorResult> {
  const window = reportWindow(options);
  try {
    return await reader(options);
  } catch (error) {
    return {
      contractVersion: COMPANY_WORK_INDICATOR_CONTRACT_VERSION,
      status: 'unavailable',
      generatedAt: window.generatedAt,
      workflow: 'sales_email',
      window: {
        startAt: window.startAt,
        endAt: window.endAt,
        days: window.days,
      },
      errorCode:
        error instanceof CompanyWorkIndicatorQualityError
          ? 'ledger_quality_failed'
          : 'ledger_query_failed',
    };
  }
}
