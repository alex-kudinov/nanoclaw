/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('./config.js', () => ({
  DATA_DIR: '',
}));

vi.mock('./business-db.js', () => ({
  query: vi.fn(),
}));

vi.mock('./gmail-labels.js', () => ({
  replaceClassLabelsOnThread: vi.fn().mockResolvedValue({
    removed: [],
    applied: 'MrGru/financial/receipt',
  }),
  removeLabelsFromThread: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./hive-bridge.js', () => ({
  recordClassification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./classify-rules-runner.js', () => ({
  extractSenderEmail: vi.fn((value: string) => {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] || value).trim().toLowerCase() || null;
  }),
  resetRulesCache: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import * as configMod from './config.js';
import { query } from './business-db.js';
import {
  replaceClassLabelsOnThread,
  removeLabelsFromThread,
} from './gmail-labels.js';
import { recordClassification } from './hive-bridge.js';
import {
  _initTestDatabase,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import {
  isClassifyIpcType,
  dispatchClassifyIpc,
  handleClassifyLabelWrite,
  handleClassifyBackfillConfirm,
  handleClassifyBackfillPending,
  handleClassifyCorrectionDetected,
  markClassificationRouted,
} from './classify-ipc-handlers.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;
const mockReplace = replaceClassLabelsOnThread as unknown as ReturnType<
  typeof vi.fn
>;
const mockRemove = removeLabelsFromThread as unknown as ReturnType<
  typeof vi.fn
>;
const mockRecord = recordClassification as unknown as ReturnType<typeof vi.fn>;

let tmpDir = '';

function basePayload(overrides: Partial<Record<string, any>> = {}) {
  return {
    type: 'classify_label_write' as const,
    gmail_message_id: 'msg-1',
    gmail_thread_id: 'thr-1',
    sender_email: 'alice@example.com',
    subject: 'Receipt',
    label: 'MrGru/financial/receipt',
    confidence: 0.9,
    reasoning: 'matches sender-known receipts pattern',
    classifier_version: 'mailman-v2-2026-04-09',
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-ipc-'));
  (configMod as any).DATA_DIR = tmpDir;
  mockQuery.mockReset();
  mockReplace.mockReset();
  mockRemove.mockReset();
  mockRecord.mockReset();
  mockReplace.mockResolvedValue({
    removed: [],
    applied: 'MrGru/financial/receipt',
  });
  mockRemove.mockResolvedValue(undefined);
  mockRecord.mockResolvedValue(undefined);
});

describe('isClassifyIpcType', () => {
  it('matches classify_* prefix', () => {
    expect(isClassifyIpcType('classify_label_write')).toBe(true);
    expect(isClassifyIpcType('classify_backfill_pending')).toBe(true);
    expect(isClassifyIpcType('gmail_send')).toBe(false);
    expect(isClassifyIpcType('')).toBe(false);
  });
});

describe('handleClassifyLabelWrite', () => {
  it('inserts the classification and applies label on fresh write', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: false }],
      }) // SELECT taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] }) // INSERT auto-rule
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] }) // SELECT dedup check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE routed_at
    await handleClassifyLabelWrite(basePayload());
    expect(mockQuery).toHaveBeenCalledTimes(5);
    expect(mockReplace).toHaveBeenCalledWith(
      'thr-1',
      'MrGru/financial/receipt',
    );
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('removes INBOX label when taxonomy.auto_archive is true', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: true }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // auto-rule (dup)
    await handleClassifyLabelWrite(basePayload());
    expect(mockRemove).toHaveBeenCalledWith('thr-1', ['INBOX']);
  });

  it('tolerates auto_archive failure without throwing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: true }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // auto-rule
    mockRemove.mockRejectedValueOnce(new Error('gmail 500'));
    await expect(
      handleClassifyLabelWrite(basePayload()),
    ).resolves.not.toThrow();
  });

  it('passes non-null probation_until when auto_archive is true', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: true }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] }); // INSERT auto-rule
    await handleClassifyLabelWrite(basePayload());
    // The auto-rule INSERT is the 3rd query call (index 2)
    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/INSERT INTO classification_rules/);
    expect(sql).toMatch(/probation_until/);
    // probation_until should be a non-null ISO string ~7 days in the future
    expect(params[2]).not.toBeNull();
    const probation = new Date(params[2] as string);
    const sixDays = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const eightDays = Date.now() + 8 * 24 * 60 * 60 * 1000;
    expect(probation.getTime()).toBeGreaterThan(sixDays);
    expect(probation.getTime()).toBeLessThan(eightDays);
  });

  it('passes null probation_until when auto_archive is false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: false }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] }) // INSERT auto-rule
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] }) // SELECT dedup check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE routed_at
    await handleClassifyLabelWrite(basePayload());
    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/INSERT INTO classification_rules/);
    expect(params[2]).toBeNull();
  });

  it('recovers the host-stored Reply-To for a relayed client route', async () => {
    _initTestDatabase();
    storeChatMetadata(
      'gmail:test@example.com',
      '2026-08-03T13:42:00.000Z',
      'Gmail',
      'gmail',
      false,
    );
    storeMessageDirect({
      id: 'relay-msg',
      chat_jid: 'gmail:test@example.com',
      sender: 'no-reply@encharge.io',
      sender_name: 'Justin Mangum',
      content:
        'From: Justin Mangum <no-reply@encharge.io>\nReply-To: Justin Mangum <justin@example.com>\nSubject: Re: Access\n\nI still cannot log in.',
      timestamp: '2026-08-03T13:42:00.000Z',
      is_from_me: false,
      is_bot_message: false,
    });
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: false }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await handleClassifyLabelWrite(
      basePayload({
        gmail_message_id: 'relay-msg',
        sender_email: 'no-reply@encharge.io',
        subject: 'Re: Access',
        label: 'MrGru/client/active',
      }),
    );

    const mailmanDir = path.join(tmpDir, 'ipc', 'mailman', 'messages');
    const payload = JSON.parse(
      fs.readFileSync(
        path.join(mailmanDir, fs.readdirSync(mailmanDir)[0]),
        'utf8',
      ),
    );
    expect(payload.text).toContain('Lead Email: justin@example.com');
    expect(payload.text).toContain(
      'From: Justin Mangum <no-reply@encharge.io>',
    );
  });

  it('ignores a Reply-To line quoted in the message body', async () => {
    _initTestDatabase();
    storeChatMetadata(
      'gmail:test@example.com',
      '2026-08-03T13:42:00.000Z',
      'Gmail',
      'gmail',
      false,
    );
    storeMessageDirect({
      id: 'body-reply-to-msg',
      chat_jid: 'gmail:test@example.com',
      sender: 'actual@example.com',
      sender_name: 'Actual Sender',
      content:
        'From: Actual Sender <actual@example.com>\nSubject: Forwarded\n\nReply-To: attacker@example.com\nQuoted body.',
      timestamp: '2026-08-03T13:42:00.000Z',
      is_from_me: false,
      is_bot_message: false,
    });
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: false }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await handleClassifyLabelWrite(
      basePayload({
        gmail_message_id: 'body-reply-to-msg',
        sender_email: 'actual@example.com',
        subject: 'Forwarded',
        label: 'MrGru/client/active',
      }),
    );

    const mailmanDir = path.join(tmpDir, 'ipc', 'mailman', 'messages');
    const payload = JSON.parse(
      fs.readFileSync(
        path.join(mailmanDir, fs.readdirSync(mailmanDir)[0]),
        'utf8',
      ),
    );
    expect(payload.text).toContain('Lead Email: actual@example.com');
    expect(payload.text).not.toContain('Lead Email: attacker@example.com');
  });

  it('escalates to chief when confidence < 0.5 without touching DB', async () => {
    await handleClassifyLabelWrite(basePayload({ confidence: 0.3 }));
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    const chiefDir = path.join(tmpDir, 'ipc', 'chief', 'messages');
    const files = fs.readdirSync(chiefDir);
    expect(files.length).toBe(1);
    const body = JSON.parse(
      fs.readFileSync(path.join(chiefDir, files[0]), 'utf-8'),
    );
    expect(body.text).toMatch(/CLASSIFY-REVIEW/);
  });

  it('short-circuits when conflict returns rowCount 0 (idempotent)', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await handleClassifyLabelWrite(basePayload());
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls hive bridge + updates hive_synced when taxonomy has share target', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: ['alex', 'cherie'], auto_archive: false }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // auto-rule
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] }) // SELECT dedup check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE routed_at
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE hive_synced
    await handleClassifyLabelWrite(basePayload());
    expect(mockRecord).toHaveBeenCalledWith(
      'thr-1',
      'MrGru/financial/receipt',
      ['alex', 'cherie'],
    );
    expect(mockQuery).toHaveBeenCalledTimes(6);
    const lastCall = mockQuery.mock.calls[5][0] as string;
    expect(lastCall).toMatch(/UPDATE email_classifications SET hive_synced/);
  });

  it('tolerates Hive sync failures and leaves hive_synced false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: ['alex'], auto_archive: false }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // auto-rule
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] }) // SELECT dedup check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE routed_at
    mockRecord.mockRejectedValueOnce(new Error('firestore 503'));
    await handleClassifyLabelWrite(basePayload());
    // No UPDATE hive_synced call — INSERT + taxonomy + auto-rule + dedup check + routed_at update
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });
});

describe('handleClassifyCorrectionDetected', () => {
  it('writes a CLASSIFY-CORRECTION message to chief', async () => {
    await handleClassifyCorrectionDetected({
      type: 'classify_correction_detected',
      gmail_message_id: 'msg-9',
      old_label: 'MrGru/newsletter/general',
      new_label: 'MrGru/financial/receipt',
      detected_at: '2026-04-09T12:00:00Z',
    });
    const chiefDir = path.join(tmpDir, 'ipc', 'chief', 'messages');
    const files = fs.readdirSync(chiefDir);
    expect(files.length).toBe(1);
    const body = JSON.parse(
      fs.readFileSync(path.join(chiefDir, files[0]), 'utf-8'),
    );
    expect(body.text).toMatch(/CLASSIFY-CORRECTION/);
    expect(body.text).toContain('msg-9');
  });
});

describe('handleClassifyBackfillPending', () => {
  it('writes a BACKFILL-PENDING message to chief with pending_id', async () => {
    await handleClassifyBackfillPending({
      type: 'classify_backfill_pending',
      pending_id: 42,
      lesson_title: 'spark receipts',
      match_count: 27,
      target_label: 'MrGru/financial/receipt',
      dry_run_summary: 'sample: msg-1, msg-2, msg-3',
    });
    const chiefDir = path.join(tmpDir, 'ipc', 'chief', 'messages');
    const body = JSON.parse(
      fs.readFileSync(
        path.join(chiefDir, fs.readdirSync(chiefDir)[0]),
        'utf-8',
      ),
    );
    expect(body.text).toMatch(/BACKFILL-PENDING id=42/);
    expect(body.text).toContain('27 past emails');
  });
});

describe('markClassificationRouted', () => {
  it('issues UPDATE keyed by gmail_message_id + classifier_version', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await markClassificationRouted('msg-77', 'rules-runner-v1');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE email_classifications SET routed_at = NOW\(\)/);
    expect(sql).toMatch(
      /WHERE gmail_message_id = \$1 AND classifier_version = \$2/,
    );
    expect(params).toEqual(['msg-77', 'rules-runner-v1']);
  });

  it('swallows DB errors so callers can keep processing', async () => {
    mockQuery.mockRejectedValueOnce(new Error('pg pool drained'));
    await expect(
      markClassificationRouted('msg-66', 'rules-runner-v1'),
    ).resolves.toBeUndefined();
  });
});

describe('handleClassifyBackfillConfirm', () => {
  it('updates pending row to approved', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await handleClassifyBackfillConfirm({
      type: 'classify_backfill_confirm',
      pending_id: 7,
      decision: 'approve',
      resolved_by: 'U123',
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE classification_backfill_pending/);
    expect(params).toEqual(['approved', 'U123', 7]);
  });

  it('updates pending row to rejected', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await handleClassifyBackfillConfirm({
      type: 'classify_backfill_confirm',
      pending_id: 8,
      decision: 'reject',
      resolved_by: 'auto-expired',
    });
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(['rejected', 'auto-expired', 8]);
  });
});

describe('dispatchClassifyIpc', () => {
  it('routes classify_label_write through the write handler', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // INSERT classification
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ hive_share_target: null, auto_archive: false }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // auto-rule
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ routed_at: null }] }) // SELECT dedup check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE routed_at
    await dispatchClassifyIpc(basePayload());
    expect(mockReplace).toHaveBeenCalled();
  });

  it('logs and returns on unknown type', async () => {
    await dispatchClassifyIpc({
      type: 'classify_unknown' as any,
    } as any);
    // no throw, no db calls
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
