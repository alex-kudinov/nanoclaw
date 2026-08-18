/**
 * Gap-independent, read-only Gmail mailbox audit.
 *
 * This host-only module lists immutable Gmail IDs and compares them with
 * durable terminal disposition receipts. It never fetches message content,
 * advances a cursor, routes a message, creates work, or performs an action.
 */

import { createHash } from 'node:crypto';

import type { gmail_v1 } from 'googleapis';

import {
  COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS,
  COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
  CompanyGmailReconciliationError,
  type CompanyGmailCandidateAccounting,
  type CompanyGmailCandidateReceipt,
  type CompanyGmailSnapshotListPage,
  type CompanyGmailSnapshotListRequest,
} from './company-gmail-reconciliation.js';

export const COMPANY_GMAIL_MAILBOX_AUDIT_CONTRACT_VERSION = 1 as const;
export const COMPANY_GMAIL_MAILBOX_AUDIT_MAX_PAGES_PER_ADVANCE = 20 as const;
export const COMPANY_GMAIL_MAILBOX_AUDIT_MAX_TOTAL_PAGES = 10_000 as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const PAGE_TOKEN_PATTERN = /^[^\s\u0000-\u001f\u007f]{1,2048}$/;
const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;

export type CompanyGmailMailboxAuditStatus =
  | 'pending'
  | 'listed'
  | 'complete'
  | 'invalidated';

export type CompanyGmailMailboxAuditInvalidReason =
  | 'head_changed'
  | 'freshness_exceeded'
  | 'pagination_cycle'
  | 'duplicate_candidate'
  | 'page_limit'
  | 'source_drift';

export type CompanyGmailMailboxAuditErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'stale_version'
  | 'wrong_status'
  | 'storage_unavailable';

export class CompanyGmailMailboxAuditError extends Error {
  constructor(
    public readonly code: CompanyGmailMailboxAuditErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailMailboxAuditError';
  }
}

export interface CompanyGmailMailboxAuditSnapshot {
  auditId: string;
  auditFingerprint: string;
  definitionId: string;
  sourceFingerprint: string;
  expectedWatermarkVersion: number;
  cursorEvidenceSha256: string;
  startedAt: string;
  initialHistoryId: string;
  status: CompanyGmailMailboxAuditStatus;
  version: number;
  /** Opaque Gmail continuation token. Never log or expose to an agent. */
  resumeToken: string | null;
  resumeTokenSha256: string | null;
  pagesRead: number;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  unknownCount: number;
  completedAt: string | null;
  finalHistoryId: string | null;
  auditEvidenceSha256: string | null;
  invalidReason: CompanyGmailMailboxAuditInvalidReason | null;
}

export interface CompanyGmailMailboxAuditBeginInput {
  startedAt: string;
  initialHistoryId: string;
}

export interface CompanyGmailMailboxAuditPageInput {
  auditId: string;
  expectedVersion: number;
  requestPageToken: string | null;
  page: CompanyGmailSnapshotListPage;
  candidates: readonly CompanyGmailCandidateReceipt[];
}

export interface CompanyGmailMailboxAuditCompleteInput {
  auditId: string;
  expectedVersion: number;
  completedAt: string;
  finalHistoryId: string;
  auditEvidenceSha256: string;
}

export interface CompanyGmailMailboxAuditInvalidateInput {
  auditId: string;
  expectedVersion: number;
  invalidReason: CompanyGmailMailboxAuditInvalidReason;
  invalidatedAt: string;
}

export interface CompanyGmailMailboxAuditStoreResult {
  snapshot: CompanyGmailMailboxAuditSnapshot;
  applied: boolean;
  duplicate: boolean;
}

export interface CompanyGmailMailboxAuditStore {
  begin(
    input: CompanyGmailMailboxAuditBeginInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult>;
  get(auditId: string): Promise<CompanyGmailMailboxAuditSnapshot>;
  recordPage(
    input: CompanyGmailMailboxAuditPageInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult>;
  complete(
    input: CompanyGmailMailboxAuditCompleteInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult>;
  invalidate(
    input: CompanyGmailMailboxAuditInvalidateInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult>;
}

export interface CompanyGmailMailboxAuditPort {
  now(): string;
  getProfile(): Promise<{ historyId: string }>;
  listMessages(
    request: CompanyGmailSnapshotListRequest,
  ): Promise<CompanyGmailSnapshotListPage>;
  accountCandidate(messageId: string): Promise<CompanyGmailCandidateAccounting>;
}

export interface CompanyGmailMailboxAuditProgress {
  contractVersion: typeof COMPANY_GMAIL_MAILBOX_AUDIT_CONTRACT_VERSION;
  auditId: string;
  status: CompanyGmailMailboxAuditStatus;
  version: number;
  pagesRead: number;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  unknownCount: number;
  auditEvidenceSha256: string | null;
  invalidReason: CompanyGmailMailboxAuditInvalidReason | null;
  safety: {
    gmailReadScope: 'profile_and_unfiltered_id_listing_only';
    gmailContentRead: false;
    sqliteWritten: false;
    cursorWritten: false;
    messagesRecovered: 0;
    actionAuthority: 'none';
  };
}

function fail(
  code: CompanyGmailMailboxAuditErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailMailboxAuditError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function canonicalTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail('invalid_input', `${field} is invalid`);
  }
  const normalized = new Date(value).toISOString();
  if (value !== normalized)
    fail('invalid_input', `${field} must be canonical UTC`);
  return normalized;
}

function historyId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UINT_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return BigInt(value).toString();
}

function messageId(value: unknown): string {
  if (typeof value !== 'string' || !MESSAGE_ID_PATTERN.test(value)) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail mailbox audit contains an invalid message ID',
    );
  }
  return value;
}

function pageToken(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !PAGE_TOKEN_PATTERN.test(value)) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail mailbox audit page token is invalid',
    );
  }
  return value;
}

function accounting(
  idValue: unknown,
  value: CompanyGmailCandidateAccounting,
): CompanyGmailCandidateReceipt {
  const id = messageId(idValue);
  if (
    !value ||
    !['accepted', 'rejected', 'unknown'].includes(value.disposition)
  ) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'Gmail mailbox audit candidate is unaccounted',
    );
  }
  if (
    typeof value.reasonKey !== 'string' ||
    !OPAQUE_KEY_PATTERN.test(value.reasonKey) ||
    typeof value.evidenceSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.evidenceSha256)
  ) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'Gmail mailbox audit evidence is invalid',
    );
  }
  return { messageId: id, ...value };
}

export function hashCompanyGmailMailboxAuditPageToken(
  value: string | null,
): string | null {
  const normalized = pageToken(value);
  return normalized === null
    ? null
    : hash(['company-gmail-mailbox-audit-page-token:v1', normalized]);
}

export function deriveCompanyGmailMailboxAuditCursorEvidence(input: {
  definitionId: string;
  sourceFingerprint: string;
  watermarkVersion: number;
  cursorValue: string;
}): string {
  if (
    !SHA256_PATTERN.test(input.definitionId) ||
    !SHA256_PATTERN.test(input.sourceFingerprint) ||
    !Number.isSafeInteger(input.watermarkVersion) ||
    input.watermarkVersion < 1
  ) {
    fail('invalid_input', 'Gmail mailbox audit cursor binding is invalid');
  }
  const cursor = historyId(input.cursorValue, 'cursorValue');
  return hash([
    'company-gmail-mailbox-audit-cursor:v1',
    input.definitionId,
    input.sourceFingerprint,
    input.watermarkVersion,
    cursor,
  ]);
}

export function deriveCompanyGmailMailboxAuditIdentity(input: {
  definitionId: string;
  sourceFingerprint: string;
  expectedWatermarkVersion: number;
  cursorEvidenceSha256: string;
  startedAt: string;
  initialHistoryId: string;
}): { auditId: string; auditFingerprint: string } {
  if (
    !SHA256_PATTERN.test(input.definitionId) ||
    !SHA256_PATTERN.test(input.sourceFingerprint) ||
    !SHA256_PATTERN.test(input.cursorEvidenceSha256) ||
    !Number.isSafeInteger(input.expectedWatermarkVersion) ||
    input.expectedWatermarkVersion < 1
  ) {
    fail('invalid_input', 'Gmail mailbox audit identity is invalid');
  }
  const facts = [
    input.definitionId,
    input.sourceFingerprint,
    input.expectedWatermarkVersion,
    input.cursorEvidenceSha256,
    canonicalTimestamp(input.startedAt, 'startedAt'),
    historyId(input.initialHistoryId, 'initialHistoryId'),
  ] as const;
  return {
    auditId: hash(['company-gmail-mailbox-audit-id:v1', ...facts]),
    auditFingerprint: hash([
      'company-gmail-mailbox-audit-fingerprint:v1',
      ...facts,
    ]),
  };
}

export function deriveCompanyGmailMailboxAuditPageFingerprint(input: {
  auditId: string;
  pageIndex: number;
  requestPageToken: string | null;
  nextPageToken: string | null;
  candidates: readonly CompanyGmailCandidateReceipt[];
}): string {
  if (
    !SHA256_PATTERN.test(input.auditId) ||
    !Number.isSafeInteger(input.pageIndex) ||
    input.pageIndex < 0
  ) {
    fail('invalid_input', 'Gmail mailbox audit page identity is invalid');
  }
  return hash([
    'company-gmail-mailbox-audit-page:v1',
    input.auditId,
    input.pageIndex,
    hashCompanyGmailMailboxAuditPageToken(input.requestPageToken),
    hashCompanyGmailMailboxAuditPageToken(input.nextPageToken),
    input.candidates.map((candidate) => [
      candidate.messageId,
      candidate.disposition,
      candidate.reasonKey,
      candidate.evidenceSha256,
    ]),
  ]);
}

export function deriveCompanyGmailMailboxAuditCompletionEvidence(
  snapshot: CompanyGmailMailboxAuditSnapshot,
  finalHistoryId: string,
): string {
  return hash([
    'company-gmail-mailbox-audit-complete:v1',
    snapshot.auditId,
    snapshot.auditFingerprint,
    snapshot.pagesRead,
    snapshot.candidateCount,
    snapshot.acceptedCount,
    snapshot.rejectedCount,
    snapshot.unknownCount,
    snapshot.initialHistoryId,
    historyId(finalHistoryId, 'finalHistoryId'),
  ]);
}

function progress(
  snapshot: CompanyGmailMailboxAuditSnapshot,
): CompanyGmailMailboxAuditProgress {
  return Object.freeze({
    contractVersion: COMPANY_GMAIL_MAILBOX_AUDIT_CONTRACT_VERSION,
    auditId: snapshot.auditId,
    status: snapshot.status,
    version: snapshot.version,
    pagesRead: snapshot.pagesRead,
    candidateCount: snapshot.candidateCount,
    acceptedCount: snapshot.acceptedCount,
    rejectedCount: snapshot.rejectedCount,
    unknownCount: snapshot.unknownCount,
    auditEvidenceSha256: snapshot.auditEvidenceSha256,
    invalidReason: snapshot.invalidReason,
    safety: {
      gmailReadScope: 'profile_and_unfiltered_id_listing_only' as const,
      gmailContentRead: false as const,
      sqliteWritten: false as const,
      cursorWritten: false as const,
      messagesRecovered: 0 as const,
      actionAuthority: 'none' as const,
    },
  });
}

async function sourceCall<T>(
  label: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (
      error instanceof CompanyGmailMailboxAuditError ||
      error instanceof CompanyGmailReconciliationError
    ) {
      throw error;
    }
    throw new CompanyGmailReconciliationError(
      'source_unavailable',
      `${label} failed`,
      { cause: error },
    );
  }
}

export function createCompanyGmailMailboxAuditReadOnlyPort(
  gmail: gmail_v1.Gmail,
  options: {
    now(): string;
    accountCandidate(
      messageId: string,
    ): Promise<CompanyGmailCandidateAccounting>;
  },
): CompanyGmailMailboxAuditPort {
  return Object.freeze({
    now: options.now,
    getProfile: async () => {
      const response = await gmail.users.getProfile({ userId: 'me' });
      return { historyId: response.data.historyId ?? '' };
    },
    listMessages: async (request: CompanyGmailSnapshotListRequest) => {
      const params: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: 'me',
        maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
        includeSpamTrash: true,
      };
      if (request.pageToken !== null) params.pageToken = request.pageToken;
      const response = await gmail.users.messages.list(params);
      return {
        messageIds: (response.data.messages ?? []).map(
          (message) => message.id ?? '',
        ),
        nextPageToken: response.data.nextPageToken ?? null,
      };
    },
    accountCandidate: options.accountCandidate,
  });
}

export async function beginCompanyGmailMailboxAudit(
  port: CompanyGmailMailboxAuditPort,
  store: CompanyGmailMailboxAuditStore,
): Promise<CompanyGmailMailboxAuditProgress> {
  const startedAt = canonicalTimestamp(port.now(), 'now');
  const profile = await sourceCall('Gmail profile read', () =>
    port.getProfile(),
  );
  const initialHistoryId = historyId(profile?.historyId, 'profile.historyId');
  const result = await store.begin({ startedAt, initialHistoryId });
  return progress(result.snapshot);
}

function normalizePage(page: CompanyGmailSnapshotListPage) {
  if (!page || !Array.isArray(page.messageIds)) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail mailbox audit page is incomplete',
    );
  }
  if (page.messageIds.length > COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail mailbox audit page exceeds the requested size',
    );
  }
  const seen = new Set<string>();
  const messageIds = page.messageIds.map((value) => {
    const id = messageId(value);
    if (seen.has(id)) {
      throw new CompanyGmailReconciliationError(
        'duplicate_candidate',
        'Gmail mailbox audit repeated a message ID',
      );
    }
    seen.add(id);
    return id;
  });
  return { messageIds, nextPageToken: pageToken(page.nextPageToken) };
}

async function invalidate(
  store: CompanyGmailMailboxAuditStore,
  snapshot: CompanyGmailMailboxAuditSnapshot,
  invalidReason: CompanyGmailMailboxAuditInvalidReason,
  now: string,
): Promise<never> {
  await store.invalidate({
    auditId: snapshot.auditId,
    expectedVersion: snapshot.version,
    invalidReason,
    invalidatedAt: canonicalTimestamp(now, 'now'),
  });
  throw new CompanyGmailMailboxAuditError(
    'conflict',
    `Gmail mailbox audit invalidated: ${invalidReason}`,
  );
}

function requireFresh(snapshot: CompanyGmailMailboxAuditSnapshot, now: string) {
  const elapsed =
    Date.parse(canonicalTimestamp(now, 'now')) - Date.parse(snapshot.startedAt);
  return (
    elapsed >= 0 &&
    elapsed <= COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS * 1000
  );
}

export async function advanceCompanyGmailMailboxAudit(
  auditId: string,
  maxPages: number,
  port: CompanyGmailMailboxAuditPort,
  store: CompanyGmailMailboxAuditStore,
): Promise<CompanyGmailMailboxAuditProgress> {
  if (
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > COMPANY_GMAIL_MAILBOX_AUDIT_MAX_PAGES_PER_ADVANCE
  ) {
    fail('invalid_input', 'maxPages is invalid');
  }
  let snapshot = await store.get(auditId);
  if (snapshot.status === 'complete' || snapshot.status === 'invalidated') {
    return progress(snapshot);
  }

  for (let pageCount = 0; pageCount < maxPages; pageCount++) {
    const now = port.now();
    if (!requireFresh(snapshot, now)) {
      return invalidate(store, snapshot, 'freshness_exceeded', now);
    }
    if (snapshot.pagesRead >= COMPANY_GMAIL_MAILBOX_AUDIT_MAX_TOTAL_PAGES) {
      return invalidate(store, snapshot, 'page_limit', now);
    }
    const requestPageToken = snapshot.resumeToken;
    try {
      const page = normalizePage(
        await sourceCall('Gmail ID listing', () =>
          port.listMessages({
            pageToken: requestPageToken,
            maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
            includeSpamTrash: true,
          }),
        ),
      );
      const candidates = await Promise.all(
        page.messageIds.map(async (id) =>
          accounting(
            id,
            await sourceCall('durable disposition lookup', () =>
              port.accountCandidate(id),
            ),
          ),
        ),
      );
      const recorded = await store.recordPage({
        auditId: snapshot.auditId,
        expectedVersion: snapshot.version,
        requestPageToken,
        page,
        candidates,
      });
      snapshot = recorded.snapshot;
    } catch (error) {
      if (
        error instanceof CompanyGmailReconciliationError &&
        (error.code === 'pagination_cycle' ||
          error.code === 'duplicate_candidate')
      ) {
        return invalidate(store, snapshot, error.code, now);
      }
      throw error;
    }
    if (snapshot.status !== 'listed') continue;

    const completedAt = canonicalTimestamp(port.now(), 'now');
    if (!requireFresh(snapshot, completedAt)) {
      return invalidate(store, snapshot, 'freshness_exceeded', completedAt);
    }
    const finalProfile = await sourceCall('Gmail profile read', () =>
      port.getProfile(),
    );
    const finalHistoryId = historyId(
      finalProfile?.historyId,
      'profile.historyId',
    );
    if (finalHistoryId !== snapshot.initialHistoryId) {
      return invalidate(store, snapshot, 'head_changed', completedAt);
    }
    const completed = await store.complete({
      auditId: snapshot.auditId,
      expectedVersion: snapshot.version,
      completedAt,
      finalHistoryId,
      auditEvidenceSha256: deriveCompanyGmailMailboxAuditCompletionEvidence(
        snapshot,
        finalHistoryId,
      ),
    });
    return progress(completed.snapshot);
  }
  return progress(snapshot);
}
