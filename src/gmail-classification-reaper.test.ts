import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./business-db.js', () => ({ query: vi.fn() }));
vi.mock('./db.js', () => ({ listRawInboundGmailMessagesBefore: vi.fn() }));
vi.mock('./classify-ipc-handlers.js', () => ({
  handleClassifyLabelWrite: vi.fn(),
  retryUnroutedClassification: vi.fn(),
}));
vi.mock('./logger.js', () => ({ logger: { info: vi.fn() } }));

import { query } from './business-db.js';
import {
  handleClassifyLabelWrite,
  retryUnroutedClassification,
} from './classify-ipc-handlers.js';
import { listRawInboundGmailMessagesBefore } from './db.js';
import { runGmailClassificationReaper } from './gmail-classification-reaper.js';

const mockQuery = vi.mocked(query);
const mockList = vi.mocked(listRawInboundGmailMessagesBefore);
const mockFallback = vi.mocked(handleClassifyLabelWrite);
const mockRetry = vi.mocked(retryUnroutedClassification);

function raw(id: string) {
  return {
    id,
    chat_jid: 'gmail:info@example.com',
    sender: 'Person <person@example.com>',
    sender_name: 'Person',
    content: `From: Person <person@example.com>\nSubject: Help\nThread-ID: thread-${id}\nMessage-ID: ${id}\n\nPlease help`,
    timestamp: '2026-09-03T00:00:00.000Z',
    is_from_me: false,
    is_bot_message: false,
    thread_ts: `thread-${id}`,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockFallback.mockResolvedValue(undefined);
  mockRetry.mockResolvedValue(true);
});

describe('Gmail classification reaper', () => {
  it('recovers a missing classification and separately retries an unrouted row', async () => {
    mockList.mockReturnValue([raw('missing'), raw('stalled')]);
    mockQuery.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          type: 'classify_label_write',
          gmail_message_id: 'stalled',
          gmail_thread_id: 'thread-stalled',
          sender_email: 'person@example.com',
          subject: 'Help',
          label: 'MrGru/student/support',
          confidence: 0.9,
          reasoning: 'support',
          classifier_version: 'mailman-v3',
          routed_at: null,
        },
      ],
    } as never);

    await expect(
      runGmailClassificationReaper(new Date('2026-09-03T00:10:00.000Z')),
    ).resolves.toEqual({
      scanned: 2,
      recoveredMissing: 1,
      retriedUnrouted: 1,
    });
    expect(mockFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        gmail_message_id: 'missing',
        label: 'MrGru/other',
        classifier_version: 'mailman-host-fallback-v1',
      }),
    );
    expect(mockRetry).toHaveBeenCalledWith(
      expect.objectContaining({ gmail_message_id: 'stalled' }),
    );
  });

  it('does nothing when every retained message is already routed', async () => {
    mockList.mockReturnValue([raw('done')]);
    mockQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ gmail_message_id: 'done', routed_at: '2026-09-03T00:00:00Z' }],
    } as never);
    await runGmailClassificationReaper(new Date('2026-09-03T00:10:00.000Z'));
    expect(mockFallback).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
