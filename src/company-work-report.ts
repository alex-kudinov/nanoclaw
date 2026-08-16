/**
 * Read-only Company OS reconciliation and exception brief.
 *
 * The approved-email SQLite ledger remains execution authority. This module
 * reads the privacy-minimized PostgreSQL projection only; it has no transition,
 * approval, retry, send, or channel dependency.
 */

import type { QueryResult, QueryResultRow } from 'pg';

import { query } from './business-db.js';
import {
  COMPANY_WORK_DISPOSITIONS,
  COMPANY_WORK_STAGES,
  type CompanyWorkDisposition,
  type CompanyWorkStage,
} from './company-work-ledger.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_STALE_AFTER_HOURS = 24;
const MAX_STALE_AFTER_HOURS = 24 * 30;

const MILESTONE_EVENTS = [
  'accepted',
  'sales_dispatched',
  'approval_requested',
  'approved',
  'mailman_dispatched',
  'action_claimed',
  'external_acknowledged',
  'outcome_validated',
] as const;

const RECEIPTS_BY_STAGE: ReadonlyArray<
  readonly [CompanyWorkStage, CompanyWorkReceiptFact]
> = [
  ['approved', 'operator_approval'],
  ['action_claimed', 'action_claim'],
  ['external_acknowledged', 'external_delivery'],
  ['outcome_validated', 'outcome_validation'],
];

export const COMPANY_WORK_EXCEPTION_KINDS = [
  'contradictory_state',
  'event_chain_gap',
  'duplicate_fact',
  'missing_receipt',
  'source_gap',
  'blocked',
  'failed',
  'deadline_overdue',
  'outcome_missing',
  'waiting_approval',
  'stale',
] as const;

export type CompanyWorkExceptionKind =
  (typeof COMPANY_WORK_EXCEPTION_KINDS)[number];
export type CompanyWorkExceptionSeverity = 'critical' | 'attention' | 'watch';

type CompanyWorkMilestoneEvent = (typeof MILESTONE_EVENTS)[number];
type CompanyWorkReceiptFact =
  | 'operator_approval'
  | 'action_claim'
  | 'external_delivery'
  | 'outcome_validation'
  | 'cancellation';

export interface CompanyWorkReportClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface CompanyWorkReportRow extends QueryResultRow {
  id: string;
  workflow_type: string;
  source_system: string;
  source_key: string;
  party_id: string;
  pipeline_entry_id: string;
  completion_definition: string;
  stage: string;
  disposition: string;
  version: number;
  block_code: string | null;
  failure_code: string | null;
  deadline_at: string | null;
  created_at: string;
  updated_at: string;
  last_transition_at: string;
  event_count: number;
  event_version_count: number;
  min_event_version: number | null;
  max_event_version: number | null;
  event_types: string[];
  receipt_types: string[];
  latest_to_stage: string | null;
  latest_to_disposition: string | null;
  latest_occurred_at: string | null;
  total_available: number;
}

export interface CompanyWorkExceptionReason {
  kind: CompanyWorkExceptionKind;
  code: string;
}

export interface CompanyWorkExceptionItem {
  workItemId: string;
  workflowType: string;
  sourceSystem: string;
  sourceKey: string;
  partyId: string;
  pipelineEntryId: string;
  stage: string;
  disposition: string;
  version: number;
  deadlineAt: string | null;
  lastTransitionAt: string;
  ageMinutes: number | null;
  severity: CompanyWorkExceptionSeverity;
  reasons: CompanyWorkExceptionReason[];
}

export interface CompanyWorkExceptionSummary {
  completed: number;
  cancelled: number;
  healthyOpen: number;
  exceptionItems: number;
  critical: number;
  attention: number;
  watch: number;
  byKind: Record<CompanyWorkExceptionKind, number>;
}

export interface CompanyWorkExceptionReport {
  status: 'ok';
  generatedAt: string;
  staleAfterHours: number;
  scanned: number;
  totalAvailable: number;
  truncated: boolean;
  summary: CompanyWorkExceptionSummary;
  exceptions: CompanyWorkExceptionItem[];
}

export interface CompanyWorkExceptionUnavailable {
  status: 'unavailable';
  generatedAt: string;
  errorCode: 'ledger_query_failed';
}

export type CompanyWorkExceptionResult =
  | CompanyWorkExceptionReport
  | CompanyWorkExceptionUnavailable;

export interface CompanyWorkReportOptions {
  now?: Date;
  limit?: number;
  staleAfterHours?: number;
}

const READ_REPORT_SQL = `
WITH event_facts AS (
  SELECT work_item_id,
         count(*)::integer AS event_count,
         count(DISTINCT work_item_version)::integer AS event_version_count,
         min(work_item_version)::integer AS min_event_version,
         max(work_item_version)::integer AS max_event_version,
         array_agg(event_type ORDER BY work_item_version) AS event_types
    FROM business_v2.company_work_events
   GROUP BY work_item_id
), receipt_facts AS (
  SELECT work_item_id,
         array_agg(receipt_type ORDER BY receipt_type, occurred_at, id)
           AS receipt_types
    FROM business_v2.company_work_receipts
   GROUP BY work_item_id
), latest_event AS (
  SELECT DISTINCT ON (work_item_id)
         work_item_id, to_stage AS latest_to_stage,
         to_disposition AS latest_to_disposition,
         occurred_at::text AS latest_occurred_at
    FROM business_v2.company_work_events
   ORDER BY work_item_id, work_item_version DESC
)
SELECT i.id::text, i.workflow_type, i.source_system, i.source_key,
       i.party_id::text, i.pipeline_entry_id::text,
       i.completion_definition, i.stage, i.disposition, i.version,
       i.block_code, i.failure_code, i.deadline_at::text,
       i.created_at::text, i.updated_at::text,
       i.last_transition_at::text,
       COALESCE(e.event_count, 0) AS event_count,
       COALESCE(e.event_version_count, 0) AS event_version_count,
       e.min_event_version, e.max_event_version,
       COALESCE(e.event_types, ARRAY[]::text[]) AS event_types,
       COALESCE(r.receipt_types, ARRAY[]::text[]) AS receipt_types,
       l.latest_to_stage, l.latest_to_disposition, l.latest_occurred_at,
       count(*) OVER ()::integer AS total_available
  FROM business_v2.company_work_items i
  LEFT JOIN event_facts e ON e.work_item_id = i.id
  LEFT JOIN receipt_facts r ON r.work_item_id = i.id
  LEFT JOIN latest_event l ON l.work_item_id = i.id
 WHERE i.workflow_type = 'sales_email'
 ORDER BY CASE
            WHEN i.disposition IN ('blocked', 'failed', 'waiting') THEN 0
            WHEN i.disposition NOT IN ('completed', 'cancelled') THEN 1
            ELSE 2
          END,
          COALESCE(i.deadline_at, i.last_transition_at) ASC,
          i.id ASC
 LIMIT $1
`;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value as number));
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function addReason(
  reasons: CompanyWorkExceptionReason[],
  kind: CompanyWorkExceptionKind,
  code: string,
): void {
  if (!reasons.some((reason) => reason.kind === kind && reason.code === code)) {
    reasons.push({ kind, code });
  }
}

function severityFor(
  reasons: readonly CompanyWorkExceptionReason[],
): CompanyWorkExceptionSeverity {
  if (
    reasons.some((reason) =>
      [
        'contradictory_state',
        'event_chain_gap',
        'duplicate_fact',
        'missing_receipt',
        'source_gap',
      ].includes(reason.kind),
    )
  ) {
    return 'critical';
  }
  if (
    reasons.some((reason) =>
      ['blocked', 'failed', 'deadline_overdue', 'outcome_missing'].includes(
        reason.kind,
      ),
    )
  ) {
    return 'attention';
  }
  return 'watch';
}

function expectedMilestones(
  stage: CompanyWorkStage,
): CompanyWorkMilestoneEvent[] {
  return MILESTONE_EVENTS.slice(0, COMPANY_WORK_STAGES.indexOf(stage) + 1);
}

function classifyRow(
  row: CompanyWorkReportRow,
  nowMs: number,
  staleAfterMs: number,
): CompanyWorkExceptionItem | null {
  const reasons: CompanyWorkExceptionReason[] = [];
  const validStage = COMPANY_WORK_STAGES.includes(
    row.stage as CompanyWorkStage,
  );
  const validDisposition = COMPANY_WORK_DISPOSITIONS.includes(
    row.disposition as CompanyWorkDisposition,
  );
  const stage = validStage ? (row.stage as CompanyWorkStage) : null;
  const disposition = validDisposition
    ? (row.disposition as CompanyWorkDisposition)
    : null;
  const events = Array.isArray(row.event_types) ? row.event_types : [];
  const receipts = Array.isArray(row.receipt_types) ? row.receipt_types : [];
  const eventCounts = countValues(events);
  const receiptCounts = countValues(receipts);

  if (!validStage) {
    addReason(reasons, 'contradictory_state', 'unknown_stage');
  }
  if (!validDisposition) {
    addReason(reasons, 'contradictory_state', 'unknown_disposition');
  }
  if (row.workflow_type !== 'sales_email') {
    addReason(reasons, 'contradictory_state', 'unknown_workflow');
  }
  if (row.completion_definition !== 'gmail_ack_and_thread_close') {
    addReason(reasons, 'contradictory_state', 'unknown_completion_definition');
  }
  if (
    stage &&
    disposition &&
    (stage === 'outcome_validated') !== (disposition === 'completed')
  ) {
    addReason(reasons, 'contradictory_state', 'terminal_state_mismatch');
  }
  if (stage && disposition === 'waiting' && stage !== 'awaiting_approval') {
    addReason(reasons, 'contradictory_state', 'waiting_stage_mismatch');
  }
  if ((disposition === 'blocked') !== Boolean(row.block_code)) {
    addReason(reasons, 'contradictory_state', 'block_code_mismatch');
  }
  if ((disposition === 'failed') !== Boolean(row.failure_code)) {
    addReason(reasons, 'contradictory_state', 'failure_code_mismatch');
  }
  if (
    row.event_count !== row.version + 1 ||
    row.event_version_count !== row.version + 1 ||
    row.min_event_version !== 0 ||
    row.max_event_version !== row.version
  ) {
    addReason(reasons, 'event_chain_gap', 'event_versions_do_not_cover_item');
  }
  if (
    row.latest_to_stage !== row.stage ||
    row.latest_to_disposition !== row.disposition
  ) {
    addReason(reasons, 'contradictory_state', 'latest_event_state_mismatch');
  }

  const transitionMs = timestampMs(row.last_transition_at);
  const latestEventMs = timestampMs(row.latest_occurred_at);
  if (transitionMs === null || latestEventMs === null) {
    addReason(reasons, 'contradictory_state', 'invalid_transition_timestamp');
  } else if (transitionMs !== latestEventMs) {
    addReason(reasons, 'contradictory_state', 'latest_event_time_mismatch');
  }

  if (stage) {
    for (const eventType of expectedMilestones(stage)) {
      if (!eventCounts.has(eventType)) {
        addReason(reasons, 'event_chain_gap', `missing_event:${eventType}`);
      }
    }
    for (const [receiptStage, receiptType] of RECEIPTS_BY_STAGE) {
      if (
        COMPANY_WORK_STAGES.indexOf(stage) >=
          COMPANY_WORK_STAGES.indexOf(receiptStage) &&
        !receiptCounts.has(receiptType)
      ) {
        addReason(reasons, 'missing_receipt', receiptType);
      }
    }
  }
  if (disposition === 'cancelled' && !receiptCounts.has('cancellation')) {
    addReason(reasons, 'missing_receipt', 'cancellation');
  }
  for (const eventType of [...MILESTONE_EVENTS, 'cancelled']) {
    if ((eventCounts.get(eventType) ?? 0) > 1) {
      addReason(reasons, 'duplicate_fact', `event:${eventType}`);
    }
  }
  for (const receiptType of [
    'operator_approval',
    'action_claim',
    'external_delivery',
    'outcome_validation',
    'cancellation',
  ]) {
    if ((receiptCounts.get(receiptType) ?? 0) > 1) {
      addReason(reasons, 'duplicate_fact', `receipt:${receiptType}`);
    }
  }

  const activeCode = row.failure_code ?? row.block_code;
  if (activeCode?.startsWith('source_gap:')) {
    addReason(reasons, 'source_gap', activeCode);
  }
  if (disposition === 'blocked') {
    addReason(reasons, 'blocked', row.block_code ?? 'blocked:unspecified');
  }
  if (disposition === 'failed') {
    addReason(reasons, 'failed', row.failure_code ?? 'failed:unspecified');
  }
  if (disposition === 'waiting') {
    addReason(reasons, 'waiting_approval', 'awaiting_operator_approval');
  }
  if (stage === 'external_acknowledged' && disposition === 'open') {
    addReason(reasons, 'outcome_missing', 'thread_closure_not_validated');
  }

  const terminal = disposition === 'completed' || disposition === 'cancelled';
  const deadlineMs = timestampMs(row.deadline_at);
  if (!terminal && deadlineMs !== null && deadlineMs < nowMs) {
    addReason(reasons, 'deadline_overdue', 'deadline_elapsed');
  }
  if (
    !terminal &&
    transitionMs !== null &&
    nowMs - transitionMs >= staleAfterMs
  ) {
    addReason(reasons, 'stale', 'transition_age_exceeded');
  }

  if (reasons.length === 0) return null;
  return {
    workItemId: row.id,
    workflowType: row.workflow_type,
    sourceSystem: row.source_system,
    sourceKey: row.source_key,
    partyId: row.party_id,
    pipelineEntryId: row.pipeline_entry_id,
    stage: row.stage,
    disposition: row.disposition,
    version: row.version,
    deadlineAt: row.deadline_at,
    lastTransitionAt: row.last_transition_at,
    ageMinutes:
      transitionMs === null
        ? null
        : Math.max(0, Math.floor((nowMs - transitionMs) / 60_000)),
    severity: severityFor(reasons),
    reasons,
  };
}

function emptyByKind(): Record<CompanyWorkExceptionKind, number> {
  return Object.fromEntries(
    COMPANY_WORK_EXCEPTION_KINDS.map((kind) => [kind, 0]),
  ) as Record<CompanyWorkExceptionKind, number>;
}

export function buildCompanyWorkExceptionReport(
  rows: CompanyWorkReportRow[],
  options: CompanyWorkReportOptions = {},
): CompanyWorkExceptionReport {
  const now = options.now ?? new Date();
  const staleAfterHours = boundedInteger(
    options.staleAfterHours,
    DEFAULT_STALE_AFTER_HOURS,
    1,
    MAX_STALE_AFTER_HOURS,
  );
  const exceptions = rows
    .map((row) =>
      classifyRow(row, now.getTime(), staleAfterHours * 60 * 60_000),
    )
    .filter((item): item is CompanyWorkExceptionItem => item !== null)
    .sort((left, right) => {
      const rank = { critical: 0, attention: 1, watch: 2 } as const;
      return (
        rank[left.severity] - rank[right.severity] ||
        (right.ageMinutes ?? -1) - (left.ageMinutes ?? -1) ||
        left.workItemId.localeCompare(right.workItemId, 'en', { numeric: true })
      );
    });
  const exceptionIds = new Set(exceptions.map((item) => item.workItemId));
  const byKind = emptyByKind();
  for (const item of exceptions) {
    for (const kind of new Set(item.reasons.map((reason) => reason.kind))) {
      byKind[kind]++;
    }
  }
  const totalAvailable = rows[0]?.total_available ?? 0;
  return {
    status: 'ok',
    generatedAt: now.toISOString(),
    staleAfterHours,
    scanned: rows.length,
    totalAvailable,
    truncated: totalAvailable > rows.length,
    summary: {
      completed: rows.filter((row) => row.disposition === 'completed').length,
      cancelled: rows.filter((row) => row.disposition === 'cancelled').length,
      healthyOpen: rows.filter(
        (row) =>
          row.disposition !== 'completed' &&
          row.disposition !== 'cancelled' &&
          !exceptionIds.has(row.id),
      ).length,
      exceptionItems: exceptions.length,
      critical: exceptions.filter((item) => item.severity === 'critical')
        .length,
      attention: exceptions.filter((item) => item.severity === 'attention')
        .length,
      watch: exceptions.filter((item) => item.severity === 'watch').length,
      byKind,
    },
    exceptions,
  };
}

export async function readCompanyWorkExceptionReportWithClient(
  client: CompanyWorkReportClient,
  options: CompanyWorkReportOptions = {},
): Promise<CompanyWorkExceptionReport> {
  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const result = await client.query<CompanyWorkReportRow>(READ_REPORT_SQL, [
    limit,
  ]);
  return buildCompanyWorkExceptionReport(result.rows, options);
}

export async function readCompanyWorkExceptionReport(
  options: CompanyWorkReportOptions = {},
): Promise<CompanyWorkExceptionReport> {
  return readCompanyWorkExceptionReportWithClient({ query }, options);
}

/**
 * Fail-open read boundary for operator surfaces. No exception from this report
 * is allowed to affect the email observer or execution path.
 */
export async function safeReadCompanyWorkExceptionReport(
  options: CompanyWorkReportOptions = {},
  reader: (
    options: CompanyWorkReportOptions,
  ) => Promise<CompanyWorkExceptionReport> = readCompanyWorkExceptionReport,
): Promise<CompanyWorkExceptionResult> {
  try {
    return await reader(options);
  } catch {
    return {
      status: 'unavailable',
      generatedAt: (options.now ?? new Date()).toISOString(),
      errorCode: 'ledger_query_failed',
    };
  }
}
