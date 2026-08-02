import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --- Mocks ---

// Mock config
vi.mock('../config.js', () => ({
  ASSISTANT_NAME: 'Jonesy',
  TRIGGER_PATTERN: /^@Jonesy\b/i,
  SLACK_THREAD_TTL_MS: 28800000, // 8h
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

// Mock db
vi.mock('../db.js', () => ({
  updateChatName: vi.fn(),
  resolveThreadAnchor: vi.fn(() => undefined),
  recordThreadAnchor: vi.fn(),
  rollThreadAnchor: vi.fn(),
  touchThreadAnchor: vi.fn(),
}));

// --- @slack/bolt mock ---

type Handler = (...args: any[]) => any;

const appRef = vi.hoisted(() => ({ current: null as any }));

vi.mock('@slack/bolt', () => ({
  App: class MockApp {
    eventHandlers = new Map<string, Handler>();
    errorHandler: Handler | null = null;
    token: string;
    appToken: string;

    client = {
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: 'U_BOT_123' }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: '1704067200.000100' }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      filesUploadV2: vi.fn().mockResolvedValue({
        files: [{ files: [{ id: 'F_UPLOAD_1' }] }],
      }),
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [],
          response_metadata: {},
        }),
      },
      users: {
        info: vi.fn().mockResolvedValue({
          user: { real_name: 'Alice Smith', name: 'alice' },
        }),
      },
    };

    constructor(opts: any) {
      this.token = opts.token;
      this.appToken = opts.appToken;
      appRef.current = this;
    }

    event(name: string, handler: Handler) {
      this.eventHandlers.set(name, handler);
    }

    error(handler: Handler) {
      this.errorHandler = handler;
    }

    async start() {}
    async stop() {}
  },
  LogLevel: { ERROR: 'error' },
}));

// Mock env
vi.mock('../env.js', () => ({
  readEnvFile: vi.fn().mockReturnValue({
    SLACK_BOT_TOKEN: 'xoxb-test-token',
    SLACK_APP_TOKEN: 'xapp-test-token',
  }),
}));

import { SlackChannel, SlackChannelOpts } from './slack.js';
import {
  updateChatName,
  resolveThreadAnchor,
  recordThreadAnchor,
  rollThreadAnchor,
  touchThreadAnchor,
} from '../db.js';
import { readEnvFile } from '../env.js';

// --- Test helpers ---

function createTestOpts(
  overrides?: Partial<SlackChannelOpts>,
): SlackChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: vi.fn(() => ({
      'slack:C0123456789': {
        name: 'Test Channel',
        folder: 'test-channel',
        trigger: '@Jonesy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    })),
    ...overrides,
  };
}

function createMessageEvent(overrides: {
  channel?: string;
  channelType?: string;
  user?: string;
  text?: string;
  ts?: string;
  threadTs?: string;
  subtype?: string;
  botId?: string;
  files?: Array<{
    id: string;
    name: string;
    mimetype: string;
    filetype: string;
    size: number;
    url_private_download?: string;
  }>;
}) {
  return {
    channel: overrides.channel ?? 'C0123456789',
    channel_type: overrides.channelType ?? 'channel',
    user: overrides.user ?? 'U_USER_456',
    text: 'text' in overrides ? overrides.text : 'Hello everyone',
    ts: overrides.ts ?? '1704067200.000000',
    thread_ts: overrides.threadTs,
    subtype: overrides.subtype,
    bot_id: overrides.botId,
    files: overrides.files,
  };
}

function currentApp() {
  return appRef.current;
}

async function triggerMessageEvent(
  event: ReturnType<typeof createMessageEvent>,
) {
  const handler = currentApp().eventHandlers.get('message');
  if (handler) await handler({ event });
}

// --- Tests ---

describe('SlackChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Connection lifecycle ---

  describe('connection lifecycle', () => {
    it('resolves connect() when app starts', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      await channel.connect();

      expect(channel.isConnected()).toBe(true);
    });

    it('registers message event handler on construction', () => {
      const opts = createTestOpts();
      new SlackChannel(opts);

      expect(currentApp().eventHandlers.has('message')).toBe(true);
    });

    it('gets bot user ID on connect', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      await channel.connect();

      expect(currentApp().client.auth.test).toHaveBeenCalled();
    });

    it('disconnects cleanly', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      await channel.connect();
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });

    it('isConnected() returns false before connect', () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      expect(channel.isConnected()).toBe(false);
    });
  });

  // --- Message handling ---

  describe('message handling', () => {
    it('delivers message for registered channel', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ text: 'Hello everyone' });
      await triggerMessageEvent(event);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.any(String),
        undefined,
        'slack',
        true,
      );
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          id: '1704067200.000000',
          chat_jid: 'slack:C0123456789',
          sender: 'U_USER_456',
          content: 'Hello everyone',
          is_from_me: false,
        }),
      );
    });

    it('only emits metadata for unregistered channels', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ channel: 'C9999999999' });
      await triggerMessageEvent(event);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'slack:C9999999999',
        expect.any(String),
        undefined,
        'slack',
        true,
      );
      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('skips non-text subtypes (channel_join, etc.)', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ subtype: 'channel_join' });
      await triggerMessageEvent(event);

      expect(opts.onMessage).not.toHaveBeenCalled();
      expect(opts.onChatMetadata).not.toHaveBeenCalled();
    });

    it('allows bot_message subtype through', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        subtype: 'bot_message',
        botId: 'B_OTHER_BOT',
        text: 'Bot message',
      });
      await triggerMessageEvent(event);

      expect(opts.onChatMetadata).toHaveBeenCalled();
    });

    it('skips messages with no text', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ text: undefined as any });
      await triggerMessageEvent(event);

      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('detects bot messages by bot_id', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        subtype: 'bot_message',
        botId: 'B_MY_BOT',
        text: 'Bot response',
      });
      await triggerMessageEvent(event);

      // Has bot_id so is_bot_message=true, but user doesn't match bot ID
      // so is_from_me is false (it's another bot, not us)
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          is_from_me: false,
          is_bot_message: true,
          sender_name: 'Jonesy',
        }),
      );
    });

    it("skips the bot's own echoed messages — storeOutbound already persisted them", async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      // Slack echoes our own outbound back as a message event. storeOutbound
      // already wrote that row (with from_group) synchronously at send time;
      // re-delivering here is redundant and, after a restart, would overwrite
      // the row's from_group with null and break handoff routing.
      const event = createMessageEvent({
        user: 'U_BOT_123',
        text: 'Self message',
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('identifies IM channel type as non-group', async () => {
      const opts = createTestOpts({
        registeredGroups: vi.fn(() => ({
          'slack:D0123456789': {
            name: 'DM',
            folder: 'dm',
            trigger: '@Jonesy',
            added_at: '2024-01-01T00:00:00.000Z',
          },
        })),
      });
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        channel: 'D0123456789',
        channelType: 'im',
      });
      await triggerMessageEvent(event);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'slack:D0123456789',
        expect.any(String),
        undefined,
        'slack',
        false, // IM is not a group
      );
    });

    it('converts ts to ISO timestamp', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ ts: '1704067200.000000' });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      );
    });

    it('resolves user name from Slack API', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ user: 'U_USER_456', text: 'Hello' });
      await triggerMessageEvent(event);

      expect(currentApp().client.users.info).toHaveBeenCalledWith({
        user: 'U_USER_456',
      });
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          sender_name: 'Alice Smith',
        }),
      );
    });

    it('caches user names to avoid repeated API calls', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      // First message — API call
      await triggerMessageEvent(
        createMessageEvent({ user: 'U_USER_456', text: 'First' }),
      );
      // Second message — should use cache
      await triggerMessageEvent(
        createMessageEvent({
          user: 'U_USER_456',
          text: 'Second',
          ts: '1704067201.000000',
        }),
      );

      expect(currentApp().client.users.info).toHaveBeenCalledTimes(1);
    });

    it('falls back to user ID when API fails', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      currentApp().client.users.info.mockRejectedValueOnce(
        new Error('API error'),
      );

      const event = createMessageEvent({ user: 'U_UNKNOWN', text: 'Hi' });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          sender_name: 'U_UNKNOWN',
        }),
      );
    });

    it('flattens threaded replies into channel messages', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        ts: '1704067201.000000',
        threadTs: '1704067200.000000', // parent message ts — this is a reply
        text: 'Thread reply',
      });
      await triggerMessageEvent(event);

      // Threaded replies are delivered as regular channel messages
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: 'Thread reply',
        }),
      );
    });

    it('delivers thread parent messages normally', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        ts: '1704067200.000000',
        threadTs: '1704067200.000000', // same as ts — this IS the parent
        text: 'Thread parent',
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: 'Thread parent',
        }),
      );
    });

    it('delivers messages without thread_ts normally', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({ text: 'Normal message' });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalled();
    });
  });

  // --- @mention translation ---

  describe('@mention translation', () => {
    it('prepends trigger when bot is @mentioned via Slack format', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect(); // sets botUserId to 'U_BOT_123'

      const event = createMessageEvent({
        text: 'Hey <@U_BOT_123> what do you think?',
        user: 'U_USER_456',
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: '@Jonesy Hey <@U_BOT_123> what do you think?',
        }),
      );
    });

    it('does not prepend trigger when trigger pattern already matches', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        text: '@Jonesy <@U_BOT_123> hello',
        user: 'U_USER_456',
      });
      await triggerMessageEvent(event);

      // Content should be unchanged since it already matches TRIGGER_PATTERN
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: '@Jonesy <@U_BOT_123> hello',
        }),
      );
    });

    it('does not translate mentions in bot messages', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        text: 'Echo: <@U_BOT_123>',
        subtype: 'bot_message',
        botId: 'B_MY_BOT',
      });
      await triggerMessageEvent(event);

      // Bot messages skip mention translation
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: 'Echo: <@U_BOT_123>',
        }),
      );
    });

    it('does not translate mentions for other users', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const event = createMessageEvent({
        text: 'Hey <@U_OTHER_USER> look at this',
        user: 'U_USER_456',
      });
      await triggerMessageEvent(event);

      // Mention is for a different user, not the bot
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: 'Hey <@U_OTHER_USER> look at this',
        }),
      );
    });
  });

  // --- File attachments ---

  describe('file attachments', () => {
    it('processes file_share subtype messages', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const csvContent = 'name,email\nBob,bob@test.com';
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(csvContent, { status: 200 }),
      );

      const event = createMessageEvent({
        subtype: 'file_share',
        text: 'send certs to this list',
        files: [
          {
            id: 'F_SHARE',
            name: 'people.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 100,
            url_private_download: 'https://files.slack.com/people.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: expect.stringContaining('<attached_file name="people.csv">'),
        }),
      );

      vi.restoreAllMocks();
    });

    it('sanitizes file names with special characters', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('data', { status: 200 }),
      );

      const event = createMessageEvent({
        text: 'check this',
        files: [
          {
            id: 'F_BAD',
            name: 'file"><evil.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 10,
            url_private_download: 'https://files.slack.com/bad.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: expect.stringContaining('name="file___evil.csv"'),
        }),
      );

      vi.restoreAllMocks();
    });

    it('inlines CSV file content into message', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const csvContent = 'name,email\nJane Doe,jane@example.com';
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(csvContent, { status: 200 }),
      );

      const event = createMessageEvent({
        text: 'send cnpc supervision to this list',
        files: [
          {
            id: 'F123',
            name: 'data.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 100,
            url_private_download:
              'https://files.slack.com/files-pri/T123/data.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: expect.stringContaining('<attached_file name="data.csv">'),
        }),
      );
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: expect.stringContaining(csvContent),
        }),
      );

      vi.restoreAllMocks();
    });

    it('notes an image attachment instead of dropping it silently', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const fetchSpy = vi.spyOn(global, 'fetch');

      const event = createMessageEvent({
        text: 'check this image',
        files: [
          {
            id: 'F456',
            name: 'photo.png',
            mimetype: 'image/png',
            filetype: 'png',
            size: 5000,
            url_private_download:
              'https://files.slack.com/files-pri/T123/photo.png',
          },
        ],
      });
      await triggerMessageEvent(event);

      // No download — an image has no extractable text — but the agent is told
      // a file arrived, so it cannot mistake this for "nothing was attached".
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: expect.stringContaining('check this image'),
        }),
      );
      const sent = vi.mocked(opts.onMessage).mock.calls[0][1] as {
        content: string;
      };
      expect(sent.content).toContain('photo.png');
      expect(sent.content).toContain('not readable as text');

      vi.restoreAllMocks();
    });

    it('skips files larger than 100KB', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const fetchSpy = vi.spyOn(global, 'fetch');

      const event = createMessageEvent({
        text: 'huge file',
        files: [
          {
            id: 'F789',
            name: 'big.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 200 * 1024,
            url_private_download: 'https://files.slack.com/big.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      expect(fetchSpy).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('delivers message with file when text is empty', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const csvContent = 'name,email\nAlice,alice@test.com';
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(csvContent, { status: 200 }),
      );

      const event = createMessageEvent({
        text: '' as any,
        files: [
          {
            id: 'F999',
            name: 'list.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 50,
            url_private_download: 'https://files.slack.com/list.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: expect.stringContaining('<attached_file name="list.csv">'),
        }),
      );

      vi.restoreAllMocks();
    });

    it('handles download failure gracefully', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );

      const event = createMessageEvent({
        text: 'send certs',
        files: [
          {
            id: 'F_ERR',
            name: 'data.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 100,
            url_private_download: 'https://files.slack.com/data.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      // Message still delivered, just without file content
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C0123456789',
        expect.objectContaining({
          content: 'send certs',
        }),
      );

      vi.restoreAllMocks();
    });

    it('does not download files from bot messages', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const fetchSpy = vi.spyOn(global, 'fetch');

      const event = createMessageEvent({
        text: 'bot with file',
        subtype: 'bot_message',
        botId: 'B_OTHER',
        files: [
          {
            id: 'F_BOT',
            name: 'bot.csv',
            mimetype: 'text/csv',
            filetype: 'csv',
            size: 100,
            url_private_download: 'https://files.slack.com/bot.csv',
          },
        ],
      });
      await triggerMessageEvent(event);

      expect(fetchSpy).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  // --- sendMessage ---

  describe('sendMessage', () => {
    it('sends message via Slack client', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      await channel.sendMessage('slack:C0123456789', 'Hello');

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C0123456789',
        text: 'Hello',
      });
    });

    it('strips slack: prefix from JID', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      await channel.sendMessage('slack:D9876543210', 'DM message');

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'D9876543210',
        text: 'DM message',
      });
    });

    it('queues message when disconnected', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      // Don't connect — should queue
      await channel.sendMessage('slack:C0123456789', 'Queued message');

      expect(currentApp().client.chat.postMessage).not.toHaveBeenCalled();
    });

    it('queues message on send failure', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      currentApp().client.chat.postMessage.mockRejectedValueOnce(
        new Error('Network error'),
      );

      // Should not throw
      await expect(
        channel.sendMessage('slack:C0123456789', 'Will fail'),
      ).resolves.toBeUndefined();
    });

    it('splits long messages at 4000 character boundary', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      // Create a message longer than 4000 chars
      const longText = 'A'.repeat(4500);
      await channel.sendMessage('slack:C0123456789', longText);

      // Should be split into 2 messages: 4000 + 500
      expect(currentApp().client.chat.postMessage).toHaveBeenCalledTimes(2);
      expect(currentApp().client.chat.postMessage).toHaveBeenNthCalledWith(1, {
        channel: 'C0123456789',
        text: 'A'.repeat(4000),
      });
      expect(currentApp().client.chat.postMessage).toHaveBeenNthCalledWith(2, {
        channel: 'C0123456789',
        text: 'A'.repeat(500),
      });
    });

    it('sends exactly-4000-char messages as a single message', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const text = 'B'.repeat(4000);
      await channel.sendMessage('slack:C0123456789', text);

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledTimes(1);
      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C0123456789',
        text,
      });
    });

    it('splits messages into 3 parts when over 8000 chars', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const longText = 'C'.repeat(8500);
      await channel.sendMessage('slack:C0123456789', longText);

      // 4000 + 4000 + 500 = 3 messages
      expect(currentApp().client.chat.postMessage).toHaveBeenCalledTimes(3);
    });

    it('flushes queued messages on connect', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      // Queue messages while disconnected
      await channel.sendMessage('slack:C0123456789', 'First queued');
      await channel.sendMessage('slack:C0123456789', 'Second queued');

      expect(currentApp().client.chat.postMessage).not.toHaveBeenCalled();

      // Connect triggers flush
      await channel.connect();

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C0123456789',
        text: 'First queued',
      });
      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C0123456789',
        text: 'Second queued',
      });
    });
  });

  describe('postGraderFileMessage', () => {
    it('posts one root, uploads into its thread, then wakes grader with inline text', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-grader-file-'));
      const filePath = path.join(dir, 'submission.txt');
      fs.writeFileSync(filePath, 'A thoughtful coaching reflection.');
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      try {
        const result = await channel.postGraderFileMessage(
          'slack:C0123456789',
          'Grade Ada - Module 2 Part 2',
          fs.readFileSync(filePath),
          'submission.txt',
          'main',
        );

        expect(result).toEqual({
          messageTs: '1704067200.000100',
          fileIds: ['F_UPLOAD_1'],
        });
        expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
          channel: 'C0123456789',
          text: 'Grade Ada - Module 2 Part 2',
        });
        expect(currentApp().client.filesUploadV2).toHaveBeenCalledWith({
          channel_id: 'C0123456789',
          thread_ts: '1704067200.000100',
          file: Buffer.from('A thoughtful coaching reflection.'),
          filename: 'submission.txt',
          title: 'submission.txt',
        });
        expect(opts.onMessage).toHaveBeenCalledWith(
          'slack:C0123456789',
          expect.objectContaining({
            id: '1704067200.000100',
            content: expect.stringContaining(
              '<attached_file name="submission.txt" type="txt">',
            ),
            from_group: 'main',
            thread_ts: undefined,
          }),
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('deletes a file-less root and does not wake grader when upload fails', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-grader-file-'));
      const filePath = path.join(dir, 'submission.txt');
      fs.writeFileSync(filePath, 'submission');
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();
      currentApp().client.filesUploadV2.mockRejectedValueOnce(
        new Error('files_upload_failed'),
      );

      try {
        await expect(
          channel.postGraderFileMessage(
            'slack:C0123456789',
            'Grade Ada - Module 2 Part 2',
            fs.readFileSync(filePath),
            'submission.txt',
            'main',
          ),
        ).rejects.toThrow('files_upload_failed');
        expect(currentApp().client.chat.delete).toHaveBeenCalledWith({
          channel: 'C0123456789',
          ts: '1704067200.000100',
        });
        expect(opts.onMessage).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // --- ownsJid ---

  describe('ownsJid', () => {
    it('owns slack: JIDs', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.ownsJid('slack:C0123456789')).toBe(true);
    });

    it('owns slack: DM JIDs', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.ownsJid('slack:D0123456789')).toBe(true);
    });

    it('does not own WhatsApp group JIDs', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.ownsJid('12345@g.us')).toBe(false);
    });

    it('does not own WhatsApp DM JIDs', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.ownsJid('12345@s.whatsapp.net')).toBe(false);
    });

    it('does not own Telegram JIDs', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.ownsJid('tg:123456')).toBe(false);
    });

    it('does not own unknown JID formats', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.ownsJid('random-string')).toBe(false);
    });
  });

  // --- syncChannelMetadata ---

  describe('syncChannelMetadata', () => {
    it('calls conversations.list and updates chat names', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      currentApp().client.conversations.list.mockResolvedValue({
        channels: [
          { id: 'C001', name: 'general', is_member: true },
          { id: 'C002', name: 'random', is_member: true },
          { id: 'C003', name: 'external', is_member: false },
        ],
        response_metadata: {},
      });

      await channel.connect();

      // connect() calls syncChannelMetadata internally
      expect(updateChatName).toHaveBeenCalledWith('slack:C001', 'general');
      expect(updateChatName).toHaveBeenCalledWith('slack:C002', 'random');
      // Non-member channels are skipped
      expect(updateChatName).not.toHaveBeenCalledWith('slack:C003', 'external');
    });

    it('handles API errors gracefully', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      currentApp().client.conversations.list.mockRejectedValue(
        new Error('API error'),
      );

      // Should not throw
      await expect(channel.connect()).resolves.toBeUndefined();
    });
  });

  // --- setTyping ---

  describe('setTyping', () => {
    it('resolves without error (no-op)', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      // Should not throw — Slack has no bot typing indicator API
      await expect(
        channel.setTyping('slack:C0123456789', true),
      ).resolves.toBeUndefined();
    });

    it('accepts false without error', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      await expect(
        channel.setTyping('slack:C0123456789', false),
      ).resolves.toBeUndefined();
    });
  });

  // --- Constructor error handling ---

  describe('constructor', () => {
    it('throws when SLACK_BOT_TOKEN is missing', () => {
      vi.mocked(readEnvFile).mockReturnValueOnce({
        SLACK_BOT_TOKEN: '',
        SLACK_APP_TOKEN: 'xapp-test-token',
      });

      expect(() => new SlackChannel(createTestOpts())).toThrow(
        'SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in .env',
      );
    });

    it('throws when SLACK_APP_TOKEN is missing', () => {
      vi.mocked(readEnvFile).mockReturnValueOnce({
        SLACK_BOT_TOKEN: 'xoxb-test-token',
        SLACK_APP_TOKEN: '',
      });

      expect(() => new SlackChannel(createTestOpts())).toThrow(
        'SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in .env',
      );
    });
  });

  // --- syncChannelMetadata pagination ---

  describe('syncChannelMetadata pagination', () => {
    it('paginates through multiple pages of channels', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);

      // First page returns a cursor; second page returns no cursor
      currentApp()
        .client.conversations.list.mockResolvedValueOnce({
          channels: [{ id: 'C001', name: 'general', is_member: true }],
          response_metadata: { next_cursor: 'cursor_page2' },
        })
        .mockResolvedValueOnce({
          channels: [{ id: 'C002', name: 'random', is_member: true }],
          response_metadata: {},
        });

      await channel.connect();

      // Should have called conversations.list twice (once per page)
      expect(currentApp().client.conversations.list).toHaveBeenCalledTimes(2);
      expect(currentApp().client.conversations.list).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: 'cursor_page2' }),
      );

      // Both channels from both pages stored
      expect(updateChatName).toHaveBeenCalledWith('slack:C001', 'general');
      expect(updateChatName).toHaveBeenCalledWith('slack:C002', 'random');
    });
  });

  // --- Health monitor ---

  describe('health monitor', () => {
    it('updates lastActivityAt on message receipt', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const before = Date.now();
      const event = createMessageEvent({ text: 'ping' });
      await triggerMessageEvent(event);

      // lastActivityAt is private, so we verify indirectly: health check
      // should NOT trigger reconnect right after a message
      // (we just confirm the channel stays connected)
      expect(channel.isConnected()).toBe(true);
    });

    it('does not reconnect on auth.test failure alone', async () => {
      vi.useFakeTimers();
      try {
        const opts = createTestOpts();
        const channel = new SlackChannel(opts);
        await channel.connect();

        const oldApp = currentApp();
        const stopSpy = vi.spyOn(oldApp, 'stop');

        // auth.test is only an HTTP sanity check — its failure does not by
        // itself force a recreate (the staleness check owns that decision).
        oldApp.client.auth.test = vi
          .fn()
          .mockRejectedValue(new Error('connection lost'));

        await vi.advanceTimersByTimeAsync(60_000 + 3_000);

        expect(stopSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('triggers reconnect when WebSocket is stale (no events for 15 min)', async () => {
      vi.useFakeTimers();
      try {
        const opts = createTestOpts();
        const channel = new SlackChannel(opts);
        await channel.connect();

        const oldApp = currentApp();
        const stopSpy = vi.spyOn(oldApp, 'stop');

        // Advance past the 15-minute staleness threshold + a health check tick
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 60_000 + 3_000);

        expect(stopSpy).toHaveBeenCalled();
        expect(currentApp()).not.toBe(oldApp);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not reconnect for staleness if recent activity', async () => {
      vi.useFakeTimers();
      try {
        const opts = createTestOpts();
        const channel = new SlackChannel(opts);
        await channel.connect();

        const app = currentApp();
        const stopSpy = vi.spyOn(app, 'stop');

        // Simulate activity every 2 minutes (below 5-min threshold)
        for (let i = 0; i < 5; i++) {
          await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
          await triggerMessageEvent(
            createMessageEvent({ text: 'ping', ts: `170406720${i}.000000` }),
          );
        }

        // stop() should not have been called for reconnect
        expect(stopSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('reconnects only after WebSocket send failures cluster', async () => {
      vi.useFakeTimers();
      try {
        const opts = createTestOpts();
        const channel = new SlackChannel(opts);
        await channel.connect();

        const oldApp = currentApp();
        const stopSpy = vi.spyOn(oldApp, 'stop');

        const wsError = new Error(
          'Failed to send a WebSocket message as the client is not ready',
        );

        // A single failure is below threshold — the library auto-reconnects.
        await oldApp.errorHandler!(wsError);
        expect(stopSpy).not.toHaveBeenCalled();

        // Once 3 failures cluster within the window, force a recreate.
        await oldApp.errorHandler!(wsError);
        await oldApp.errorHandler!(wsError);
        await vi.advanceTimersByTimeAsync(3_500);

        expect(stopSpy).toHaveBeenCalled();
        expect(currentApp()).not.toBe(oldApp);
      } finally {
        vi.useRealTimers();
      }
    });

    it('resets the WebSocket failure count after the window elapses', async () => {
      vi.useFakeTimers();
      try {
        const opts = createTestOpts();
        const channel = new SlackChannel(opts);
        await channel.connect();

        const oldApp = currentApp();
        const stopSpy = vi.spyOn(oldApp, 'stop');

        const wsError = new Error(
          'Failed to send a message as the client has no active connection',
        );

        // Two failures, then a gap longer than the 10-min window resets the
        // count — so the third failure does not reach the threshold of 3.
        await oldApp.errorHandler!(wsError);
        await oldApp.errorHandler!(wsError);
        await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
        await oldApp.errorHandler!(wsError);

        expect(stopSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not reconnect on non-WebSocket app errors', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel(opts);
      await channel.connect();

      const app = currentApp();
      const stopSpy = vi.spyOn(app, 'stop');

      // Simulate a non-WebSocket error
      if (app.errorHandler) {
        await app.errorHandler(new Error('Some other error'));
      }

      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('clears health check interval on disconnect', async () => {
      vi.useFakeTimers();
      try {
        const opts = createTestOpts();
        const channel = new SlackChannel(opts);
        await channel.connect();

        const app = currentApp();
        const stopSpy = vi.spyOn(app, 'stop');

        await channel.disconnect();

        // Advance time well past 5 min — no reconnect should fire
        stopSpy.mockClear();
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

        // stop() should not have been called again after disconnect
        expect(stopSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // --- Channel properties ---

  describe('channel properties', () => {
    it('has name "slack"', () => {
      const channel = new SlackChannel(createTestOpts());
      expect(channel.name).toBe('slack');
    });
  });

  // --- Entity-keyed threading (cross-minion threading) ---

  describe('threadKey anchoring', () => {
    const JID = 'slack:C0123456789';

    async function connected() {
      const channel = new SlackChannel(createTestOpts());
      await channel.connect();
      return channel;
    }

    it('first post for a new key starts a root and records its ts', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
      const channel = await connected();

      await channel.sendMessage(JID, 'cert issued', {
        threadKey: 'certifier:cert:jane|pcc',
      });

      const post = currentApp().client.chat.postMessage;
      // No thread_ts on the root post — it BECOMES the thread. A root is already
      // top-level, so it must not broadcast.
      expect(post.mock.calls[0][0].thread_ts).toBeUndefined();
      expect(post.mock.calls[0][0].reply_broadcast).toBeUndefined();
      expect(resolveThreadAnchor).toHaveBeenCalledWith(
        'C0123456789',
        'certifier:cert:jane|pcc',
      );
      expect(recordThreadAnchor).toHaveBeenCalledWith(
        'C0123456789',
        'certifier:cert:jane|pcc',
        '1704067200.000100',
      );
    });

    it('a post under a still-fresh anchor replies in-thread, broadcasts, and touches it', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue({
        threadTs: '1700000000.000001',
        lastActivityAt: new Date().toISOString(), // just active → fresh
      });
      const channel = await connected();

      await channel.sendMessage(JID, 'cert resent', {
        threadKey: 'certifier:cert:jane|pcc',
      });

      const post = currentApp().client.chat.postMessage;
      expect(post.mock.calls[0][0].thread_ts).toBe('1700000000.000001');
      // A reply under an active anchor broadcasts so it lands at the channel
      // bottom too, not just inside the thread.
      expect(post.mock.calls[0][0].reply_broadcast).toBe(true);
      // Active anchor — keep the root, bump its activity, never roll.
      expect(recordThreadAnchor).not.toHaveBeenCalled();
      expect(rollThreadAnchor).not.toHaveBeenCalled();
      expect(touchThreadAnchor).toHaveBeenCalledWith(
        'C0123456789',
        'certifier:cert:jane|pcc',
      );
    });

    it('a post under a STALE anchor rolls over to a fresh top-level root', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue({
        threadTs: '1700000000.000001',
        // 3 days idle — past the TTL, must not resurrect the dormant thread.
        lastActivityAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
      });
      const channel = await connected();

      await channel.sendMessage(JID, 'lead re-engaged', {
        threadKey: 'sales:entry:622',
      });

      const post = currentApp().client.chat.postMessage;
      // Fresh root: no thread_ts, no broadcast — it's a top-level post at the
      // channel bottom, NOT a reply into the old thread.
      expect(post.mock.calls[0][0].thread_ts).toBeUndefined();
      expect(post.mock.calls[0][0].reply_broadcast).toBeUndefined();
      // The anchor is repointed at the new root.
      expect(rollThreadAnchor).toHaveBeenCalledWith(
        'C0123456789',
        'sales:entry:622',
        '1704067200.000100',
      );
      expect(touchThreadAnchor).not.toHaveBeenCalled();
      expect(recordThreadAnchor).not.toHaveBeenCalled();
    });

    it('an explicit threadTs wins over threadKey (no anchor lookup)', async () => {
      const channel = await connected();

      await channel.sendMessage(JID, 'reply', {
        threadTs: '1699999999.000009',
        threadKey: 'sales:entry:42',
      });

      const post = currentApp().client.chat.postMessage;
      expect(post.mock.calls[0][0].thread_ts).toBe('1699999999.000009');
      // A conversational threadTs reply (human is watching that thread) stays
      // quiet — only anchor-resolved replies broadcast.
      expect(post.mock.calls[0][0].reply_broadcast).toBeUndefined();
      expect(resolveThreadAnchor).not.toHaveBeenCalled();
      expect(recordThreadAnchor).not.toHaveBeenCalled();
    });
  });

  // --- Canonical lead threading (one root per lead) ---

  describe('lead thread canonicalization', () => {
    const JID = 'slack:C0AHV1SGT6W';
    const HANDOFF = `[HANDOFF: inbox→sales]
Party ID: 10088
Name: Oana Tue
Email: oana.tue.coach@gmail.com
Message: I have four questions about the AAMC program.`;
    const CARD = `[SALES REVIEW] Lead #938
Category: program-info
Email: oana.tue.coach@gmail.com

DRAFT RESPONSE TO LEAD:
---
Hi Oana, good to hear from you.
---`;

    async function connected() {
      const channel = new SlackChannel(createTestOpts());
      await channel.connect();
      return channel;
    }

    it('anchors the inbound handoff on the lead email, not the author key', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
      const channel = await connected();

      await channel.sendMessage(JID, HANDOFF, {
        fromGroup: 'inbox',
        threadKey: 'inbox:lead:oana.tue.coach@gmail.com',
      });

      expect(resolveThreadAnchor).toHaveBeenCalledWith(
        'C0AHV1SGT6W',
        'lead:oana.tue.coach@gmail.com',
      );
      expect(recordThreadAnchor).toHaveBeenCalledWith(
        'C0AHV1SGT6W',
        'lead:oana.tue.coach@gmail.com',
        '1704067200.000100',
      );
    });

    // Entry #871, 2026-07-31: the agent retyped the root ts out of its prompt as
    // 1785510996.909199 when the real root was ...909209. Slack does not reject
    // an unknown thread_ts — it posts to the channel — so the draft landed below
    // the thread instead of inside it. The host knows the canonical root.
    it('overrides a wrong agent-supplied threadTs with the canonical lead anchor', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue({
        threadTs: '1785510996.909209',
        lastActivityAt: new Date().toISOString(),
      });
      const channel = await connected();

      await channel.sendMessage(JID, CARD, {
        fromGroup: 'sales',
        threadTs: '1785510996.909199',
      });

      expect(resolveThreadAnchor).toHaveBeenCalledWith(
        'C0AHV1SGT6W',
        'lead:oana.tue.coach@gmail.com',
      );
      const post = currentApp().client.chat.postMessage;
      expect(post.mock.calls[0][0].thread_ts).toBe('1785510996.909209');
    });

    it('threads the sales card under that root instead of opening a second one', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue({
        threadTs: '1785230544.590929',
        lastActivityAt: new Date().toISOString(),
      });
      const channel = await connected();

      // The agent still passes its own entry-scoped key; the host overrides it.
      await channel.sendMessage(JID, CARD, {
        fromGroup: 'sales',
        threadKey: 'sales:entry:938',
      });

      const post = currentApp().client.chat.postMessage;
      expect(resolveThreadAnchor).toHaveBeenCalledWith(
        'C0AHV1SGT6W',
        'lead:oana.tue.coach@gmail.com',
      );
      expect(post.mock.calls[0][0].thread_ts).toBe('1785230544.590929');
      // Broadcast, so the card reaches the channel timeline as well as the
      // thread. Suppressing it here hid a customer follow-up and its draft
      // entirely — the operator reported the email as never having arrived
      // (Oana Tue, 2026-07-28T12:27Z). Deduplication is the card's job, not
      // the thread's.
      expect(post.mock.calls[0][0].reply_broadcast).toBe(true);
    });

    it('leaves non-lead messages on their author-supplied key', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
      const channel = await connected();

      await channel.sendMessage(JID, 'cert issued for jane', {
        threadKey: 'certifier:cert:jane|pcc',
      });

      expect(resolveThreadAnchor).toHaveBeenCalledWith(
        'C0AHV1SGT6W',
        'certifier:cert:jane|pcc',
      );
    });

    // Per-lead status lines name their lead by pipeline entry id and carry no
    // labelled address, so before this they anchored nothing and posted at the
    // channel root while the card and send sat in a thread.
    describe('status lines anchored by entry id', () => {
      async function withResolver(
        resolveLeadEmail: (id: number) => Promise<string | undefined>,
      ) {
        const channel = new SlackChannel(createTestOpts({ resolveLeadEmail }));
        await channel.connect();
        return channel;
      }

      it('anchors "Lead #N …" on the resolved lead email', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const channel = await withResolver(async () => 'lead@example.com');

        await channel.sendMessage(JID, 'Lead #611 — proposal sent', {
          fromGroup: 'sales',
        });

        expect(resolveThreadAnchor).toHaveBeenCalledWith(
          'C0AHV1SGT6W',
          'lead:lead@example.com',
        );
      });

      it('threads a "[NO ACTION] Entry #N" line under the existing lead root', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue({
          threadTs: '1785230544.590929',
          lastActivityAt: new Date().toISOString(),
        });
        const channel = await withResolver(async () => 'lead@example.com');

        await channel.sendMessage(
          JID,
          '[NO ACTION] Entry #85 — nothing to do',
          {
            fromGroup: 'sales',
          },
        );

        const post = currentApp().client.chat.postMessage;
        expect(post.mock.calls[0][0].thread_ts).toBe('1785230544.590929');
      });

      it('passes the parsed entry id to the resolver', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const resolveLeadEmail = vi.fn(async () => 'lead@example.com');
        const channel = await withResolver(resolveLeadEmail);

        await channel.sendMessage(JID, 'Lead #611 — proposal sent');

        expect(resolveLeadEmail).toHaveBeenCalledWith(611);
      });

      // The address route is authoritative and free; the id route is a fallback.
      it('prefers a labelled address over an id lookup', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const resolveLeadEmail = vi.fn(async () => 'wrong@example.com');
        const channel = await withResolver(resolveLeadEmail);

        await channel.sendMessage(JID, CARD, { fromGroup: 'sales' });

        expect(resolveLeadEmail).not.toHaveBeenCalled();
        expect(resolveThreadAnchor).toHaveBeenCalledWith(
          'C0AHV1SGT6W',
          'lead:oana.tue.coach@gmail.com',
        );
      });

      it('falls back to the author key when the entry cannot be resolved', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const channel = await withResolver(async () => undefined);

        await channel.sendMessage(JID, 'Lead #611 — proposal sent', {
          threadKey: 'sales:entry:611',
        });

        expect(resolveThreadAnchor).toHaveBeenCalledWith(
          'C0AHV1SGT6W',
          'sales:entry:611',
        );
      });

      it('does not anchor a roundup naming two leads', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const resolveLeadEmail = vi.fn(async () => 'lead@example.com');
        const channel = await withResolver(resolveLeadEmail);

        await channel.sendMessage(
          JID,
          'Entry #101 updated ✓\nStill pending: Entry #97',
        );

        expect(resolveLeadEmail).not.toHaveBeenCalled();
      });

      it('still delivers the message when the resolver rejects', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const channel = new SlackChannel(
          createTestOpts({
            resolveLeadEmail: async () => {
              throw new Error('db down');
            },
          }),
        );
        await channel.connect();

        await expect(
          channel.sendMessage(JID, 'Lead #611 — proposal sent'),
        ).resolves.toBeUndefined();
      });

      it('anchors nothing by id when no resolver is wired', async () => {
        vi.mocked(resolveThreadAnchor).mockReturnValue(undefined);
        const channel = await connected();

        await channel.sendMessage(JID, 'Lead #611 — proposal sent', {
          threadKey: 'sales:entry:611',
        });

        expect(resolveThreadAnchor).toHaveBeenCalledWith(
          'C0AHV1SGT6W',
          'sales:entry:611',
        );
      });
    });

    it('still broadcasts non-lead anchored replies', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue({
        threadTs: '1700000000.000001',
        lastActivityAt: new Date().toISOString(),
      });
      const channel = await connected();

      await channel.sendMessage(JID, 'cert resent', {
        threadKey: 'certifier:cert:jane|pcc',
      });

      expect(
        currentApp().client.chat.postMessage.mock.calls[0][0].reply_broadcast,
      ).toBe(true);
    });

    it('splits a long card on a line boundary and keeps every part in-thread', async () => {
      vi.mocked(resolveThreadAnchor).mockReturnValue({
        threadTs: '1785230544.590929',
        lastActivityAt: new Date().toISOString(),
      });
      const channel = await connected();

      const body = Array.from(
        { length: 400 },
        (_, i) => `Paragraph ${i} of the proposed response to the lead.`,
      ).join('\n');
      await channel.sendMessage(JID, `${CARD}\n${body}`, {
        fromGroup: 'sales',
      });

      const post = currentApp().client.chat.postMessage;
      expect(post.mock.calls.length).toBeGreaterThan(1);
      for (const [call] of post.mock.calls) {
        expect(call.thread_ts).toBe('1785230544.590929');
        // A boundary-aware split never starts a chunk mid-word.
        expect(call.text.startsWith(' ')).toBe(false);
        expect(call.text).not.toMatch(/^[a-z]+ of the proposed/);
      }
    });
  });
});
