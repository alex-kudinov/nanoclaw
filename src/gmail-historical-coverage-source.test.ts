import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GMAIL_HISTORICAL_CLASSIFICATION_QUERY,
  GMAIL_HISTORICAL_SQLITE_QUERY,
  makeReadOnlyClassificationEvidenceReader,
  openReadOnlyGmailHistoricalCoverageSource,
} from './gmail-historical-coverage-source.js';
import { normalizeGmailInboundDispositionInput } from './gmail-inbound-disposition.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixtureDatabase(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-coverage-'));
  tempRoots.push(root);
  const file = path.join(root, 'messages.db');
  const database = new Database(file);
  database.exec(`
    CREATE TABLE messages (
      id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER,
      from_group TEXT,
      thread_ts TEXT,
      PRIMARY KEY (id, chat_jid)
    );
    CREATE TABLE gmail_inbound_disposition_receipts (
      contract_version INTEGER NOT NULL,
      source_key TEXT NOT NULL,
      gmail_message_id TEXT PRIMARY KEY,
      disposition TEXT NOT NULL,
      reason_key TEXT NOT NULL,
      source_evidence_sha256 TEXT NOT NULL,
      receipt_fingerprint TEXT NOT NULL UNIQUE,
      observed_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
  `);
  const insertMessage = database.prepare(`
    INSERT INTO messages (
      id, chat_jid, sender, sender_name, content, timestamp,
      is_from_me, is_bot_message, from_group, thread_ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const jid = 'gmail:private@example.invalid';
  insertMessage.run(
    'ordinary-id',
    jid,
    'private-sender@example.invalid',
    'Private Sender',
    'SECRET EMAIL BODY',
    '2026-08-18T00:00:00.000Z',
    0,
    0,
    null,
    'thread-1',
  );
  insertMessage.run(
    'route-id',
    jid,
    'private-route@example.invalid',
    'Private Route',
    'ANOTHER SECRET BODY',
    '2026-08-18T00:01:00.000Z',
    0,
    1,
    'mailman',
    'thread-2',
  );
  insertMessage.run(
    'outbound-id',
    jid,
    'private-outbound@example.invalid',
    'Private Outbound',
    'OUTBOUND SECRET BODY',
    '2026-08-18T00:02:00.000Z',
    1,
    1,
    'mailman',
    'thread-3',
  );
  insertMessage.run(
    'unsupported-id',
    jid,
    'private-unknown@example.invalid',
    'Private Unknown',
    'UNKNOWN SECRET BODY',
    '2026-08-18T00:03:00.000Z',
    null,
    0,
    null,
    'thread-4',
  );
  insertMessage.run(
    'other-mailbox-id',
    'gmail:other@example.invalid',
    'other@example.invalid',
    'Other',
    'OTHER MAILBOX BODY',
    '2026-08-18T00:04:00.000Z',
    0,
    0,
    null,
    'thread-5',
  );
  const normalized = normalizeGmailInboundDispositionInput({
    messageId: 'receipt-only-id',
    disposition: 'accepted',
    reasonKey: 'rule_auto_archive_completed',
    sourceEvidenceSha256: 'b'.repeat(64),
    observedAt: '2026-08-18T00:05:00.000Z',
  });
  database
    .prepare(
      `
      INSERT INTO gmail_inbound_disposition_receipts (
        contract_version, source_key, gmail_message_id, disposition,
        reason_key, source_evidence_sha256, receipt_fingerprint,
        observed_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      normalized.contractVersion,
      normalized.sourceKey,
      normalized.messageId,
      normalized.disposition,
      normalized.reasonKey,
      normalized.sourceEvidenceSha256,
      normalized.receiptFingerprint,
      normalized.observedAt,
      '2026-08-18T00:05:01.000Z',
    );
  database.close();
  return file;
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

describe('read-only retained Gmail SQLite source', () => {
  it('selects only content-free evidence for the exact mailbox and leaves the file unchanged', async () => {
    const sqlitePath = fixtureDatabase();
    const before = sha256(sqlitePath);
    const source = openReadOnlyGmailHistoricalCoverageSource({
      chatJid: 'gmail:private@example.invalid',
      maxIds: 20,
      sqlitePath,
    });
    expect(Object.keys(source).sort()).toEqual(['close', 'listCandidates']);
    const rows = await source.listCandidates();
    source.close();
    expect(sha256(sqlitePath)).toBe(before);
    expect(rows.map((row) => [row.messageId, row.storedEvidence])).toEqual([
      ['ordinary-id', 'ordinary_persisted'],
      ['outbound-id', 'outbound_stored'],
      ['receipt-only-id', 'absent'],
      ['route-id', 'direct_route_staged'],
      ['unsupported-id', 'unsupported_inbound_stored'],
    ]);
    expect(rows.every((row) => row.classificationRouted === false)).toBe(true);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('SECRET EMAIL BODY');
    expect(serialized).not.toContain('private-sender');
    expect(serialized).not.toContain('other-mailbox-id');
  });

  it('refuses a retained evidence set above the explicit ID bound', async () => {
    const source = openReadOnlyGmailHistoricalCoverageSource({
      chatJid: 'gmail:private@example.invalid',
      maxIds: 2,
      sqlitePath: fixtureDatabase(),
    });
    await expect(source.listCandidates()).rejects.toMatchObject({
      code: 'scope_incomplete',
    });
    source.close();
  });

  it('keeps content-bearing columns out of both database queries', () => {
    expect(GMAIL_HISTORICAL_SQLITE_QUERY).not.toMatch(
      /\b(sender|sender_name|content|subject)\b/i,
    );
    expect(GMAIL_HISTORICAL_CLASSIFICATION_QUERY).not.toMatch(
      /\b(sender_email|subject|reasoning)\b/i,
    );
  });
});

describe('read-only PostgreSQL classification source', () => {
  it('uses an explicit read-only transaction, selects bounded IDs, and always rolls back', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT gmail_message_id')) {
        return {
          rows: [
            {
              messageId: 'route-id',
              exactRoutedCount: 1,
              exactUnroutedCount: 0,
              otherClassifierCount: 0,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query, release });
    const reader = makeReadOnlyClassificationEvidenceReader({
      connect,
    } as never);

    await expect(reader(['route-id'])).resolves.toEqual([
      {
        messageId: 'route-id',
        exactRoutedCount: 1,
        exactUnroutedCount: 0,
        otherClassifierCount: 0,
      },
    ]);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN TRANSACTION READ ONLY',
      GMAIL_HISTORICAL_CLASSIFICATION_QUERY,
      'ROLLBACK',
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([['route-id']]);
    expect(release).toHaveBeenCalledOnce();
    expect(
      query.mock.calls.some(([sql]) =>
        /\b(INSERT|UPDATE|DELETE|COMMIT)\b/.test(sql),
      ),
    ).toBe(false);
  });

  it('rolls back and releases when the SELECT fails', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const reader = makeReadOnlyClassificationEvidenceReader({
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);
    await expect(reader(['route-id'])).rejects.toMatchObject({
      code: 'storage_unavailable',
    });
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });

  it('does not open PostgreSQL when no direct-route IDs exist', async () => {
    const connect = vi.fn();
    const reader = makeReadOnlyClassificationEvidenceReader({
      connect,
    } as never);
    await expect(reader([])).resolves.toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });
});
