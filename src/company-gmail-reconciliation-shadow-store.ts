/** PostgreSQL store for the unwired, content-free Gmail reconciliation shadow. */

import type { QueryResultRow } from 'pg';

import { withTransaction } from './business-db.js';
import {
  COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
  CompanyGmailReconciliationError,
  validateCompanyGmailReconciliationContext,
  validateCompanyGmailReconciliationHead,
  type CompanyGmailCandidateReceipt,
} from './company-gmail-reconciliation.js';
import {
  COMPANY_GMAIL_SHADOW_MAX_TOTAL_PAGES,
  CompanyGmailShadowError,
  deriveCompanyGmailShadowPageFingerprint,
  deriveCompanyGmailShadowSnapshotIdentity,
  hashCompanyGmailShadowPageToken,
  type CompanyGmailShadowBeginInput,
  type CompanyGmailShadowCompleteInput,
  type CompanyGmailShadowInvalidateInput,
  type CompanyGmailShadowInvalidReason,
  type CompanyGmailShadowPageInput,
  type CompanyGmailShadowSnapshot,
  type CompanyGmailShadowStatus,
  type CompanyGmailShadowStore,
  type CompanyGmailShadowStoreResult,
} from './company-gmail-reconciliation-shadow.js';
import type { CompanyTriggerClient } from './company-trigger.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;

interface ShadowSnapshotRow extends QueryResultRow {
  snapshot_id: string;
  snapshot_fingerprint: string;
  definition_id: string;
  source_fingerprint: string;
  gap_event_id: string;
  expected_watermark_version: string;
  previous_cursor: string;
  cursor_observed_at: string | Date;
  target_history_id: string;
  started_at: string | Date;
  initial_history_id: string;
  status: CompanyGmailShadowStatus;
  version: string;
  next_page_token: string | null;
  next_page_token_sha256: string | null;
  pages_read: number;
  candidate_count: number;
  accepted_count: number;
  rejected_count: number;
  completed_at: string | Date | null;
  final_history_id: string | null;
  reconciliation_evidence_sha256: string | null;
  proposed_event_fingerprint: string | null;
  invalid_reason: CompanyGmailShadowInvalidReason | null;
}

interface SourceGapRow extends QueryResultRow {
  source_fingerprint: string;
  version: string;
  status: string;
  cursor_value: string | null;
  cursor_observed_at: string | Date | null;
  open_gap_event_id: string | null;
  gap_event_type: string | null;
  gap_next_cursor: string | null;
}

interface PageFingerprintRow extends QueryResultRow {
  page_fingerprint: string;
}

interface CandidateRow extends QueryResultRow {
  gmail_message_id: string;
  disposition: 'accepted' | 'rejected';
  reason_key: string;
  evidence_sha256: string;
}

function fail(
  code: CompanyGmailShadowError['code'],
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailShadowError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function normalizeSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return value;
}

function normalizeVersion(value: unknown, field: string): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(number) || (number as number) < 0) {
    fail('conflict', `${field} is invalid`);
  }
  return number as number;
}

function normalizeCount(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail('conflict', `${field} is invalid`);
  }
  return value as number;
}

function normalizeTimestamp(value: string | Date | null): string | null {
  if (value === null) return null;
  const timestamp = new Date(value).toISOString();
  if (Number.isNaN(Date.parse(timestamp))) {
    fail('conflict', 'stored timestamp is invalid');
  }
  return timestamp;
}

function mapSnapshot(row: ShadowSnapshotRow): CompanyGmailShadowSnapshot {
  const candidateCount = normalizeCount(row.candidate_count, 'candidate_count');
  const acceptedCount = normalizeCount(row.accepted_count, 'accepted_count');
  const rejectedCount = normalizeCount(row.rejected_count, 'rejected_count');
  if (candidateCount !== acceptedCount + rejectedCount) {
    fail('conflict', 'stored snapshot accounting is invalid');
  }
  const snapshot = {
    snapshotId: normalizeSha256(row.snapshot_id, 'snapshot_id'),
    snapshotFingerprint: normalizeSha256(
      row.snapshot_fingerprint,
      'snapshot_fingerprint',
    ),
    definitionId: normalizeSha256(row.definition_id, 'definition_id'),
    sourceFingerprint: normalizeSha256(
      row.source_fingerprint,
      'source_fingerprint',
    ),
    gapEventId: row.gap_event_id,
    expectedWatermarkVersion: normalizeVersion(
      row.expected_watermark_version,
      'expected_watermark_version',
    ),
    previousCursor: row.previous_cursor,
    cursorObservedAt: normalizeTimestamp(row.cursor_observed_at)!,
    targetHistoryId: row.target_history_id,
    startedAt: normalizeTimestamp(row.started_at)!,
    initialHistoryId: row.initial_history_id,
    status: row.status,
    version: normalizeVersion(row.version, 'version'),
    resumeToken: row.next_page_token,
    resumeTokenSha256: row.next_page_token_sha256,
    pagesRead: normalizeCount(row.pages_read, 'pages_read'),
    candidateCount,
    acceptedCount,
    rejectedCount,
    completedAt: normalizeTimestamp(row.completed_at),
    finalHistoryId: row.final_history_id,
    reconciliationEvidenceSha256: row.reconciliation_evidence_sha256,
    proposedEventFingerprint: row.proposed_event_fingerprint,
    invalidReason: row.invalid_reason,
  } satisfies CompanyGmailShadowSnapshot;
  if (
    snapshot.version < snapshot.pagesRead ||
    snapshot.pagesRead > COMPANY_GMAIL_SHADOW_MAX_TOTAL_PAGES ||
    (snapshot.resumeToken === null) !== (snapshot.resumeTokenSha256 === null)
  ) {
    fail('conflict', 'stored snapshot state is invalid');
  }
  return Object.freeze(snapshot);
}

function validateCandidate(
  candidate: CompanyGmailCandidateReceipt,
): CompanyGmailCandidateReceipt {
  if (
    !candidate ||
    typeof candidate.messageId !== 'string' ||
    !MESSAGE_ID_PATTERN.test(candidate.messageId)
  ) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail snapshot contains an invalid message ID',
    );
  }
  if (
    candidate.disposition !== 'accepted' &&
    candidate.disposition !== 'rejected'
  ) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'Gmail snapshot candidate is unaccounted',
    );
  }
  if (!OPAQUE_KEY_PATTERN.test(candidate.reasonKey)) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'candidate reasonKey is invalid',
    );
  }
  normalizeSha256(candidate.evidenceSha256, 'candidate evidenceSha256');
  return { ...candidate };
}

function normalizePageInput(input: CompanyGmailShadowPageInput): {
  snapshotId: string;
  expectedVersion: number;
  requestPageToken: string | null;
  nextPageToken: string | null;
  candidates: CompanyGmailCandidateReceipt[];
} {
  const snapshotId = normalizeSha256(input.snapshotId, 'snapshotId');
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    fail('invalid_input', 'expectedVersion is invalid');
  }
  if (!input.page || !Array.isArray(input.page.messageIds)) {
    fail('invalid_input', 'snapshot page is invalid');
  }
  if (input.page.messageIds.length > COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE) {
    throw new CompanyGmailReconciliationError(
      'invalid_candidate',
      'Gmail snapshot page exceeds the requested size',
    );
  }
  if (input.page.messageIds.length !== input.candidates.length) {
    throw new CompanyGmailReconciliationError(
      'candidate_unaccounted',
      'Gmail page accounting is incomplete',
    );
  }
  const candidates = input.candidates.map(validateCandidate);
  const ids = new Set<string>();
  for (let index = 0; index < candidates.length; index++) {
    if (candidates[index].messageId !== input.page.messageIds[index]) {
      throw new CompanyGmailReconciliationError(
        'candidate_unaccounted',
        'Gmail page accounting order does not match candidates',
      );
    }
    if (ids.has(candidates[index].messageId)) {
      throw new CompanyGmailReconciliationError(
        'duplicate_candidate',
        'Gmail snapshot repeated a message ID',
      );
    }
    ids.add(candidates[index].messageId);
  }
  const requestPageToken = input.requestPageToken;
  const nextPageToken = input.page.nextPageToken;
  hashCompanyGmailShadowPageToken(requestPageToken);
  hashCompanyGmailShadowPageToken(nextPageToken);
  return {
    snapshotId,
    expectedVersion: input.expectedVersion,
    requestPageToken,
    nextPageToken,
    candidates,
  };
}

function sameSnapshotBinding(
  snapshot: CompanyGmailShadowSnapshot,
  expected: ReturnType<typeof snapshotIdentityInput>,
): boolean {
  return (
    snapshot.definitionId === expected.definitionId &&
    snapshot.sourceFingerprint === expected.sourceFingerprint &&
    snapshot.gapEventId === expected.gapEventId &&
    snapshot.expectedWatermarkVersion === expected.expectedWatermarkVersion &&
    snapshot.previousCursor === expected.previousCursor &&
    snapshot.cursorObservedAt === expected.cursorObservedAt &&
    snapshot.targetHistoryId === expected.targetHistoryId &&
    snapshot.initialHistoryId === expected.initialHistoryId
  );
}

function snapshotIdentityInput(input: CompanyGmailShadowBeginInput) {
  const context = validateCompanyGmailReconciliationContext(
    input.reconciliation,
    input.startedAt,
  );
  const initialHistoryId = validateCompanyGmailReconciliationHead(
    context,
    input.initialHistoryId,
  );
  return {
    definitionId: context.source.definitionId,
    sourceFingerprint: context.source.sourceFingerprint,
    gapEventId: context.gapEventId,
    expectedWatermarkVersion: input.reconciliation.state.version,
    previousCursor: context.cursor,
    cursorObservedAt: context.cursorObservedAt,
    targetHistoryId: context.targetHistoryId,
    startedAt: context.startedAt,
    initialHistoryId,
  };
}

const SNAPSHOT_COLUMNS = `snapshot_id, snapshot_fingerprint, definition_id,
       source_fingerprint, gap_event_id::text,
       expected_watermark_version::text, previous_cursor, cursor_observed_at,
       target_history_id, started_at, initial_history_id, status,
       version::text, next_page_token, next_page_token_sha256, pages_read,
       candidate_count, accepted_count, rejected_count, completed_at,
       final_history_id, reconciliation_evidence_sha256,
       proposed_event_fingerprint, invalid_reason`;

async function selectSnapshot(
  client: CompanyTriggerClient,
  snapshotId: string,
  forUpdate = false,
): Promise<CompanyGmailShadowSnapshot | null> {
  const result = await client.query<ShadowSnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS}
       FROM business_v2.company_gmail_reconciliation_snapshots
      WHERE snapshot_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [snapshotId],
  );
  return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
}

/** @internal The caller must provide a transaction-scoped client. */
export async function beginCompanyGmailShadowWithClient(
  client: CompanyTriggerClient,
  input: CompanyGmailShadowBeginInput,
): Promise<CompanyGmailShadowStoreResult> {
  const identityInput = snapshotIdentityInput(input);
  const identity = deriveCompanyGmailShadowSnapshotIdentity(identityInput);

  const authorityResult = await client.query<SourceGapRow>(
    `SELECT s.source_fingerprint, w.version::text, w.status,
            w.cursor_value, w.cursor_observed_at,
            w.open_gap_event_id::text,
            e.event_type AS gap_event_type, e.next_cursor AS gap_next_cursor
       FROM business_v2.company_trigger_sources s
       JOIN business_v2.company_trigger_watermark_state w
         ON w.definition_id = s.definition_id
       LEFT JOIN business_v2.company_trigger_watermark_events e
         ON e.definition_id = w.definition_id
        AND e.id = w.open_gap_event_id
      WHERE s.definition_id = $1
      FOR UPDATE OF w`,
    [identityInput.definitionId],
  );
  const authority = authorityResult.rows[0];
  if (!authority) fail('not_found', 'registered Gmail source is missing');
  const authorityObservedAt = normalizeTimestamp(authority.cursor_observed_at);
  if (
    authority.source_fingerprint !== identityInput.sourceFingerprint ||
    normalizeVersion(authority.version, 'watermark version') !==
      identityInput.expectedWatermarkVersion ||
    authority.status !== 'gap' ||
    authority.cursor_value !== identityInput.previousCursor ||
    authorityObservedAt !== identityInput.cursorObservedAt ||
    authority.open_gap_event_id !== identityInput.gapEventId ||
    authority.gap_event_type !== 'gap_detected' ||
    authority.gap_next_cursor !== identityInput.targetHistoryId
  ) {
    fail('conflict', 'durable Gmail source gap does not match shadow input');
  }

  const exact = await selectSnapshot(client, identity.snapshotId, true);
  if (exact) {
    if (!sameSnapshotBinding(exact, identityInput)) {
      fail(
        'conflict',
        'shadow snapshot identity was reused with different facts',
      );
    }
    return { snapshot: exact, applied: false, duplicate: true };
  }

  const active = await client.query<ShadowSnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS}
       FROM business_v2.company_gmail_reconciliation_snapshots
      WHERE definition_id = $1
        AND gap_event_id = $2
        AND status IN ('pending', 'listed')
      FOR UPDATE`,
    [identityInput.definitionId, identityInput.gapEventId],
  );
  if (active.rows[0]) {
    const snapshot = mapSnapshot(active.rows[0]);
    if (!sameSnapshotBinding(snapshot, identityInput)) {
      fail('conflict', 'another shadow attempt already owns this source gap');
    }
    return { snapshot, applied: false, duplicate: true };
  }

  const inserted = await client.query<ShadowSnapshotRow>(
    `INSERT INTO business_v2.company_gmail_reconciliation_snapshots
       (snapshot_id, snapshot_fingerprint, definition_id, source_fingerprint,
        gap_event_id, expected_watermark_version, previous_cursor,
        cursor_observed_at, target_history_id, started_at, initial_history_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SNAPSHOT_COLUMNS}`,
    [
      identity.snapshotId,
      identity.snapshotFingerprint,
      identityInput.definitionId,
      identityInput.sourceFingerprint,
      identityInput.gapEventId,
      identityInput.expectedWatermarkVersion,
      identityInput.previousCursor,
      identityInput.cursorObservedAt,
      identityInput.targetHistoryId,
      identityInput.startedAt,
      identityInput.initialHistoryId,
    ],
  );
  const row = inserted.rows[0];
  if (!row) fail('conflict', 'shadow snapshot insert returned no row');
  return { snapshot: mapSnapshot(row), applied: true, duplicate: false };
}

/** @internal The caller must provide a transaction-scoped client. */
export async function recordCompanyGmailShadowPageWithClient(
  client: CompanyTriggerClient,
  input: CompanyGmailShadowPageInput,
): Promise<CompanyGmailShadowStoreResult> {
  const normalized = normalizePageInput(input);
  const stored = await selectSnapshot(client, normalized.snapshotId, true);
  if (!stored) fail('not_found', 'shadow snapshot does not exist');

  const pageIndex = normalized.expectedVersion;
  const pageFingerprint = deriveCompanyGmailShadowPageFingerprint({
    snapshotId: normalized.snapshotId,
    pageIndex,
    requestPageToken: normalized.requestPageToken,
    nextPageToken: normalized.nextPageToken,
    candidates: normalized.candidates,
  });
  if (stored.version !== normalized.expectedVersion) {
    const replay = await client.query<PageFingerprintRow>(
      `SELECT page_fingerprint
         FROM business_v2.company_gmail_reconciliation_pages
        WHERE snapshot_id = $1 AND page_index = $2`,
      [normalized.snapshotId, pageIndex],
    );
    if (replay.rows[0]?.page_fingerprint === pageFingerprint) {
      return { snapshot: stored, applied: false, duplicate: true };
    }
    fail('stale_version', 'shadow snapshot version changed');
  }
  if (stored.status !== 'pending') {
    fail('wrong_status', 'shadow snapshot is not awaiting a page');
  }
  if (stored.pagesRead !== pageIndex) {
    fail('conflict', 'shadow page sequence is not contiguous');
  }
  if (stored.resumeToken !== normalized.requestPageToken) {
    fail('conflict', 'shadow resume token does not match durable state');
  }
  if (stored.pagesRead >= COMPANY_GMAIL_SHADOW_MAX_TOTAL_PAGES) {
    throw new CompanyGmailReconciliationError(
      'page_limit',
      'Gmail snapshot exceeded the total page ceiling',
    );
  }

  const requestTokenSha256 = hashCompanyGmailShadowPageToken(
    normalized.requestPageToken,
  );
  const nextTokenSha256 = hashCompanyGmailShadowPageToken(
    normalized.nextPageToken,
  );
  if (nextTokenSha256 !== null) {
    const repeated = await client.query(
      `SELECT 1
         FROM business_v2.company_gmail_reconciliation_pages
        WHERE snapshot_id = $1
          AND next_page_token_sha256 = $2
        LIMIT 1`,
      [normalized.snapshotId, nextTokenSha256],
    );
    if (repeated.rows[0]) {
      throw new CompanyGmailReconciliationError(
        'pagination_cycle',
        'Gmail snapshot repeated a page token',
      );
    }
  }

  const acceptedCount = normalized.candidates.filter(
    (candidate) => candidate.disposition === 'accepted',
  ).length;
  const rejectedCount = normalized.candidates.length - acceptedCount;
  await client.query(
    `INSERT INTO business_v2.company_gmail_reconciliation_pages
       (snapshot_id, page_index, page_fingerprint,
        request_page_token_sha256, next_page_token_sha256, candidate_count,
        accepted_count, rejected_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      normalized.snapshotId,
      pageIndex,
      pageFingerprint,
      requestTokenSha256,
      nextTokenSha256,
      normalized.candidates.length,
      acceptedCount,
      rejectedCount,
    ],
  );

  const receiptRows = normalized.candidates.map((candidate) => ({
    gmail_message_id: candidate.messageId,
    disposition: candidate.disposition,
    reason_key: candidate.reasonKey,
    evidence_sha256: candidate.evidenceSha256,
    candidate_fingerprint: deriveCompanyGmailShadowPageFingerprint({
      snapshotId: normalized.snapshotId,
      pageIndex,
      requestPageToken: null,
      nextPageToken: null,
      candidates: [candidate],
    }),
  }));
  const insertedCandidates = await client.query(
    `INSERT INTO business_v2.company_gmail_reconciliation_candidates
       (snapshot_id, gmail_message_id, page_index, disposition, reason_key,
        evidence_sha256, candidate_fingerprint)
     SELECT $1, receipt.gmail_message_id, $2, receipt.disposition,
            receipt.reason_key, receipt.evidence_sha256,
            receipt.candidate_fingerprint
       FROM jsonb_to_recordset($3::jsonb) AS receipt(
         gmail_message_id text, disposition text, reason_key text,
         evidence_sha256 text, candidate_fingerprint text
       )
     ON CONFLICT DO NOTHING`,
    [normalized.snapshotId, pageIndex, JSON.stringify(receiptRows)],
  );
  if (insertedCandidates.rowCount !== normalized.candidates.length) {
    throw new CompanyGmailReconciliationError(
      'duplicate_candidate',
      'Gmail snapshot repeated a message ID across pages',
    );
  }

  const nextStatus: CompanyGmailShadowStatus =
    normalized.nextPageToken === null ? 'listed' : 'pending';
  const updated = await client.query<ShadowSnapshotRow>(
    `UPDATE business_v2.company_gmail_reconciliation_snapshots
        SET status = $3,
            version = version + 1,
            next_page_token = $4,
            next_page_token_sha256 = $5,
            pages_read = pages_read + 1,
            candidate_count = candidate_count + $6,
            accepted_count = accepted_count + $7,
            rejected_count = rejected_count + $8,
            updated_at = now()
      WHERE snapshot_id = $1 AND version = $2 AND status = 'pending'
      RETURNING ${SNAPSHOT_COLUMNS}`,
    [
      normalized.snapshotId,
      normalized.expectedVersion,
      nextStatus,
      normalized.nextPageToken,
      nextTokenSha256,
      normalized.candidates.length,
      acceptedCount,
      rejectedCount,
    ],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) fail('stale_version', 'shadow snapshot update lost its CAS');
  return {
    snapshot: mapSnapshot(updatedRow),
    applied: true,
    duplicate: false,
  };
}

/** @internal The caller must provide a transaction-scoped client. */
export async function completeCompanyGmailShadowWithClient(
  client: CompanyTriggerClient,
  input: CompanyGmailShadowCompleteInput,
): Promise<CompanyGmailShadowStoreResult> {
  const snapshotId = normalizeSha256(input.snapshotId, 'snapshotId');
  const evidence = normalizeSha256(
    input.reconciliationEvidenceSha256,
    'reconciliationEvidenceSha256',
  );
  const eventFingerprint = normalizeSha256(
    input.proposedEventFingerprint,
    'proposedEventFingerprint',
  );
  const completedAt = new Date(input.completedAt).toISOString();
  const stored = await selectSnapshot(client, snapshotId, true);
  if (!stored) fail('not_found', 'shadow snapshot does not exist');
  if (stored.status === 'complete') {
    if (
      stored.completedAt === completedAt &&
      stored.finalHistoryId === input.finalHistoryId &&
      stored.reconciliationEvidenceSha256 === evidence &&
      stored.proposedEventFingerprint === eventFingerprint
    ) {
      return { snapshot: stored, applied: false, duplicate: true };
    }
    fail('conflict', 'completed shadow snapshot facts changed');
  }
  if (stored.version !== input.expectedVersion) {
    fail('stale_version', 'shadow snapshot version changed');
  }
  if (stored.status !== 'listed') {
    fail('wrong_status', 'shadow snapshot has not reached a terminal page');
  }
  if (input.finalHistoryId !== stored.initialHistoryId) {
    throw new CompanyGmailReconciliationError(
      'head_changed',
      'Gmail mailbox changed during the full snapshot',
    );
  }

  const updated = await client.query<ShadowSnapshotRow>(
    `UPDATE business_v2.company_gmail_reconciliation_snapshots
        SET status = 'complete', version = version + 1,
            completed_at = $3, final_history_id = $4,
            reconciliation_evidence_sha256 = $5,
            proposed_event_fingerprint = $6, updated_at = now()
      WHERE snapshot_id = $1 AND version = $2 AND status = 'listed'
      RETURNING ${SNAPSHOT_COLUMNS}`,
    [
      snapshotId,
      input.expectedVersion,
      completedAt,
      input.finalHistoryId,
      evidence,
      eventFingerprint,
    ],
  );
  if (!updated.rows[0]) fail('stale_version', 'shadow completion lost its CAS');
  return {
    snapshot: mapSnapshot(updated.rows[0]),
    applied: true,
    duplicate: false,
  };
}

/** @internal The caller must provide a transaction-scoped client. */
export async function invalidateCompanyGmailShadowWithClient(
  client: CompanyTriggerClient,
  input: CompanyGmailShadowInvalidateInput,
): Promise<CompanyGmailShadowStoreResult> {
  const snapshotId = normalizeSha256(input.snapshotId, 'snapshotId');
  const invalidatedAt = new Date(input.invalidatedAt).toISOString();
  const stored = await selectSnapshot(client, snapshotId, true);
  if (!stored) fail('not_found', 'shadow snapshot does not exist');
  if (stored.status === 'invalidated') {
    if (stored.invalidReason === input.invalidReason) {
      return { snapshot: stored, applied: false, duplicate: true };
    }
    fail('conflict', 'shadow invalidation reason changed');
  }
  if (stored.version !== input.expectedVersion) {
    fail('stale_version', 'shadow snapshot version changed');
  }
  if (stored.status === 'complete') {
    fail('wrong_status', 'completed shadow snapshot cannot be invalidated');
  }
  const updated = await client.query<ShadowSnapshotRow>(
    `UPDATE business_v2.company_gmail_reconciliation_snapshots
        SET status = 'invalidated', version = version + 1,
            next_page_token = NULL, next_page_token_sha256 = NULL,
            invalid_reason = $3, invalidated_at = $4, updated_at = now()
      WHERE snapshot_id = $1 AND version = $2
        AND status IN ('pending', 'listed')
      RETURNING ${SNAPSHOT_COLUMNS}`,
    [snapshotId, input.expectedVersion, input.invalidReason, invalidatedAt],
  );
  if (!updated.rows[0])
    fail('stale_version', 'shadow invalidation lost its CAS');
  return {
    snapshot: mapSnapshot(updated.rows[0]),
    applied: true,
    duplicate: false,
  };
}

export const companyGmailShadowPostgresStore: CompanyGmailShadowStore = {
  begin: (input) =>
    withTransaction((client) =>
      beginCompanyGmailShadowWithClient(client, input),
    ),
  get: async (snapshotId) => {
    const normalized = normalizeSha256(snapshotId, 'snapshotId');
    const snapshot = await withTransaction((client) =>
      selectSnapshot(client, normalized),
    );
    if (!snapshot) fail('not_found', 'shadow snapshot does not exist');
    return snapshot;
  },
  recordPage: (input) =>
    withTransaction((client) =>
      recordCompanyGmailShadowPageWithClient(client, input),
    ),
  listCandidates: async (snapshotId) => {
    const normalized = normalizeSha256(snapshotId, 'snapshotId');
    return withTransaction(async (client) => {
      const snapshot = await selectSnapshot(client, normalized);
      if (!snapshot) fail('not_found', 'shadow snapshot does not exist');
      const result = await client.query<CandidateRow>(
        `SELECT gmail_message_id, disposition, reason_key, evidence_sha256
           FROM business_v2.company_gmail_reconciliation_candidates
          WHERE snapshot_id = $1
          ORDER BY gmail_message_id`,
        [normalized],
      );
      return result.rows.map((row) =>
        validateCandidate({
          messageId: row.gmail_message_id,
          disposition: row.disposition,
          reasonKey: row.reason_key,
          evidenceSha256: row.evidence_sha256,
        }),
      );
    });
  },
  complete: (input) =>
    withTransaction((client) =>
      completeCompanyGmailShadowWithClient(client, input),
    ),
  invalidate: (input) =>
    withTransaction((client) =>
      invalidateCompanyGmailShadowWithClient(client, input),
    ),
};
