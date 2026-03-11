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
import { registerChannel } from './registry.js';

// Slack's chat.postMessage API limits text to ~4000 characters per call.
// Messages exceeding this are split into sequential chunks.
const MAX_MESSAGE_LENGTH = 4000;

// The message subtypes we process. Bolt delivers all subtypes via app.event('message');
// we filter to regular messages (GenericMessageEvent, subtype undefined) and bot messages
// (BotMessageEvent, subtype 'bot_message') so we can track our own output.
type HandledMessageEvent = GenericMessageEvent | BotMessageEvent;

// Slack file object (subset of fields we use)
interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private_download?: string;
}

// Max file size to download (100 KB — plenty for CSV lists, prevents abuse)
const MAX_FILE_DOWNLOAD_SIZE = 100 * 1024;

// MIME types and extensions we'll inline as text attachments
const TEXT_FILE_TYPES = new Set([
  'csv',
  'text',
  'plain',
  'tsv',
  'txt',
]);

export interface SlackChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  onBotJoinedChannel?: OnBotJoinedChannel;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class SlackChannel implements Channel {
  name = 'slack';

  private app: App;
  private botToken: string;
  private botUserId: string | undefined;
  private connected = false;
  private outgoingQueue: Array<{
    jid: string;
    text: string;
    opts?: SendMessageOpts;
  }> = [];
  private flushing = false;
  private userNameCache = new Map<string, string>();
  // Maps Slack message ts → fromGroup for bot messages we sent.
  // The event handler looks this up to set from_group on stored messages.
  private pendingFromGroup = new Map<string, string>();
  private lastActivityAt = Date.now();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  // WebSocket staleness: if no inbound events for this long, force reconnect.
  // auth.test() is HTTP and succeeds even when the WebSocket is dead.
  private static readonly STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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

    this.botToken = botToken;
    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      logLevel: LogLevel.ERROR,
    });

    // Catch WebSocket errors that Bolt logs to stderr by default.
    // These fire when the Socket Mode connection dies but auth.test() still works.
    this.app.error(async (error) => {
      const msg = error.message || String(error);
      if (msg.includes('WebSocket') || msg.includes('not ready')) {
        logger.warn({ err: error }, 'Slack WebSocket error, triggering reconnect');
        if (this.connected) await this.reconnect();
      } else {
        logger.error({ err: error }, 'Unhandled Slack app error');
      }
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
      this.lastActivityAt = Date.now();
      // Bolt's event type is the full MessageEvent union (17+ subtypes).
      // We filter on subtype first, then narrow to the two types we handle.
      const subtype = (event as { subtype?: string }).subtype;
      if (subtype && subtype !== 'bot_message' && subtype !== 'file_share') return;

      // After filtering, event is either GenericMessageEvent or BotMessageEvent
      const msg = event as HandledMessageEvent;

      // Allow messages with file attachments even if text is empty
      const hasFiles = !!(msg as { files?: unknown[] }).files?.length;
      if (!msg.text && !hasFiles) return;

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
      let content = msg.text || '';
      if (this.botUserId && !isBotMessage) {
        const mentionPattern = `<@${this.botUserId}>`;
        if (
          content.includes(mentionPattern) &&
          !TRIGGER_PATTERN.test(content)
        ) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Download text file attachments (CSV, TXT) and inline them
      const files = (msg as { files?: SlackFile[] }).files;
      if (files && !isBotMessage) {
        const inlined = await this.downloadTextFiles(files);
        if (inlined) content += inlined;
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

    this.startHealthCheck();
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.connected) {
        // Keep retrying reconnect with exponential backoff (max 5 min)
        const delay = Math.min(3000 * 2 ** this.reconnectAttempts, 300_000);
        if (Date.now() - this.lastActivityAt > delay) {
          logger.info(
            { attempt: this.reconnectAttempts + 1 },
            'Slack disconnected, attempting reconnect',
          );
          await this.reconnect();
        }
        return;
      }
      // Check WebSocket staleness: if no inbound events for 5 min,
      // the WebSocket is likely dead even though auth.test() (HTTP) passes.
      const staleDuration = Date.now() - this.lastActivityAt;
      if (staleDuration > SlackChannel.STALE_THRESHOLD_MS) {
        logger.warn(
          { staleSec: Math.round(staleDuration / 1000) },
          'Slack WebSocket stale (no events), forcing reconnect',
        );
        await this.reconnect();
        return;
      }
      try {
        await this.app.client.auth.test();
        this.reconnectAttempts = 0;
      } catch (err) {
        logger.warn({ err }, 'Slack health check failed, reconnecting');
        await this.reconnect();
      }
    }, 60_000);
  }

  private async reconnect(): Promise<void> {
    this.connected = false;
    try {
      await this.app.stop();
    } catch (err) {
      logger.warn({ err }, 'Slack stop failed during reconnect');
    }
    // Give Slack time to release the WebSocket before reconnecting
    await new Promise((r) => setTimeout(r, 3000));
    try {
      await this.app.start();
      const auth = await this.app.client.auth.test();
      this.botUserId = auth.user_id as string;
      this.lastActivityAt = Date.now();
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info('Slack reconnected successfully');
      await this.flushOutgoingQueue();
    } catch (err) {
      this.reconnectAttempts++;
      const nextDelay = Math.min(3000 * 2 ** this.reconnectAttempts, 300_000);
      logger.error(
        {
          err,
          attempt: this.reconnectAttempts,
          nextDelaySec: nextDelay / 1000,
        },
        'Slack reconnect failed, will retry',
      );
    }
  }

  async sendMessage(
    jid: string,
    text: string,
    opts?: SendMessageOpts,
  ): Promise<void> {
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
      // Prefix agent messages with group name for readability
      const prefix =
        fromGroup && !text.startsWith('[') ? `[${fromGroup}]\n` : '';
      const displayText = prefix + text;

      const baseOpts: { channel: string; thread_ts?: string } = {
        channel: channelId,
      };
      if (threadTs) baseOpts.thread_ts = threadTs;

      // Slack limits messages to ~4000 characters; split if needed
      if (displayText.length <= MAX_MESSAGE_LENGTH) {
        const result = await this.app.client.chat.postMessage({
          ...baseOpts,
          text: displayText,
        });
        if (fromGroup && result.ts) {
          this.pendingFromGroup.set(result.ts, fromGroup);
          if (this.pendingFromGroup.size > 1000) {
            this.pendingFromGroup.delete(
              this.pendingFromGroup.keys().next().value!,
            );
          }
        }
        // Store immediately — Socket Mode doesn't reliably deliver bot_message
        // events back to the same app, so the parent message may not reach the
        // DB before a thread reply triggers getThreadParent.
        if (result.ts) {
          this.storeOutbound(jid, result.ts, text, fromGroup, threadTs);
        }
      } else {
        for (let i = 0; i < displayText.length; i += MAX_MESSAGE_LENGTH) {
          const chunk = displayText.slice(i, i + MAX_MESSAGE_LENGTH);
          const result = await this.app.client.chat.postMessage({
            ...baseOpts,
            text: chunk,
          });
          if (fromGroup && result.ts) {
            this.pendingFromGroup.set(result.ts, fromGroup);
            if (this.pendingFromGroup.size > 1000) {
              this.pendingFromGroup.delete(
                this.pendingFromGroup.keys().next().value!,
              );
            }
          }
          if (result.ts) {
            this.storeOutbound(jid, result.ts, chunk, fromGroup, threadTs);
          }
        }
      }
      this.lastActivityAt = Date.now();
      logger.info(
        { jid, length: text.length, fromGroup, threadTs },
        'Slack message sent',
      );
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
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
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

  /**
   * Download text/CSV file attachments and return them as inline content.
   * Returns a string like "\n<attached_file name="data.csv">...contents...</attached_file>"
   * or empty string if no downloadable text files.
   */
  private async downloadTextFiles(files: SlackFile[]): Promise<string> {
    const parts: string[] = [];

    for (const file of files) {
      const ext = (file.filetype || '').toLowerCase();
      const isText =
        TEXT_FILE_TYPES.has(ext) ||
        file.mimetype?.startsWith('text/') ||
        file.mimetype === 'application/csv';

      if (!isText || !file.url_private_download) continue;
      if (file.size > MAX_FILE_DOWNLOAD_SIZE) {
        logger.warn(
          { fileId: file.id, name: file.name, size: file.size },
          'Slack file too large to inline, skipping',
        );
        continue;
      }

      try {
        // Slack file downloads require the bot token with files:read scope.
        // The token must be passed as Authorization header (not query param).
        const resp = await fetch(file.url_private_download, {
          headers: { Authorization: `Bearer ${this.botToken}` },
        });

        if (!resp.ok) {
          logger.warn(
            { fileId: file.id, status: resp.status },
            'Failed to download Slack file',
          );
          continue;
        }
        const text = await resp.text();
        const safeName = file.name.replace(/[<>"&]/g, '_');
        parts.push(
          `\n<attached_file name="${safeName}">\n${text}\n</attached_file>`,
        );
        logger.debug(
          { fileId: file.id, name: file.name, bytes: text.length },
          'Inlined Slack file attachment',
        );
      } catch (err) {
        logger.warn(
          { fileId: file.id, name: file.name, err },
          'Error downloading Slack file',
        );
      }
    }

    return parts.join('');
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

  /**
   * Store an outbound bot message immediately after posting.
   * Socket Mode doesn't reliably deliver bot_message events back to the same
   * app, so we can't rely on the event handler to persist the message in the DB.
   * INSERT OR REPLACE means this is idempotent if the event does fire later.
   */
  private storeOutbound(
    jid: string,
    ts: string,
    content: string,
    fromGroup: string | undefined,
    threadTs: string | undefined,
  ): void {
    const timestamp = new Date(parseFloat(ts) * 1000).toISOString();
    this.opts.onMessage(jid, {
      id: ts,
      chat_jid: jid,
      sender: this.botUserId || '',
      sender_name: ASSISTANT_NAME,
      content,
      timestamp,
      is_from_me: true,
      is_bot_message: true,
      from_group: fromGroup,
      thread_ts: threadTs,
    });
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
        const postOpts: { channel: string; text: string; thread_ts?: string } =
          {
            channel: channelId,
            text: item.text,
          };
        if (item.opts?.threadTs) postOpts.thread_ts = item.opts.threadTs;

        const result = await this.app.client.chat.postMessage(postOpts);
        if (item.opts?.fromGroup && result.ts) {
          this.pendingFromGroup.set(result.ts, item.opts.fromGroup);
        }
        if (result.ts) {
          this.storeOutbound(
            item.jid,
            result.ts,
            item.text,
            item.opts?.fromGroup,
            item.opts?.threadTs,
          );
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

// Self-register when this module is imported
registerChannel('slack', (opts) => {
  const env = readEnvFile(['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']);
  if (!env.SLACK_BOT_TOKEN || !env.SLACK_APP_TOKEN) {
    logger.info(
      'Slack channel disabled — SLACK_BOT_TOKEN or SLACK_APP_TOKEN not set',
    );
    return null;
  }
  return new SlackChannel(opts);
});
