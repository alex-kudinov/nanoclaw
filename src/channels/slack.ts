import { App, LogLevel } from '@slack/bolt';
import type { GenericMessageEvent, BotMessageEvent } from '@slack/types';

import { promoteBriefItem } from '../brief-promote.js';
import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import {
  recordThreadAnchor,
  resolveThreadAnchor,
  updateChatName,
} from '../db.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import {
  buildApprovalContent,
  isApprovalOnlyText,
  isCheckReaction,
  isThumbsDownReaction,
} from '../slack-approval.js';
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
const TEXT_FILE_TYPES = new Set(['csv', 'text', 'plain', 'tsv', 'txt']);

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
  private lastActivityAt = Date.now();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  // Nuclear fallback: if no inbound events for this long, destroy and recreate
  // the entire App instance. @slack/socket-mode has built-in ping/pong (5s/30s)
  // + auto-reconnect that handles normal drops. We only intervene when that fails.
  // NEVER call app.stop() then app.start() on the same instance — the deferred
  // WebSocket close event creates zombie connections (see Session 5 postmortem).
  private static readonly NUCLEAR_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  // A healthy socket never fails to send. Clustered send failures mean the
  // WebSocket is half-open — still receiving events (which keep lastActivityAt
  // fresh, so the staleness check never fires) but unable to ACK or reply.
  private wsSendFailures = 0;
  private lastWsFailureAt = 0;
  private recreating = false;
  private static readonly WS_FAILURE_THRESHOLD = 3;
  private static readonly WS_FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  private opts: SlackChannelOpts;

  // Host-side approval listeners. A ✅ on a Mr Gru message is offered to each
  // listener; if one claims it (returns true), the normal agent-approval
  // injection is suppressed so a host-owned draft (e.g. a proposal follow-up)
  // doesn't also wake the channel's container.
  private approvalListeners: Array<
    (ts: string, reactor: string) => Promise<boolean>
  > = [];

  // Host-side rejection listeners. A 👎 on a Mr Gru message is offered to each;
  // a listener that owns the message (returns true) handles the skip.
  private rejectListeners: Array<
    (ts: string, reactor: string) => Promise<boolean>
  > = [];

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

    this.app.error(async (error) => {
      await this.handleAppError(error as Error);
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
      if (subtype && subtype !== 'bot_message' && subtype !== 'file_share')
        return;

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

      // Our own outbound is persisted synchronously by storeOutbound() at
      // send time, with from_group. Slack also echoes it back as a
      // bot_message event — re-storing it here is redundant, and after a
      // restart (when the in-process send context is gone) would overwrite
      // the good row's from_group with null, breaking handoff routing.
      if (msg.user === this.botUserId) return;

      // Own messages already returned above; a remaining bot_id is another app.
      const isBotMessage = !!msg.bot_id;

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

      // A message that is nothing but a check-mark (✅/☑️/✔️) is a bare
      // approval — normalize to explicit text so every minion reads it
      // uniformly (mirrors the ✅-reaction path below).
      if (!isBotMessage && isApprovalOnlyText(msg.text || '')) {
        content = buildApprovalContent({});
      }

      this.opts.onMessage(jid, {
        id: msg.ts,
        chat_jid: jid,
        sender: msg.user || msg.bot_id || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: isBotMessage,
        from_group: undefined,
        thread_ts: threadTs,
      });
    });

    // Check-mark reaction (✅/☑️/✔️) on a Mr Gru message = approval, in ANY
    // registered channel. Injected into the normal message pipeline so every
    // minion (and the healer) reads it identically — no per-minion changes.
    // Anyone in-channel may approve; only reactions on the bot's OWN messages
    // count, so a ✅ on a human message does nothing.
    this.app.event('reaction_added', async ({ event }) => {
      this.lastActivityAt = Date.now();
      if (!isCheckReaction(event.reaction)) return;
      if (event.item?.type !== 'message') return;
      if (event.user === this.botUserId) return; // ignore the bot's own reactions
      if (event.item_user !== this.botUserId) return; // only on Mr Gru's messages

      const channelId = event.item.channel;
      const jid = `slack:${channelId}`;
      if (!this.opts.registeredGroups()[jid]) return;

      const reactor =
        (await this.resolveUserName(event.user)) || event.user || 'someone';

      // Offer the approval to host-side listeners first (e.g. proposal
      // follow-ups). If a listener claims this message, suppress the normal
      // agent-approval injection so a host-owned draft doesn't also wake the
      // channel's container.
      for (const listener of this.approvalListeners) {
        try {
          if (await listener(event.item.ts, reactor)) return;
        } catch (err) {
          logger.warn({ err }, 'Slack: approval listener threw');
        }
      }

      const eventTs =
        (event as { event_ts?: string }).event_ts || event.item.ts;
      const quoted = await this.fetchMessageText(channelId, event.item.ts);

      this.opts.onMessage(jid, {
        id: `reaction-${eventTs}`,
        chat_jid: jid,
        sender: event.user,
        sender_name: reactor,
        content: buildApprovalContent({ reactor, quoted }),
        timestamp: new Date(parseFloat(eventTs) * 1000).toISOString(),
        is_from_me: false,
        is_bot_message: false,
        from_group: undefined,
        thread_ts: event.item.ts, // thread under the approved bot message
      });
    });

    // 📌 (pushpin) reaction on a Mr Gru decision-brief item = promote it into
    // Things 3 on the Studio. Isolated from the approval path above; parsing
    // guards (needs *bold title* + a domain word) mean a 📌 on any other bot
    // message is a no-op. On success we add a ✅ so the user sees it landed.
    this.app.event('reaction_added', async ({ event }) => {
      if (event.reaction !== 'pushpin') return;
      if (event.item?.type !== 'message') return;
      if (event.user === this.botUserId) return;
      if (event.item_user !== this.botUserId) return; // only on Mr Gru's messages

      const channelId = event.item.channel;
      if (!this.opts.registeredGroups()[`slack:${channelId}`]) return;

      const text = await this.fetchMessageText(channelId, event.item.ts);
      if (!text) return;
      const ok = await promoteBriefItem(text);
      if (!ok) return;
      try {
        await this.app.client.reactions.add({
          channel: channelId,
          timestamp: event.item.ts,
          name: 'white_check_mark',
        });
      } catch (err) {
        logger.warn({ err }, 'Slack: failed to add promote-confirm reaction');
      }
    });

    // 👎 reaction on a Mr Gru message = explicit "skip", offered to host-side
    // reject listeners (e.g. proposal follow-ups). Mirrors the approval path.
    this.app.event('reaction_added', async ({ event }) => {
      if (!isThumbsDownReaction(event.reaction)) return;
      if (event.item?.type !== 'message') return;
      if (event.user === this.botUserId) return;
      if (event.item_user !== this.botUserId) return; // only on Mr Gru's messages

      const channelId = event.item.channel;
      if (!this.opts.registeredGroups()[`slack:${channelId}`]) return;
      const reactor =
        (await this.resolveUserName(event.user)) || event.user || 'someone';
      for (const listener of this.rejectListeners) {
        try {
          if (await listener(event.item.ts, reactor)) return;
        } catch (err) {
          logger.warn({ err }, 'Slack: reject listener threw');
        }
      }
    });
  }

  /** Fetch a single message's text by ts (for quoting the approved message). */
  private async fetchMessageText(
    channel: string,
    ts: string,
  ): Promise<string | undefined> {
    try {
      const res = await this.app.client.conversations.history({
        channel,
        latest: ts,
        oldest: ts,
        inclusive: true,
        limit: 1,
      });
      const m = (res.messages as { text?: string }[] | undefined)?.[0];
      return m?.text || undefined;
    } catch (err) {
      logger.warn(
        { err, channel, ts },
        'Slack: failed to fetch reacted message text',
      );
      return undefined;
    }
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
        // App was marked disconnected by recreateApp failure — retry with backoff
        const delay = Math.min(60_000 * 2 ** this.reconnectAttempts, 900_000); // max 15 min
        if (Date.now() - this.lastActivityAt > delay) {
          logger.info(
            { attempt: this.reconnectAttempts + 1, delaySec: delay / 1000 },
            'Slack disconnected, recreating App',
          );
          await this.recreateApp();
        }
        return;
      }
      // Check WebSocket staleness. @slack/socket-mode handles normal drops
      // via built-in ping/pong + auto-reconnect. If no events for 15 min,
      // the library's reconnect has silently failed — nuclear recreate.
      const staleDuration = Date.now() - this.lastActivityAt;
      if (staleDuration > SlackChannel.NUCLEAR_THRESHOLD_MS) {
        logger.warn(
          { staleSec: Math.round(staleDuration / 1000) },
          'Slack WebSocket stale (no events for 15 min), recreating App',
        );
        await this.recreateApp();
        return;
      }
      // Periodic HTTP sanity check — only resets reconnectAttempts counter.
      // Does NOT trigger reconnect on failure (stale check handles that).
      try {
        await this.app.client.auth.test();
        this.reconnectAttempts = 0;
      } catch (err) {
        logger.warn(
          { err },
          'Slack auth.test() failed — will recreate if stale',
        );
      }
    }, 60_000);
  }

  /**
   * Nuclear fallback: destroy the current App and create a fresh one.
   * This avoids the stop/start race in @slack/socket-mode where the old
   * WebSocket's deferred close event fires after start() resets state,
   * creating zombie connections that poison the socket pool.
   */
  private async recreateApp(): Promise<void> {
    // Re-entrancy guard: the health check and the error handler can both
    // trigger a recreate, and a burst of errors fires the handler repeatedly.
    if (this.recreating) return;
    this.recreating = true;
    logger.warn('Slack: recreating App instance (nuclear fallback)');
    this.connected = false;
    this.wsSendFailures = 0;

    // Stop old app — best effort with timeout so we don't hang forever
    try {
      await Promise.race([
        this.app.stop(),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    } catch (err) {
      logger.warn({ err }, 'Slack: old app stop failed during recreate');
    }

    // Read tokens fresh from .env (may have been rotated)
    const env = readEnvFile(['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']);
    if (!env.SLACK_BOT_TOKEN || !env.SLACK_APP_TOKEN) {
      logger.error('Slack: cannot recreate — tokens missing from .env');
      this.reconnectAttempts++;
      this.recreating = false;
      return;
    }

    this.botToken = env.SLACK_BOT_TOKEN;
    this.app = new App({
      token: this.botToken,
      appToken: env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: LogLevel.ERROR,
    });

    this.app.error(async (error) => {
      await this.handleAppError(error as Error);
    });

    this.setupEventHandlers();

    try {
      await this.app.start();
      const auth = await this.app.client.auth.test();
      this.botUserId = auth.user_id as string;
      this.lastActivityAt = Date.now();
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info(
        { botUserId: this.botUserId },
        'Slack: recreated App successfully',
      );
      await this.flushOutgoingQueue();
    } catch (err) {
      this.reconnectAttempts++;
      logger.error(
        { err, attempt: this.reconnectAttempts },
        'Slack: recreateApp failed, will retry',
      );
    }
    this.recreating = false;
  }

  /**
   * Bolt app error handler. @slack/socket-mode has built-in auto-reconnect for
   * normal drops, so most errors are just logged. But a cluster of "client not
   * ready" send failures means the socket is half-open and that auto-reconnect
   * has stalled — the staleness check can't see this because inbound events
   * still arrive and keep lastActivityAt fresh. Force a recreate in that case.
   */
  private async handleAppError(error: Error): Promise<void> {
    logger.warn({ err: error }, 'Slack app error');

    const msg = String(error?.message ?? error).toLowerCase();
    const isSendFailure =
      msg.includes('is not ready') || msg.includes('no active connection');
    if (!isSendFailure) return;

    const now = Date.now();
    if (now - this.lastWsFailureAt > SlackChannel.WS_FAILURE_WINDOW_MS) {
      this.wsSendFailures = 0;
    }
    this.lastWsFailureAt = now;
    this.wsSendFailures++;

    if (
      this.wsSendFailures >= SlackChannel.WS_FAILURE_THRESHOLD &&
      this.connected &&
      !this.recreating
    ) {
      logger.warn(
        { failures: this.wsSendFailures },
        'Slack: WebSocket send failures clustered — forcing recreate',
      );
      await this.recreateApp();
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
    const threadKey = opts?.threadKey;

    if (!this.connected) {
      this.outgoingQueue.push({ jid, text, opts });
      logger.info(
        { jid, queueSize: this.outgoingQueue.length },
        'Slack disconnected, message queued',
      );
      return;
    }

    // Entity-anchored threading: a threadKey collapses repeated posts about the
    // same work-unit into one thread. Resolve an existing anchor → reply under
    // it; the first post about the key becomes the root and is recorded from
    // its ts after sending. An explicit threadTs always wins (the caller already
    // knows the thread). Resolved at send time so a queued-then-flushed post
    // still threads correctly.
    let effectiveThreadTs = threadTs;
    let keyToAnchor: string | undefined;
    if (threadKey && !effectiveThreadTs) {
      const existing = resolveThreadAnchor(channelId, threadKey);
      if (existing) effectiveThreadTs = existing;
      else keyToAnchor = threadKey;
    }

    try {
      // Prefix agent messages with group name for readability
      const prefix =
        fromGroup && !text.startsWith('[') ? `[${fromGroup}]\n` : '';
      const displayText = prefix + text;

      const baseOpts: { channel: string; thread_ts?: string } = {
        channel: channelId,
      };
      if (effectiveThreadTs) baseOpts.thread_ts = effectiveThreadTs;

      // Slack limits messages to ~4000 characters; split if needed
      if (displayText.length <= MAX_MESSAGE_LENGTH) {
        const result = await this.app.client.chat.postMessage({
          ...baseOpts,
          text: displayText,
        });
        // storeOutbound is the sole persistence path for our own messages —
        // Socket Mode doesn't reliably echo bot_message events back, and the
        // event handler skips the ones it does receive.
        if (result.ts) {
          this.storeOutbound(jid, result.ts, text, fromGroup, effectiveThreadTs);
          if (keyToAnchor) recordThreadAnchor(channelId, keyToAnchor, result.ts);
        }
      } else {
        for (let i = 0; i < displayText.length; i += MAX_MESSAGE_LENGTH) {
          const chunk = displayText.slice(i, i + MAX_MESSAGE_LENGTH);
          const result = await this.app.client.chat.postMessage({
            ...baseOpts,
            text: chunk,
          });
          if (result.ts) {
            this.storeOutbound(
              jid,
              result.ts,
              chunk,
              fromGroup,
              effectiveThreadTs,
            );
            // First chunk of a new-key post becomes the root; pin the rest of
            // the chunks (and the recorded anchor) under it so a split message
            // stays in one thread.
            if (keyToAnchor) {
              recordThreadAnchor(channelId, keyToAnchor, result.ts);
              effectiveThreadTs = result.ts;
              baseOpts.thread_ts = result.ts;
              keyToAnchor = undefined;
            }
          }
        }
      }
      this.lastActivityAt = Date.now();
      logger.info(
        { jid, length: text.length, fromGroup, threadTs: effectiveThreadTs },
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

  /**
   * Register a host-side approval listener. Invoked for every ✅ on a Mr Gru
   * message; return true to claim it (suppressing the agent-approval path).
   */
  registerApprovalListener(
    fn: (ts: string, reactor: string) => Promise<boolean>,
  ): void {
    this.approvalListeners.push(fn);
  }

  /**
   * Register a host-side rejection (👎) listener. Invoked for every 👎 on a Mr
   * Gru message; return true to claim it.
   */
  registerRejectListener(
    fn: (ts: string, reactor: string) => Promise<boolean>,
  ): void {
    this.rejectListeners.push(fn);
  }

  /**
   * Post a message and return its Slack ts (sendMessage returns void). Host
   * features that must later match a reaction to the exact message they posted
   * use this. Persists via storeOutbound like the normal send path.
   */
  async postTracked(
    jid: string,
    text: string,
    threadTs?: string,
  ): Promise<string | undefined> {
    if (!this.connected) {
      logger.warn({ jid }, 'postTracked: slack disconnected, dropping');
      return undefined;
    }
    const channelId = jid.replace(/^slack:/, '');
    const postOpts: { channel: string; text: string; thread_ts?: string } = {
      channel: channelId,
      text: text.slice(0, MAX_MESSAGE_LENGTH),
    };
    if (threadTs) postOpts.thread_ts = threadTs;
    try {
      const result = await this.app.client.chat.postMessage(postOpts);
      if (result.ts) {
        this.storeOutbound(jid, result.ts, text, undefined, threadTs);
        return result.ts;
      }
    } catch (err) {
      logger.warn({ jid, err }, 'postTracked: send failed');
    }
    return undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLastActivitySec(): number {
    return Math.round((Date.now() - this.lastActivityAt) / 1000);
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
