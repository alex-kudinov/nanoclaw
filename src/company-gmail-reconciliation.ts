/**
 * Dark Company OS adapter for the inbound Gmail history-expiry gap.
 *
 * This module is intentionally pure and unwired. It can construct validated,
 * content-free source/watermark proposals, but it cannot read the production
 * Gmail client, register a source, write a cursor, deliver a message, or create
 * work. A later host wrapper must provide read-only ports and separately record
 * an accepted proposal through the generic trigger-source store.
 */

import { createHash } from 'crypto';

import {
  normalizeCompanyTriggerSource,
  normalizeCompanyTriggerWatermarkEvent,
  type CompanyTriggerSourceDefinition,
  type CompanyTriggerWatermarkEvent,
  type CompanyTriggerWatermarkState,
} from './company-trigger-source.js';

export const COMPANY_GMAIL_RECONCILIATION_ADAPTER_VERSION = '1.0.0' as const;
export const COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS = 8 * 24 * 60 * 60;
export const COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS = 20 * 60;
export const COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE = 500 as const;
export const COMPANY_GMAIL_RECONCILIATION_MAX_PAGES = 20 as const;

const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const PAGE_TOKEN_PATTERN = /^[^\s\u0000-\u001f\u007f]{1,1024}$/;

export type CompanyGmailReconciliationErrorCode =
  | 'invalid_input'
  | 'wrong_source'
  | 'wrong_state'
  | 'gap_mismatch'
  | 'window_exceeded'
  | 'source_unavailable'
  | 'head_behind_gap'
  | 'head_changed'
  | 'page_limit'
  | 'pagination_cycle'
  | 'invalid_candidate'
  | 'duplicate_candidate'
  | 'candidate_unaccounted'
  | 'freshness_exceeded';

export class CompanyGmailReconciliationError extends Error {
  constructor(
    public readonly code: CompanyGmailReconciliationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailReconciliationError';
  }
}

export interface CompanyGmailInboundSourceOptions {
  /** Stable non-address alias such as `primary`; email addresses are rejected. */
  accountAlias: string;
  ownerKey: string;
  alertRouteKey: string;
}

export interface CompanyGmailGapDetectionInput {
  source: CompanyTriggerSourceDefinition;
  state: CompanyTriggerWatermarkState;
  notificationHistoryId: string;
  detectedAt: string;
}

export interface CompanyGmailOpenGap {
  eventId: string;
  targetHistoryId: string;
}

export interface CompanyGmailSnapshotListRequest {
  pageToken: string | null;
  maxResults: typeof COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE;
  includeSpamTrash: true;
}

export interface CompanyGmailSnapshotListPage {
  messageIds: string[];
  nextPageToken: string | null;
}

export type CompanyGmailCandidateDisposition =
  | 'accepted'
  | 'rejected'
  | 'unknown';

export interface CompanyGmailCandidateAccounting {
  disposition: CompanyGmailCandidateDisposition;
  reasonKey: string;
  evidenceSha256: string;
}

/**
 * Read-only boundary supplied by a later host wrapper.
 *
 * `listMessages` represents an unfiltered users.messages.list page: no query
 * and no label filter, with Spam and Trash included. `accountCandidate` must
 * only inspect durable source/process evidence; it must not deliver or mutate.
 */
export interface CompanyGmailReconciliationPort {
  now(): string;
  getProfile(): Promise<{ historyId: string }>;
  listMessages(
    request: CompanyGmailSnapshotListRequest,
  ): Promise<CompanyGmailSnapshotListPage>;
  accountCandidate(messageId: string): Promise<CompanyGmailCandidateAccounting>;
}

export interface CompanyGmailReconciliationInput {
  source: CompanyTriggerSourceDefinition;
  state: CompanyTriggerWatermarkState;
  gap: CompanyGmailOpenGap;
}

export interface CompanyGmailReconciliationResult {
  event: CompanyTriggerWatermarkEvent;
  stableHistoryId: string;
  pagesRead: number;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  evidenceSha256: string;
  actionAuthority: 'none';
}

export interface CompanyGmailCandidateReceipt extends CompanyGmailCandidateAccounting {
  messageId: string;
}

export interface CompanyGmailClosedSnapshot {
  startedAt: string;
  completedAt: string;
  beforeHistoryId: string;
  afterHistoryId: string;
  pagesRead: number;
  candidates: readonly CompanyGmailCandidateReceipt[];
}

export interface CompanyGmailReconciliationContext {
  source: CompanyTriggerSourceDefinition;
  cursor: string;
  cursorObservedAt: string;
  gapEventId: string;
  targetHistoryId: string;
  startedAt: string;
}

function fail(
  code: CompanyGmailReconciliationErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailReconciliationError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function normalizeHistoryId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UINT_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return BigInt(value).toString();
}

function compareHistoryIds(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    fail('invalid_input', `${field} is invalid`);
  }
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    fail('invalid_input', `${field} is invalid`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    fail('invalid_input', `${field} is invalid`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return new Date(milliseconds).toISOString();
}

function normalizePositiveEventId(value: unknown, field: string): string {
  const normalized = normalizeHistoryId(value, field);
  if (normalized === '0') fail('invalid_input', `${field} is invalid`);
  return normalized;
}

function normalizeOpaqueKey(value: unknown, field: string): string {
  if (typeof value !== 'string' || !OPAQUE_KEY_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return value;
}

function normalizeMessageId(value: unknown): string {
  if (typeof value !== 'string' || !MESSAGE_ID_PATTERN.test(value)) {
    fail('invalid_candidate', 'Gmail snapshot contains an invalid message ID');
  }
  return value;
}

function normalizeSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('candidate_unaccounted', `${field} is invalid`);
  }
  return value;
}

function requireInboundSource(
  source: CompanyTriggerSourceDefinition,
): CompanyTriggerSourceDefinition {
  if (
    source.kind !== 'gmail' ||
    source.sourceSystem !== 'gmail' ||
    source.adapterKey !== 'gmail_inbound_full_snapshot' ||
    source.adapterVersion !== COMPANY_GMAIL_RECONCILIATION_ADAPTER_VERSION ||
    source.cursorKind !== 'uint' ||
    source.reconciliationMode !== 'full_snapshot' ||
    source.maxReconciliationWindowSeconds !==
      COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS ||
    source.freshnessBudgetSeconds !==
      COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS ||
    source.actionAuthority !== 'none'
  ) {
    fail('wrong_source', 'source is not the dark inbound Gmail adapter');
  }

  const reconstructed = normalizeCompanyTriggerSource({
    kind: source.kind,
    sourceSystem: source.sourceSystem,
    sourceKey: source.sourceKey,
    adapterKey: source.adapterKey,
    adapterVersion: source.adapterVersion,
    cursorKind: source.cursorKind,
    reconciliationMode: source.reconciliationMode,
    maxReconciliationWindowSeconds: source.maxReconciliationWindowSeconds,
    freshnessBudgetSeconds: source.freshnessBudgetSeconds,
    ownerKey: source.ownerKey,
    alertRouteKey: source.alertRouteKey,
  });
  if (
    reconstructed.definitionId !== source.definitionId ||
    reconstructed.sourceFingerprint !== source.sourceFingerprint
  ) {
    fail('wrong_source', 'source identity does not match its operating facts');
  }
  return reconstructed;
}

function requireStateCursor(
  source: CompanyTriggerSourceDefinition,
  state: CompanyTriggerWatermarkState,
  expectedStatus: 'current' | 'gap',
): { cursor: string; cursorObservedAt: string } {
  if (
    state.definitionId !== source.definitionId ||
    !Number.isSafeInteger(state.version) ||
    state.version < 1 ||
    state.status !== expectedStatus ||
    state.cursorValue === null ||
    state.cursorObservedAt === null
  ) {
    fail('wrong_state', `watermark state is not ${expectedStatus}`);
  }
  return {
    cursor: normalizeHistoryId(state.cursorValue, 'state.cursorValue'),
    cursorObservedAt: normalizeTimestamp(
      state.cursorObservedAt,
      'state.cursorObservedAt',
    ),
  };
}

export function createCompanyGmailInboundSource(
  options: CompanyGmailInboundSourceOptions,
): CompanyTriggerSourceDefinition {
  const accountAlias = normalizeOpaqueKey(options.accountAlias, 'accountAlias');
  if (accountAlias.includes(':') || accountAlias.includes('@')) {
    fail('invalid_input', 'accountAlias must be a non-address alias');
  }
  return normalizeCompanyTriggerSource({
    kind: 'gmail',
    sourceSystem: 'gmail',
    sourceKey: `mailbox:${accountAlias}:inbound-v1`,
    adapterKey: 'gmail_inbound_full_snapshot',
    adapterVersion: COMPANY_GMAIL_RECONCILIATION_ADAPTER_VERSION,
    cursorKind: 'uint',
    reconciliationMode: 'full_snapshot',
    maxReconciliationWindowSeconds:
      COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS,
    freshnessBudgetSeconds: COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS,
    ownerKey: options.ownerKey,
    alertRouteKey: options.alertRouteKey,
  });
}

/** Construct a durable-gap proposal without moving the prior cursor. */
export function proposeCompanyGmailHistoryGap(
  input: CompanyGmailGapDetectionInput,
): CompanyTriggerWatermarkEvent {
  const source = requireInboundSource(input.source);
  const { cursor, cursorObservedAt } = requireStateCursor(
    source,
    input.state,
    'current',
  );
  if (input.state.openGapEventId !== null || input.state.lastEventId === null) {
    fail('wrong_state', 'current watermark state has invalid gap fields');
  }

  const notificationHistoryId = normalizeHistoryId(
    input.notificationHistoryId,
    'notificationHistoryId',
  );
  if (compareHistoryIds(notificationHistoryId, cursor) <= 0) {
    fail('invalid_input', 'notification history ID must advance the cursor');
  }
  const detectedAt = normalizeTimestamp(input.detectedAt, 'detectedAt');
  if (Date.parse(detectedAt) < Date.parse(cursorObservedAt)) {
    fail('invalid_input', 'gap detection predates the durable cursor');
  }

  const evidenceSha256 = hash([
    'company-gmail-history-gap:v1',
    source.definitionId,
    input.state.version,
    cursor,
    cursorObservedAt,
    notificationHistoryId,
    detectedAt,
    'history_expired',
  ]);
  const eventKey = `gmail:gap:${hash([
    'company-gmail-history-gap-key:v1',
    source.definitionId,
    cursor,
    notificationHistoryId,
    detectedAt,
  ])}`;

  return normalizeCompanyTriggerWatermarkEvent(source.cursorKind, {
    definitionId: source.definitionId,
    eventKey,
    eventType: 'gap_detected',
    expectedVersion: input.state.version,
    previousCursor: cursor,
    nextCursor: notificationHistoryId,
    observedFrom: cursorObservedAt,
    observedThrough: detectedAt,
    evidenceSha256,
    observedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    gapReason: 'history_expired',
    resolvesEventId: null,
  });
}

async function sourceCall<T>(
  label: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof CompanyGmailReconciliationError) throw error;
    fail('source_unavailable', `${label} failed`, error);
  }
}

function validateListPage(
  page: CompanyGmailSnapshotListPage,
): CompanyGmailSnapshotListPage {
  if (!page || !Array.isArray(page.messageIds)) {
    fail('invalid_candidate', 'Gmail snapshot page is incomplete');
  }
  if (page.messageIds.length > COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE) {
    fail('invalid_candidate', 'Gmail snapshot page exceeds the requested size');
  }
  if (
    page.nextPageToken !== null &&
    (typeof page.nextPageToken !== 'string' ||
      !PAGE_TOKEN_PATTERN.test(page.nextPageToken))
  ) {
    fail('invalid_candidate', 'Gmail snapshot page token is invalid');
  }
  return page;
}

function validateAccounting(
  value: CompanyGmailCandidateAccounting,
): CompanyGmailCandidateAccounting {
  if (
    !value ||
    !['accepted', 'rejected', 'unknown'].includes(value.disposition)
  ) {
    fail('candidate_unaccounted', 'candidate disposition is invalid');
  }
  const reasonKey = normalizeOpaqueKey(value.reasonKey, 'reasonKey');
  const evidenceSha256 = normalizeSha256(
    value.evidenceSha256,
    'candidate evidenceSha256',
  );
  if (value.disposition === 'unknown') {
    fail('candidate_unaccounted', 'Gmail snapshot candidate is unaccounted');
  }
  return {
    disposition: value.disposition,
    reasonKey,
    evidenceSha256,
  };
}

/**
 * Validate the immutable source/gap/time boundary before a Gmail call.
 *
 * The resumable shadow uses the same check at begin and again at completion;
 * it does not get a weaker recovery contract merely because paging spans more
 * than one bounded invocation.
 */
export function validateCompanyGmailReconciliationContext(
  input: CompanyGmailReconciliationInput,
  startedAtValue: string,
): CompanyGmailReconciliationContext {
  const source = requireInboundSource(input.source);
  const { cursor, cursorObservedAt } = requireStateCursor(
    source,
    input.state,
    'gap',
  );
  const gapEventId = normalizePositiveEventId(input.gap.eventId, 'gap.eventId');
  if (input.state.openGapEventId !== gapEventId) {
    fail('gap_mismatch', 'reconciliation does not bind the durable open gap');
  }
  const targetHistoryId = normalizeHistoryId(
    input.gap.targetHistoryId,
    'gap.targetHistoryId',
  );
  if (compareHistoryIds(targetHistoryId, cursor) <= 0) {
    fail('gap_mismatch', 'open gap target does not advance the durable cursor');
  }

  const startedAt = normalizeTimestamp(startedAtValue, 'snapshot startedAt');
  const gapAgeSeconds =
    (Date.parse(startedAt) - Date.parse(cursorObservedAt)) / 1000;
  if (gapAgeSeconds < 0) {
    fail(
      'invalid_input',
      'snapshot starts before the durable cursor observation',
    );
  }
  if (gapAgeSeconds > COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS) {
    fail('window_exceeded', 'Gmail gap exceeds the bounded recovery window');
  }

  return Object.freeze({
    source,
    cursor,
    cursorObservedAt,
    gapEventId,
    targetHistoryId,
    startedAt,
  });
}

export function validateCompanyGmailReconciliationHead(
  context: CompanyGmailReconciliationContext,
  historyIdValue: string,
): string {
  const historyId = normalizeHistoryId(historyIdValue, 'profile.historyId');
  if (compareHistoryIds(historyId, context.targetHistoryId) < 0) {
    fail('head_behind_gap', 'Gmail profile head is behind the open gap target');
  }
  return historyId;
}

/**
 * Construct the final proposal from a closed, content-free snapshot.
 *
 * This is the common proof boundary for the original one-shot reader and the
 * resumable shadow ledger. Neither caller can reconcile a gap without the same
 * exact stable-head, freshness, uniqueness, and accounting checks.
 */
export function proposeCompanyGmailSnapshotReconciliation(
  input: CompanyGmailReconciliationInput,
  snapshot: CompanyGmailClosedSnapshot,
): CompanyGmailReconciliationResult {
  const context = validateCompanyGmailReconciliationContext(
    input,
    snapshot.startedAt,
  );
  const beforeHead = validateCompanyGmailReconciliationHead(
    context,
    snapshot.beforeHistoryId,
  );
  const afterHead = normalizeHistoryId(
    snapshot.afterHistoryId,
    'profile.historyId',
  );
  if (afterHead !== beforeHead) {
    fail('head_changed', 'Gmail mailbox changed during the full snapshot');
  }

  const completedAt = normalizeTimestamp(
    snapshot.completedAt,
    'snapshot completedAt',
  );
  const elapsedSeconds =
    (Date.parse(completedAt) - Date.parse(context.startedAt)) / 1000;
  if (elapsedSeconds < 0) {
    fail('invalid_input', 'snapshot completion predates its start');
  }
  if (elapsedSeconds > COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS) {
    fail('freshness_exceeded', 'Gmail snapshot exceeded its freshness budget');
  }
  if (!Number.isSafeInteger(snapshot.pagesRead) || snapshot.pagesRead < 1) {
    fail('invalid_input', 'snapshot pagesRead is invalid');
  }
  if (!Array.isArray(snapshot.candidates)) {
    fail('invalid_input', 'snapshot candidates are invalid');
  }

  const seenMessageIds = new Set<string>();
  const accountingEvidence: Array<readonly [string, string, string, string]> =
    [];
  let acceptedCount = 0;
  let rejectedCount = 0;
  for (const rawReceipt of [...snapshot.candidates].sort((left, right) =>
    String(left?.messageId).localeCompare(String(right?.messageId)),
  )) {
    const messageId = normalizeMessageId(rawReceipt?.messageId);
    if (seenMessageIds.has(messageId)) {
      fail('duplicate_candidate', 'Gmail snapshot repeated a message ID');
    }
    seenMessageIds.add(messageId);
    const accounting = validateAccounting(rawReceipt);
    if (accounting.disposition === 'accepted') acceptedCount++;
    else rejectedCount++;
    accountingEvidence.push([
      messageId,
      accounting.disposition,
      accounting.reasonKey,
      accounting.evidenceSha256,
    ]);
  }

  const candidateCount = snapshot.candidates.length;
  if (candidateCount !== acceptedCount + rejectedCount) {
    fail('candidate_unaccounted', 'Gmail snapshot accounting is incomplete');
  }

  const evidenceSha256 = hash([
    'company-gmail-full-snapshot:v1',
    context.source.definitionId,
    context.gapEventId,
    context.cursor,
    context.cursorObservedAt,
    context.targetHistoryId,
    beforeHead,
    context.startedAt,
    completedAt,
    snapshot.pagesRead,
    COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
    true,
    accountingEvidence,
  ]);
  const eventKey = `gmail:reconcile:${hash([
    'company-gmail-full-snapshot-key:v1',
    context.source.definitionId,
    context.gapEventId,
    beforeHead,
    context.startedAt,
    completedAt,
    evidenceSha256,
  ])}`;
  const event = normalizeCompanyTriggerWatermarkEvent(
    context.source.cursorKind,
    {
      definitionId: context.source.definitionId,
      eventKey,
      eventType: 'gap_reconciled',
      expectedVersion: input.state.version,
      previousCursor: context.cursor,
      nextCursor: beforeHead,
      observedFrom: context.startedAt,
      observedThrough: completedAt,
      evidenceSha256,
      observedCount: candidateCount,
      acceptedCount,
      rejectedCount,
      gapReason: null,
      resolvesEventId: context.gapEventId,
    },
  );

  return Object.freeze({
    event,
    stableHistoryId: beforeHead,
    pagesRead: snapshot.pagesRead,
    candidateCount,
    acceptedCount,
    rejectedCount,
    evidenceSha256,
    actionAuthority: 'none' as const,
  });
}

/**
 * Read and account one terminal full-mailbox snapshot.
 *
 * Success means only that a `gap_reconciled` proposal is safe to submit. The
 * function never submits it. Every refusal throws before a proposal exists, so
 * the durable source remains frozen on its open gap.
 */
export async function reconcileCompanyGmailHistoryGap(
  input: CompanyGmailReconciliationInput,
  port: CompanyGmailReconciliationPort,
): Promise<CompanyGmailReconciliationResult> {
  const context = validateCompanyGmailReconciliationContext(input, port.now());

  const beforeProfile = await sourceCall('Gmail profile read', () =>
    port.getProfile(),
  );
  const beforeHead = validateCompanyGmailReconciliationHead(
    context,
    beforeProfile?.historyId,
  );

  const messageIds: string[] = [];
  const seenMessageIds = new Set<string>();
  const seenPageTokens = new Set<string>();
  let pageToken: string | null = null;
  let pagesRead = 0;

  for (
    let pageIndex = 0;
    pageIndex < COMPANY_GMAIL_RECONCILIATION_MAX_PAGES;
    pageIndex++
  ) {
    const page = validateListPage(
      await sourceCall('Gmail full snapshot page', () =>
        port.listMessages({
          pageToken,
          maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
          includeSpamTrash: true,
        }),
      ),
    );
    pagesRead++;

    for (const rawMessageId of page.messageIds) {
      const messageId = normalizeMessageId(rawMessageId);
      if (seenMessageIds.has(messageId)) {
        fail('duplicate_candidate', 'Gmail snapshot repeated a message ID');
      }
      seenMessageIds.add(messageId);
      messageIds.push(messageId);
    }

    if (page.nextPageToken === null) {
      pageToken = null;
      break;
    }
    if (seenPageTokens.has(page.nextPageToken)) {
      fail('pagination_cycle', 'Gmail snapshot repeated a page token');
    }
    seenPageTokens.add(page.nextPageToken);
    pageToken = page.nextPageToken;
  }

  if (pageToken !== null) {
    fail('page_limit', 'Gmail snapshot did not reach a terminal page');
  }

  const candidates: CompanyGmailCandidateReceipt[] = [];
  for (const messageId of [...messageIds].sort()) {
    const accounting = validateAccounting(
      await sourceCall('Gmail candidate accounting', () =>
        port.accountCandidate(messageId),
      ),
    );
    candidates.push({
      messageId,
      disposition: accounting.disposition,
      reasonKey: accounting.reasonKey,
      evidenceSha256: accounting.evidenceSha256,
    });
  }

  const afterProfile = await sourceCall('Gmail profile verification', () =>
    port.getProfile(),
  );
  return proposeCompanyGmailSnapshotReconciliation(input, {
    startedAt: context.startedAt,
    completedAt: port.now(),
    beforeHistoryId: beforeHead,
    afterHistoryId: afterProfile?.historyId,
    pagesRead,
    candidates,
  });
}
