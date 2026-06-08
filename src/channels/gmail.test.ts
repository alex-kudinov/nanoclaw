import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config
vi.mock('../config.js', () => ({
  DATA_DIR: '/tmp/nanoclaw-test',
  GMAIL_LABEL: 'TestLabel',
  GMAIL_MONITORED_EMAIL: 'test@example.com',
  GMAIL_POLL_INTERVAL: 1000, // 1s for fast tests
  GMAIL_PUSH_ENABLED: false,
  GMAIL_PUSH_OWN_WATCH: false,
  GMAIL_PUBSUB_TOPIC: '',
  GMAIL_PUSH_SAFETY_POLL_INTERVAL: 600000,
}));

// Mock hard-filters
vi.mock('../hard-filters.js', () => ({
  matchHardFilter: vi.fn().mockReturnValue(null),
  incrementDropCount: vi.fn(),
}));

// Mock host-router
vi.mock('../host-router.js', () => ({
  routeClassifiedEmail: vi
    .fn()
    .mockResolvedValue({ routed: false, action: 'unhandled' }),
}));

// Mock db
vi.mock('../db.js', () => ({
  getRouterState: vi.fn().mockReturnValue(String(Date.now())),
  setRouterState: vi.fn(),
  getMessageIdsForJid: vi.fn().mockReturnValue([]),
}));

// Mock gmail-auth
const mockGmail = {
  users: {
    messages: {
      list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
      get: vi.fn(),
    },
    labels: {
      list: vi.fn().mockResolvedValue({
        data: {
          labels: [{ id: 'Label_1', name: 'TestLabel' }],
        },
      }),
    },
  },
};
vi.mock('../gmail-auth.js', () => ({
  getGmailClient: vi.fn(() => mockGmail),
}));

// Mock gmail-parser
vi.mock('../gmail-parser.js', () => ({
  formatEmailForAgent: vi.fn().mockReturnValue('formatted email'),
  parseEmailBody: vi.fn().mockReturnValue('body'),
  parseEmailHeaders: vi.fn().mockReturnValue({
    from: 'sender@example.com',
    fromName: 'Sender',
    subject: 'Test',
  }),
}));

// Mock registry
vi.mock('./registry.js', () => ({
  registerChannel: vi.fn(),
}));

import { GmailChannel, isOwnOutbound } from './gmail.js';
import { logger } from '../logger.js';

function createTestOpts() {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registerGroup: vi.fn(),
    registeredGroups: vi.fn(() => ({})),
  };
}

describe('GmailChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isOwnOutbound', () => {
    it('skips pure outbound — SENT without INBOX', () => {
      expect(isOwnOutbound(['SENT'])).toBe(true);
      expect(isOwnOutbound(['DRAFT'])).toBe(true);
      expect(isOwnOutbound(['SENT', 'CATEGORY_PERSONAL'])).toBe(true);
    });

    it('processes self-addressed inbound — SENT plus INBOX', () => {
      // Website contact-form mail sent from a send-as alias to the
      // monitored mailbox carries both labels and is real inbound.
      expect(isOwnOutbound(['SENT', 'INBOX'])).toBe(false);
      expect(isOwnOutbound(['UNREAD', 'SENT', 'INBOX'])).toBe(false);
      expect(isOwnOutbound(['DRAFT', 'INBOX'])).toBe(false);
    });

    it('processes ordinary inbound — no SENT/DRAFT', () => {
      expect(isOwnOutbound(['INBOX', 'UNREAD'])).toBe(false);
      expect(isOwnOutbound([])).toBe(false);
    });
  });

  describe('poll stall detection', () => {
    it('updates lastPollCompletedAt after successful poll', async () => {
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();

      // Advance past one poll interval to trigger schedulePoll
      await vi.advanceTimersByTimeAsync(1100);

      // Poll succeeded, no error logged
      expect(logger.error).not.toHaveBeenCalledWith(
        expect.anything(),
        'Gmail poll timed out, rescheduling',
      );
    });

    it('logs timeout when poll hangs', async () => {
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);

      // Make poll() hang indefinitely
      mockGmail.users.messages.list.mockImplementation(
        () => new Promise(() => {}),
      );

      await channel.connect();

      // Advance past poll interval + timeout (GMAIL_POLL_INTERVAL * 3 = 3s)
      await vi.advanceTimersByTimeAsync(1000 + 3100);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 3000 }),
        'Gmail poll timed out, rescheduling',
      );

      // Restore for cleanup
      mockGmail.users.messages.list.mockResolvedValue({
        data: { messages: [] },
      });
    });

    it('stall detector restarts poll chain when stalled', async () => {
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);

      // Make poll() hang indefinitely
      mockGmail.users.messages.list.mockImplementation(
        () => new Promise(() => {}),
      );

      await channel.connect();

      // Advance past stall detection threshold (GMAIL_POLL_INTERVAL * 5 = 5s)
      // plus stall detector interval (120s, but we're using 1s poll interval)
      // Stall detector runs every 120s and checks if lastPollCompletedAt > 5s ago
      // With 1s poll interval, threshold is 5s.
      // We need to advance past 120s for the detector to run.
      await vi.advanceTimersByTimeAsync(121_000);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ stalledSec: expect.any(Number) }),
        'Gmail poll chain appears stalled, restarting',
      );

      // Restore
      mockGmail.users.messages.list.mockResolvedValue({
        data: { messages: [] },
      });
    });

    it('clears stall detector on disconnect', async () => {
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();

      await channel.disconnect();

      // Advance time — no stall detection should fire
      vi.advanceTimersByTime(200_000);

      expect(logger.error).not.toHaveBeenCalledWith(
        expect.anything(),
        'Gmail poll chain appears stalled, restarting',
      );
    });
  });
});
