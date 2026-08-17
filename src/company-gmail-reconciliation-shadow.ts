/**
 * Resumable, read-only Company OS shadow for inbound Gmail gap recovery.
 *
 * This module is intentionally absent from every runtime entry point. Gmail
 * access is limited to users.getProfile and an unfiltered users.messages.list.
 * The injected store persists only opaque continuation state, immutable Gmail
 * IDs, dispositions, reason keys, and hashes. It cannot fetch message content,
 * recover a message, write a watermark, create work, or perform an action.
 */

import { createHash } from 'crypto';

import type { gmail_v1 } from 'googleapis';

import {
  COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS,
  COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
  CompanyGmailReconciliationError,
  proposeCompanyGmailSnapshotReconciliation,
  validateCompanyGmailReconciliationContext,
  validateCompanyGmailReconciliationHead,
  type CompanyGmailCandidateAccounting,
  type CompanyGmailCandidateReceipt,
  type CompanyGmailReconciliationInput,
  type CompanyGmailReconciliationPort,
  type CompanyGmailReconciliationResult,
  type CompanyGmailSnapshotListRequest,
  type CompanyGmailSnapshotListPage,
} from './company-gmail-reconciliation.js';

export const COMPANY_GMAIL_SHADOW_CONTRACT_VERSION = 1 as const;
export const COMPANY_GMAIL_SHADOW_MAX_PAGES_PER_ADVANCE = 20 as const;
export const COMPANY_GMAIL_SHADOW_MAX_TOTAL_PAGES = 10_000 as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const PAGE_TOKEN_PATTERN = /^[^\s\u0000-\u001f\u007f]{1,2048}$/;
const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;

export type CompanyGmailShadowStatus =
  | 'pending'
  | 'listed'
  | 'complete'
  | 'invalidated';

export type CompanyGmailShadowInvalidReason =
  | 'head_changed'
  | 'freshness_exceeded'
  | 'pagination_cycle'
  | 'duplicate_candidate'
  | 'page_limit';

export type CompanyGmailShadowErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'stale_version'
  | 'wrong_status'
  | 'storage_unavailable';

export class CompanyGmailShadowError extends Error {
  constructor(
    public readonly code: CompanyGmailShadowErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailShadowError';
  }
}

export interface CompanyGmailShadowSnapshot {
  snapshotId: string;
  snapshotFingerprint: string;
  definitionId: string;
  sourceFingerprint: string;
  gapEventId: string;
  expectedWatermarkVersion: number;
  previousCursor: string;
  cursorObservedAt: string;
  targetHistoryId: string;
  startedAt: string;
  initialHistoryId: string;
  status: CompanyGmailShadowStatus;
  version: number;
  /** Opaque Gmail continuation token. Never log or expose to an agent. */
  resumeToken: string | null;
  resumeTokenSha256: string | null;
  pagesRead: number;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  completedAt: string | null;
  finalHistoryId: string | null;
  reconciliationEvidenceSha256: string | null;
  proposedEventFingerprint: string | null;
  invalidReason: CompanyGmailShadowInvalidReason | null;
}

export interface CompanyGmailShadowBeginInput {
  reconciliation: CompanyGmailReconciliationInput;
  startedAt: string;
  initialHistoryId: string;
}

export interface CompanyGmailShadowPageInput {
  snapshotId: string;
  expectedVersion: number;
  requestPageToken: string | null;
  page: CompanyGmailSnapshotListPage;
  candidates: readonly CompanyGmailCandidateReceipt[];
}

export interface CompanyGmailShadowCompleteInput {
  snapshotId: string;
  expectedVersion: number;
  completedAt: string;
  finalHistoryId: string;
  reconciliationEvidenceSha256: string;
  proposedEventFingerprint: string;
}

export interface CompanyGmailShadowInvalidateInput {
  snapshotId: string;
  expectedVersion: number;
  invalidReason: CompanyGmailShadowInvalidReason;
  invalidatedAt: string;
}

export interface CompanyGmailShadowStoreResult {
  snapshot: CompanyGmailShadowSnapshot;
  applied: boolean;
  duplicate: boolean;
}

export interface CompanyGmailShadowStore {
  begin(
    input: CompanyGmailShadowBeginInput,
  ): Promise<CompanyGmailShadowStoreResult>;
  get(snapshotId: string): Promise<CompanyGmailShadowSnapshot>;
  recordPage(
    input: CompanyGmailShadowPageInput,
  ): Promise<CompanyGmailShadowStoreResult>;
  listCandidates(snapshotId: string): Promise<CompanyGmailCandidateReceipt[]>;
  complete(
    input: CompanyGmailShadowCompleteInput,
  ): Promise<CompanyGmailShadowStoreResult>;
  invalidate(
    input: CompanyGmailShadowInvalidateInput,
  ): Promise<CompanyGmailShadowStoreResult>;
}

export interface CompanyGmailShadowProgress {
  snapshotId: string;
  status: CompanyGmailShadowStatus;
  version: number;
  pagesRead: number;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  reconciliation: CompanyGmailReconciliationResult | null;
  actionAuthority: 'none';
}

export interface CompanyGmailReadOnlyPortOptions {
  now(): string;
  accountCandidate(messageId: string): Promise<CompanyGmailCandidateAccounting>;
}

function shadowFail(
  code: CompanyGmailShadowErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailShadowError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function normalizeSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    shadowFail('invalid_input', `${field} is invalid`);
  }
  return value;
}

function normalizeMessageId(value: unknown): string {
  if (typeof value !== 'string' || !MESSAGE_ID_PATTERN.test(value)) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail snapshot contains an invalid message ID',
    );
  }
  return value;
}

function normalizePageToken(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !PAGE_TOKEN_PATTERN.test(value)) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail snapshot page token is invalid',
    );
  }
  return value;
}

function normalizeAccounting(
  messageIdValue: unknown,
  value: CompanyGmailCandidateAccounting,
): CompanyGmailCandidateReceipt {
  const messageId = normalizeMessageId(messageIdValue);
  if (
    !value ||
    (value.disposition !== 'accepted' && value.disposition !== 'rejected')
  ) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'Gmail snapshot candidate is unaccounted',
    );
  }
  if (
    typeof value.reasonKey !== 'string' ||
    !OPAQUE_KEY_PATTERN.test(value.reasonKey)
  ) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'candidate reasonKey is invalid',
    );
  }
  return {
    messageId,
    disposition: value.disposition,
    reasonKey: value.reasonKey,
    evidenceSha256: normalizeSha256(
      value.evidenceSha256,
      'candidate evidenceSha256',
    ),
  };
}

function normalizePage(
  page: CompanyGmailSnapshotListPage,
): CompanyGmailSnapshotListPage {
  if (!page || !Array.isArray(page.messageIds)) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail snapshot page is incomplete',
    );
  }
  if (page.messageIds.length > COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail snapshot page exceeds the requested size',
    );
  }
  const seen = new Set<string>();
  const messageIds = page.messageIds.map((value) => {
    const id = normalizeMessageId(value);
    if (seen.has(id)) {
      throw new CompanyGmailReconciliationError(
        'duplicate_candidate',
        'Gmail snapshot repeated a message ID',
      );
    }
    seen.add(id);
    return id;
  });
  return {
    messageIds,
    nextPageToken: normalizePageToken(page.nextPageToken),
  };
}

function normalizePositivePageBudget(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > COMPANY_GMAIL_SHADOW_MAX_PAGES_PER_ADVANCE
  ) {
    shadowFail('invalid_input', 'maxPages is invalid');
  }
  return value as number;
}

function assertSnapshotBinding(
  snapshot: CompanyGmailShadowSnapshot,
  input: CompanyGmailReconciliationInput,
): void {
  const context = validateCompanyGmailReconciliationContext(
    input,
    snapshot.startedAt,
  );
  if (
    snapshot.definitionId !== context.source.definitionId ||
    snapshot.sourceFingerprint !== context.source.sourceFingerprint ||
    snapshot.gapEventId !== context.gapEventId ||
    snapshot.expectedWatermarkVersion !== input.state.version ||
    snapshot.previousCursor !== context.cursor ||
    snapshot.cursorObservedAt !== context.cursorObservedAt ||
    snapshot.targetHistoryId !== context.targetHistoryId
  ) {
    shadowFail('conflict', 'snapshot does not bind the exact source gap');
  }
  validateCompanyGmailReconciliationHead(context, snapshot.initialHistoryId);
}

function progress(
  snapshot: CompanyGmailShadowSnapshot,
  reconciliation: CompanyGmailReconciliationResult | null = null,
): CompanyGmailShadowProgress {
  return Object.freeze({
    snapshotId: snapshot.snapshotId,
    status: snapshot.status,
    version: snapshot.version,
    pagesRead: snapshot.pagesRead,
    candidateCount: snapshot.candidateCount,
    acceptedCount: snapshot.acceptedCount,
    rejectedCount: snapshot.rejectedCount,
    reconciliation,
    actionAuthority: 'none' as const,
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
      error instanceof CompanyGmailReconciliationError ||
      error instanceof CompanyGmailShadowError
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

/**
 * Exact Gmail API adapter for the read-only shadow.
 *
 * No q or labelIds field is ever sent. A null continuation token is omitted,
 * and no messages.get/modify/send method is reachable through this wrapper.
 */
export function createCompanyGmailReadOnlyPort(
  gmail: gmail_v1.Gmail,
  options: CompanyGmailReadOnlyPortOptions,
): CompanyGmailReconciliationPort {
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

/** Begin one immutable shadow attempt after a read-only profile check. */
export async function beginCompanyGmailReconciliationShadow(
  reconciliation: CompanyGmailReconciliationInput,
  port: CompanyGmailReconciliationPort,
  store: CompanyGmailShadowStore,
): Promise<CompanyGmailShadowProgress> {
  const startedAt = port.now();
  const context = validateCompanyGmailReconciliationContext(
    reconciliation,
    startedAt,
  );
  const profile = await sourceCall('Gmail profile read', () =>
    port.getProfile(),
  );
  const initialHistoryId = validateCompanyGmailReconciliationHead(
    context,
    profile?.historyId,
  );
  const result = await store.begin({
    reconciliation,
    startedAt: context.startedAt,
    initialHistoryId,
  });
  assertSnapshotBinding(result.snapshot, reconciliation);
  return progress(result.snapshot);
}

async function invalidateAndThrow(
  store: CompanyGmailShadowStore,
  snapshot: CompanyGmailShadowSnapshot,
  reason: CompanyGmailShadowInvalidReason,
  error: CompanyGmailReconciliationError,
  now: string,
): Promise<never> {
  await store.invalidate({
    snapshotId: snapshot.snapshotId,
    expectedVersion: snapshot.version,
    invalidReason: reason,
    invalidatedAt: now,
  });
  throw error;
}

function ensureFresh(snapshot: CompanyGmailShadowSnapshot, now: string): void {
  const elapsed = (Date.parse(now) - Date.parse(snapshot.startedAt)) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    shadowFail('invalid_input', 'shadow clock is invalid');
  }
  if (elapsed > COMPANY_GMAIL_RECONCILIATION_FRESHNESS_SECONDS) {
    throw new CompanyGmailReconciliationError(
      'freshness_exceeded',
      'Gmail snapshot exceeded its freshness budget',
    );
  }
}

async function finishListedSnapshot(
  reconciliation: CompanyGmailReconciliationInput,
  port: CompanyGmailReconciliationPort,
  store: CompanyGmailShadowStore,
  snapshot: CompanyGmailShadowSnapshot,
): Promise<CompanyGmailShadowProgress> {
  const context = validateCompanyGmailReconciliationContext(
    reconciliation,
    snapshot.startedAt,
  );
  const profile = await sourceCall('Gmail profile verification', () =>
    port.getProfile(),
  );
  const completedAt = port.now();
  ensureFresh(snapshot, completedAt);
  const finalHistoryId = validateCompanyGmailReconciliationHead(
    context,
    profile?.historyId,
  );
  if (finalHistoryId !== snapshot.initialHistoryId) {
    return invalidateAndThrow(
      store,
      snapshot,
      'head_changed',
      new CompanyGmailReconciliationError(
        'head_changed',
        'Gmail mailbox changed during the full snapshot',
      ),
      completedAt,
    );
  }

  const candidates = await store.listCandidates(snapshot.snapshotId);
  if (
    candidates.length !== snapshot.candidateCount ||
    candidates.filter((item) => item.disposition === 'accepted').length !==
      snapshot.acceptedCount ||
    candidates.filter((item) => item.disposition === 'rejected').length !==
      snapshot.rejectedCount
  ) {
    shadowFail('conflict', 'durable candidate accounting does not match state');
  }

  const proposal = proposeCompanyGmailSnapshotReconciliation(reconciliation, {
    startedAt: snapshot.startedAt,
    completedAt,
    beforeHistoryId: snapshot.initialHistoryId,
    afterHistoryId: finalHistoryId,
    pagesRead: snapshot.pagesRead,
    candidates,
  });
  const completed = await store.complete({
    snapshotId: snapshot.snapshotId,
    expectedVersion: snapshot.version,
    completedAt,
    finalHistoryId,
    reconciliationEvidenceSha256: proposal.evidenceSha256,
    proposedEventFingerprint: proposal.event.eventFingerprint,
  });
  return progress(completed.snapshot, proposal);
}

/**
 * Advance at most twenty pages and return sanitized progress.
 *
 * A non-terminal chunk remains pending and never emits a watermark proposal.
 * A terminal chunk is rechecked against users.getProfile and the durable
 * candidate ledger before the common NC-005 proof function can emit one.
 */
export async function advanceCompanyGmailReconciliationShadow(
  reconciliation: CompanyGmailReconciliationInput,
  snapshotId: string,
  maxPages: number,
  port: CompanyGmailReconciliationPort,
  store: CompanyGmailShadowStore,
): Promise<CompanyGmailShadowProgress> {
  const pageBudget = normalizePositivePageBudget(maxPages);
  let snapshot = await store.get(normalizeSha256(snapshotId, 'snapshotId'));
  assertSnapshotBinding(snapshot, reconciliation);

  if (snapshot.status === 'complete') {
    if (
      snapshot.completedAt === null ||
      snapshot.finalHistoryId === null ||
      snapshot.reconciliationEvidenceSha256 === null ||
      snapshot.proposedEventFingerprint === null
    ) {
      shadowFail('conflict', 'completed snapshot is missing proof fields');
    }
    const candidates = await store.listCandidates(snapshot.snapshotId);
    const proposal = proposeCompanyGmailSnapshotReconciliation(reconciliation, {
      startedAt: snapshot.startedAt,
      completedAt: snapshot.completedAt,
      beforeHistoryId: snapshot.initialHistoryId,
      afterHistoryId: snapshot.finalHistoryId,
      pagesRead: snapshot.pagesRead,
      candidates,
    });
    if (
      proposal.evidenceSha256 !== snapshot.reconciliationEvidenceSha256 ||
      proposal.event.eventFingerprint !== snapshot.proposedEventFingerprint
    ) {
      shadowFail(
        'conflict',
        'completed snapshot proof does not match receipts',
      );
    }
    return progress(snapshot, proposal);
  }
  if (snapshot.status === 'invalidated') {
    shadowFail('wrong_status', 'shadow snapshot is invalidated');
  }

  const resumeCheckedAt = port.now();
  try {
    ensureFresh(snapshot, resumeCheckedAt);
  } catch (error) {
    if (
      error instanceof CompanyGmailReconciliationError &&
      error.code === 'freshness_exceeded'
    ) {
      return invalidateAndThrow(
        store,
        snapshot,
        'freshness_exceeded',
        error,
        resumeCheckedAt,
      );
    }
    throw error;
  }

  const profile = await sourceCall('Gmail profile read', () =>
    port.getProfile(),
  );
  const context = validateCompanyGmailReconciliationContext(
    reconciliation,
    snapshot.startedAt,
  );
  const currentHistoryId = validateCompanyGmailReconciliationHead(
    context,
    profile?.historyId,
  );
  if (currentHistoryId !== snapshot.initialHistoryId) {
    return invalidateAndThrow(
      store,
      snapshot,
      'head_changed',
      new CompanyGmailReconciliationError(
        'head_changed',
        'Gmail mailbox changed during the resumable snapshot',
      ),
      resumeCheckedAt,
    );
  }

  if (snapshot.status === 'listed') {
    return finishListedSnapshot(reconciliation, port, store, snapshot);
  }

  for (let index = 0; index < pageBudget; index++) {
    if (snapshot.pagesRead >= COMPANY_GMAIL_SHADOW_MAX_TOTAL_PAGES) {
      return invalidateAndThrow(
        store,
        snapshot,
        'page_limit',
        new CompanyGmailReconciliationError(
          'page_limit',
          'Gmail snapshot exceeded the total page ceiling',
        ),
        port.now(),
      );
    }

    const requestPageToken = snapshot.resumeToken;
    const page = normalizePage(
      await sourceCall('Gmail full snapshot page', () =>
        port.listMessages({
          pageToken: requestPageToken,
          maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
          includeSpamTrash: true,
        }),
      ),
    );
    const candidates: CompanyGmailCandidateReceipt[] = [];
    for (const messageId of page.messageIds) {
      const accounting = await sourceCall('Gmail candidate accounting', () =>
        port.accountCandidate(messageId),
      );
      candidates.push(normalizeAccounting(messageId, accounting));
    }

    try {
      const stored = await store.recordPage({
        snapshotId: snapshot.snapshotId,
        expectedVersion: snapshot.version,
        requestPageToken,
        page,
        candidates,
      });
      snapshot = stored.snapshot;
    } catch (error) {
      if (
        error instanceof CompanyGmailReconciliationError &&
        (error.code === 'pagination_cycle' ||
          error.code === 'duplicate_candidate')
      ) {
        return invalidateAndThrow(
          store,
          snapshot,
          error.code,
          error,
          port.now(),
        );
      }
      throw error;
    }

    if (snapshot.status === 'listed') {
      return finishListedSnapshot(reconciliation, port, store, snapshot);
    }
  }

  return progress(snapshot);
}

export function deriveCompanyGmailShadowSnapshotIdentity(input: {
  definitionId: string;
  sourceFingerprint: string;
  gapEventId: string;
  expectedWatermarkVersion: number;
  previousCursor: string;
  cursorObservedAt: string;
  targetHistoryId: string;
  startedAt: string;
  initialHistoryId: string;
}): { snapshotId: string; snapshotFingerprint: string } {
  const ordered = [
    COMPANY_GMAIL_SHADOW_CONTRACT_VERSION,
    input.definitionId,
    input.sourceFingerprint,
    input.gapEventId,
    input.expectedWatermarkVersion,
    input.previousCursor,
    input.cursorObservedAt,
    input.targetHistoryId,
    input.startedAt,
    input.initialHistoryId,
  ] as const;
  if (
    !SHA256_PATTERN.test(input.definitionId) ||
    !SHA256_PATTERN.test(input.sourceFingerprint) ||
    !UINT_PATTERN.test(input.gapEventId) ||
    !UINT_PATTERN.test(input.previousCursor) ||
    !UINT_PATTERN.test(input.targetHistoryId) ||
    !UINT_PATTERN.test(input.initialHistoryId) ||
    !Number.isSafeInteger(input.expectedWatermarkVersion) ||
    input.expectedWatermarkVersion < 1
  ) {
    shadowFail('invalid_input', 'shadow snapshot identity is invalid');
  }
  const snapshotFingerprint = hash([
    'company-gmail-shadow-snapshot-fingerprint:v1',
    ...ordered,
  ]);
  return {
    snapshotId: hash(['company-gmail-shadow-snapshot-id:v1', ...ordered]),
    snapshotFingerprint,
  };
}

export function deriveCompanyGmailShadowPageFingerprint(input: {
  snapshotId: string;
  pageIndex: number;
  requestPageToken: string | null;
  nextPageToken: string | null;
  candidates: readonly CompanyGmailCandidateReceipt[];
}): string {
  return hash([
    'company-gmail-shadow-page:v1',
    input.snapshotId,
    input.pageIndex,
    input.requestPageToken === null
      ? null
      : hash(['company-gmail-shadow-token:v1', input.requestPageToken]),
    input.nextPageToken === null
      ? null
      : hash(['company-gmail-shadow-token:v1', input.nextPageToken]),
    input.candidates.map((candidate) => [
      candidate.messageId,
      candidate.disposition,
      candidate.reasonKey,
      candidate.evidenceSha256,
    ]),
  ]);
}

export function hashCompanyGmailShadowPageToken(
  token: string | null,
): string | null {
  const normalized = normalizePageToken(token);
  return normalized === null
    ? null
    : hash(['company-gmail-shadow-token:v1', normalized]);
}
