import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const recordEmailOpen = vi.fn();
vi.mock('./db.js', () => ({
  recordEmailOpen: (...args: unknown[]) => recordEmailOpen(...args),
}));

import { handleEmailOpen } from './email-tracking.js';

beforeEach(() => {
  recordEmailOpen.mockReset();
});

describe('handleEmailOpen (T04 — opens recorded only, no agent spawn)', () => {
  it('records the open and never calls sendToInbox when a result is returned', async () => {
    recordEmailOpen.mockReturnValue({
      leadId: 7,
      emailType: 'follow-up',
      openCount: 1,
      firstOpenedAt: '2026-05-15T00:00:00Z',
      shouldNotify: true,
    });
    const sendToInbox = vi.fn(async () => {});
    await handleEmailOpen('tok-1', 'Mozilla', sendToInbox);
    expect(recordEmailOpen).toHaveBeenCalledWith('tok-1', 'Mozilla');
    expect(sendToInbox).not.toHaveBeenCalled();
  });

  it('never calls sendToInbox when recordEmailOpen returns null', async () => {
    recordEmailOpen.mockReturnValue(null);
    const sendToInbox = vi.fn(async () => {});
    await handleEmailOpen('tok-unknown', 'Mozilla', sendToInbox);
    expect(sendToInbox).not.toHaveBeenCalled();
  });
});
