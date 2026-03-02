import { App, LogLevel } from '@slack/bolt';
import type { GenericMessageEvent, BotMessageEvent } from '@slack/types';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { updateChatName } from '../db.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnBotJoinedChannel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
  SendMessageOpts,
} from '../types.js';

// Slack's chat.postMessage API limits text to ~4000 characters per call.
// Messages exceeding this are split into sequential chunks.
const MAX_MESSAGE_LENGTH = 4000;

// The message subtypes we process. Bolt delivers all subtypes via app.event('message');
// we filter to regular messages (GenericMessageEvent, subtype undefined) and bot messages
// (BotMessageEvent, subtype 'bot_message') so we can track our own output.
type HandledMessageEvent = GenericMessageEvent | BotMessageEvent;

export interface SlackChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  onBotJoinedChannel?: OnBotJoinedChannel;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class SlackChannel implements Channel {
  name = 'slack';

  private app: App;
  private botUserId: string | undefined;
  private connected = false;
  private outgoingQueue: Array<{ jid: string; text: string; opts?: SendMessageOpts }> = [];
  private flushing = false;
  private userNameCache = new Map<string, string>();
  // Maps Slack message ts → fromGroup for bot messages we sent.
  // The event handler looks this up to set from_group on stored messages.
  private pendingFromGroup = new Map<string, string>();

  private opts: SlackChannelOpts;

  constructor(opts: SlackChannelOpts) {
    this.opts = opts;

    // Read tokens from .env (not process.env — keeps secrets off the environment
    // so they don't leak to child processes, matching NanoClaw's security pattern)
    const env = readEnvFile(['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']);
    const botToken = env.SLACK_BOT_TOKEN;
    const appToken = env.SLACK_APP_TOKEN;

    if (!botToken || !appToken) {
      throw new Error(
        'SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in .env',
      );
    }

    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      logLevel: LogLevel.ERROR,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Auto-register when the bot is invited to a new channel
    this.app.event('member_joined_channel', async ({ event }) => {
      if (!this.botUserId || event.user !== this.botUserId) return;

      const channelId = event.channel;
      const jid = `slack:${channelId}`;

      let name = channelId;
      try {
        const info = await this.app.client.conversations.info({
          channel: channelId,
        });
        name = (info.channel as { name?: string })?.name || channelId;
      } catch (err) {
        logger.warn(
          { err, channel: channelId },
          'Slack: failed to fetch channel info on join',
        );
      }

      this.opts.onChatMetadata(
        jid,
        new Date().toISOString(),
        name,
        'slack',
        true,
      );

      if (this.opts.onBotJoinedChannel) {
        this.opts.onBotJoinedChannel(jid, name);
      }
    });

    // Use app.event('message') instead of app.message() to capture all
    // message subtypes including bot_message (needed to track our own output)
    this.app.event('message', async ({ event }) => {
      // Bolt's event type is the full MessageEvent union (17+ subtypes).
      // We filter on subtype first, then narrow to the two types we handle.
      const subtype = (event as { subtype?: string }).subtype;
      if (subtype && subtype !== 'bot_message') return;

      // After filtering, event is either GenericMessageEvent or BotMessageEvent
      const msg = event as HandledMessageEvent;

      if (!msg.text) return;

      // Extract thread_ts for thread-aware routing
      const threadTs = (msg as { thread_ts?: string }).thread_ts;

      const jid = `slack:${msg.channel}`;
      const timestamp = new Date(parseFloat(msg.ts) * 1000).toISOString();
      const isGroup = msg.channel_type !== 'im';

      // Always report metadata for group discovery
      this.opts.onChatMetadata(jid, timestamp, undefined, 'slack', isGroup);

      // Only deliver full messages for registered groups
      const groups = this.opts.registeredGroups();
      if (!groups[jid]) return;

      const isBotMessage = !!msg.bot_id || msg.user === this.botUserId;

      let senderName: string;
      if (isBotMessage) {
        senderName = ASSISTANT_NAME;
      } else {
        senderName =
          (msg.user ? await this.resolveUserName(msg.user) : undefined) ||
          msg.user ||
          'unknown';
      }

      // Translate Slack <@UBOTID> mentions into TRIGGER_PATTERN format.
      // Slack encodes @mentions as <@U12345>, which won't match TRIGGER_PATTERN
      // (e.g., ^@<ASSISTANT_NAME>\b), so we prepend the trigger when the bot is @mentioned.
      let content = msg.text;
      if (this.botUserId && !isBotMessage) {
        const mentionPattern = `<@${this.botUserId}>`;
        if (
          content.includes(mentionPattern) &&
          !TRIGGER_PATTERN.test(content)
        ) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Look up from_group for bot messages we sent via sendMessage(jid, text, fromGroup)
      let fromGroup: string | undefined;
      if (isBotMessage) {
        fromGroup = this.pendingFromGroup.get(msg.ts);
        if (fromGroup) this.pendingFromGroup.delete(msg.ts);
      }

      this.opts.onMessage(jid, {
        id: msg.ts,
        chat_jid: jid,
        sender: msg.user || msg.bot_id || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: msg.user === this.botUserId,
        is_bot_message: isBotMessage,
        from_group: fromGroup,
        thread_ts: threadTs,
      });
    });
  }

  async connect(): Promise<void> {
    await this.app.start();

    // Get bot's own user ID for self-message detection.
    // Resolve this BEFORE setting connected=true so that messages arriving
    // during startup can correctly detect bot-sent messages.
    try {
      const auth = await this.app.client.auth.test();
      this.botUserId = auth.user_id as string;
      logger.info({ botUserId: this.botUserId }, 'Connected to Slack');
    } catch (err) {
      logger.warn({ err }, 'Connected to Slack but failed to get bot user ID');
    }

    this.connected = true;

    // Flush any messages queued before connection
    await this.flushOutgoingQueue();

    // Sync channel names on startup
    await this.syncChannelMetadata();
  }

  async sendMessage(jid: string, text: string, opts?: SendMessageOpts): Promise<void> {
    const channelId = jid.replace(/^slack:/, '');
    const fromGroup = opts?.fromGroup;
    const threadTs = opts?.threadTs;

    if (!this.connected) {
      this.outgoingQueue.push({ jid, text, opts });
      logger.info(
        { jid, queueSize: this.outgoingQueue.length },
        'Slack disconnected, message queued',
      );
      return;
    }

    try {
      const postOpts: { channel: string; text: string; thread_ts?: string } = {
        channel: channelId,
        text,
      };
      if (threadTs) postOpts.thread_ts = threadTs;

      // Slack limits messages to ~4000 characters; split if needed
      if (text.length <= MAX_MESSAGE_LENGTH) {
        const result = await this.app.client.chat.postMessage(postOpts);
        if (fromGroup && result.ts) {
          this.pendingFromGroup.set(result.ts, fromGroup);
          // FIFO eviction at 1000 entries to prevent memory leak
          if (this.pendingFromGroup.size > 1000) {
            this.pendingFromGroup.delete(this.pendingFromGroup.keys().next().value!);
          }
        }
      } else {
        for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
          const result = await this.app.client.chat.postMessage({
            ...postOpts,
            text: text.slice(i, i + MAX_MESSAGE_LENGTH),
          });
          if (fromGroup && result.ts) {
            this.pendingFromGroup.set(result.ts, fromGroup);
            if (this.pendingFromGroup.size > 1000) {
              this.pendingFromGroup.delete(this.pendingFromGroup.keys().next().value!);
            }
          }
        }
      }
      logger.info({ jid, length: text.length, fromGroup, threadTs }, 'Slack message sent');
    } catch (err) {
      this.outgoingQueue.push({ jid, text, opts });
      logger.warn(
        { jid, err, queueSize: this.outgoingQueue.length },
        'Failed to send Slack message, queued',
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('slack:');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await this.app.stop();
  }

  // Slack does not expose a typing indicator API for bots.
  // This no-op satisfies the Channel interface so the orchestrator
  // doesn't need channel-specific branching.
  async setTyping(_jid: string, _isTyping: boolean): Promise<void> {
    // no-op: Slack Bot API has no typing indicator endpoint
  }

  /**
   * Sync channel metadata from Slack.
   * Fetches channels the bot is a member of and stores their names in the DB.
   */
  async syncChannelMetadata(): Promise<void> {
    try {
      logger.info('Syncing channel metadata from Slack...');
      let cursor: string | undefined;
      let count = 0;

      do {
        const result = await this.app.client.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: 200,
          cursor,
        });

        for (const ch of result.channels || []) {
          if (ch.id && ch.name && ch.is_member) {
            const jid = `slack:${ch.id}`;
            updateChatName(jid, ch.name);
            count++;

            // Auto-register channels the bot is already in but hasn't registered yet
            if (
              this.opts.onBotJoinedChannel &&
              !this.opts.registeredGroups()[jid]
            ) {
              this.opts.onBotJoinedChannel(jid, ch.name);
            }
          }
        }

        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);

      logger.info({ count }, 'Slack channel metadata synced');
    } catch (err) {
      logger.error({ err }, 'Failed to sync Slack channel metadata');
    }
  }

  private async resolveUserName(userId: string): Promise<string | undefined> {
    if (!userId) return undefined;

    const cached = this.userNameCache.get(userId);
    if (cached) return cached;

    try {
      const result = await this.app.client.users.info({ user: userId });
      const name = result.user?.real_name || result.user?.name;
      if (name) this.userNameCache.set(userId, name);
      return name;
    } catch (err) {
      logger.debug({ userId, err }, 'Failed to resolve Slack user name');
      return undefined;
    }
  }

  private async flushOutgoingQueue(): Promise<void> {
    if (this.flushing || this.outgoingQueue.length === 0) return;
    this.flushing = true;
    try {
      logger.info(
        { count: this.outgoingQueue.length },
        'Flushing Slack outgoing queue',
      );
      while (this.outgoingQueue.length > 0) {
        const item = this.outgoingQueue.shift()!;
        const channelId = item.jid.replace(/^slack:/, '');
        const postOpts: { channel: string; text: string; thread_ts?: string } = {
          channel: channelId,
          text: item.text,
        };
        if (item.opts?.threadTs) postOpts.thread_ts = item.opts.threadTs;

        const result = await this.app.client.chat.postMessage(postOpts);
        if (item.opts?.fromGroup && result.ts) {
          this.pendingFromGroup.set(result.ts, item.opts.fromGroup);
        }
        logger.info(
          { jid: item.jid, length: item.text.length },
          'Queued Slack message sent',
        );
      }
    } finally {
      this.flushing = false;
    }
  }
}
