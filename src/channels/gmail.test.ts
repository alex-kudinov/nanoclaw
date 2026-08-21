import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dispositionState = vi.hoisted(() => ({
  receipts: new Map<string, Record<string, unknown>>(),
}));

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
  GMAIL_BCC: 'info@tandemcoach.co',
  GMAIL_MONITORED_EMAIL: 'test@example.com',
  GMAIL_REPLY_TO: 'info@tandemcoach.co',
  GMAIL_SEND_AS: 'Tandem <info@tandemcoach.co>',
  GMAIL_POLL_INTERVAL: 1000, // 1s for fast tests
  GMAIL_PUSH_ENABLED: false,
  GMAIL_PUSH_OWN_WATCH: false,
  GMAIL_PUBSUB_TOPIC: '',
  GMAIL_PUSH_SAFETY_POLL_INTERVAL: 600000,
  COMPANY_GMAIL_RUNTIME_WATERMARK_MODE: 'freeze_only',
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
  isClassificationRouted: vi.fn().mockResolvedValue(false),
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
  getStoredInboundMessageEvidence: vi.fn().mockReturnValue(undefined),
  getGmailInboundDispositionReceipt: vi.fn((messageId: string) =>
    dispositionState.receipts.get(messageId),
  ),
  recordGmailInboundDisposition: vi.fn(
    (input: Record<string, unknown> & { messageId: string }) => {
      const receipt = {
        ...input,
        contractVersion: 1,
        sourceKey: 'gmail:inbound-v1',
        receiptFingerprint: 'a'.repeat(64),
        recordedAt: input.observedAt,
      };
      const duplicate = dispositionState.receipts.has(input.messageId);
      dispositionState.receipts.set(input.messageId, receipt);
      return { receipt, applied: !duplicate, duplicate };
    },
  ),
}));

// Mock gmail-auth
const mockGmail = {
  users: {
    messages: {
      list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
      get: vi.fn(),
      modify: vi.fn().mockResolvedValue({ data: {} }),
    },
    history: {
      list: vi.fn().mockResolvedValue({
        data: { history: [], historyId: '200' },
      }),
    },
    threads: {
      list: vi.fn().mockResolvedValue({ data: { threads: [] } }),
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
  deriveReplyAllCandidates: vi.fn().mockReturnValue([]),
  formatEmailForAgent: vi.fn().mockReturnValue('formatted email'),
  parseEmailBody: vi.fn().mockReturnValue('body'),
  parseEmailHeaders: vi.fn().mockReturnValue({
    from: 'sender@example.com',
    fromName: 'Sender',
    replyTo: '',
    to: 'test@example.com',
    cc: '',
    subject: 'Test',
  }),
  resolveForwardedIdentity: vi.fn().mockReturnValue(null),
}));

// Mock registry
vi.mock('./registry.js', () => ({
  registerChannel: vi.fn(),
}));

import { GmailChannel, isOwnOutbound } from './gmail.js';
import {
  getStoredInboundMessageEvidence,
  getRouterState,
  recordGmailInboundDisposition,
  setRouterState,
} from '../db.js';
import { logger } from '../logger.js';
import { routeClassifiedEmail } from '../host-router.js';
import { matchRule } from '../classify-rules-runner.js';
import { matchHardFilter } from '../hard-filters.js';
import {
  isClassificationRouted,
  isAutoArchiveLabel,
  markClassificationRouted,
} from '../classify-ipc-handlers.js';
import { storeMessageDirect } from '../db.js';
import {
  deriveReplyAllCandidates,
  parseEmailBody,
  parseEmailHeaders,
  resolveForwardedIdentity,
} from '../gmail-parser.js';
import { grantHostGmailResources } from '../gmail-ipc-policy.js';
import {
  GmailInboundDispositionError,
  normalizeGmailInboundDispositionInput,
} from '../gmail-inbound-disposition.js';

const mockRouteClassifiedEmail = routeClassifiedEmail as ReturnType<
  typeof vi.fn
>;
const mockMatchRule = matchRule as ReturnType<typeof vi.fn>;
const mockStoreMessageDirect = storeMessageDirect as ReturnType<typeof vi.fn>;
const mockParseEmailHeaders = parseEmailHeaders as ReturnType<typeof vi.fn>;
const mockDeriveReplyAllCandidates = deriveReplyAllCandidates as ReturnType<
  typeof vi.fn
>;
const mockParseEmailBody = parseEmailBody as ReturnType<typeof vi.fn>;
const mockResolveForwardedIdentity = resolveForwardedIdentity as ReturnType<
  typeof vi.fn
>;
const mockGrantHostGmailResources = grantHostGmailResources as ReturnType<
  typeof vi.fn
>;
const mockRecordDisposition = recordGmailInboundDisposition as ReturnType<
  typeof vi.fn
>;
const mockGetStoredInboundEvidence =
  getStoredInboundMessageEvidence as ReturnType<typeof vi.fn>;
const mockGetRouterState = getRouterState as ReturnType<typeof vi.fn>;
const mockSetRouterState = setRouterState as ReturnType<typeof vi.fn>;
const mockMatchHardFilter = matchHardFilter as ReturnType<typeof vi.fn>;
const mockIsAutoArchiveLabel = isAutoArchiveLabel as ReturnType<typeof vi.fn>;
const mockIsClassificationRouted = isClassificationRouted as ReturnType<
  typeof vi.fn
>;
const mockMarkClassificationRouted = markClassificationRouted as ReturnType<
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
    dispositionState.receipts.clear();
    mockGetRouterState.mockReturnValue('100');
    mockGetStoredInboundEvidence.mockReturnValue(undefined);
    mockIsClassificationRouted.mockResolvedValue(false);
    mockMatchHardFilter.mockReturnValue(null);
    mockMatchRule.mockResolvedValue(null);
    mockIsAutoArchiveLabel.mockResolvedValue(false);
    mockRouteClassifiedEmail.mockResolvedValue({
      routed: false,
      action: 'unhandled',
    });
    mockParseEmailHeaders.mockReturnValue({
      from: 'sender@example.com',
      fromName: 'Sender',
      replyTo: '',
      to: 'test@example.com',
      cc: '',
      subject: 'Test',
    });
    mockParseEmailBody.mockReturnValue('body');
    mockResolveForwardedIdentity.mockReturnValue(null);
    mockDeriveReplyAllCandidates.mockReturnValue([]);
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
      mockParseEmailHeaders.mockReturnValueOnce({
        from: 'sender@example.com',
        fromName: 'Sender',
        replyTo: '',
        to: 'Tandem <test@example.com>',
        cc: 'Pat <pat@example.com>',
        subject: 'Test',
      });
      mockDeriveReplyAllCandidates.mockReturnValueOnce(['pat@example.com']);
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
      expect(mockMarkClassificationRouted).toHaveBeenCalledWith(
        'msg-actionable',
        'rules-runner-v1',
      );
      expect(mockRouteClassifiedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          visibleTo: 'Tandem <test@example.com>',
          visibleCc: 'Pat <pat@example.com>',
          replyAllCandidates: ['pat@example.com'],
        }),
      );
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-actionable',
          disposition: 'accepted',
          reasonKey: 'classified_route_persisted',
        }),
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
        cc: '',
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

  describe('durable terminal dispositions', () => {
    const gmailMessage = (id: string, labelIds: string[] = ['INBOX']) => ({
      data: {
        id,
        threadId: `thread-${id}`,
        internalDate: '1787004000000',
        labelIds,
        payload: { headers: [] },
      },
    });

    it('receipts ordinary persisted inbound before reporting success', async () => {
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-inbound'),
      );
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();

      await expect(
        (channel as any).fetchAndProcess('msg-inbound'),
      ).resolves.toBe(true);

      expect(opts.onMessage).toHaveBeenCalledOnce();
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-inbound',
          disposition: 'accepted',
          reasonKey: 'inbound_message_persisted',
        }),
      );
      expect(opts.onMessage.mock.invocationCallOrder[0]).toBeLessThan(
        mockRecordDisposition.mock.invocationCallOrder[0],
      );
    });

    it('receipts own outbound, Spam/Trash, empty, and hard-filter terminals', async () => {
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();

      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-own', ['SENT']),
      );
      await expect((channel as any).fetchAndProcess('msg-own')).resolves.toBe(
        false,
      );

      (channel as any).pushMode = true;
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-spam', ['SPAM']),
      );
      await expect((channel as any).fetchAndProcess('msg-spam')).resolves.toBe(
        false,
      );

      mockParseEmailBody.mockReturnValueOnce('');
      mockParseEmailHeaders.mockReturnValueOnce({
        from: 'sender@example.com',
        fromName: 'Sender',
        replyTo: '',
        subject: '',
      });
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-empty'),
      );
      await expect((channel as any).fetchAndProcess('msg-empty')).resolves.toBe(
        false,
      );

      mockMatchHardFilter.mockReturnValueOnce({
        id: 'filter-1',
        reason: 'fixture',
      });
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-filtered'),
      );
      await expect(
        (channel as any).fetchAndProcess('msg-filtered'),
      ).resolves.toBe(false);

      expect(mockRecordDisposition.mock.calls).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({
              messageId: 'msg-own',
              reasonKey: 'own_outbound',
            }),
          ],
          [
            expect.objectContaining({
              messageId: 'msg-spam',
              reasonKey: 'spam_or_trash',
            }),
          ],
          [
            expect.objectContaining({
              messageId: 'msg-empty',
              reasonKey: 'empty_message',
            }),
          ],
          [
            expect.objectContaining({
              messageId: 'msg-filtered',
              reasonKey: 'hard_filter',
            }),
          ],
        ]),
      );
    });

    it('receipts completed rule auto-archive as accepted', async () => {
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-autoarchive'),
      );
      mockMatchRule.mockResolvedValueOnce({
        rule_id: 200,
        target_label: 'MrGru/notification',
        pattern_type: 'sender_exact',
        pattern_value: 'sender@example.com',
      });
      mockIsAutoArchiveLabel.mockResolvedValueOnce(true);
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();

      await expect(
        (channel as any).fetchAndProcess('msg-autoarchive'),
      ).resolves.toBe(true);
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-autoarchive',
          disposition: 'accepted',
          reasonKey: 'rule_auto_archive_completed',
        }),
      );
    });

    it('receipts an exact Gmail message-get 404 as terminal unavailable', async () => {
      mockGmail.users.messages.get.mockRejectedValueOnce({
        code: 404,
        response: { status: 404, data: { error: { code: 404 } } },
      });
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();

      await expect(
        (channel as any).fetchAndProcess('msg-unavailable'),
      ).resolves.toBe(false);

      expect(opts.onMessage).not.toHaveBeenCalled();
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-unavailable',
          disposition: 'rejected',
          reasonKey: 'message_unavailable',
        }),
      );
    });

    it('propagates receipt-store failure instead of silently changing route', async () => {
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-store-error'),
      );
      mockMatchHardFilter.mockReturnValueOnce({
        id: 'filter-1',
        reason: 'fixture',
      });
      mockRecordDisposition.mockImplementationOnce(() => {
        throw new GmailInboundDispositionError(
          'storage_unavailable',
          'receipt store unavailable',
        );
      });
      const opts = createTestOpts();
      const channel = new GmailChannel(opts);
      await channel.connect();

      await expect(
        (channel as any).fetchAndProcess('msg-store-error'),
      ).rejects.toMatchObject({ code: 'storage_unavailable' });
      expect(opts.onMessage).not.toHaveBeenCalled();
      expect(mockMatchRule).not.toHaveBeenCalled();
    });

    it('bridges only an exact durable inbound row, including after restart', async () => {
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();

      await expect(
        (channel as any).ensureDurableDisposition('legacy-1'),
      ).resolves.toBe(false);
      mockGetStoredInboundEvidence.mockReturnValueOnce('ordinary_persisted');
      await expect(
        (channel as any).ensureDurableDisposition('legacy-1'),
      ).resolves.toBe(true);
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'legacy-1',
          disposition: 'accepted',
          reasonKey: 'legacy_message_persisted',
        }),
      );
    });

    it('bridges a staged direct route only from its durable routed marker', async () => {
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();
      mockGetStoredInboundEvidence.mockReturnValue('direct_route_staged');

      await expect(
        (channel as any).ensureDurableDisposition('route-1'),
      ).rejects.toMatchObject({ code: 'storage_unavailable' });
      expect(mockRecordDisposition).not.toHaveBeenCalled();

      mockIsClassificationRouted.mockResolvedValueOnce(true);
      await expect(
        (channel as any).ensureDurableDisposition('route-1'),
      ).resolves.toBe(true);
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'route-1',
          disposition: 'accepted',
          reasonKey: 'classified_route_persisted',
        }),
      );
    });

    it('holds an unresolved staged row without starving later label-poll candidates', async () => {
      mockGmail.users.messages.list.mockResolvedValueOnce({
        data: {
          messages: [{ id: 'route-unresolved' }, { id: 'msg-after' }],
        },
      });
      mockGetStoredInboundEvidence.mockImplementation((messageId: string) =>
        messageId === 'route-unresolved' ? 'direct_route_staged' : undefined,
      );
      mockGmail.users.messages.get.mockResolvedValueOnce(
        gmailMessage('msg-after'),
      );
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();
      mockSetRouterState.mockClear();

      await expect((channel as any).poll()).resolves.toBeUndefined();

      expect(mockGmail.users.messages.get).toHaveBeenCalledTimes(1);
      expect(mockGmail.users.messages.get).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-after' }),
      );
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-after' }),
      );
      expect(mockSetRouterState).toHaveBeenCalledWith(
        'gmail_last_check',
        expect.any(String),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'route-unresolved',
          scan: 'label_poll',
        }),
        'Gmail poll held unresolved candidate',
      );
    });

    it('receipts the thread-scanner outbound terminal without fetching content', async () => {
      mockGmail.users.threads.list.mockResolvedValueOnce({
        data: { threads: [{ id: 'thread-1' }] },
      });
      mockGmail.users.threads.get.mockResolvedValueOnce({
        data: {
          messages: [
            {
              id: 'msg-thread-own',
              internalDate: '1787004000000',
              labelIds: ['SENT'],
            },
          ],
        },
      });
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();

      await expect((channel as any).pollThreadReplies()).resolves.toBe(0);
      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-thread-own',
          disposition: 'rejected',
          reasonKey: 'thread_outbound',
        }),
      );
    });

    it('holds an unresolved staged thread row and receipts later terminals', async () => {
      mockGmail.users.threads.list.mockResolvedValueOnce({
        data: { threads: [{ id: 'thread-1' }] },
      });
      mockGmail.users.threads.get.mockResolvedValueOnce({
        data: {
          messages: [
            { id: 'route-unresolved', labelIds: ['INBOX'] },
            { id: 'msg-thread-own', labelIds: ['SENT'] },
          ],
        },
      });
      mockGetStoredInboundEvidence.mockImplementation((messageId: string) =>
        messageId === 'route-unresolved' ? 'direct_route_staged' : undefined,
      );
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();

      await expect((channel as any).pollThreadReplies()).resolves.toBe(0);

      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
      expect(mockRecordDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-thread-own',
          reasonKey: 'thread_outbound',
        }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'route-unresolved',
          scan: 'thread_poll',
        }),
        'Gmail poll held unresolved candidate',
      );
    });
  });

  describe('history cursor accounting', () => {
    function runtimeWatermark() {
      return {
        prepare: vi.fn().mockResolvedValue({
          decision: 'proceed',
          cursor: '100',
          stateVersion: 1,
        }),
        recordAdvance: vi.fn().mockResolvedValue({
          state: { version: 2, status: 'current' },
        }),
        recordGap: vi.fn().mockResolvedValue({
          state: { version: 2, status: 'gap' },
        }),
      };
    }

    function historyWith(messageIds: string[]) {
      return {
        data: {
          history: [
            {
              id: '150',
              messagesAdded: messageIds.map((id) => ({ message: { id } })),
            },
          ],
          historyId: '200',
        },
      };
    }

    function fullMessage(id: string) {
      return {
        data: {
          id,
          threadId: `thread-${id}`,
          internalDate: '1787004000000',
          labelIds: ['INBOX'],
          payload: { headers: [] },
        },
      };
    }

    it('retains the prior cursor when any history candidate is unaccounted', async () => {
      mockGmail.users.history.list.mockResolvedValueOnce(
        historyWith(['msg-ok', 'msg-failed']),
      );
      mockGmail.users.messages.get
        .mockResolvedValueOnce(fullMessage('msg-ok'))
        .mockRejectedValueOnce(new Error('Gmail unavailable'));
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(dispositionState.receipts.get('msg-ok')).toBeDefined();
      expect(dispositionState.receipts.get('msg-failed')).toBeUndefined();
      expect(mockSetRouterState).not.toHaveBeenCalledWith(
        'gmail_history_id',
        expect.anything(),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          unaccountedCount: 1,
          start: '100',
          retainedHistoryId: '100',
        }),
        'Gmail push retained history cursor for unaccounted candidates',
      );
    });

    it('advances only after every history candidate has a durable receipt', async () => {
      mockGmail.users.history.list.mockResolvedValueOnce(
        historyWith(['msg-1', 'msg-2']),
      );
      mockGmail.users.messages.get
        .mockResolvedValueOnce(fullMessage('msg-1'))
        .mockResolvedValueOnce(fullMessage('msg-2'));
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(dispositionState.receipts.get('msg-1')).toBeDefined();
      expect(dispositionState.receipts.get('msg-2')).toBeDefined();
      expect(mockSetRouterState).toHaveBeenCalledWith(
        'gmail_history_id',
        '200',
      );
    });

    it('advances both active cursors after exact message-get 404s are durably rejected', async () => {
      mockGmail.users.history.list.mockResolvedValueOnce(
        historyWith(['msg-unavailable']),
      );
      mockGmail.users.messages.get.mockRejectedValueOnce({ code: 404 });
      mockRecordDisposition.mockImplementationOnce((input) => {
        const normalized = normalizeGmailInboundDispositionInput(input as any);
        const receipt = { ...normalized, recordedAt: normalized.observedAt };
        dispositionState.receipts.set(normalized.messageId, receipt);
        return { receipt, applied: true, duplicate: false };
      });
      const bridge = runtimeWatermark();
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'active',
        runtimeWatermark: bridge as any,
      });
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(dispositionState.receipts.get('msg-unavailable')).toMatchObject({
        disposition: 'rejected',
        reasonKey: 'message_unavailable',
      });
      expect(bridge.recordAdvance).toHaveBeenCalledWith(
        expect.objectContaining({
          previousCursor: '100',
          nextCursor: '200',
          candidates: [
            expect.objectContaining({
              messageId: 'msg-unavailable',
              disposition: 'rejected',
              reasonKey: 'message_unavailable',
            }),
          ],
        }),
      );
      expect(mockSetRouterState).toHaveBeenCalledWith(
        'gmail_history_id',
        '200',
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.anything(),
        'Gmail push retained history cursor for unaccounted candidates',
      );
    });

    it('reuses an existing receipt after restart without refetching the message', async () => {
      dispositionState.receipts.set('msg-existing', {
        messageId: 'msg-existing',
        disposition: 'accepted',
      });
      mockGmail.users.history.list.mockResolvedValueOnce(
        historyWith(['msg-existing']),
      );
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
      expect(mockRecordDisposition).not.toHaveBeenCalled();
      expect(mockSetRouterState).toHaveBeenCalledWith(
        'gmail_history_id',
        '200',
      );
    });

    it('retains the cursor and processes nothing when page 20 is non-terminal', async () => {
      for (let page = 1; page <= 20; page++) {
        mockGmail.users.history.list.mockResolvedValueOnce({
          data: {
            history: [
              {
                id: String(100 + page),
                messagesAdded: [{ message: { id: `msg-${page}` } }],
              },
            ],
            historyId: String(100 + page),
            nextPageToken: `page-${page + 1}`,
          },
        });
      }
      const channel = new GmailChannel(createTestOpts());
      await channel.connect();
      mockSetRouterState.mockClear();

      await expect((channel as any).processPush('200')).rejects.toMatchObject({
        name: 'HistoryPageLimitError',
      });

      expect(mockGmail.users.messages.get).not.toHaveBeenCalled();
      expect(mockRecordDisposition).not.toHaveBeenCalled();
      expect(mockSetRouterState).not.toHaveBeenCalledWith(
        'gmail_history_id',
        expect.anything(),
      );
    });

    it('retains the exact SQLite cursor on history expiry in freeze-only mode', async () => {
      mockGmail.users.history.list.mockRejectedValueOnce({ code: 404 });
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'freeze_only',
      });
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(mockSetRouterState).not.toHaveBeenCalledWith(
        'gmail_history_id',
        expect.anything(),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Gmail history expired; SQLite cursor retained in freeze-only mode',
      );
    });

    it('records a natural 404 gap before holding both cursors', async () => {
      mockGmail.users.history.list.mockRejectedValueOnce({ code: 404 });
      const bridge = runtimeWatermark();
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'active',
        runtimeWatermark: bridge as any,
      });
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(bridge.prepare).toHaveBeenCalledWith('100');
      expect(bridge.recordGap).toHaveBeenCalledWith(
        expect.objectContaining({
          previousCursor: '100',
          notificationHistoryId: '200',
        }),
      );
      expect(mockSetRouterState).not.toHaveBeenCalledWith(
        'gmail_history_id',
        expect.anything(),
      );
    });

    it('does not call Gmail again while the durable gap is open', async () => {
      const bridge = runtimeWatermark();
      bridge.prepare.mockResolvedValueOnce({
        decision: 'hold_gap',
        cursor: '100',
        stateVersion: 2,
        gapEventId: '51',
      });
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'active',
        runtimeWatermark: bridge as any,
      });
      await channel.connect();
      mockGmail.users.history.list.mockClear();

      await (channel as any).processPush('220');

      expect(mockGmail.users.history.list).not.toHaveBeenCalled();
      expect(bridge.recordGap).not.toHaveBeenCalled();
    });

    it('catches SQLite up after a committed Company OS advance without rereading Gmail', async () => {
      const bridge = runtimeWatermark();
      bridge.prepare.mockResolvedValueOnce({
        decision: 'catch_up_sqlite',
        cursor: '200',
        stateVersion: 2,
        eventId: '52',
      });
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'active',
        runtimeWatermark: bridge as any,
      });
      await channel.connect();
      mockSetRouterState.mockClear();
      mockGmail.users.history.list.mockClear();

      await (channel as any).processPush('200');

      expect(mockSetRouterState).toHaveBeenCalledWith(
        'gmail_history_id',
        '200',
      );
      expect(mockGmail.users.history.list).not.toHaveBeenCalled();
    });

    it('records a zero-candidate Company OS advance before moving SQLite', async () => {
      mockGmail.users.history.list.mockResolvedValueOnce({
        data: { history: [], historyId: '200' },
      });
      const bridge = runtimeWatermark();
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'active',
        runtimeWatermark: bridge as any,
      });
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(bridge.recordAdvance).toHaveBeenCalledWith({
        previousCursor: '100',
        nextCursor: '200',
        observedThrough: expect.any(String),
        candidates: [],
      });
      expect(bridge.recordAdvance.mock.invocationCallOrder[0]).toBeLessThan(
        mockSetRouterState.mock.invocationCallOrder[0],
      );
    });

    it('retains SQLite when the Company OS advance fails', async () => {
      mockGmail.users.history.list.mockResolvedValueOnce({
        data: { history: [], historyId: '200' },
      });
      const bridge = runtimeWatermark();
      bridge.recordAdvance.mockRejectedValueOnce(new Error('postgres down'));
      const channel = new GmailChannel({
        ...createTestOpts(),
        runtimeWatermarkMode: 'active',
        runtimeWatermark: bridge as any,
      });
      await channel.connect();
      mockSetRouterState.mockClear();

      await (channel as any).processPush('200');

      expect(mockSetRouterState).not.toHaveBeenCalledWith(
        'gmail_history_id',
        expect.anything(),
      );
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
