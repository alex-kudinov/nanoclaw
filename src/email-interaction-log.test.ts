import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./business-db.js', () => ({
  withAgentContext: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { withAgentContext } from './business-db.js';
import { logOutboundEmailInteraction } from './email-interaction-log.js';

const query = vi.fn();

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  vi.mocked(withAgentContext)
    .mockReset()
    .mockImplementation(async (_agent, callback) =>
      callback({ query } as never),
    );
});

describe('logOutboundEmailInteraction', () => {
  it('writes exact host-approved pipeline lineage into content-free metadata', async () => {
    await logOutboundEmailInteraction({
      partyId: 42,
      pipelineEntryId: 1003,
      emailType: 'follow-up',
      subject: 'Approved subject',
      threadId: 'thread-1',
      messageId: 'message-1',
    });

    const metadata = JSON.parse(query.mock.calls[0][1][2]);
    expect(metadata).toEqual({
      thread_id: 'thread-1',
      message_id: 'message-1',
      email_type: 'follow-up',
      follow_up: true,
      pipeline_entry_id: 1003,
    });
  });

  it('omits invalid or absent pipeline identities', async () => {
    await logOutboundEmailInteraction({
      partyId: 42,
      pipelineEntryId: -1,
      emailType: 'reply',
      subject: 'Approved subject',
      threadId: 'thread-1',
      messageId: 'message-1',
    });

    const metadata = JSON.parse(query.mock.calls[0][1][2]);
    expect(metadata).not.toHaveProperty('pipeline_entry_id');
  });
});
