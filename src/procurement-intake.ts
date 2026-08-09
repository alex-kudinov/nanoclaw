/**
 * Host-owned Procurement intake.
 *
 * Portal/email content is data, never SQL. This module validates and
 * canonicalizes observations, hashes their bounded payload, and calls only the
 * typed functions installed by migration 114.
 */

import { createHash } from 'crypto';

import type { QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';

import { query as businessQuery } from './business-db.js';
import {
  CALEPROCURE_ADAPTER_VERSION,
  plannedCaleProcureUnits,
} from './procurement-source-config.js';

export type ProcurementSource = 'caleprocure' | 'email';
export type ProcurementReviewDecision = 'needs_info' | 'process' | 'drop';

export interface ProcurementObservation {
  source: ProcurementSource;
  sourceKey: string;
  title: string;
  agency?: string;
  closeDate?: string;
  category?: string;
  sourceUrl?: string;
  searchKeywords: string[];
  observedAt: string;
  rawPayload: Record<string, unknown>;
  sourceRunId?: number;
  gmailMessageId?: string;
  gmailThreadId?: string;
}

export interface ProcurementIngestResult {
  opportunityId: number;
  observationCreated: boolean;
  opportunityCreated: boolean;
  reviewState: string;
  reviewVersion: number;
}

export interface ProcurementRunResult {
  runId: number;
  status: 'complete' | 'partial' | 'failed';
  observationsSeen: number;
  observationsNew: number;
  opportunityIds: number[];
  missingUnits: string[];
}

export interface CaleProcureCoverage {
  observedUnits: string[];
  evidence: Record<string, CaleProcureUnitEvidence>;
}

export interface CaleProcureUnitEvidence {
  resultCount: number;
  pagesVisited: number;
}

export interface ProcurementReviewResult {
  opportunityId: number;
  reviewState: ProcurementReviewDecision;
  reviewVersion: number;
  status: string;
}

export interface QueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

const defaultExecutor: QueryExecutor = {
  query: (sql, params = []) => businessQuery(sql, params),
};

const boundedText = (max: number) => z.string().trim().min(1).max(max);

const caleProcureRowSchema = z
  .object({
    event_id: boundedText(128),
    business_unit: boundedText(64).optional(),
    title: boundedText(500),
    agency: boundedText(300),
    close_date: boundedText(80).optional(),
    category: z.string().trim().max(120).optional(),
    url: z.string().trim().url().max(2_000).optional(),
    search_keyword: boundedText(120),
  })
  .strict();

export type CaleProcureRow = z.infer<typeof caleProcureRowSchema>;

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_BATCH_PAYLOAD_BYTES = 512 * 1024;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const CALE_PATH_RE = /^\/event\/([^/]+)\/([^/?#]+)\/?$/i;

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function payloadHash(payload: unknown, maxBytes = MAX_PAYLOAD_BYTES): string {
  const canonical = canonicalJson(payload);
  if (Buffer.byteLength(canonical, 'utf8') > maxBytes) {
    throw new Error(`procurement payload exceeds ${maxBytes} bytes`);
  }
  return createHash('sha256').update(canonical).digest('hex');
}

function validIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function normalizeProcurementDate(
  value: string | undefined,
): string | undefined {
  const cleaned = cleanOptional(value);
  if (!cleaned) return undefined;
  const isoCandidate = cleaned.slice(0, 10);
  if (validIsoDate(isoCandidate)) return isoCandidate;

  const us = US_DATE_RE.exec(cleaned);
  if (us) {
    const candidate = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    if (validIsoDate(candidate)) return candidate;
  }
  throw new Error(`unsupported or invalid procurement date: ${cleaned}`);
}

function parseCaleProcureUrl(rawUrl: string | undefined): {
  url?: string;
  businessUnit?: string;
  eventId?: string;
} {
  if (!rawUrl) return {};
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'caleprocure.ca.gov') {
    throw new Error('CaleProcure URL must use https://caleprocure.ca.gov');
  }
  const match = CALE_PATH_RE.exec(url.pathname);
  if (!match) {
    throw new Error(
      'CaleProcure URL must use /event/{business_unit}/{event_id}',
    );
  }
  return {
    url: url.toString(),
    businessUnit: decodeURIComponent(match[1]),
    eventId: decodeURIComponent(match[2]),
  };
}

function normalizeCaleProcureRow(raw: unknown): ProcurementObservation {
  const row = caleProcureRowSchema.parse(raw);
  const parsedUrl = parseCaleProcureUrl(row.url);
  const businessUnit = row.business_unit ?? parsedUrl.businessUnit;

  if (!businessUnit) {
    throw new Error(
      `CaleProcure event ${row.event_id} is missing its business unit`,
    );
  }
  if (parsedUrl.eventId && parsedUrl.eventId !== row.event_id) {
    throw new Error(
      `CaleProcure URL event ${parsedUrl.eventId} conflicts with ${row.event_id}`,
    );
  }
  if (parsedUrl.businessUnit && parsedUrl.businessUnit !== businessUnit) {
    throw new Error(
      `CaleProcure URL business unit ${parsedUrl.businessUnit} conflicts with ${businessUnit}`,
    );
  }

  const sourceKey = `${businessUnit}/${row.event_id}`;
  const rawPayload: Record<string, unknown> = {
    event_id: row.event_id,
    business_unit: businessUnit,
    title: cleanOptional(row.title),
    agency: cleanOptional(row.agency),
    close_date: normalizeProcurementDate(row.close_date) ?? null,
    category: cleanOptional(row.category) ?? null,
    url:
      parsedUrl.url ??
      `https://caleprocure.ca.gov/event/${encodeURIComponent(businessUnit)}/${encodeURIComponent(row.event_id)}`,
  };

  return {
    source: 'caleprocure',
    sourceKey,
    title: cleanOptional(row.title)!,
    agency: cleanOptional(row.agency),
    closeDate: normalizeProcurementDate(row.close_date),
    category: cleanOptional(row.category),
    sourceUrl: String(rawPayload.url),
    searchKeywords: [cleanOptional(row.search_keyword)!],
    observedAt: new Date().toISOString(),
    rawPayload,
  };
}

function sameCanonicalOpportunity(
  left: ProcurementObservation,
  right: ProcurementObservation,
): boolean {
  return (
    left.title === right.title &&
    left.agency === right.agency &&
    left.closeDate === right.closeDate &&
    left.category === right.category &&
    left.sourceUrl === right.sourceUrl
  );
}

/**
 * Normalize and deduplicate rows extracted from the public CaleProcure result
 * table. The adapter fails closed on conflicting copies of the same event.
 */
export function normalizeCaleProcureRows(
  rows: unknown,
  observedAt = new Date().toISOString(),
): ProcurementObservation[] {
  if (!Array.isArray(rows)) {
    throw new Error('CaleProcure result payload must be an array');
  }
  const byKey = new Map<string, ProcurementObservation>();

  for (const raw of rows) {
    const normalized = normalizeCaleProcureRow(raw);
    normalized.observedAt = observedAt;
    const existing = byKey.get(normalized.sourceKey);
    if (!existing) {
      byKey.set(normalized.sourceKey, normalized);
      continue;
    }
    if (!sameCanonicalOpportunity(existing, normalized)) {
      throw new Error(
        `conflicting CaleProcure rows for ${normalized.sourceKey}`,
      );
    }
    existing.searchKeywords = [
      ...new Set([...existing.searchKeywords, ...normalized.searchKeywords]),
    ].sort();
  }

  return [...byKey.values()].sort((a, b) =>
    a.sourceKey.localeCompare(b.sourceKey),
  );
}

interface ObservationRow extends QueryResultRow {
  opportunity_id: number | string;
  observation_created: boolean;
  opportunity_created: boolean;
  review_state: string;
  review_version: number | string;
}

export async function ingestProcurementObservation(
  observation: ProcurementObservation,
  executor: QueryExecutor = defaultExecutor,
): Promise<ProcurementIngestResult> {
  const hash = payloadHash(observation.rawPayload);
  const result = await executor.query<ObservationRow>(
    `SELECT *
       FROM public.fn_record_procurement_observation(
         $1, $2, $3, $4, $5::date, $6, $7, $8::text[],
         $9::timestamptz, $10, $11::jsonb, $12, $13, $14
       )`,
    [
      observation.source,
      observation.sourceKey,
      observation.title,
      observation.agency ?? null,
      observation.closeDate ?? null,
      observation.category ?? null,
      observation.sourceUrl ?? null,
      observation.searchKeywords,
      observation.observedAt,
      hash,
      JSON.stringify(observation.rawPayload),
      observation.sourceRunId ?? null,
      observation.gmailMessageId ?? null,
      observation.gmailThreadId ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('procurement observation returned no result');
  return {
    opportunityId: Number(row.opportunity_id),
    observationCreated: Boolean(row.observation_created),
    opportunityCreated: Boolean(row.opportunity_created),
    reviewState: row.review_state,
    reviewVersion: Number(row.review_version),
  };
}

export interface EmailProcurementInput {
  label: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  messageId: string;
  threadId: string;
  observedAt?: string;
}

/**
 * Store only routing metadata for an emailed opportunity. The body stays in
 * Gmail and can be read only through the exact host-granted message resource.
 */
export async function ingestEmailProcurementObservation(
  input: EmailProcurementInput,
  executor: QueryExecutor = defaultExecutor,
): Promise<ProcurementIngestResult> {
  const messageId = cleanOptional(input.messageId);
  const threadId = cleanOptional(input.threadId);
  const title = cleanOptional(input.subject) ?? '(untitled procurement email)';
  if (!messageId) throw new Error('procurement email messageId is required');
  if (!threadId) throw new Error('procurement email threadId is required');

  const senderEmail = cleanOptional(input.senderEmail);
  const senderName = cleanOptional(input.senderName);
  return ingestProcurementObservation(
    {
      source: 'email',
      sourceKey: messageId,
      title,
      agency: senderName ?? senderEmail,
      searchKeywords: [],
      observedAt: input.observedAt ?? new Date().toISOString(),
      rawPayload: {
        label: cleanOptional(input.label) ?? 'procurement/rfp',
        sender_email: senderEmail ?? null,
      },
      gmailMessageId: messageId,
      gmailThreadId: threadId,
    },
    executor,
  );
}

interface RunRow extends QueryResultRow {
  run_id: number | string;
  status: 'running' | 'complete' | 'partial' | 'failed';
  observations_seen: number | string;
  observations_new: number | string;
  missing_units: unknown;
}

function normalizeCoverageUnits(units: unknown): string[] {
  if (!Array.isArray(units)) {
    throw new Error('CaleProcure observedUnits must be an array');
  }
  const planned = new Set(plannedCaleProcureUnits());
  const normalized = units.map((unit) => {
    if (typeof unit !== 'string') {
      throw new Error('CaleProcure observed unit must be a string');
    }
    const value = unit.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!planned.has(value)) {
      throw new Error(
        `CaleProcure observed unit is not host-planned: ${value}`,
      );
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('CaleProcure observedUnits contains duplicates');
  }
  return normalized.sort();
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeCoverageEvidence(
  observedUnits: string[],
  evidence: unknown,
): Record<string, CaleProcureUnitEvidence> {
  if (
    typeof evidence !== 'object' ||
    evidence === null ||
    Array.isArray(evidence)
  ) {
    throw new Error('CaleProcure coverageEvidence must be an object');
  }
  const input = evidence as Record<string, unknown>;
  const observed = new Set(observedUnits);
  if (
    Object.keys(input).length !== observed.size ||
    Object.keys(input).some((unit) => !observed.has(unit))
  ) {
    throw new Error(
      'CaleProcure coverageEvidence must exactly receipt every observed unit',
    );
  }
  return Object.fromEntries(
    observedUnits.map((unit) => {
      const receipt = input[unit];
      if (
        typeof receipt !== 'object' ||
        receipt === null ||
        Array.isArray(receipt)
      ) {
        throw new Error(`CaleProcure coverage receipt is invalid: ${unit}`);
      }
      const values = receipt as Record<string, unknown>;
      if (
        Object.keys(values).some(
          (key) => key !== 'resultCount' && key !== 'pagesVisited',
        ) ||
        !Number.isSafeInteger(values.resultCount) ||
        Number(values.resultCount) < 0 ||
        !Number.isSafeInteger(values.pagesVisited) ||
        Number(values.pagesVisited) < 1
      ) {
        throw new Error(`CaleProcure coverage receipt is invalid: ${unit}`);
      }
      return [
        unit,
        {
          resultCount: Number(values.resultCount),
          pagesVisited: Number(values.pagesVisited),
        },
      ];
    }),
  );
}

async function beginSourceRun(
  runKey: string,
  observedAt: string,
  batchHash: string,
  executor: QueryExecutor,
): Promise<RunRow> {
  const result = await executor.query<RunRow>(
    `SELECT *
       FROM public.fn_begin_procurement_source_run_v2(
         $1, $2, $3::timestamptz, $4, $5, $6::jsonb
       )`,
    [
      'caleprocure',
      runKey,
      observedAt,
      batchHash,
      CALEPROCURE_ADAPTER_VERSION,
      JSON.stringify(plannedCaleProcureUnits()),
    ],
  );
  if (!result.rows[0]) {
    throw new Error('procurement source run returned no result');
  }
  return result.rows[0];
}

async function sourceRunOpportunityIds(
  runId: number,
  executor: QueryExecutor,
): Promise<number[]> {
  const result = await executor.query<{ opportunity_id: number | string }>(
    `SELECT opportunity_id
       FROM public.procurement_source_run_opportunities
      WHERE source_run_id = $1
      ORDER BY opportunity_id`,
    [runId],
  );
  return result.rows.map((row) => Number(row.opportunity_id));
}

async function linkSourceRunOpportunity(
  runId: number,
  opportunityId: number,
  executor: QueryExecutor,
): Promise<void> {
  await executor.query(
    'SELECT public.fn_link_procurement_run_opportunity($1, $2)',
    [runId, opportunityId],
  );
}

async function completeSourceRun(
  runId: number,
  observedUnits: string[],
  evidence: Record<string, unknown>,
  observationsSeen: number,
  observationsNew: number,
  errorCode: string | null,
  executor: QueryExecutor,
): Promise<RunRow> {
  const result = await executor.query<RunRow>(
    `SELECT * FROM public.fn_complete_procurement_source_run_v2(
       $1, $2::timestamptz, $3::jsonb, $4::jsonb, $5, $6, $7
     )`,
    [
      runId,
      new Date().toISOString(),
      JSON.stringify(observedUnits),
      JSON.stringify(evidence),
      observationsSeen,
      observationsNew,
      errorCode,
    ],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error(`procurement source run ${runId} returned no result`);
  return row;
}

/**
 * Persist one deterministic CaleProcure batch and leave an explicit failed run
 * when any normalized observation cannot be recorded.
 */
export async function ingestCaleProcureRows(
  rows: unknown,
  runKey: string,
  observedAt = new Date().toISOString(),
  executor: QueryExecutor = defaultExecutor,
  coverage?: CaleProcureCoverage,
): Promise<ProcurementRunResult> {
  const normalizedRunKey = cleanOptional(runKey);
  if (!normalizedRunKey) throw new Error('CaleProcure runKey is required');
  if (
    normalizedRunKey.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalizedRunKey)
  ) {
    throw new Error('CaleProcure runKey is invalid');
  }
  if (!Array.isArray(rows)) {
    throw new Error('CaleProcure result payload must be an array');
  }
  const observedUnits = normalizeCoverageUnits(coverage?.observedUnits);
  const evidence = normalizeCoverageEvidence(observedUnits, coverage?.evidence);
  if (canonicalJson(evidence).length > 32 * 1024) {
    throw new Error('CaleProcure coverage evidence exceeds 32768 characters');
  }
  const batchHash = payloadHash(
    {
      rows,
      observedUnits,
      evidence,
      adapterVersion: CALEPROCURE_ADAPTER_VERSION,
    },
    MAX_BATCH_PAYLOAD_BYTES,
  );
  const run = await beginSourceRun(
    normalizedRunKey,
    observedAt,
    batchHash,
    executor,
  );
  const runId = Number(run.run_id);
  if (run.status === 'complete') {
    return {
      runId,
      status: 'complete',
      observationsSeen: Number(run.observations_seen),
      observationsNew: Number(run.observations_new),
      opportunityIds: await sourceRunOpportunityIds(runId, executor),
      missingUnits: jsonStringArray(run.missing_units),
    };
  }
  if (run.status !== 'running') {
    throw new Error(
      `CaleProcure run ${normalizedRunKey} is already ${run.status}; use a new run key`,
    );
  }
  const opportunityIds: number[] = [];
  let observationsNew = 0;

  try {
    const observations = normalizeCaleProcureRows(rows, observedAt);
    for (const observation of observations) {
      const result = await ingestProcurementObservation(
        { ...observation, sourceRunId: runId },
        executor,
      );
      opportunityIds.push(result.opportunityId);
      await linkSourceRunOpportunity(runId, result.opportunityId, executor);
      if (result.observationCreated) observationsNew += 1;
    }
    const rowKeywords = new Set(
      observations.flatMap((observation) => observation.searchKeywords),
    );
    for (const keyword of rowKeywords) {
      if (!observedUnits.includes(keyword)) {
        throw new Error(
          `CaleProcure row keyword was not reported observed: ${keyword}`,
        );
      }
    }
    const completed = await completeSourceRun(
      runId,
      observedUnits,
      evidence,
      observations.length,
      observationsNew,
      null,
      executor,
    );
    if (completed.status === 'running') {
      throw new Error(
        `procurement source run ${runId} did not reach a terminal state`,
      );
    }
    return {
      runId,
      status: completed.status,
      observationsSeen: Number(completed.observations_seen),
      observationsNew: Number(completed.observations_new),
      opportunityIds,
      missingUnits: jsonStringArray(completed.missing_units),
    };
  } catch (error) {
    const code =
      error instanceof Error && error.name
        ? `adapter_${error.name.toLowerCase()}`
        : 'adapter_error';
    await completeSourceRun(
      runId,
      observedUnits,
      evidence,
      opportunityIds.length,
      observationsNew,
      code,
      executor,
    ).catch(() => undefined);
    throw error;
  }
}

interface ReviewRow extends QueryResultRow {
  opportunity_id: number | string;
  review_state: ProcurementReviewDecision;
  review_version: number | string;
  status: string;
}

export async function transitionProcurementReview(
  input: {
    opportunityId: number;
    expectedVersion: number;
    decision: ProcurementReviewDecision;
    reason: string;
    owner: string;
  },
  executor: QueryExecutor = defaultExecutor,
): Promise<ProcurementReviewResult> {
  if (input.decision === 'process') {
    throw new Error(
      'procurement process decisions require a bound Slack review card',
    );
  }
  if (!Number.isSafeInteger(input.opportunityId) || input.opportunityId <= 0) {
    throw new Error('procurement opportunityId must be a positive integer');
  }
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    throw new Error(
      'procurement expectedVersion must be a non-negative integer',
    );
  }
  const reason = cleanOptional(input.reason);
  const owner = cleanOptional(input.owner);
  if (!reason) throw new Error('procurement review reason is required');
  if (!owner) throw new Error('procurement decision owner is required');

  const result = await executor.query<ReviewRow>(
    `SELECT *
       FROM public.fn_transition_procurement_review($1, $2, $3, $4, $5)`,
    [input.opportunityId, input.expectedVersion, input.decision, reason, owner],
  );
  const row = result.rows[0];
  if (!row) throw new Error('procurement review returned no result');
  return {
    opportunityId: Number(row.opportunity_id),
    reviewState: row.review_state,
    reviewVersion: Number(row.review_version),
    status: row.status,
  };
}
