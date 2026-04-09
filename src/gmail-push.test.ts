import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory router_state for tests.
const state: Record<string, string> = {};

vi.mock('./db.js', () => ({
  getRouterState: vi.fn((key: string) => state[key]),
  setRouterState: vi.fn((key: string, value: string) => {
    state[key] = value;
  }),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  compareHistoryIds,
  ensureHistoryIdBaseline,
  HISTORY_ID_KEY,
  HistoryExpiredError,
  WATCH_EXPIRES_KEY,
  getStoredHistoryId,
  getWatchExpiresAt,
  processHistoryDelta,
  setStoredHistoryId,
  startWatch,
} from './gmail-push.js';

function clearState(): void {
  for (const k of Object.keys(state)) delete state[k];
}

function makeGmailMock(impl: {
  watch?: (args: any) => Promise<any>;
  stop?: (args: any) => Promise<any>;
  historyList?: (args: any) => Promise<any>;
  getProfile?: (args: any) => Promise<any>;
}): any {
  return {
    users: {
      watch: impl.watch ? vi.fn(impl.watch) : vi.fn(),
      stop: impl.stop ? vi.fn(impl.stop) : vi.fn(),
      getProfile: impl.getProfile ? vi.fn(impl.getProfile) : vi.fn(),
      history: {
        list: impl.historyList ? vi.fn(impl.historyList) : vi.fn(),
      },
    },
  };
}

describe('compareHistoryIds', () => {
  it('orders small values', () => {
    expect(compareHistoryIds('100', '200')).toBe(-1);
    expect(compareHistoryIds('200', '100')).toBe(1);
    expect(compareHistoryIds('100', '100')).toBe(0);
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER', () => {
    const a = '99999999999999999'; // > 2^53
    const b = '99999999999999998';
    expect(compareHistoryIds(a, b)).toBe(1);
    expect(compareHistoryIds(b, a)).toBe(-1);
  });
});

describe('startWatch', () => {
  beforeEach(() => clearState());

  it('registers watch and stores expiration', async () => {
    const gmail = makeGmailMock({
      watch: async () => ({
        data: {
          historyId: '5000',
          expiration: String(Date.now() + 7 * 24 * 3600 * 1000),
        },
      }),
    });

    const result = await startWatch(gmail, 'projects/x/topics/y', ['INBOX']);
    expect(result.historyId).toBe('5000');
    expect(result.expiration).toBeGreaterThan(Date.now());
    expect(getStoredHistoryId()).toBe('5000');
    expect(getWatchExpiresAt()).toBe(result.expiration);
  });

  it('does not overwrite an existing stored historyId', async () => {
    setStoredHistoryId('1000');
    const gmail = makeGmailMock({
      watch: async () => ({
        data: {
          historyId: '5000',
          expiration: String(Date.now() + 1000),
        },
      }),
    });
    await startWatch(gmail, 'projects/x/topics/y');
    expect(getStoredHistoryId()).toBe('1000');
  });

  it('throws on missing historyId or expiration', async () => {
    const gmail = makeGmailMock({
      watch: async () => ({ data: {} }),
    });
    await expect(startWatch(gmail, 'projects/x/topics/y')).rejects.toThrow();
  });

  it('passes labelIds to the watch request', async () => {
    const gmail = makeGmailMock({
      watch: async () => ({
        data: { historyId: '1', expiration: String(Date.now() + 1000) },
      }),
    });
    await startWatch(gmail, 'projects/x/topics/y', ['INBOX']);
    expect(gmail.users.watch).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        topicName: 'projects/x/topics/y',
        labelIds: ['INBOX'],
      },
    });
  });
});

describe('processHistoryDelta', () => {
  beforeEach(() => clearState());

  it('returns unique message IDs from messagesAdded only, ignores labelsAdded', async () => {
    const gmail = makeGmailMock({
      historyList: async () => ({
        data: {
          history: [
            {
              id: '1001',
              messagesAdded: [
                { message: { id: 'm1', threadId: 't1' } },
                { message: { id: 'm2', threadId: 't1' } },
              ],
            },
            {
              id: '1002',
              // labelsAdded should be ignored — only new messages matter.
              labelsAdded: [
                { message: { id: 'm3', threadId: 't2' } },
              ],
              messagesAdded: [{ message: { id: 'm2', threadId: 't1' } }], // dupe
            },
          ],
          historyId: '1002',
        },
      }),
    });

    const { messageIds, lastHistoryId } = await processHistoryDelta(
      gmail,
      '1000',
    );
    expect(messageIds.sort()).toEqual(['m1', 'm2']);
    expect(lastHistoryId).toBe('1002');
  });

  it('requests only messageAdded history type', async () => {
    const gmail = makeGmailMock({
      historyList: async () => ({
        data: { history: [], historyId: '1' },
      }),
    });
    await processHistoryDelta(gmail, '1');
    expect(gmail.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({
        historyTypes: ['messageAdded'],
      }),
    );
  });

  it('paginates through multiple pages', async () => {
    let call = 0;
    const gmail = makeGmailMock({
      historyList: async () => {
        call++;
        if (call === 1) {
          return {
            data: {
              history: [
                {
                  id: '100',
                  messagesAdded: [{ message: { id: 'a' } }],
                },
              ],
              nextPageToken: 'page2',
              historyId: '100',
            },
          };
        }
        return {
          data: {
            history: [
              {
                id: '200',
                messagesAdded: [{ message: { id: 'b' } }],
              },
            ],
            historyId: '200',
          },
        };
      },
    });

    const result = await processHistoryDelta(gmail, '50');
    expect(result.messageIds.sort()).toEqual(['a', 'b']);
    expect(result.lastHistoryId).toBe('200');
    expect(gmail.users.history.list).toHaveBeenCalledTimes(2);
  });

  it('throws HistoryExpiredError on 404', async () => {
    const gmail = makeGmailMock({
      historyList: async () => {
        const err: Error & { code?: number } = new Error('historyId not found');
        err.code = 404;
        throw err;
      },
    });
    await expect(processHistoryDelta(gmail, '50')).rejects.toBeInstanceOf(
      HistoryExpiredError,
    );
  });

  it('advances lastHistoryId from top-level response when no records', async () => {
    const gmail = makeGmailMock({
      historyList: async () => ({
        data: { historyId: '5000' }, // no history[] array
      }),
    });
    const result = await processHistoryDelta(gmail, '1000');
    expect(result.messageIds).toEqual([]);
    expect(result.lastHistoryId).toBe('5000');
  });

  it('passes labelId filter to history.list when provided', async () => {
    const gmail = makeGmailMock({
      historyList: async () => ({
        data: { history: [], historyId: '1' },
      }),
    });
    await processHistoryDelta(gmail, '1', 'Label_123');
    expect(gmail.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        startHistoryId: '1',
        labelId: 'Label_123',
      }),
    );
  });
});

describe('ensureHistoryIdBaseline', () => {
  beforeEach(() => clearState());

  it('seeds from getProfile when no baseline exists', async () => {
    const gmail = makeGmailMock({
      getProfile: async () => ({ data: { historyId: '9000' } }),
    });
    const result = await ensureHistoryIdBaseline(gmail);
    expect(result).toBe('9000');
    expect(getStoredHistoryId()).toBe('9000');
    expect(gmail.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
  });

  it('returns existing baseline without calling getProfile', async () => {
    setStoredHistoryId('1234');
    const gmail = makeGmailMock({
      getProfile: async () => ({ data: { historyId: '9999' } }),
    });
    const result = await ensureHistoryIdBaseline(gmail);
    expect(result).toBe('1234');
    expect(getStoredHistoryId()).toBe('1234');
    expect(gmail.users.getProfile).not.toHaveBeenCalled();
  });

  it('throws when getProfile returns no historyId', async () => {
    const gmail = makeGmailMock({
      getProfile: async () => ({ data: {} }),
    });
    await expect(ensureHistoryIdBaseline(gmail)).rejects.toThrow();
  });
});

describe('state key constants', () => {
  it('exports stable router_state keys', () => {
    expect(HISTORY_ID_KEY).toBe('gmail_history_id');
    expect(WATCH_EXPIRES_KEY).toBe('gmail_watch_expires_at');
  });
});
