/**
 * Read-only retained-host source for NC-010 Gmail historical coverage.
 *
 * SQLite is opened with `readonly` + `fileMustExist`; PostgreSQL classification
 * evidence is read inside an explicit READ ONLY transaction that is always
 * rolled back. No selected column contains email content or an address.
 */

import path from 'node:path';

import Database from 'better-sqlite3';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { STORE_DIR } from './config.js';
import {
  GmailHistoricalCoverageError,
  type GmailHistoricalClassificationEvidence,
  type GmailHistoricalCoverageCandidate,
  type GmailHistoricalStoredEvidence,
} from './gmail-historical-coverage.js';
import {
  normalizeGmailInboundDispositionReceipt,
  type GmailInboundDispositionReceipt,
} from './gmail-inbound-disposition.js';

export const MAX_GMAIL_HISTORICAL_COVERAGE_IDS = 100_000;

export const GMAIL_HISTORICAL_SQLITE_QUERY = `
  WITH retained_ids AS (
    SELECT gmail_message_id AS message_id
      FROM gmail_inbound_disposition_receipts
    UNION
    SELECT id AS message_id
      FROM messages
     WHERE chat_jid = ?
  )
  SELECT retained_ids.message_id AS messageId,
         receipt.contract_version AS contractVersion,
         receipt.source_key AS sourceKey,
         receipt.disposition AS disposition,
         receipt.reason_key AS reasonKey,
         receipt.source_evidence_sha256 AS sourceEvidenceSha256,
         receipt.receipt_fingerprint AS receiptFingerprint,
         receipt.observed_at AS observedAt,
         receipt.recorded_at AS recordedAt,
         message.id AS storedMessageId,
         message.is_from_me AS isFromMe,
         message.is_bot_message AS isBotMessage,
         message.from_group AS fromGroup
    FROM retained_ids
    LEFT JOIN gmail_inbound_disposition_receipts receipt
      ON receipt.gmail_message_id = retained_ids.message_id
    LEFT JOIN messages message
      ON message.id = retained_ids.message_id
     AND message.chat_jid = ?
   ORDER BY retained_ids.message_id
   LIMIT ?
`;

export const GMAIL_HISTORICAL_CLASSIFICATION_QUERY = `
  SELECT gmail_message_id AS "messageId",
         COUNT(*) FILTER (
           WHERE classifier_version = 'rules-runner-v1'
             AND routed_at IS NOT NULL
         )::integer AS "exactRoutedCount",
         COUNT(*) FILTER (
           WHERE classifier_version = 'rules-runner-v1'
             AND routed_at IS NULL
         )::integer AS "exactUnroutedCount",
         COUNT(*) FILTER (
           WHERE classifier_version <> 'rules-runner-v1'
         )::integer AS "otherClassifierCount"
    FROM email_classifications
   WHERE gmail_message_id = ANY($1::text[])
   GROUP BY gmail_message_id
   ORDER BY gmail_message_id
`;

interface SqliteCoverageRow {
  messageId: string;
  contractVersion: number | null;
  sourceKey: string | null;
  disposition: string | null;
  reasonKey: string | null;
  sourceEvidenceSha256: string | null;
  receiptFingerprint: string | null;
  observedAt: string | null;
  recordedAt: string | null;
  storedMessageId: string | null;
  isFromMe: number | null;
  isBotMessage: number | null;
  fromGroup: string | null;
}

interface ClassificationEvidenceRow extends QueryResultRow {
  messageId: string;
  exactRoutedCount: number;
  exactUnroutedCount: number;
  otherClassifierCount: number;
}

function storedEvidence(row: SqliteCoverageRow): GmailHistoricalStoredEvidence {
  if (row.storedMessageId === null) return 'absent';
  if (row.isFromMe === 1) return 'outbound_stored';
  if (row.isFromMe !== 0) return 'unsupported_inbound_stored';
  if ((row.isBotMessage ?? 0) === 0) return 'ordinary_persisted';
  if (row.isBotMessage === 1 && row.fromGroup === 'mailman') {
    return 'direct_route_staged';
  }
  return 'unsupported_inbound_stored';
}

function receipt(
  row: SqliteCoverageRow,
): GmailInboundDispositionReceipt | null {
  if (row.contractVersion === null) return null;
  return normalizeGmailInboundDispositionReceipt({
    contractVersion: row.contractVersion,
    sourceKey: row.sourceKey,
    messageId: row.messageId,
    disposition: row.disposition,
    reasonKey: row.reasonKey,
    sourceEvidenceSha256: row.sourceEvidenceSha256,
    receiptFingerprint: row.receiptFingerprint,
    observedAt: row.observedAt,
    recordedAt: row.recordedAt,
  } as GmailInboundDispositionReceipt);
}

function boundedMaxIds(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_GMAIL_HISTORICAL_COVERAGE_IDS
  ) {
    throw new GmailHistoricalCoverageError(
      'invalid_input',
      `maxIds must be between 1 and ${MAX_GMAIL_HISTORICAL_COVERAGE_IDS}`,
    );
  }
  return value;
}

function exactGmailChatJid(value: string): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('gmail:') ||
    value.length < 7 ||
    value.length > 320
  ) {
    throw new GmailHistoricalCoverageError(
      'invalid_input',
      'Gmail historical coverage chat JID is invalid',
    );
  }
  return value;
}

export function openReadOnlyGmailHistoricalCoverageSource(options: {
  chatJid: string;
  maxIds: number;
  sqlitePath?: string;
}): {
  listCandidates(): Promise<readonly GmailHistoricalCoverageCandidate[]>;
  close(): void;
} {
  const chatJid = exactGmailChatJid(options.chatJid);
  const maxIds = boundedMaxIds(options.maxIds);
  const database = new Database(
    options.sqlitePath ?? path.join(STORE_DIR, 'messages.db'),
    { readonly: true, fileMustExist: true },
  );
  database.pragma('query_only = ON');
  return {
    async listCandidates() {
      let rows: SqliteCoverageRow[];
      try {
        rows = database
          .prepare(GMAIL_HISTORICAL_SQLITE_QUERY)
          .all(chatJid, chatJid, maxIds + 1) as SqliteCoverageRow[];
      } catch (error) {
        throw new GmailHistoricalCoverageError(
          'storage_unavailable',
          'retained Gmail coverage evidence is unavailable',
          { cause: error },
        );
      }
      if (rows.length > maxIds) {
        throw new GmailHistoricalCoverageError(
          'scope_incomplete',
          'retained Gmail coverage scope exceeds the explicit ID bound',
        );
      }
      return rows.map((row) => ({
        messageId: row.messageId,
        receipt: receipt(row),
        storedEvidence: storedEvidence(row),
        classificationRouted: false,
      }));
    },
    close: () => database.close(),
  };
}

type ReadOnlyPool = Pick<Pool, 'connect'>;
type ReadOnlyClient = Pick<PoolClient, 'query' | 'release'>;

async function rollback(client: ReadOnlyClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

export function makeReadOnlyClassificationEvidenceReader(pool: ReadOnlyPool) {
  return async function listClassificationEvidence(
    messageIds: readonly string[],
  ): Promise<readonly GmailHistoricalClassificationEvidence[]> {
    if (messageIds.length === 0) return [];
    const client: ReadOnlyClient = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      transactionOpen = true;
      const result = await client.query<ClassificationEvidenceRow>(
        GMAIL_HISTORICAL_CLASSIFICATION_QUERY,
        [messageIds],
      );
      await rollback(client);
      transactionOpen = false;
      return result.rows.map((row) => ({
        messageId: row.messageId,
        exactRoutedCount: Number(row.exactRoutedCount),
        exactUnroutedCount: Number(row.exactUnroutedCount),
        otherClassifierCount: Number(row.otherClassifierCount),
      }));
    } catch (error) {
      if (transactionOpen) await rollback(client);
      throw new GmailHistoricalCoverageError(
        'storage_unavailable',
        'classification route evidence is unavailable',
        { cause: error },
      );
    } finally {
      client.release();
    }
  };
}
