/**
 * Gmail Channel — polls for labeled emails via Gmail API.
 *
 * Inbound: polls messages.list(labelIds) on a chained setTimeout.
 * Outbound: no-op — agent uses IPC tools (gmail_reply, gmail_send).
 * All inbound maps to a single mailbox JID: gmail:{monitored-email}.
 */

import fs from 'fs';
import path from 'path';

import { gmail_v1 } from 'googleapis';

import {
  DATA_DIR,
  GMAIL_LABEL,
  GMAIL_MONITORED_EMAIL,
  GMAIL_POLL_INTERVAL,
  GMAIL_PUBSUB_TOPIC,
  GMAIL_PUSH_ENABLED,
  GMAIL_PUSH_OWN_WATCH,
  GMAIL_PUSH_SAFETY_POLL_INTERVAL,
} from '../config.js';
import { getMessageIdsForJid, getRouterState, setRouterState } from '../db.js';
import { getGmailClient } from '../gmail-auth.js';
import { grantHostGmailResources } from '../gmail-ipc-policy.js';
import {
  handleClassifyLabelWrite,
  isAutoArchiveLabel,
  markClassificationRouted,
} from '../classify-ipc-handlers.js';
import {
  extractSenderEmail,
  matchRule,
  recordRuleHit,
} from '../classify-rules-runner.js';
import { matchHardFilter, incrementDropCount } from '../hard-filters.js';
import { routeClassifiedEmail } from '../host-router.js';
import {
  formatEmailForAgent,
  parseEmailBody,
  parseEmailHeaders,
} from '../gmail-parser.js';
import {
  compareHistoryIds,
  ensureHistoryIdBaseline,
  getStoredHistoryId,
  getWatchExpiresAt,
  HistoryExpiredError,
  processHistoryDelta,
  setStoredHistoryId,
  startWatch,
} from '../gmail-push.js';
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

/**
 * True when a message is our own outbound and must be skipped: it carries
 * SENT or DRAFT but is NOT in the inbox. Self-addressed inbound — e.g.
 * website contact-form mail sent from a send-as alias to the monitored
 * mailbox — carries both SENT and INBOX, and is legitimate inbound that
 * must still be classified.
 */
export function isOwnOutbound(labelIds: string[]): boolean {
  const isSentOrDraft = labelIds.includes('SENT') || labelIds.includes('DRAFT');
  return isSentOrDraft && !labelIds.includes('INBOX');
}

export class GmailChannel implements Channel {
  name = 'gmail';

  private gmail: gmail_v1.Gmail | null = null;
  private labelId: string | null = null;
  private jid: string;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stallDetector: ReturnType<typeof setInterval> | null = null;
  private renewalTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private pollCount = 0;
  private lastPollCompletedAt = Date.now();
  private processedIds = new Set<string>();
  private pushMode = false;
  // Serialize push processing so overlapping notifications don't double-fetch.
  private pushQueue: Promise<void> = Promise.resolve();

  private onMessage: OnInboundMessage;
  private onChatMetadata: OnChatMetadata;
  private registerGroup?: RegisterGroupFn;
  private registeredGroups: () => Record<string, RegisteredGroup>;
  private onInboundReply?: (input: {
    senderEmail: string;
    threadId?: string;
    body: string;
  }) => Promise<void>;

  constructor(opts: {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    registerGroup?: RegisterGroupFn;
    registeredGroups: () => Record<string, RegisteredGroup>;
    onInboundReply?: (input: {
      senderEmail: string;
      threadId?: string;
      body: string;
    }) => Promise<void>;
  }) {
    this.onMessage = opts.onMessage;
    this.onChatMetadata = opts.onChatMetadata;
    this.registerGroup = opts.registerGroup;
    this.registeredGroups = opts.registeredGroups;
    this.onInboundReply = opts.onInboundReply;
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

    // Push mode: safety-net poll + history-delta processing on webhook.
    // If we own the watch, also register users.watch() + renewal loop.
    // If we don't (Hive coexistence), seed baseline from users.getProfile().
    // Legacy mode: fast poll + stall detector.
    if (GMAIL_PUSH_ENABLED) {
      this.pushMode = true;
      try {
        if (GMAIL_PUSH_OWN_WATCH) {
          if (!GMAIL_PUBSUB_TOPIC) {
            throw new Error(
              'GMAIL_PUSH_OWN_WATCH=true but GMAIL_PUBSUB_TOPIC is unset',
            );
          }
          await startWatch(this.gmail, GMAIL_PUBSUB_TOPIC, ['INBOX']);
        } else {
          await ensureHistoryIdBaseline(this.gmail);
        }
      } catch (err) {
        logger.error(
          { err, ownWatch: GMAIL_PUSH_OWN_WATCH, topic: GMAIL_PUBSUB_TOPIC },
          'Gmail push bootstrap failed — falling back to legacy poll',
        );
        this.pushMode = false;
      }
    }

    if (this.pushMode) {
      logger.info(
        {
          safetyPollMs: GMAIL_PUSH_SAFETY_POLL_INTERVAL,
          ownWatch: GMAIL_PUSH_OWN_WATCH,
        },
        'Gmail push mode active',
      );
      this.scheduleSafetyPoll();
      if (GMAIL_PUSH_OWN_WATCH) this.startRenewalLoop();
    } else {
      this.schedulePoll();
      this.startStallDetector();
    }
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
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = null;
    }
    logger.info('Gmail channel disconnected');
  }

  /**
   * Entry point for Pub/Sub push notifications. Called by webhook-server when
   * a push arrives for this mailbox. Serialized via pushQueue so overlapping
   * notifications don't double-fetch.
   */
  async handlePushNotification(
    emailAddress: string,
    historyId: string,
  ): Promise<void> {
    if (!this.pushMode) {
      logger.debug(
        { emailAddress, historyId },
        'Gmail push arrived but channel is not in push mode — ignoring',
      );
      return;
    }
    if (emailAddress !== GMAIL_MONITORED_EMAIL) {
      logger.warn(
        { emailAddress, expected: GMAIL_MONITORED_EMAIL },
        'Gmail push for unexpected mailbox — ignoring',
      );
      return;
    }
    logger.info({ emailAddress, historyId }, 'Gmail push received');
    this.pushQueue = this.pushQueue
      .then(() => this.processPush(historyId))
      .catch((err) => {
        logger.error(
          { err, emailAddress, historyId },
          'Gmail push processing failed',
        );
      });
    return this.pushQueue;
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

    // Paginate through all result pages (cap at 5 pages = 250 messages)
    const messageRefs: gmail_v1.Schema$Message[] = [];
    let pageToken: string | undefined;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = { ...listParams, pageToken };
      const listRes = await this.gmail.users.messages.list(params);
      const msgs = listRes.data.messages || [];
      messageRefs.push(...msgs);

      pageToken = listRes.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    if (pageToken) {
      logger.warn(
        { pages: MAX_PAGES, totalRefs: messageRefs.length },
        'Gmail poll hit page cap — oldest labeled emails not checked',
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

    // Check MrGru threads for unlabeled replies (Gmail labels are per-message,
    // not per-thread — new replies don't inherit the label).
    // Band-aid until gmelius project replaces this polling approach entirely.
    const threadReplyCount = await this.pollThreadReplies();
    newCount += threadReplyCount;

    // Update last check timestamp
    setRouterState(STATE_KEY_LAST_CHECK, String(Date.now()));

    if (newCount > 0) {
      logger.info(
        { newCount, threadReplyCount, isCatchUp, pollCount: this.pollCount },
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

    // Skip our own outbound (SENT/DRAFT not in inbox). Self-addressed
    // inbound (contact-form mail from a send-as alias) keeps INBOX and is
    // processed normally.
    const labels = msg.labelIds || [];
    if (isOwnOutbound(labels)) {
      this.processedIds.add(msg.id);
      return false;
    }

    // In push mode, history.list returns every messageAdded event including
    // SPAM and TRASH. Exclude those explicitly rather than requiring INBOX —
    // messages can legitimately lack INBOX (e.g. filter-archived, pre-classified).
    if (
      this.pushMode &&
      (labels.includes('SPAM') || labels.includes('TRASH'))
    ) {
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

    const threadId = msg.threadId || msg.id;

    // Pre-LLM classification: if a rule matches, apply the classification
    // directly and skip mailman entirely. Saves one LLM call + one container
    // spawn per matched message. Falls through to mailman on any error.
    const senderEmail = extractSenderEmail(headers.from);
    // The Gmail API is authoritative for these identifiers. Grant them before
    // any host routing so mailman can use the resource and can pass the same
    // grant—not an invented replacement—to the selected downstream group.
    grantHostGmailResources(GMAIL_GROUP_FOLDER, {
      threadId,
      messageId: msg.id,
      emailAddresses: senderEmail ? [senderEmail] : [],
    });
    const headerMap: Record<string, string> = {};
    for (const h of rawHeaders) {
      if (h.name && h.value) headerMap[h.name.toLowerCase()] = h.value;
    }
    // Hard filters: drop known-unwanted emails before any classification
    try {
      const hardFilter = matchHardFilter({
        senderEmail: senderEmail || '',
        subject: headers.subject,
        headers: headerMap,
      });
      if (hardFilter) {
        logger.info(
          {
            messageId: msg.id,
            filterId: hardFilter.id,
            reason: hardFilter.reason,
          },
          'Gmail: hard filter drop',
        );
        try {
          incrementDropCount(hardFilter.id);
        } catch {
          /* skip increment */
        }
        try {
          const logLine = `${new Date().toISOString()} ${senderEmail} ${hardFilter.id} ${hardFilter.reason}\n`;
          const logPath = path.join(DATA_DIR, 'hard-filter-drops.log');
          fs.appendFileSync(logPath, logLine, 'utf-8');
        } catch {
          /* skip audit log */
        }
        this.processedIds.add(msg.id);
        return false;
      }
    } catch (err) {
      logger.error(
        { err, messageId: msg.id },
        'Gmail: hard filter error, proceeding',
      );
    }

    // Proposal-reply detector: if this sender has an open proposal we followed
    // up on, classify their reply (decline/accept) and act. Best-effort side
    // effect (posts a card/notice); does NOT swallow the email — it still flows
    // to the normal pipeline so a human can respond.
    if (this.onInboundReply && senderEmail) {
      try {
        await this.onInboundReply({ senderEmail, threadId, body: body || '' });
      } catch (err) {
        logger.error(
          { err, messageId: msg.id },
          'Gmail: inbound-reply hook error',
        );
      }
    }

    const ruleMatch = await matchRule({
      sender_email: senderEmail,
      subject: headers.subject || null,
      headers: headerMap,
    });

    if (ruleMatch) {
      try {
        await handleClassifyLabelWrite({
          type: 'classify_label_write',
          gmail_message_id: msg.id,
          gmail_thread_id: threadId,
          sender_email: senderEmail,
          subject: headers.subject || null,
          label: ruleMatch.target_label,
          confidence: 0.95,
          reasoning: `Matched rule #${ruleMatch.rule_id} (${ruleMatch.pattern_type}: ${ruleMatch.pattern_value})`,
          classifier_version: 'rules-runner-v1',
        });
        await recordRuleHit(ruleMatch.rule_id);

        // Only skip mailman for auto-archive labels (newsletters, notifications,
        // receipts, etc.). Actionable labels (client, lead, procurement) still
        // need mailman for routing to the correct minion.
        const canSkipMailman = await isAutoArchiveLabel(ruleMatch.target_label);
        if (canSkipMailman) {
          logger.info(
            {
              messageId: msg.id,
              ruleId: ruleMatch.rule_id,
              label: ruleMatch.target_label,
            },
            'Gmail: pre-classified via rule runner, skipped mailman',
          );
          this.processedIds.add(msg.id);
          return true;
        }
        // Actionable label — fall through to mailman for routing
        logger.info(
          {
            messageId: msg.id,
            ruleId: ruleMatch.rule_id,
            label: ruleMatch.target_label,
          },
          'Gmail: pre-classified via rule runner, forwarding to mailman for routing',
        );
        // Gate 3: host-router dispatches classified email to target group
        try {
          const routeResult = await routeClassifiedEmail({
            label: ruleMatch.target_label,
            senderEmail: senderEmail || '',
            senderName: headers.fromName || '',
            subject: headers.subject || '',
            body: body || '',
            threadId,
            messageId: msg.id,
          });
          if (routeResult.routed) {
            await markClassificationRouted(msg.id, 'rules-runner-v1');
            this.processedIds.add(msg.id);
            return true;
          }
          // else: fall through to formatEmailForAgent -> mailman path
        } catch (routeErr) {
          logger.error(
            { err: routeErr, messageId: msg.id, label: ruleMatch.target_label },
            'Gmail: host-router failed, falling through to mailman',
          );
        }
      } catch (err) {
        logger.error(
          { err, messageId: msg.id, ruleId: ruleMatch.rule_id },
          'classify-rules: pre-classification failed, falling through to mailman',
        );
        // Fall through to the onMessage path below.
      }
    }

    const content = formatEmailForAgent(headers, body, threadId, msg.id);

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

  /**
   * Check recently active MrGru threads for unlabeled replies.
   * Gmail labels are per-message — replies don't inherit the thread's label.
   * Band-aid: will be replaced by gmelius Pub/Sub push architecture.
   */
  private async pollThreadReplies(): Promise<number> {
    if (!this.gmail || !this.labelId) return 0;

    const threadsRes = await this.gmail.users.threads.list({
      userId: 'me',
      labelIds: [this.labelId],
      q: 'newer_than:90d',
      maxResults: 50,
    });

    const threads = threadsRes.data.threads || [];
    let newCount = 0;

    for (const threadRef of threads) {
      if (!threadRef.id) continue;

      const thread = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadRef.id,
        format: 'minimal',
      });

      for (const msg of thread.data.messages || []) {
        if (!msg.id || this.processedIds.has(msg.id)) continue;

        const labels = msg.labelIds || [];
        if (labels.includes('SENT') || labels.includes('DRAFT')) {
          this.processedIds.add(msg.id);
          continue;
        }

        const processed = await this.fetchAndProcess(msg.id);
        if (processed) {
          newCount++;
          if (!labels.includes(this.labelId!)) {
            try {
              await this.gmail!.users.messages.modify({
                userId: 'me',
                id: msg.id,
                requestBody: { addLabelIds: [this.labelId!] },
              });
            } catch (err) {
              logger.warn(
                { messageId: msg.id, err },
                'Failed to apply label to reply',
              );
            }
          }
        }
      }
    }

    return newCount;
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

  // --- Push mode ---

  /**
   * Process a history delta from the stored historyId forward. Every new
   * inbound message (excluding SENT/DRAFT, filtered in fetchAndProcess) is
   * delivered to the mailman agent — Gru sorts what's relevant. No label
   * filtering in NanoClaw; we trust the agent to triage.
   * On HistoryExpiredError (historyId >7 days stale), resets to the notif's
   * historyId and accepts the data loss window.
   */
  private async processPush(notifHistoryId: string): Promise<void> {
    if (!this.gmail) return;

    const start = getStoredHistoryId();
    if (!start) {
      // No baseline — first push ever. Seed from the notification and wait
      // for the next one; we can't backfill without a previous anchor.
      setStoredHistoryId(notifHistoryId);
      logger.info(
        { notifHistoryId },
        'Gmail push: seeded baseline historyId from first notification',
      );
      return;
    }

    let result;
    try {
      result = await processHistoryDelta(this.gmail, start);
    } catch (err) {
      if (err instanceof HistoryExpiredError) {
        logger.warn(
          { start, notifHistoryId },
          'Gmail history expired, resetting baseline (data loss window)',
        );
        setStoredHistoryId(notifHistoryId);
        return;
      }
      throw err;
    }

    let newCount = 0;
    for (const id of result.messageIds) {
      if (this.processedIds.has(id)) continue;
      try {
        if (await this.fetchAndProcess(id)) newCount++;
      } catch (err) {
        logger.warn(
          { err, messageId: id },
          'Gmail push: fetchAndProcess failed',
        );
      }
    }

    // Advance stored historyId to max(notifHistoryId, lastHistoryId).
    const advanced =
      compareHistoryIds(notifHistoryId, result.lastHistoryId) > 0
        ? notifHistoryId
        : result.lastHistoryId;
    setStoredHistoryId(advanced);

    logger.info(
      {
        newCount,
        scanned: result.messageIds.length,
        start,
        advanced,
      },
      'Gmail push processed',
    );
  }

  /**
   * Safety-net poll for push mode: runs every GMAIL_PUSH_SAFETY_POLL_INTERVAL
   * to catch any notifications Pub/Sub may have dropped. Uses the same
   * history-delta machinery as push handling.
   */
  private scheduleSafetyPoll(): void {
    if (!this.connected) return;
    this.pollTimer = setTimeout(() => {
      const current = getStoredHistoryId();
      if (current) {
        this.pushQueue = this.pushQueue
          .then(() => this.processPush(current))
          .then(() => {
            this.lastPollCompletedAt = Date.now();
          })
          .catch((err) => {
            logger.error({ err }, 'Gmail safety poll error');
          });
      }
      this.scheduleSafetyPoll();
    }, GMAIL_PUSH_SAFETY_POLL_INTERVAL);
  }

  /** Hourly check: renew watch if expiration is within 24h. */
  private startRenewalLoop(): void {
    this.renewalTimer = setInterval(
      () => {
        this.maybeRenewWatch().catch((err) =>
          logger.error({ err }, 'Gmail watch renewal failed'),
        );
      },
      60 * 60 * 1000,
    );
  }

  private async maybeRenewWatch(): Promise<void> {
    if (!this.gmail || !this.pushMode) return;
    const expiresAt = getWatchExpiresAt();
    const remaining = expiresAt - Date.now();
    // Renew when <24h remaining (watch max is 7 days).
    if (remaining > 24 * 60 * 60 * 1000) return;
    logger.info(
      { remainingHours: (remaining / 3_600_000).toFixed(1) },
      'Renewing Gmail watch',
    );
    await startWatch(this.gmail, GMAIL_PUBSUB_TOPIC, ['INBOX']);
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
