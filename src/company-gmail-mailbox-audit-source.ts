/** Read-only SQLite terminal-receipt source for the Gmail mailbox audit. */

import path from 'node:path';

import Database from 'better-sqlite3';

import { STORE_DIR } from './config.js';
import type { CompanyGmailCandidateAccounting } from './company-gmail-reconciliation.js';
import {
  gmailInboundReceiptToCandidateAccounting,
  normalizeGmailInboundDispositionReceipt,
  type GmailInboundDispositionReceipt,
} from './gmail-inbound-disposition.js';

interface ReceiptRow {
  contractVersion: number;
  sourceKey: string;
  messageId: string;
  disposition: string;
  reasonKey: string;
  sourceEvidenceSha256: string;
  receiptFingerprint: string;
  observedAt: string;
  recordedAt: string;
}

export function openReadOnlyGmailMailboxAuditAccounting(options?: {
  sqlitePath?: string;
}): {
  accountCandidate(messageId: string): Promise<CompanyGmailCandidateAccounting>;
  quickCheck(): boolean;
  close(): void;
} {
  const database = new Database(
    options?.sqlitePath ?? path.join(STORE_DIR, 'messages.db'),
    { readonly: true, fileMustExist: true },
  );
  database.pragma('query_only = ON');
  const statement = database.prepare(
    `SELECT contract_version AS contractVersion,
            source_key AS sourceKey,
            gmail_message_id AS messageId,
            disposition,
            reason_key AS reasonKey,
            source_evidence_sha256 AS sourceEvidenceSha256,
            receipt_fingerprint AS receiptFingerprint,
            observed_at AS observedAt,
            recorded_at AS recordedAt
       FROM gmail_inbound_disposition_receipts
      WHERE gmail_message_id = ?`,
  );
  return {
    async accountCandidate(messageId) {
      const row = statement.get(messageId) as ReceiptRow | undefined;
      const receipt = row
        ? normalizeGmailInboundDispositionReceipt(
            row as GmailInboundDispositionReceipt,
          )
        : undefined;
      return gmailInboundReceiptToCandidateAccounting(messageId, receipt);
    },
    quickCheck: () => database.pragma('quick_check', { simple: true }) === 'ok',
    close: () => database.close(),
  };
}
