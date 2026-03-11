/**
 * Gmail Channel — polls for labeled emails via Gmail API.
 *
 * Inbound: polls messages.list(labelIds) on a chained setTimeout.
 * Outbound: no-op — agent uses IPC tools (gmail_reply, gmail_send).
 * All inbound maps to a single mailbox JID: gmail:{monitored-email}.
 */

import { gmail_v1 } from 'googleapis';

import {
  GMAIL_LABEL,
  GMAIL_MONITORED_EMAIL,
  GMAIL_POLL_INTERVAL,
} from '../config.js';
import { getMessageIdsForJid, getRouterState, setRouterState } from '../db.js';
import { getGmailClient } from '../gmail-auth.js';
import {
  formatEmailForAgent,
  parseEmailBody,
  parseEmailHeaders,
} from '../gmail-parser.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  SendMessageOpts,
} from '../types.js';
import { registerChannel, RegisterGroupFn } from './registry.js';

const STATE_KEY_LAST_CHECK = 'gmail_last_check';
const GMAIL_GROUP_FOLDER = 'mailman';

export class GmailChannel implements Channel {
  name = 'gmail';

  private gmail: gmail_v1.Gmail | null = null;
  private labelId: string | null = null;
  private jid: string;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stallDetector: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private pollCount = 0;
  private lastPollCompletedAt = Date.now();
  private processedIds = new Set<string>();

  private onMessage: OnInboundMessage;
  private onChatMetadata: OnChatMetadata;
  private registerGroup?: RegisterGroupFn;
  private registeredGroups: () => Record<string, RegisteredGroup>;

  constructor(opts: {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    registerGroup?: RegisterGroupFn;
    registeredGroups: () => Record<string, RegisteredGroup>;
  }) {
    this.onMessage = opts.onMessage;
    this.onChatMetadata = opts.onChatMetadata;
    this.registerGroup = opts.registerGroup;
    this.registeredGroups = opts.registeredGroups;
    this.jid = `gmail:${GMAIL_MONITORED_EMAIL}`;
  }

  async connect(): Promise<void> {
    this.gmail = getGmailClient();

    // Resolve label name → label ID
    this.labelId = await this.resolveLabelId(GMAIL_LABEL);
    if (!this.labelId) {
      throw new Error(
        `Gmail label "${GMAIL_LABEL}" not found. Create it in Gmail first.`,
      );
    }

    // Initialize last check timestamp (default: 1h ago)
    const stored = getRouterState(STATE_KEY_LAST_CHECK);
    if (!stored) {
      setRouterState(STATE_KEY_LAST_CHECK, String(Date.now() - 3_600_000));
    }

    // Seed processedIds from DB so restarts don't re-deliver already-seen emails
    const knownIds = getMessageIdsForJid(this.jid);
    for (const id of knownIds) this.processedIds.add(id);

    this.connected = true;
    logger.info(
      {
        label: GMAIL_LABEL,
        labelId: this.labelId,
        jid: this.jid,
        seededIds: knownIds.length,
      },
      'Gmail channel connected',
    );

    // Report metadata so the orchestrator knows about this JID
    this.onChatMetadata(
      this.jid,
      new Date().toISOString(),
      GMAIL_GROUP_FOLDER,
      'gmail',
      true,
    );

    // Auto-register mailman group if not already registered
    const groups = this.registeredGroups();
    if (!groups[this.jid] && this.registerGroup) {
      this.registerGroup(this.jid, {
        name: GMAIL_GROUP_FOLDER,
        folder: GMAIL_GROUP_FOLDER,
        trigger: '', // no trigger — every email is processed
        requiresTrigger: false,
        added_at: new Date().toISOString(),
      });
    }

    // Start polling
    this.schedulePoll();
    this.startStallDetector();
  }

  async sendMessage(
    _jid: string,
    _text: string,
    _opts?: SendMessageOpts,
  ): Promise<void> {
    // No-op — agent uses IPC tools for outbound email.
    logger.debug(
      'Gmail sendMessage called (no-op). Agent should use IPC tools.',
    );
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('gmail:');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.stallDetector) {
      clearInterval(this.stallDetector);
      this.stallDetector = null;
    }
    logger.info('Gmail channel disconnected');
  }

  // --- Private ---

  private schedulePoll(): void {
    if (!this.connected) return;
    this.pollTimer = setTimeout(async () => {
      try {
        const pollTimeout = GMAIL_POLL_INTERVAL * 3;
        const result = await Promise.race([
          this.poll().then(() => 'ok' as const),
          new Promise<'timeout'>((resolve) =>
            setTimeout(() => resolve('timeout'), pollTimeout),
          ),
        ]);
        if (result === 'ok') {
          this.lastPollCompletedAt = Date.now();
        } else {
          logger.error(
            { timeoutMs: pollTimeout },
            'Gmail poll timed out, rescheduling',
          );
        }
      } catch (err) {
        logger.error({ err }, 'Gmail poll error');
      }
      this.schedulePoll();
    }, GMAIL_POLL_INTERVAL);
  }

  private startStallDetector(): void {
    this.stallDetector = setInterval(() => {
      const stalledMs = Date.now() - this.lastPollCompletedAt;
      if (stalledMs > GMAIL_POLL_INTERVAL * 5) {
        logger.error(
          { stalledSec: Math.round(stalledMs / 1000) },
          'Gmail poll chain appears stalled, restarting',
        );
        this.schedulePoll();
      }
    }, 120_000);
  }

  private async poll(): Promise<void> {
    if (!this.gmail || !this.labelId) return;
    this.pollCount++;

    const lastCheckMs = parseInt(
      getRouterState(STATE_KEY_LAST_CHECK) || '0',
      10,
    );
    const afterSeconds = Math.floor(lastCheckMs / 1000);

    // First poll + every 10th: catch-up without time filter (late-labeled emails)
    const isCatchUp = this.pollCount <= 1 || this.pollCount % 10 === 0;

    const query = isCatchUp ? undefined : `after:${afterSeconds}`;

    const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
      userId: 'me',
      labelIds: [this.labelId],
      maxResults: 50,
    };
    if (query) listParams.q = query;

    const listRes = await this.gmail.users.messages.list(listParams);
    const messageRefs = listRes.data.messages || [];

    if (listRes.data.nextPageToken) {
      logger.warn(
        { nextPageToken: listRes.data.nextPageToken },
        'Gmail poll returned nextPageToken — some messages may be missed',
      );
    }

    let newCount = 0;
    for (const ref of messageRefs) {
      if (!ref.id) continue;

      // Deduplicate: skip already-processed messages
      if (this.processedIds.has(ref.id)) continue;

      const msg = await this.fetchAndProcess(ref.id);
      if (msg) newCount++;
    }

    // Update last check timestamp
    setRouterState(STATE_KEY_LAST_CHECK, String(Date.now()));

    if (newCount > 0) {
      logger.info(
        { newCount, isCatchUp, pollCount: this.pollCount },
        'Gmail poll delivered messages',
      );
    }
  }

  private async fetchAndProcess(messageId: string): Promise<boolean> {
    if (!this.gmail) return false;

    const res = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const msg = res.data;
    if (!msg.payload || !msg.id) return false;

    // Skip SENT and DRAFT messages
    const labels = msg.labelIds || [];
    if (labels.includes('SENT') || labels.includes('DRAFT')) {
      this.processedIds.add(msg.id);
      return false;
    }

    const rawHeaders = msg.payload.headers || [];
    const headers = parseEmailHeaders(rawHeaders);
    const body = parseEmailBody(msg.payload);

    if (!body && !headers.subject) {
      this.processedIds.add(msg.id);
      return false;
    }

    const content = formatEmailForAgent(headers, body);
    const threadId = msg.threadId || msg.id;

    this.processedIds.add(msg.id);

    // Cap processedIds to prevent unbounded growth
    if (this.processedIds.size > 5000) {
      const iter = this.processedIds.values();
      for (let i = 0; i < 1000; i++) iter.next();
      // Rebuild set from remaining entries
      const keep = new Set<string>();
      for (const v of iter) keep.add(v);
      this.processedIds = keep;
    }

    this.onMessage(this.jid, {
      id: msg.id,
      chat_jid: this.jid,
      sender: headers.from,
      sender_name: headers.fromName,
      content,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
      thread_ts: threadId,
    });

    return true;
  }

  private async resolveLabelId(labelName: string): Promise<string | null> {
    if (!this.gmail) return null;

    const res = await this.gmail.users.labels.list({ userId: 'me' });
    const labels = res.data.labels || [];
    const match = labels.find(
      (l) => l.name?.toLowerCase() === labelName.toLowerCase(),
    );
    return match?.id || null;
  }
}

// Self-register when this module is imported
registerChannel('gmail', (opts) => {
  if (!GMAIL_MONITORED_EMAIL) {
    logger.info('Gmail channel disabled — GMAIL_MONITORED_EMAIL not set');
    return null;
  }
  return new GmailChannel(opts);
});
