/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// vi.mock factories are hoisted above imports, so closure references to
// top-level consts fail with "cannot access before initialization". Async
// factories can use dynamic imports safely.
vi.mock('./config.js', async () => {
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  return { DATA_DIR: join(tmpdir(), `reaper-test-${process.pid}`) };
});

const TMP_DATA_DIR = path.join(os.tmpdir(), `reaper-test-${process.pid}`);
fs.mkdirSync(TMP_DATA_DIR, { recursive: true });

afterAll(() => {
  fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
});

const mockQuery = vi.fn();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

const mockRecord = vi.fn();
vi.mock('./hive-bridge.js', () => ({
  recordClassification: (...args: any[]) => mockRecord(...args),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('./db.js', () => ({
  getAllRegisteredGroups: () => ({
    'slack:C0AHDHX1NBH': {
      jid: 'slack:C0AHDHX1NBH',
      name: 'gru-chief',
      folder: 'chief',
      triggerPattern: '@Mr Gru',
      addedAt: '2026-01-01',
      requiresTrigger: false,
      isMain: false,
    },
  }),
}));

import { runReaper } from './hive-sync-reaper.js';
import { ExternalWriteDeniedError } from './action-safety.js';

function staleRow(overrides: Record<string, any> = {}) {
  return {
    gmail_message_id: 'msg-1',
    gmail_thread_id: 'thr-1',
    label: 'MrGru/financial/receipt',
    reaper_attempts: 0,
    hive_share_target: ['cherie'],
    ...overrides,
  };
}

function chiefMessagesDir(): string {
  return path.join(TMP_DATA_DIR, 'ipc', 'chief', 'messages');
}

function listChiefMessages(): string[] {
  if (!fs.existsSync(chiefMessagesDir())) return [];
  return fs
    .readdirSync(chiefMessagesDir())
    .filter((f) => f.startsWith('reaper-') && f.endsWith('.json'));
}

function readChiefMessage(name: string): { type: string; text: string } {
  return JSON.parse(
    fs.readFileSync(path.join(chiefMessagesDir(), name), 'utf-8'),
  );
}

function clearChiefMessages(): void {
  if (fs.existsSync(chiefMessagesDir())) {
    for (const f of listChiefMessages()) {
      fs.unlinkSync(path.join(chiefMessagesDir(), f));
    }
  }
}

beforeEach(() => {
  mockQuery.mockReset();
  mockRecord.mockReset();
  clearChiefMessages();
});

describe('runReaper', () => {
  it('returns zeros when no stale rows exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await runReaper();
    expect(res).toEqual({
      processed: 0,
      recovered: 0,
      held: 0,
      retried: 0,
      deadLettered: 0,
      deadLetterDetails: [],
    });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(listChiefMessages()).toEqual([]);
  });

  it('recovers a row on successful retry and marks hive_synced', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [staleRow()] }) // fetchStaleRows
      .mockResolvedValueOnce({ rows: [] }); // markSuccess UPDATE
    mockRecord.mockResolvedValueOnce(undefined);
    const res = await runReaper();
    expect(res.recovered).toBe(1);
    expect(res.deadLettered).toBe(0);
    expect(mockRecord).toHaveBeenCalledWith(
      'thr-1',
      'MrGru/financial/receipt',
      ['cherie'],
    );
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/hive_synced = TRUE/);
    expect(updateCall[1]).toEqual(['msg-1']);
  });

  it('increments reaper_attempts on failure without dead-lettering below threshold', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [staleRow({ reaper_attempts: 2 })] })
      .mockResolvedValueOnce({ rows: [] }); // markFailure UPDATE
    mockRecord.mockRejectedValueOnce(new Error('firestore: transient'));
    const res = await runReaper();
    expect(res.retried).toBe(1);
    expect(res.deadLettered).toBe(0);
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[1]).toEqual([3, false, 'msg-1']);
  });

  it('holds a safety-denied row without consuming retries or alerting', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [staleRow({ reaper_attempts: 4 })],
    });
    mockRecord.mockRejectedValueOnce(
      new ExternalWriteDeniedError('global_safe_mode', 'hive_firestore'),
    );

    const res = await runReaper();

    expect(res).toMatchObject({
      processed: 1,
      recovered: 0,
      held: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(listChiefMessages()).toEqual([]);
  });

  it('dead-letters a row and alerts chief when attempts reach the max', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [staleRow({ reaper_attempts: 4 })] })
      .mockResolvedValueOnce({ rows: [] });
    mockRecord.mockRejectedValueOnce(new Error('firestore: permission denied'));
    const res = await runReaper();
    expect(res.deadLettered).toBe(1);
    expect(res.retried).toBe(0);
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[1]).toEqual([5, true, 'msg-1']);
    const messages = listChiefMessages();
    expect(messages.length).toBe(1);
    const payload = readChiefMessage(messages[0]);
    expect(payload.type).toBe('message');
    expect(payload.text).toContain('[REAPER-DEAD-LETTER]');
    expect(payload.text).toContain('msg-1');
    expect(payload.text).toContain('permission denied');
  });

  it('posts a single burst alert instead of 10+ individual alerts', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      staleRow({ gmail_message_id: `msg-${i}`, reaper_attempts: 4 }),
    );
    mockQuery.mockResolvedValueOnce({ rows });
    for (let i = 0; i < 10; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // one UPDATE per row
      mockRecord.mockRejectedValueOnce(new Error('firestore down'));
    }
    const res = await runReaper();
    expect(res.deadLettered).toBe(10);
    const messages = listChiefMessages();
    expect(messages.length).toBe(1);
    expect(readChiefMessage(messages[0]).text).toContain(
      '[REAPER-DEAD-LETTER-BURST]',
    );
    expect(readChiefMessage(messages[0]).text).toContain('10 classifications');
  });

  it('handles a mix of recovery and retry in a single batch', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          staleRow({ gmail_message_id: 'msg-a' }),
          staleRow({ gmail_message_id: 'msg-b', reaper_attempts: 1 }),
          staleRow({ gmail_message_id: 'msg-c' }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // msg-a success UPDATE
      .mockResolvedValueOnce({ rows: [] }) // msg-b failure UPDATE
      .mockResolvedValueOnce({ rows: [] }); // msg-c success UPDATE
    mockRecord
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(undefined);
    const res = await runReaper();
    expect(res.processed).toBe(3);
    expect(res.recovered).toBe(2);
    expect(res.retried).toBe(1);
    expect(res.deadLettered).toBe(0);
    expect(listChiefMessages()).toEqual([]);
  });

  it('queries only stale rows with hive_share_target not null and within 7 days', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await runReaper();
    const fetchCall = mockQuery.mock.calls[0];
    expect(fetchCall[0]).toMatch(/hive_synced = FALSE/);
    expect(fetchCall[0]).toMatch(/hive_sync_dead_lettered = FALSE/);
    expect(fetchCall[0]).toMatch(/classified_at > NOW\(\) - INTERVAL '7 days'/);
    expect(fetchCall[0]).toMatch(/hive_share_target IS NOT NULL/);
    expect(fetchCall[1]).toEqual([50]);
  });
});
