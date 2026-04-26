import { describe, it, expect, vi, beforeEach } from 'vitest';

type GmailMock = {
  users: {
    labels: {
      list: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      patch: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    messages: {
      modify: ReturnType<typeof vi.fn>;
    };
    threads: {
      get: ReturnType<typeof vi.fn>;
    };
  };
};

const mockGmail: GmailMock = {
  users: {
    labels: {
      list: vi.fn(),
      create: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    messages: { modify: vi.fn() },
    threads: { get: vi.fn() },
  },
};

vi.mock('./gmail-auth.js', () => ({
  getGmailClient: () => mockGmail,
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  listLabels,
  ensureLabel,
  updateLabel,
  deleteLabel,
  addLabels,
  removeLabels,
  addLabelsToThread,
  removeLabelsFromThread,
  replaceClassLabelsOnThread,
  getLabelCacheStats,
  resetLabelCache,
} from './gmail-labels.js';
import { logger } from './logger.js';

function seedLabelList(labels: Array<{ name: string; id: string }>): void {
  mockGmail.users.labels.list.mockResolvedValue({ data: { labels } });
}

function seedThread(
  threadId: string,
  messages: Array<{ id: string; labelIds?: string[] }>,
): void {
  mockGmail.users.threads.get.mockResolvedValueOnce({ data: { messages } });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLabelCache();
});

describe('listLabels', () => {
  it('caches label map across calls', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    const a = await listLabels();
    const b = await listLabels();
    expect(a).toBe(b);
    expect(mockGmail.users.labels.list).toHaveBeenCalledTimes(1);
    expect(getLabelCacheStats().size).toBe(1);
  });
});

describe('ensureLabel', () => {
  it('returns cached id without calling create', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    const id = await ensureLabel('MrGru/foo');
    expect(id).toBe('L_1');
    expect(mockGmail.users.labels.create).not.toHaveBeenCalled();
  });

  it('creates a missing label and caches it', async () => {
    seedLabelList([]);
    mockGmail.users.labels.create.mockResolvedValue({ data: { id: 'L_2' } });
    const id = await ensureLabel('MrGru/new');
    expect(id).toBe('L_2');
    expect(mockGmail.users.labels.create).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        name: 'MrGru/new',
        labelListVisibility: 'labelShowIfUnread',
        messageListVisibility: 'show',
      },
    });
    // second call should hit cache, not API
    const again = await ensureLabel('MrGru/new');
    expect(again).toBe('L_2');
    expect(mockGmail.users.labels.create).toHaveBeenCalledTimes(1);
  });

  it('rejects header-injection attempts in label names', async () => {
    seedLabelList([]);
    await expect(ensureLabel('evil\r\nSubject: hi')).rejects.toThrow(
      /invalid label name/,
    );
    await expect(ensureLabel('')).rejects.toThrow(/invalid label name/);
  });
});

describe('updateLabel', () => {
  it('patches by id and invalidates cache', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    await listLabels();
    expect(getLabelCacheStats().size).toBe(1);
    await updateLabel('MrGru/foo', { color: { textColor: '#000' } });
    expect(mockGmail.users.labels.patch).toHaveBeenCalledWith({
      userId: 'me',
      id: 'L_1',
      requestBody: { color: { textColor: '#000' } },
    });
    expect(getLabelCacheStats().size).toBe(0);
  });
});

describe('deleteLabel', () => {
  it('deletes by id and evicts from cache', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    await deleteLabel('MrGru/foo');
    expect(mockGmail.users.labels.delete).toHaveBeenCalledWith({
      userId: 'me',
      id: 'L_1',
    });
  });

  it('is a no-op when label does not exist', async () => {
    seedLabelList([]);
    await deleteLabel('MrGru/ghost');
    expect(mockGmail.users.labels.delete).not.toHaveBeenCalled();
  });
});

describe('addLabels / removeLabels', () => {
  it('resolves names to ids and calls messages.modify with addLabelIds', async () => {
    seedLabelList([
      { name: 'MrGru/foo', id: 'L_1' },
      { name: 'MrGru/bar', id: 'L_2' },
    ]);
    await addLabels('msg1', ['MrGru/foo', 'MrGru/bar']);
    expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg1',
      requestBody: { addLabelIds: ['L_1', 'L_2'] },
    });
  });

  it('uses removeLabelIds for removeLabels', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    await removeLabels('msg1', ['MrGru/foo']);
    expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg1',
      requestBody: { removeLabelIds: ['L_1'] },
    });
  });

  it('is a no-op when label list is empty', async () => {
    await addLabels('msg1', []);
    expect(mockGmail.users.messages.modify).not.toHaveBeenCalled();
  });
});

describe('addLabelsToThread', () => {
  it('walks every message in the thread and applies labels', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    seedThread('t1', [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
    const res = await addLabelsToThread('t1', ['MrGru/foo']);
    expect(res.messageIds).toEqual(['m1', 'm2', 'm3']);
    expect(res.labelIds).toEqual(['L_1']);
    expect(mockGmail.users.messages.modify).toHaveBeenCalledTimes(3);
  });

  it('warns when thread exceeds 500 messages', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    const huge = Array.from({ length: 501 }, (_, i) => ({ id: `m${i}` }));
    seedThread('big', huge);
    await addLabelsToThread('big', ['MrGru/foo']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'big', count: 501 }),
      expect.any(String),
    );
  });
});

describe('removeLabelsFromThread', () => {
  it('removes labels from every message in the thread', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    seedThread('t1', [{ id: 'm1' }, { id: 'm2' }]);
    await removeLabelsFromThread('t1', ['MrGru/foo']);
    expect(mockGmail.users.messages.modify).toHaveBeenCalledTimes(2);
    expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'm1',
      requestBody: { removeLabelIds: ['L_1'] },
    });
  });
});

describe('replaceClassLabelsOnThread', () => {
  it('removes existing MrGru/* and applies target label', async () => {
    seedLabelList([
      { name: 'MrGru/newsletter/general', id: 'L_OLD' },
      { name: 'MrGru/financial/receipt', id: 'L_NEW' },
      { name: 'INBOX', id: 'L_INBOX' },
    ]);
    // thread listed twice: once for replace (get stale), once each for remove + add thread walks
    mockGmail.users.threads.get.mockResolvedValue({
      data: {
        messages: [
          { id: 'm1', labelIds: ['L_OLD', 'L_INBOX'] },
          { id: 'm2', labelIds: ['L_OLD', 'L_INBOX'] },
        ],
      },
    });
    const res = await replaceClassLabelsOnThread(
      't1',
      'MrGru/financial/receipt',
    );
    expect(res.removed).toEqual(['MrGru/newsletter/general']);
    expect(res.applied).toBe('MrGru/financial/receipt');
    // Two messages × (1 remove + 1 add) = 4 modify calls
    expect(mockGmail.users.messages.modify).toHaveBeenCalledTimes(4);
  });

  it('skips remove when no stale class labels present', async () => {
    seedLabelList([{ name: 'MrGru/financial/receipt', id: 'L_NEW' }]);
    mockGmail.users.threads.get.mockResolvedValue({
      data: { messages: [{ id: 'm1', labelIds: [] }] },
    });
    const res = await replaceClassLabelsOnThread(
      't1',
      'MrGru/financial/receipt',
    );
    expect(res.removed).toEqual([]);
    // Only the addLabelsToThread path fires
    expect(mockGmail.users.messages.modify).toHaveBeenCalledTimes(1);
  });
});

describe('cache reset', () => {
  it('clears size and lastReset', async () => {
    seedLabelList([{ name: 'MrGru/foo', id: 'L_1' }]);
    await listLabels();
    expect(getLabelCacheStats().size).toBe(1);
    resetLabelCache();
    const stats = getLabelCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.lastReset).toBe(0);
  });
});
