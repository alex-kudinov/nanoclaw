import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { openReadOnlyGmailMailboxAuditAccounting } from './company-gmail-mailbox-audit-source.js';
import {
  hashGmailInboundSourceEvidence,
  normalizeGmailInboundDispositionInput,
} from './gmail-inbound-disposition.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-mailbox-audit-'));
  tempDirs.push(dir);
  const sqlitePath = path.join(dir, 'messages.db');
  const database = new Database(sqlitePath);
  database.exec(`
    CREATE TABLE gmail_inbound_disposition_receipts (
      contract_version INTEGER NOT NULL,
      source_key TEXT NOT NULL,
      gmail_message_id TEXT PRIMARY KEY,
      disposition TEXT NOT NULL,
      reason_key TEXT NOT NULL,
      source_evidence_sha256 TEXT NOT NULL,
      receipt_fingerprint TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `);
  const receipt = normalizeGmailInboundDispositionInput({
    messageId: 'accepted-1',
    disposition: 'accepted',
    reasonKey: 'inbound_message_persisted',
    sourceEvidenceSha256: hashGmailInboundSourceEvidence(
      'inbound_message_persisted',
      ['accepted-1'],
    ),
    observedAt: '2026-08-18T15:00:00.000Z',
  });
  database
    .prepare(
      `INSERT INTO gmail_inbound_disposition_receipts
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      receipt.contractVersion,
      receipt.sourceKey,
      receipt.messageId,
      receipt.disposition,
      receipt.reasonKey,
      receipt.sourceEvidenceSha256,
      receipt.receiptFingerprint,
      receipt.observedAt,
      '2026-08-18T15:00:01.000Z',
    );
  database.close();
  return sqlitePath;
}

describe('read-only Gmail mailbox audit accounting source', () => {
  it('returns exact terminal receipts and honest unknowns without writing SQLite', async () => {
    const sqlitePath = fixture();
    const before = fs.statSync(sqlitePath).mtimeMs;
    const source = openReadOnlyGmailMailboxAuditAccounting({ sqlitePath });
    try {
      expect(source.quickCheck()).toBe(true);
      await expect(
        source.accountCandidate('accepted-1'),
      ).resolves.toMatchObject({
        disposition: 'accepted',
        reasonKey: 'inbound_message_persisted',
      });
      await expect(source.accountCandidate('missing-1')).resolves.toMatchObject(
        {
          disposition: 'unknown',
          reasonKey: 'receipt_missing',
        },
      );
    } finally {
      source.close();
    }
    expect(fs.statSync(sqlitePath).mtimeMs).toBe(before);
  });
});
