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

vi.mock('../classify-ipc-handlers.js', () => ({
  handleClassifyLabelWrite: vi.fn().mockResolvedValue(undefined),
  isAutoArchiveLabel: vi.fn().mockResolvedValue(false),
  markClassificationRouted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../classify-rules-runner.js', () => ({
  extractSenderEmail: vi.fn((value: string | null) => {
    if (!value) return null;
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] || value).trim().toLowerCase();
  }),
  matchRule: vi.fn().mockResolvedValue(null),
  recordRuleHit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../gmail-ipc-policy.js', () => ({
  grantHostGmailResources: vi.fn(),
}));

// Mock db
vi.mock('../db.js', () => ({
  getRouterState: vi.fn().mockReturnValue(String(Date.now())),
  setRouterState: vi.fn(),
  getMessageIdsForJid: vi.fn().mockReturnValue([]),
  storeMessageDirect: vi.fn(),
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
    replyTo: '',
    subject: 'Test',
  }),
  resolveForwardedIdentity: vi.fn().mockReturnValue(null),
}));

// Mock registry
vi.mock('./registry.js', () => ({
  registerChannel: vi.fn(),
}));

import { GmailChannel, isOwnOutbound } from './gmail.js';
import { logger } from '../logger.js';
import { routeClassifiedEmail } from '../host-router.js';
import { matchRule } from '../classify-rules-runner.js';
import { storeMessageDirect } from '../db.js';
import {
  parseEmailHeaders,
  resolveForwardedIdentity,
} from '../gmail-parser.js';
import { grantHostGmailResources } from '../gmail-ipc-policy.js';

const mockRouteClassifiedEmail = routeClassifiedEmail as ReturnType<
  typeof vi.fn
>;
const mockMatchRule = matchRule as ReturnType<typeof vi.fn>;
const mockStoreMessageDirect = storeMessageDirect as ReturnType<typeof vi.fn>;
const mockParseEmailHeaders = parseEmailHeaders as ReturnType<typeof vi.fn>;
const mockResolveForwardedIdentity = resolveForwardedIdentity as ReturnType<
  typeof vi.fn
>;
const mockGrantHostGmailResources = grantHostGmailResources as ReturnType<
  typeof vi.fn
>;

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

  describe('pre-classified actionable routing', () => {
    it('persists the exact inbound before direct routing without waking mailman', async () => {
      mockGmail.users.messages.get.mockResolvedValueOnce({
        data: {
          id: 'msg-actionable',
          threadId: 'thr-actionable',
          internalDate: '1785772571000',
          labelIds: ['INBOX'],
          payload: { headers: [] },
        },
      });
      mockMatchRule.mockResolvedValueOnce({
        rule_id: 100,
        target_label: 'MrGru/lead/inquiry',
        pattern_type: 'sender_exact',
        pattern_value: 'sender@example.com',
      });
      mockRouteClassifiedEmail.mockResolvedValueOnce({
        routed: true,
        action: 'ipc_written',
        target: 'mailman',
      });

      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();
      const processed = await (channel as any).fetchAndProcess(
        'msg-actionable',
      );

      expect(processed).toBe(true);
      expect(mockStoreMessageDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-actionable',
          chat_jid: 'gmail:test@example.com',
          content: 'formatted email',
          is_from_me: false,
          is_bot_message: true,
          from_group: 'mailman',
          thread_ts: 'thr-actionable',
        }),
      );
      expect(opts.onMessage).not.toHaveBeenCalled();
      expect(mockStoreMessageDirect.mock.invocationCallOrder[0]).toBeLessThan(
        mockRouteClassifiedEmail.mock.invocationCallOrder[0],
      );
    });

    it('falls through to the ordinary inbound path when persistence fails', async () => {
      mockGmail.users.messages.get.mockResolvedValueOnce({
        data: {
          id: 'msg-store-failed',
          threadId: 'thr-store-failed',
          labelIds: ['INBOX'],
          payload: { headers: [] },
        },
      });
      mockMatchRule.mockResolvedValueOnce({
        rule_id: 101,
        target_label: 'MrGru/lead/inquiry',
        pattern_type: 'sender_exact',
        pattern_value: 'sender@example.com',
      });
      mockStoreMessageDirect.mockImplementationOnce(() => {
        throw new Error('sqlite unavailable');
      });

      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();
      const processed = await (channel as any).fetchAndProcess(
        'msg-store-failed',
      );

      expect(processed).toBe(true);
      expect(mockRouteClassifiedEmail).not.toHaveBeenCalled();
      expect(opts.onMessage).toHaveBeenCalledWith(
        'gmail:test@example.com',
        expect.objectContaining({ id: 'msg-store-failed' }),
      );
    });

    it('routes an internal forward under the external author without reusing the source thread', async () => {
      mockGmail.users.messages.get.mockResolvedValueOnce({
        data: {
          id: 'msg-forwarded',
          threadId: 'thr-internal-forward',
          labelIds: ['INBOX'],
          payload: { headers: [] },
        },
      });
      mockParseEmailHeaders.mockReturnValueOnce({
        from: 'Cherie Silas <cherie@tandemcoach.co>',
        fromName: 'Cherie Silas',
        replyTo: '',
        to: 'info@tandemcoach.co',
        subject: 'Fwd: Level 1 registration',
        date: 'Mon, 3 Aug 2026',
        messageId: '<source@example.com>',
        inReplyTo: '',
      });
      mockResolveForwardedIdentity.mockReturnValueOnce({
        email: 'prospect@example.com',
        name: 'External Prospect',
      });
      mockMatchRule.mockResolvedValueOnce({
        rule_id: 102,
        target_label: 'MrGru/lead/inquiry',
        pattern_type: 'subject_regex',
        pattern_value: 'Level 1 registration',
      });
      mockRouteClassifiedEmail.mockResolvedValueOnce({
        routed: true,
        action: 'ipc_written',
        target: 'mailman',
      });

      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();
      await (channel as any).fetchAndProcess('msg-forwarded');

      expect(mockStoreMessageDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: 'External Prospect <prospect@example.com>',
          sender_name: 'External Prospect',
        }),
      );
      expect(mockRouteClassifiedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          senderEmail: 'prospect@example.com',
          senderName: 'External Prospect',
          forwardedByEmail: 'cherie@tandemcoach.co',
          forwardedByName: 'Cherie Silas',
          threadId: 'thr-internal-forward',
        }),
      );
      expect(mockGrantHostGmailResources).toHaveBeenCalledWith('mailman', {
        messageId: 'msg-forwarded',
        emailAddresses: ['cherie@tandemcoach.co', 'prospect@example.com'],
      });
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
