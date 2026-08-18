/**
 * Crash-safe runtime bridge between the SQLite Gmail cursor and the generic
 * Company OS trigger-source watermark.
 *
 * The bridge stores only cursor values, counts, and content-free receipt
 * fingerprints. It never calls Gmail, reads message content, creates work, or
 * grants action authority.
 */

import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';

import { withTransaction } from './business-db.js';
import {
  createCompanyGmailInboundSource,
  proposeCompanyGmailHistoryGap,
  type CompanyGmailCandidateAccounting,
  type CompanyGmailCandidateReceipt,
} from './company-gmail-reconciliation.js';
import { COMPANY_GMAIL_SOURCE_OPTIONS } from './company-gmail-source-bootstrap.js';
import type { CompanyTriggerClient } from './company-trigger.js';
import {
  normalizeCompanyTriggerWatermarkEvent,
  recordCompanyTriggerWatermarkWithClient,
  type CompanyTriggerWatermarkRecordResult,
  type CompanyTriggerWatermarkState,
} from './company-trigger-source.js';

export const COMPANY_GMAIL_RUNTIME_WATERMARK_CONTRACT_VERSION = 1 as const;

const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type CompanyGmailRuntimeWatermarkErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'source_drift'
  | 'cursor_drift'
  | 'state_drift'
  | 'storage_unavailable';

export class CompanyGmailRuntimeWatermarkError extends Error {
  constructor(
    public readonly code: CompanyGmailRuntimeWatermarkErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailRuntimeWatermarkError';
  }
}

export type CompanyGmailRuntimePreparation =
  | { decision: 'proceed'; cursor: string; stateVersion: number }
  | {
      decision: 'catch_up_sqlite';
      cursor: string;
      stateVersion: number;
      eventId: string;
    }
  | {
      decision: 'hold_gap';
      cursor: string;
      stateVersion: number;
      gapEventId: string;
    };

export interface CompanyGmailRuntimeAdvanceInput {
  previousCursor: string;
  nextCursor: string;
  observedThrough: string;
  candidates: readonly CompanyGmailCandidateReceipt[];
}

export interface CompanyGmailRuntimeGapInput {
  previousCursor: string;
  notificationHistoryId: string;
  detectedAt: string;
}

export interface CompanyGmailRuntimeWatermark {
  prepare(sqliteCursor: string): Promise<CompanyGmailRuntimePreparation>;
  recordAdvance(
    input: CompanyGmailRuntimeAdvanceInput,
  ): Promise<CompanyTriggerWatermarkRecordResult>;
  recordGap(
    input: CompanyGmailRuntimeGapInput,
  ): Promise<CompanyTriggerWatermarkRecordResult>;
}

interface AuthorityRow extends QueryResultRow {
  source_fingerprint: string;
  version: string;
  status: string;
  cursor_value: string | null;
  cursor_observed_at: string | Date | null;
  open_gap_event_id: string | null;
  last_event_id: string | null;
  event_type: string | null;
  event_expected_version: string | null;
  event_previous_cursor: string | null;
  event_next_cursor: string | null;
  event_gap_reason: string | null;
}

interface RuntimeAuthority {
  state: CompanyTriggerWatermarkState;
  lastEvent: {
    id: string;
    eventType: string;
    expectedVersion: number;
    previousCursor: string | null;
    nextCursor: string;
    gapReason: string | null;
  } | null;
}

const source = createCompanyGmailInboundSource(COMPANY_GMAIL_SOURCE_OPTIONS);

function fail(
  code: CompanyGmailRuntimeWatermarkErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailRuntimeWatermarkError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function historyId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UINT_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return BigInt(value).toString();
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail('invalid_input', `${field} is invalid`);
  }
  const normalized = new Date(value).toISOString();
  if (value !== normalized) {
    fail('invalid_input', `${field} must be canonical UTC`);
  }
  return normalized;
}

function count(value: unknown, field: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 0) {
    fail('state_drift', `${field} is invalid`);
  }
  return parsed as number;
}

function compare(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeCandidate(
  candidate: CompanyGmailCandidateReceipt,
): CompanyGmailCandidateReceipt {
  if (
    !candidate ||
    typeof candidate.messageId !== 'string' ||
    !MESSAGE_ID_PATTERN.test(candidate.messageId) ||
    (candidate.disposition !== 'accepted' &&
      candidate.disposition !== 'rejected') ||
    typeof candidate.reasonKey !== 'string' ||
    !OPAQUE_KEY_PATTERN.test(candidate.reasonKey) ||
    typeof candidate.evidenceSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.evidenceSha256)
  ) {
    fail('invalid_input', 'Gmail runtime candidate evidence is invalid');
  }
  return {
    messageId: candidate.messageId,
    disposition: candidate.disposition,
    reasonKey: candidate.reasonKey,
    evidenceSha256: candidate.evidenceSha256,
  };
}

function normalizeCandidates(
  candidates: readonly CompanyGmailCandidateReceipt[],
): CompanyGmailCandidateReceipt[] {
  if (!Array.isArray(candidates)) {
    fail('invalid_input', 'Gmail runtime candidates are invalid');
  }
  const normalized = candidates
    .map(normalizeCandidate)
    .sort((a, b) => a.messageId.localeCompare(b.messageId));
  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index - 1].messageId === normalized[index].messageId) {
      fail('invalid_input', 'Gmail runtime candidate IDs are duplicated');
    }
  }
  return normalized;
}

async function readAuthority(
  client: CompanyTriggerClient,
  forUpdate: boolean,
): Promise<RuntimeAuthority> {
  let result;
  try {
    result = await client.query<AuthorityRow>(
      `SELECT s.source_fingerprint, w.version::text, w.status, w.cursor_value,
              w.cursor_observed_at, w.open_gap_event_id::text,
              w.last_event_id::text, e.event_type,
              e.expected_version::text AS event_expected_version,
              e.previous_cursor AS event_previous_cursor,
              e.next_cursor AS event_next_cursor,
              e.gap_reason AS event_gap_reason
         FROM business_v2.company_trigger_sources s
         JOIN business_v2.company_trigger_watermark_state w
           ON w.definition_id = s.definition_id
         LEFT JOIN business_v2.company_trigger_watermark_events e
           ON e.id = w.last_event_id
        WHERE s.definition_id = $1${forUpdate ? ' FOR UPDATE OF w' : ''}`,
      [source.definitionId],
    );
  } catch (error) {
    fail('storage_unavailable', 'Gmail runtime authority read failed', error);
  }
  const row = result.rows[0];
  if (!row) fail('not_found', 'registered Gmail runtime source is missing');
  if (row.source_fingerprint !== source.sourceFingerprint) {
    fail('source_drift', 'registered Gmail runtime source drifted');
  }
  const version = count(row.version, 'watermark version');
  if (
    version < 1 ||
    (row.status !== 'current' && row.status !== 'gap') ||
    row.cursor_value === null ||
    !UINT_PATTERN.test(row.cursor_value) ||
    row.cursor_observed_at === null ||
    !row.last_event_id
  ) {
    fail('state_drift', 'Gmail runtime watermark state is malformed');
  }
  const state: CompanyTriggerWatermarkState = Object.freeze({
    definitionId: source.definitionId,
    version,
    status: row.status,
    cursorValue: BigInt(row.cursor_value).toString(),
    cursorObservedAt: new Date(row.cursor_observed_at).toISOString(),
    openGapEventId: row.open_gap_event_id,
    lastEventId: row.last_event_id,
  });
  const eventType = row.event_type;
  if (
    eventType === null ||
    row.event_expected_version === null ||
    row.event_next_cursor === null ||
    !UINT_PATTERN.test(row.event_next_cursor)
  ) {
    fail('state_drift', 'Gmail runtime watermark head event is missing');
  }
  const lastEvent = {
    id: row.last_event_id,
    eventType,
    expectedVersion: count(
      row.event_expected_version,
      'watermark event version',
    ),
    previousCursor: row.event_previous_cursor,
    nextCursor: BigInt(row.event_next_cursor).toString(),
    gapReason: row.event_gap_reason,
  };
  return { state, lastEvent };
}

/** @internal The caller must supply a transaction-scoped client. */
export async function readCompanyGmailRuntimeWatermarkStateWithClient(
  client: CompanyTriggerClient,
  forUpdate = false,
): Promise<CompanyTriggerWatermarkState> {
  return (await readAuthority(client, forUpdate)).state;
}

export function classifyCompanyGmailRuntimePreparation(input: {
  sqliteCursor: string;
  authority: RuntimeAuthority;
}): CompanyGmailRuntimePreparation {
  const sqliteCursor = historyId(input.sqliteCursor, 'sqliteCursor');
  const { state, lastEvent } = input.authority;
  if (
    state.definitionId !== source.definitionId ||
    state.cursorValue === null ||
    state.lastEventId === null ||
    lastEvent === null ||
    lastEvent.id !== state.lastEventId
  ) {
    fail('state_drift', 'Gmail runtime authority is incomplete');
  }
  const durableCursor = historyId(state.cursorValue, 'watermark cursor');
  if (state.status === 'gap') {
    if (
      durableCursor !== sqliteCursor ||
      state.openGapEventId !== lastEvent.id ||
      lastEvent.eventType !== 'gap_detected' ||
      lastEvent.expectedVersion !== state.version - 1 ||
      lastEvent.previousCursor !== durableCursor ||
      compare(lastEvent.nextCursor, durableCursor) <= 0 ||
      lastEvent.gapReason !== 'history_expired'
    ) {
      fail('cursor_drift', 'Gmail runtime open gap does not bind SQLite');
    }
    return {
      decision: 'hold_gap',
      cursor: durableCursor,
      stateVersion: state.version,
      gapEventId: lastEvent.id,
    };
  }
  if (
    state.status !== 'current' ||
    state.openGapEventId !== null ||
    state.cursorObservedAt === null
  ) {
    fail('state_drift', 'Gmail runtime watermark is not current');
  }
  const order = compare(durableCursor, sqliteCursor);
  if (order === 0) {
    return {
      decision: 'proceed',
      cursor: sqliteCursor,
      stateVersion: state.version,
    };
  }
  if (
    order > 0 &&
    lastEvent.eventType === 'advance' &&
    lastEvent.expectedVersion === state.version - 1 &&
    lastEvent.previousCursor === sqliteCursor &&
    lastEvent.nextCursor === durableCursor &&
    lastEvent.gapReason === null
  ) {
    return {
      decision: 'catch_up_sqlite',
      cursor: durableCursor,
      stateVersion: state.version,
      eventId: lastEvent.id,
    };
  }
  fail('cursor_drift', 'SQLite and Company OS Gmail cursors diverged');
}

export function buildCompanyGmailRuntimeAdvance(input: {
  state: CompanyTriggerWatermarkState;
  previousCursor: string;
  nextCursor: string;
  observedThrough: string;
  candidates: readonly CompanyGmailCandidateReceipt[];
}) {
  const previousCursor = historyId(input.previousCursor, 'previousCursor');
  const nextCursor = historyId(input.nextCursor, 'nextCursor');
  if (compare(nextCursor, previousCursor) <= 0) {
    fail('invalid_input', 'runtime nextCursor must advance');
  }
  if (
    input.state.definitionId !== source.definitionId ||
    input.state.status !== 'current' ||
    input.state.cursorValue !== previousCursor ||
    input.state.cursorObservedAt === null ||
    input.state.openGapEventId !== null ||
    input.state.lastEventId === null ||
    !Number.isSafeInteger(input.state.version) ||
    input.state.version < 1
  ) {
    fail('cursor_drift', 'runtime advance does not bind the durable cursor');
  }
  const observedThrough = timestamp(input.observedThrough, 'observedThrough');
  if (Date.parse(observedThrough) < Date.parse(input.state.cursorObservedAt)) {
    fail('invalid_input', 'runtime advance predates the durable cursor');
  }
  const candidates = normalizeCandidates(input.candidates);
  const acceptedCount = candidates.filter(
    (candidate) => candidate.disposition === 'accepted',
  ).length;
  const rejectedCount = candidates.length - acceptedCount;
  const evidenceSha256 = hash([
    'company-gmail-runtime-advance-evidence:v1',
    source.definitionId,
    source.sourceFingerprint,
    input.state.version,
    previousCursor,
    nextCursor,
    input.state.cursorObservedAt,
    observedThrough,
    candidates.map((candidate) => [
      candidate.messageId,
      candidate.disposition,
      candidate.reasonKey,
      candidate.evidenceSha256,
    ]),
  ]);
  const eventKey = `gmail:advance:${hash([
    'company-gmail-runtime-advance-key:v1',
    source.definitionId,
    input.state.version,
    previousCursor,
    nextCursor,
    evidenceSha256,
  ])}`;
  return normalizeCompanyTriggerWatermarkEvent(source.cursorKind, {
    definitionId: source.definitionId,
    eventKey,
    eventType: 'advance',
    expectedVersion: input.state.version,
    previousCursor,
    nextCursor,
    observedFrom: input.state.cursorObservedAt,
    observedThrough,
    evidenceSha256,
    observedCount: candidates.length,
    acceptedCount,
    rejectedCount,
    gapReason: null,
    resolvesEventId: null,
  });
}

function recordInput(
  event: ReturnType<typeof normalizeCompanyTriggerWatermarkEvent>,
): Record<string, unknown> {
  return {
    definitionId: event.definitionId,
    eventKey: event.eventKey,
    eventType: event.eventType,
    expectedVersion: event.expectedVersion,
    previousCursor: event.previousCursor,
    nextCursor: event.nextCursor,
    observedFrom: event.observedFrom,
    observedThrough: event.observedThrough,
    evidenceSha256: event.evidenceSha256,
    observedCount: event.observedCount,
    acceptedCount: event.acceptedCount,
    rejectedCount: event.rejectedCount,
    gapReason: event.gapReason,
    resolvesEventId: event.resolvesEventId,
  };
}

function validateRecord(
  result: CompanyTriggerWatermarkRecordResult,
  event: ReturnType<typeof normalizeCompanyTriggerWatermarkEvent>,
  expectedStatus: 'current' | 'gap',
): CompanyTriggerWatermarkRecordResult {
  if (
    result.event.eventFingerprint !== event.eventFingerprint ||
    result.state.definitionId !== source.definitionId ||
    result.state.version !== event.expectedVersion + 1 ||
    result.state.status !== expectedStatus ||
    (expectedStatus === 'gap' &&
      result.state.cursorValue !== event.previousCursor) ||
    (expectedStatus === 'current' &&
      result.state.cursorValue !== event.nextCursor) ||
    result.state.lastEventId !== result.eventId
  ) {
    fail('storage_unavailable', 'Gmail runtime watermark result drifted');
  }
  return result;
}

/** @internal The caller must supply a transaction-scoped client. */
export async function recordCompanyGmailRuntimeAdvanceWithClient(
  client: CompanyTriggerClient,
  input: CompanyGmailRuntimeAdvanceInput,
  record: typeof recordCompanyTriggerWatermarkWithClient = recordCompanyTriggerWatermarkWithClient,
): Promise<CompanyTriggerWatermarkRecordResult> {
  const authority = await readAuthority(client, true);
  const event = buildCompanyGmailRuntimeAdvance({
    state: authority.state,
    ...input,
  });
  return validateRecord(
    await record(client, recordInput(event)),
    event,
    'current',
  );
}

export function createCompanyGmailRuntimeWatermark(dependencies?: {
  withTransaction?: typeof withTransaction;
  recordWatermark?: typeof recordCompanyTriggerWatermarkWithClient;
}): CompanyGmailRuntimeWatermark {
  const transact = dependencies?.withTransaction ?? withTransaction;
  const record =
    dependencies?.recordWatermark ?? recordCompanyTriggerWatermarkWithClient;
  return {
    prepare: (sqliteCursor) =>
      transact(async (client) =>
        classifyCompanyGmailRuntimePreparation({
          sqliteCursor,
          authority: await readAuthority(client, false),
        }),
      ),
    recordAdvance: (input) =>
      transact((client) =>
        recordCompanyGmailRuntimeAdvanceWithClient(client, input, record),
      ),
    recordGap: (input) =>
      transact(async (client) => {
        const authority = await readAuthority(client, true);
        const previousCursor = historyId(
          input.previousCursor,
          'previousCursor',
        );
        if (
          authority.state.status !== 'current' ||
          authority.state.cursorValue !== previousCursor
        ) {
          fail('cursor_drift', 'runtime gap does not bind the durable cursor');
        }
        const event = proposeCompanyGmailHistoryGap({
          source,
          state: authority.state,
          notificationHistoryId: historyId(
            input.notificationHistoryId,
            'notificationHistoryId',
          ),
          detectedAt: timestamp(input.detectedAt, 'detectedAt'),
        });
        return validateRecord(
          await record(client, recordInput(event)),
          event,
          'gap',
        );
      }),
  };
}

export const companyGmailRuntimeWatermark =
  createCompanyGmailRuntimeWatermark();

export function runtimeCandidate(
  messageId: string,
  accounting: CompanyGmailCandidateAccounting,
): CompanyGmailCandidateReceipt {
  return normalizeCandidate({ messageId, ...accounting });
}
