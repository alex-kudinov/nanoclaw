/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

vi.mock('./config.js', async () => {
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  return { DATA_DIR: join(tmpdir(), `label-poll-test-${process.pid}`) };
});

const TMP_DATA_DIR = path.join(os.tmpdir(), `label-poll-test-${process.pid}`);
fs.mkdirSync(TMP_DATA_DIR, { recursive: true });

afterAll(() => {
  fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
});

const mockQuery = vi.fn();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

const mockGetRouterState = vi.fn<(k: string) => string | undefined>();
const mockSetRouterState = vi.fn<(k: string, v: string) => void>();
vi.mock('./db.js', () => ({
  getRouterState: (k: string) => mockGetRouterState(k),
  setRouterState: (k: string, v: string) => mockSetRouterState(k, v),
}));

const mockGmail = {
  users: {
    labels: { list: vi.fn() },
    history: { list: vi.fn() },
    getProfile: vi.fn(),
  },
};
vi.mock('./gmail-auth.js', () => ({
  getGmailClient: () => mockGmail,
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { runLabelChangePoll } from './gmail-label-poll.js';

function chiefMessages(): string[] {
  const dir = path.join(TMP_DATA_DIR, 'ipc', 'chief', 'messages');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith('label-poll-'));
}

function readChiefMessage(name: string): any {
  return JSON.parse(
    fs.readFileSync(
      path.join(TMP_DATA_DIR, 'ipc', 'chief', 'messages', name),
      'utf-8',
    ),
  );
}

function clearChiefMessages(): void {
  const dir = path.join(TMP_DATA_DIR, 'ipc', 'chief', 'messages');
  if (!fs.existsSync(dir)) return;
  for (const f of chiefMessages()) fs.unlinkSync(path.join(dir, f));
}

const labelsResponse = {
  data: {
    labels: [
      { id: 'Label_100', name: 'MrGru/lead/inquiry' },
      { id: 'Label_101', name: 'MrGru/vendor/cold' },
      { id: 'Label_102', name: 'MrGru/financial/receipt' },
      { id: 'Label_999', name: 'INBOX' },
    ],
  },
};

beforeEach(() => {
  mockQuery.mockReset();
  mockGetRouterState.mockReset();
  mockSetRouterState.mockReset();
  mockGmail.users.labels.list.mockReset();
  mockGmail.users.history.list.mockReset();
  mockGmail.users.getProfile.mockReset();
  clearChiefMessages();
});

describe('runLabelChangePoll', () => {
  it('bootstraps by recording current historyId when state is empty', async () => {
    mockGetRouterState.mockReturnValue(undefined);
    mockGmail.users.getProfile.mockResolvedValue({ data: { historyId: '42' } });
    const res = await runLabelChangePoll();
    expect(res).toEqual({ processed: 0, corrections: 0, skipped: 0 });
    expect(mockSetRouterState).toHaveBeenCalledWith(
      'gmail_label_poll_history_id',
      '42',
    );
    expect(mockGmail.users.history.list).not.toHaveBeenCalled();
  });

  it('re-bootstraps when history.list returns 404 (historyId expired)', async () => {
    mockGetRouterState.mockReturnValue('100');
    mockGmail.users.labels.list.mockResolvedValue(labelsResponse);
    const err: any = new Error('history expired');
    err.code = 404;
    mockGmail.users.history.list.mockRejectedValue(err);
    mockGmail.users.getProfile.mockResolvedValue({
      data: { historyId: '500' },
    });
    const res = await runLabelChangePoll();
    expect(res.corrections).toBe(0);
    expect(mockSetRouterState).toHaveBeenCalledWith(
      'gmail_label_poll_history_id',
      '500',
    );
  });

  it('emits a correction IPC when Gmail label differs from DB label', async () => {
    mockGetRouterState.mockImplementation((k) => {
      if (k === 'gmail_label_poll_history_id') return '100';
      return undefined; // no debounce, no backfill marker
    });
    mockGmail.users.labels.list.mockResolvedValue(labelsResponse);
    mockGmail.users.history.list.mockResolvedValue({
      data: {
        historyId: '200',
        history: [
          {
            id: '150',
            labelsAdded: [
              { message: { id: 'msg-a' }, labelIds: ['Label_100'] }, // MrGru/lead/inquiry
            ],
          },
        ],
      },
    });
    // DB says the message is currently labeled MrGru/vendor/cold → mismatch
    mockQuery.mockResolvedValueOnce({
      rows: [{ label: 'MrGru/vendor/cold' }],
    });

    const res = await runLabelChangePoll();
    expect(res.processed).toBe(1);
    expect(res.corrections).toBe(1);
    expect(res.skipped).toBe(0);

    const messages = chiefMessages();
    expect(messages.length).toBe(1);
    const payload = readChiefMessage(messages[0]);
    expect(payload).toMatchObject({
      type: 'classify_correction_detected',
      gmail_message_id: 'msg-a',
      old_label: 'MrGru/vendor/cold',
      new_label: 'MrGru/lead/inquiry',
    });
    expect(mockSetRouterState).toHaveBeenCalledWith(
      'gmail_label_poll_history_id',
      '200',
    );
  });

  it('skips events where the added label matches the DB (NanoClaw own write)', async () => {
    mockGetRouterState.mockReturnValue('100');
    mockGmail.users.labels.list.mockResolvedValue(labelsResponse);
    mockGmail.users.history.list.mockResolvedValue({
      data: {
        historyId: '200',
        history: [
          {
            id: '150',
            labelsAdded: [
              { message: { id: 'msg-b' }, labelIds: ['Label_100'] },
            ],
          },
        ],
      },
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ label: 'MrGru/lead/inquiry' }],
    });
    const res = await runLabelChangePoll();
    expect(res.corrections).toBe(0);
    expect(res.skipped).toBe(1);
    expect(chiefMessages()).toEqual([]);
  });

  it('skips events inside the backfill marker window', async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    mockGetRouterState.mockImplementation((k) => {
      if (k === 'gmail_label_poll_history_id') return '100';
      if (k === 'nanoclaw_backfill_marker_msg-c') {
        return JSON.stringify({ expires_at: futureExpiry });
      }
      return undefined;
    });
    mockGmail.users.labels.list.mockResolvedValue(labelsResponse);
    mockGmail.users.history.list.mockResolvedValue({
      data: {
        historyId: '200',
        history: [
          {
            id: '150',
            labelsAdded: [
              { message: { id: 'msg-c' }, labelIds: ['Label_101'] },
            ],
          },
        ],
      },
    });
    const res = await runLabelChangePoll();
    expect(res.skipped).toBe(1);
    expect(res.corrections).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('skips messages that are not yet in the DB', async () => {
    mockGetRouterState.mockReturnValue('100');
    mockGmail.users.labels.list.mockResolvedValue(labelsResponse);
    mockGmail.users.history.list.mockResolvedValue({
      data: {
        historyId: '200',
        history: [
          {
            id: '150',
            labelsAdded: [
              { message: { id: 'msg-new' }, labelIds: ['Label_100'] },
            ],
          },
        ],
      },
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await runLabelChangePoll();
    expect(res.skipped).toBe(1);
    expect(res.corrections).toBe(0);
  });

  it('ignores non-class labels in the labelsAdded event', async () => {
    mockGetRouterState.mockReturnValue('100');
    mockGmail.users.labels.list.mockResolvedValue(labelsResponse);
    mockGmail.users.history.list.mockResolvedValue({
      data: {
        historyId: '200',
        history: [
          {
            id: '150',
            labelsAdded: [
              { message: { id: 'msg-d' }, labelIds: ['Label_999'] }, // INBOX
            ],
          },
        ],
      },
    });
    const res = await runLabelChangePoll();
    expect(res.processed).toBe(0);
    expect(res.corrections).toBe(0);
  });
});
