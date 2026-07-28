import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { App, LogLevel } from '@slack/bolt';
import type { GenericMessageEvent, BotMessageEvent } from '@slack/types';
import type { ChatPostMessageArguments } from '@slack/web-api';

const execFileP = promisify(execFile);

import {
  classifyAttachment,
  extractIWorkPdf,
  extractOdfText,
} from '../attachment-convert.js';
import { promoteBriefItem } from '../brief-promote.js';
import {
  ASSISTANT_NAME,
  SLACK_THREAD_TTL_MS,
  TRIGGER_PATTERN,
} from '../config.js';
import {
  getMessageById,
  recordThreadAnchor,
  resolveThreadAnchor,
  rollThreadAnchor,
  touchThreadAnchor,
  updateChatName,
} from '../db.js';
import { readEnvFile } from '../env.js';
import { deriveLeadThreadKey } from '../lead-thread-key.js';
import { logger } from '../logger.js';
import { splitForSlack } from '../message-split.js';
import {
  buildApprovalContent,
  isApprovalOnlyText,
  isCheckReaction,
  isThumbsDownReaction,
  resolveApprovalThreadTs,
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

// Attachment routing (text / doc / odf / iwork / unsupported) lives in
// attachment-convert.ts. Office+PDF go through markitdown, which dispatches by
// extension to pdfminer / mammoth / openpyxl / python-pptx. On any failure we
// inline a note rather than silently dropping the file — a dropped attachment
// reads to the agent as "no submission" and it asks the sender to attach the
// file they just attached (grader, 2026-07-28T01:52Z).
const MAX_DOC_DOWNLOAD_SIZE = 25 * 1024 * 1024; // 25 MB
const MARKITDOWN_BIN =
  process.env.NANOCLAW_MARKITDOWN_BIN ||
  join(homedir(), '.nanoclaw-venvs', 'markitdown', 'bin', 'markitdown');
const MARKITDOWN_TIMEOUT_MS = 90_000;
const MARKITDOWN_MAX_OUTPUT = 20 * 1024 * 1024; // 20 MB of extracted text

function escapeAttr(s: string): string {
  return s.replace(/[<>"&]/g, '_');
}

function attachedFileTag(name: string, body: string, type?: string): string {
  const t = type ? ` type="${escapeAttr(type)}"` : '';
  return `\n<attached_file name="${escapeAttr(name)}"${t}>\n${body}\n</attached_file>`;
}

function attachedFileNote(name: string, note: string): string {
  return `\n<attached_file name="${escapeAttr(name)}" note="${escapeAttr(note)}" />`;
}

/**
 * Convert a pdf/office document buffer to markdown via the markitdown CLI.
 * Writes the buffer to a temp file (markitdown dispatches on extension), runs
 * the converter with a timeout, and always cleans up. Returns null on failure.
 */
async function convertViaMarkitdown(
  buf: Buffer,
  ext: string,
  id: string,
): Promise<string | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanoclaw-att-'));
    const fp = join(dir, `${id}.${ext}`);
    await writeFile(fp, buf);
    const { stdout } = await execFileP(MARKITDOWN_BIN, [fp], {
      timeout: MARKITDOWN_TIMEOUT_MS,
      maxBuffer: MARKITDOWN_MAX_OUTPUT,
    });
    return stdout.trim() || null;
  } catch (err) {
    logger.warn({ id, ext, err }, 'markitdown conversion failed');
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

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

  // Host-side rejection OBSERVERS. Unlike listeners, every observer runs on each
  // 👎 regardless of what the claim-chain does — a side effect that must not
  // preempt the listeners (e.g. dropping a follow-up lead while the autonomy
  // listener still cancels the same draft's pending auto-send). Return value
  // ignored.
  private rejectObservers: Array<
    (ts: string, reactor: string) => Promise<void>
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

      // Download attachments (text inlined verbatim; pdf/office docs converted
      // to markdown via markitdown) and append them to the message content.
      const files = (msg as { files?: SlackFile[] }).files;
      if (files && !isBotMessage) {
        const inlined = await this.downloadAndInlineFiles(files);
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

      // Prefer the STORED message body for the approval quote. fetchMessageText
      // uses conversations.history, which does not return threaded replies —
      // so a reaction on a threaded draft yielded an empty "Approved message"
      // and left the resumed agent without the text it was approving, a factor
      // in the 2026-07-21 stale-draft send. The store holds full text for both
      // root and threaded messages; fall back to the API only when the message
      // isn't in our store yet.
      const reacted = getMessageById(event.item.ts);
      const quoted =
        reacted?.content ||
        (await this.fetchMessageText(channelId, event.item.ts));

      // Route the approval into the SAME thread the reacted message lives in, so
      // it resumes that message's session/context instead of forking a brand-new
      // one (see resolveApprovalThreadTs).
      const routeThreadTs = resolveApprovalThreadTs(
        reacted,
        jid,
        event.item.ts,
      );

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
        thread_ts: routeThreadTs,
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
      // Observers first — they always run, independent of the claim-chain below.
      for (const observer of this.rejectObservers) {
        try {
          await observer(event.item.ts, reactor);
        } catch (err) {
          logger.warn({ err }, 'Slack: reject observer threw');
        }
      }
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
    // A lead-bearing message keys on the lead itself, overriding whatever
    // namespace its author invented. Without this the inbox handoff and the
    // sales approval card anchor separately and the operator gets two roots per
    // lead. See lead-thread-key.ts.
    const leadKey = deriveLeadThreadKey(text);
    const threadKey = leadKey ?? opts?.threadKey;

    if (!this.connected) {
      this.outgoingQueue.push({ jid, text, opts });
      logger.info(
        { jid, queueSize: this.outgoingQueue.length },
        'Slack disconnected, message queued',
      );
      return;
    }

    // Entity-anchored threading: a threadKey collapses repeated posts about the
    // same work-unit into one thread. An explicit threadTs always wins (the
    // caller already knows the thread). Resolved at send time so a queued-then-
    // flushed post still threads correctly. Three outcomes for a threadKey:
    //   - no anchor yet      → this post becomes the root (recordThreadAnchor)
    //   - anchor, still fresh → reply under it + broadcast (touchThreadAnchor)
    //   - anchor, gone stale  → don't resurrect; fresh root at the channel
    //                           bottom, repoint the anchor (rollThreadAnchor)
    let effectiveThreadTs = threadTs;
    let keyToAnchor: string | undefined; // brand-new key → INSERT (race-safe)
    let keyToRoll: string | undefined; // dormant key → repoint to fresh root
    let keyToTouch: string | undefined; // active key → bump last activity
    let anchoredReply = false;
    if (threadKey && !effectiveThreadTs) {
      const existing = resolveThreadAnchor(channelId, threadKey);
      if (!existing) {
        keyToAnchor = threadKey;
      } else {
        const idleMs = Date.now() - Date.parse(existing.lastActivityAt);
        if (Number.isNaN(idleMs) || idleMs > SLACK_THREAD_TTL_MS) {
          keyToRoll = threadKey;
        } else {
          effectiveThreadTs = existing.threadTs;
          anchoredReply = true;
          keyToTouch = threadKey;
        }
      }
    }

    try {
      // Prefix agent messages with group name for readability
      const prefix =
        fromGroup && !text.startsWith('[') ? `[${fromGroup}]\n` : '';
      const displayText = prefix + text;

      const baseOpts: {
        channel: string;
        thread_ts?: string;
        reply_broadcast?: boolean;
      } = {
        channel: channelId,
      };
      if (effectiveThreadTs) baseOpts.thread_ts = effectiveThreadTs;
      // A reply under a still-active anchor threads under it, but a quiet
      // threaded reply can scroll off in a busy channel. Broadcast it so it also
      // lands at the channel bottom AND stays grouped in the thread. New/rolled
      // roots already post top-level; conversational threadTs replies (a human is
      // actively watching that thread) are left quiet. (Stale anchors don't reach
      // here — they roll over to a fresh top-level root above.)
      //
      // Lead threads broadcast too, and MUST. Exempting them (2026-07-28,
      // reasoning that a broadcast card is duplication) re-created the exact
      // bug the broadcast was added to fix on 2026-06-29: a reply under an
      // existing anchor goes into a collapsed thread that never surfaces in the
      // channel timeline, so new activity is invisible. Within four hours a
      // customer's follow-up, its draft reply, and the agent's two open
      // questions all landed silently in a thread and the operator reported the
      // email as never having arrived (Oana Tue, Entry 938, 12:27–12:32Z).
      //
      // The operator's actual complaint was DUPLICATED CONTENT — three roots per
      // lead, the inbound quoted twice, plus a pointless recap. That is fixed by
      // the trimmed card and the suppressed root recap, not by hiding posts.
      if (anchoredReply) baseOpts.reply_broadcast = true;

      // Slack limits messages to ~4000 characters; split if needed
      if (displayText.length <= MAX_MESSAGE_LENGTH) {
        const result = await this.app.client.chat.postMessage({
          ...baseOpts,
          text: displayText,
        } as ChatPostMessageArguments);
        // storeOutbound is the sole persistence path for our own messages —
        // Socket Mode doesn't reliably echo bot_message events back, and the
        // event handler skips the ones it does receive.
        if (result.ts) {
          this.storeOutbound(
            jid,
            result.ts,
            text,
            fromGroup,
            effectiveThreadTs,
          );
          if (keyToAnchor)
            recordThreadAnchor(channelId, keyToAnchor, result.ts);
          else if (keyToRoll) rollThreadAnchor(channelId, keyToRoll, result.ts);
          else if (keyToTouch) touchThreadAnchor(channelId, keyToTouch);
        }
      } else {
        // Break on paragraph/line/word boundaries — a raw slice cuts mid-word
        // and an operator cannot read a draft that splits inside a sentence.
        for (const chunk of splitForSlack(displayText, MAX_MESSAGE_LENGTH)) {
          const result = await this.app.client.chat.postMessage({
            ...baseOpts,
            text: chunk,
          } as ChatPostMessageArguments);
          if (result.ts) {
            this.storeOutbound(
              jid,
              result.ts,
              chunk,
              fromGroup,
              effectiveThreadTs,
            );
            // First chunk of a new/rolled-root post becomes the root; pin the
            // rest of the chunks (and the recorded anchor) under it so a split
            // message stays in one thread.
            if (keyToAnchor || keyToRoll) {
              if (keyToAnchor)
                recordThreadAnchor(channelId, keyToAnchor, result.ts);
              else if (keyToRoll)
                rollThreadAnchor(channelId, keyToRoll, result.ts);
              effectiveThreadTs = result.ts;
              baseOpts.thread_ts = result.ts;
              keyToAnchor = undefined;
              keyToRoll = undefined;
            } else if (keyToTouch) {
              touchThreadAnchor(channelId, keyToTouch);
              keyToTouch = undefined;
            }
          }
          // Only the first chunk of a multi-part anchored reply broadcasts to
          // the channel — the rest stay quiet in the thread.
          if (baseOpts.reply_broadcast) baseOpts.reply_broadcast = false;
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
   * Register a host-side rejection (👎) OBSERVER. Invoked for every 👎 on a Mr
   * Gru message and always runs, independent of the claim-chain (unlike a
   * listener, its return is ignored and it never suppresses other handlers).
   * Use for side effects that must coexist with a listener — e.g. dropping a
   * follow-up lead while the autonomy listener still cancels its auto-send.
   */
  registerRejectObserver(
    fn: (ts: string, reactor: string) => Promise<void>,
  ): void {
    this.rejectObservers.push(fn);
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
  /**
   * Download attachments and return them as inline content. Plain text/CSV is
   * inlined verbatim; pdf/office docs are converted to markdown via markitdown
   * so the container agent gets readable text for every format. Each attachment
   * becomes an <attached_file> block (or a note if it could not be read).
   */
  private async downloadAndInlineFiles(files: SlackFile[]): Promise<string> {
    const parts: string[] = [];
    for (const file of files) {
      if (!file.url_private_download) continue;
      const ext = (file.filetype || '').toLowerCase();
      switch (classifyAttachment(ext, file.mimetype)) {
        case 'text':
          parts.push(await this.inlineTextFile(file));
          break;
        case 'doc':
          parts.push(await this.inlineDocFile(file, ext || 'bin'));
          break;
        case 'odf':
          parts.push(await this.inlineOdfFile(file));
          break;
        case 'iwork':
          parts.push(await this.inlineIWorkFile(file, ext));
          break;
        // Both remaining kinds emit a note rather than nothing: the agent must
        // be able to tell "no file was sent" from "a file was sent that I
        // cannot read". Silence reads as the former and produces a request to
        // attach the file the sender already attached.
        case 'image':
          parts.push(
            attachedFileNote(
              file.name,
              'image attachment — not readable as text; ask the sender to send the text itself',
            ),
          );
          break;
        default:
          parts.push(
            attachedFileNote(
              file.name,
              `unsupported format "${ext || file.mimetype || 'unknown'}" — ask the sender to re-send as PDF, Word (.docx), or plain text`,
            ),
          );
          break;
      }
    }
    return parts.join('');
  }

  /** Download a Slack file with the bot token; null on non-OK response. */
  private async fetchFile(file: SlackFile): Promise<Response | null> {
    // Slack downloads require the bot token (files:read) as an Authorization header.
    const resp = await fetch(file.url_private_download as string, {
      headers: { Authorization: `Bearer ${this.botToken}` },
    });
    if (!resp.ok) {
      logger.warn(
        { fileId: file.id, status: resp.status },
        'Failed to download Slack file',
      );
      return null;
    }
    return resp;
  }

  /** Inline a plain-text/CSV attachment verbatim (100 KB cap). */
  private async inlineTextFile(file: SlackFile): Promise<string> {
    if (file.size > MAX_FILE_DOWNLOAD_SIZE) {
      logger.warn(
        { fileId: file.id, size: file.size },
        'Text file too large to inline, skipping',
      );
      return '';
    }
    try {
      const resp = await this.fetchFile(file);
      if (!resp) return '';
      return attachedFileTag(file.name, await resp.text());
    } catch (err) {
      logger.warn(
        { fileId: file.id, name: file.name, err },
        'Error downloading text file',
      );
      return '';
    }
  }

  /** Download a pdf/office doc and inline its markitdown-extracted markdown. */
  private async inlineDocFile(file: SlackFile, ext: string): Promise<string> {
    try {
      const buf = await this.fetchDocBuffer(file);
      if (typeof buf === 'string') return buf;
      const md = await convertViaMarkitdown(buf, ext, file.id);
      if (md) {
        logger.debug(
          { fileId: file.id, name: file.name, chars: md.length },
          'Converted attachment via markitdown',
        );
        return attachedFileTag(file.name, md, ext);
      }
      return attachedFileNote(
        file.name,
        'could not extract text; ask sender to paste it',
      );
    } catch (err) {
      logger.warn(
        { fileId: file.id, name: file.name, err },
        'Error converting document attachment',
      );
      return attachedFileNote(file.name, 'conversion error');
    }
  }

  /** Inline an OpenDocument file's text, extracted from its `content.xml`. */
  private async inlineOdfFile(file: SlackFile): Promise<string> {
    const buf = await this.fetchDocBuffer(file);
    if (typeof buf === 'string') return buf;
    try {
      const text = await extractOdfText(buf, file.id);
      if (text) {
        logger.debug(
          { fileId: file.id, name: file.name, chars: text.length },
          'Extracted OpenDocument attachment',
        );
        return attachedFileTag(file.name, text, file.filetype || 'odf');
      }
      return attachedFileNote(file.name, 'OpenDocument file holds no text');
    } catch (err) {
      logger.warn(
        { fileId: file.id, name: file.name, err },
        'Error extracting OpenDocument attachment',
      );
      return attachedFileNote(file.name, 'OpenDocument conversion error');
    }
  }

  /**
   * Inline an Apple Pages/Numbers file via its embedded preview PDF. Documents
   * saved without one carry only a `preview.jpg` thumbnail of page 1, and their
   * real text sits in Snappy-compressed protobuf we do not parse — so say so.
   */
  private async inlineIWorkFile(file: SlackFile, ext: string): Promise<string> {
    const buf = await this.fetchDocBuffer(file);
    if (typeof buf === 'string') return buf;
    try {
      const pdf = await extractIWorkPdf(buf, file.id);
      if (pdf) {
        const md = await convertViaMarkitdown(pdf, 'pdf', file.id);
        if (md) {
          logger.debug(
            { fileId: file.id, name: file.name, chars: md.length },
            'Converted iWork attachment via embedded preview PDF',
          );
          return attachedFileTag(file.name, md, ext || 'iwork');
        }
      }
      return attachedFileNote(
        file.name,
        `Apple ${ext || 'iWork'} file with no readable preview — ask the sender to export it as PDF or Word (.docx) and re-send`,
      );
    } catch (err) {
      logger.warn(
        { fileId: file.id, name: file.name, err },
        'Error converting iWork attachment',
      );
      return attachedFileNote(file.name, 'iWork conversion error');
    }
  }

  /**
   * Shared download for convertible documents. Returns the bytes, or an
   * already-formatted note string when the file is too large or unfetchable.
   */
  private async fetchDocBuffer(file: SlackFile): Promise<Buffer | string> {
    if (file.size > MAX_DOC_DOWNLOAD_SIZE) {
      logger.warn(
        { fileId: file.id, size: file.size },
        'Document too large to convert, skipping',
      );
      return attachedFileNote(
        file.name,
        'too large to convert; paste key parts as text',
      );
    }
    const resp = await this.fetchFile(file);
    if (!resp) return attachedFileNote(file.name, 'download failed');
    return Buffer.from(await resp.arrayBuffer());
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
