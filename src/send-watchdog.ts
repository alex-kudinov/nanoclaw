/**
 * Approved-send watchdog.
 *
 * An approval is a promise to the operator that an email goes out. Between the
 * ✅ and the actual `[HANDOFF: *→mailman]` sits an agent turn that can lose the
 * thread — on 2026-07-28 the sales agent approved-then-searched Gmail for a
 * Thread-ID, received the result, and by its next turn had forgotten the
 * approval entirely, reporting the draft as "awaiting approval". No handoff was
 * ever emitted. The operator discovered it 45 minutes later by asking, and the
 * agent answered with an invented cause ("MCP connectivity issues").
 *
 * The host cannot make the agent remember, but it knows two facts the agent
 * does not reliably hold: an approval happened at time T, and no handoff has
 * been seen since. That is enough to guarantee the failure is never silent.
 *
 * Deliberately alert-only. The host does NOT synthesise the email: the approved
 * body is the operator's, and a host that re-derives it risks sending something
 * subtly different from what was approved — the exact failure recorded on
 * 2026-07-23 when an override round-trip reverted approved edits.
 */

import {
  buildApprovedHandoff,
  parseMailmanHandoff,
} from './approved-send-handoff.js';
import {
  hashApprovedEmailContent,
  newEmailActionId,
  type EmailActionState,
} from './email-action.js';
import { logger } from './logger.js';

/**
 * Grace period between approval and the expected mailman handoff. Generous
 * enough to cover a Thread-ID recovery round-trip (the 2026-07-28 run took
 * ~2 min to search Gmail) without letting a real drop sit unnoticed.
 */
export const SEND_GRACE_MS = 5 * 60 * 1000;

/** How often to look for approvals whose send never arrived. */
export const SEND_WATCHDOG_TICK_MS = 60 * 1000;

/** A routed handoff should enter Mailman's message loop promptly. */
export const MAILMAN_START_GRACE_MS = 60 * 1000;

/** Check the narrower handoff→Mailman boundary more frequently than sends. */
export const MAILMAN_START_WATCHDOG_TICK_MS = 10 * 1000;

export interface PendingSend {
  actionId?: string;
  draftTs: string;
  groupFolder: string;
  chatJid: string;
  threadTs?: string;
  gmailThreadId?: string;
  recipient?: string;
  leadRef?: string;
  approvedSubject?: string;
  approvedContentSha256?: string;
  approvedAt: string;
  state?: EmailActionState;
  handoffObservedAt?: string;
  handoffMessageId?: string;
  mailmanStartedAt?: string;
  handoffAlertedAt?: string;
  executionStartedAt?: string;
  alertedAt?: string;
}

export interface SendWatchdogStore {
  recordPendingSend(row: PendingSend): PendingSend | void;
  /** Clear unfulfilled rows for a group, optionally narrowed by recipient. */
  clearPendingSends(groupFolder: string, recipient?: string): number;
  /**
   * Clear the oldest matching recipient across every group. The send is
   * executed by mailman's IPC, but the expectation belongs to the group whose
   * card was approved, so group folder cannot be the join key.
   */
  clearPendingSendsByRecipient(recipient: string): number;
  markHandoff(
    groupFolder: string,
    recipient: string,
    messageId: string | undefined,
    observedAt: string,
  ): number;
  findAction?(opts: {
    actionId?: string;
    groupFolder?: string;
    recipient?: string;
    gmailThreadId?: string;
    approvedContentSha256: string;
  }): { action?: PendingSend; ambiguous: boolean };
  markActionHandoff?(
    actionId: string,
    messageId: string | undefined,
    observedAt: string,
  ): number;
  markMailmanStarted(
    groupFolder: string,
    recipient: string,
    startedAt: string,
  ): number;
  markActionMailmanStarted?(actionId: string, startedAt: string): number;
  listOverdueSends(cutoffIso: string): PendingSend[];
  listStalledHandoffs(cutoffIso: string): PendingSend[];
  markHandoffAlerted(draftTs: string, alertedAt: string): void;
  markAlerted(draftTs: string): void;
}

export interface SendWatchdogDeps {
  store: SendWatchdogStore;
  postThread(chatJid: string, text: string, threadTs?: string): Promise<void>;
}

/**
 * Approvable send cards. `CLIENT SUPPORT REVIEW` was missing until 2026-07-31:
 * Gaye Montgomery's $499 access question was drafted, approved, and then
 * blocked (no party record yet), and because the card matched nothing here
 * `recordApproval` returned null — no pending row, so no rescue, no
 * `[SEND NOT OBSERVED]`, and no approval-boundary Gmail grant. The operator's
 * approval vanished into silence for 15 minutes. Support approvals are send
 * promises exactly like sales ones and get the same safety net.
 */
const CARD_RE = /\[(?:SALES REVIEW|CLIENT SUPPORT REVIEW|SUPPORT-DRAFT)\]/;
const EMAIL_RE = /^\s*(?:Email|To)\s*:\s*([^\s<>,;]+@[^\s<>,;]+)\s*$/im;
const LEAD_RE = /\[SALES REVIEW\]\s*(Lead\s*#\s*\d+)/i;
const MAILMAN_HANDOFF_RE = /\[HANDOFF:\s*([a-z0-9_-]+)\s*(?:→|->)\s*mailman\]/i;
const TO_RE = /^\s*To\s*:\s*([^\s<>,;]+@[^\s<>,;]+)\s*$/im;

/** Extract only a structured header, never a Thread-ID injected in body text. */
export function extractApprovedGmailThreadId(
  text: string | undefined,
): string | undefined {
  if (!text) return undefined;
  for (const line of text.split(/\r?\n/)) {
    if (
      /^\s*(?:Body|Message|Original-Message|DRAFT RESPONSE|THEIR REQUEST)\s*:/i.test(
        line,
      )
    ) {
      break;
    }
    const threadId = /^\s*Thread-ID\s*:\s*(\S+)\s*$/i.exec(line)?.[1];
    if (threadId) return threadId;
  }
  return undefined;
}

/** True when this text is an approvable send card the watchdog should track. */
export function isTrackableCard(text: string): boolean {
  return CARD_RE.test(text);
}

/**
 * Register an expectation that a mailman handoff follows this approval. Returns
 * the row recorded, or null when the approved message is not a send card.
 */
export function recordApproval(
  opts: {
    draftTs: string;
    groupFolder: string;
    chatJid: string;
    threadTs?: string;
    cardText: string;
    approvedGmailThreadId?: string;
    now: Date;
  },
  store: SendWatchdogStore,
): PendingSend | null {
  if (!isTrackableCard(opts.cardText)) return null;
  const approved = buildApprovedHandoff(opts.cardText);
  const row: PendingSend = {
    actionId: newEmailActionId(),
    draftTs: opts.draftTs,
    groupFolder: opts.groupFolder,
    chatJid: opts.chatJid,
    threadTs: opts.threadTs,
    gmailThreadId:
      opts.approvedGmailThreadId ?? extractApprovedGmailThreadId(opts.cardText),
    recipient: opts.cardText.match(EMAIL_RE)?.[1]?.toLowerCase(),
    leadRef: opts.cardText.match(LEAD_RE)?.[1],
    approvedSubject: approved?.subject,
    approvedContentSha256: approved
      ? hashApprovedEmailContent(approved.subject, approved.body)
      : undefined,
    approvedAt: opts.now.toISOString(),
    state: 'approved',
  };
  const stored = store.recordPendingSend(row);
  logger.info(
    { group: opts.groupFolder, recipient: row.recipient, lead: row.leadRef },
    'send-watchdog: approval recorded, awaiting Gmail-confirmed send',
  );
  return stored ?? row;
}

/**
 * Called for every outbound message a group emits. A mailman handoff is
 * PROGRESS, not proof — it records that the agent got as far as asking for the
 * send. It deliberately does NOT discharge the expectation.
 *
 * The original design cleared here, reasoning "the agent got that far". That
 * left a hole: everything downstream of the handoff can still refuse to send —
 * the recipient guard, the content guard (an outbound reply was blocked on
 * 2026-07-29 for the banned phrase "thank you for reaching out" and simply
 * stopped), a Gmail API failure, or mailman answering [ALREADY-HANDLED]. In
 * every one of those cases the row had already been deleted, so the sweep found
 * nothing overdue and the operator saw silence after their own approval. Only a
 * confirmed send discharges the promise now.
 */
export function observeOutbound(
  groupFolder: string,
  text: string,
  messageId: string | undefined,
  now: Date,
  store: Pick<
    SendWatchdogStore,
    'markHandoff' | 'findAction' | 'markActionHandoff'
  >,
): number {
  if (!MAILMAN_HANDOFF_RE.test(text)) return 0;
  const parsed = parseMailmanHandoff(text);
  if (parsed && store.findAction && store.markActionHandoff) {
    const match = store.findAction({
      actionId: parsed.actionId,
      groupFolder,
      recipient: parsed.recipient,
      approvedContentSha256: hashApprovedEmailContent(
        parsed.subject,
        parsed.body,
      ),
    });
    if (match.ambiguous) {
      logger.error(
        { group: groupFolder, recipient: parsed.recipient },
        'send-watchdog: handoff matches multiple approved actions — held for operator',
      );
      return 0;
    }
    if (match.action?.actionId) {
      return store.markActionHandoff(
        match.action.actionId,
        messageId,
        now.toISOString(),
      );
    }
  }
  const to = text.match(TO_RE)?.[1]?.toLowerCase();
  const recorded = to
    ? store.markHandoff(groupFolder, to, messageId, now.toISOString())
    : 0;
  logger.info(
    { group: groupFolder, to, messageId, recorded },
    'send-watchdog: mailman handoff observed (progress only — awaiting confirmed send)',
  );
  return recorded;
}

/** Record that Mailman's message loop has selected a routed handoff for work. */
export function observeMailmanStart(
  texts: string[],
  now: Date,
  store: Pick<
    SendWatchdogStore,
    'markMailmanStarted' | 'findAction' | 'markActionMailmanStarted'
  >,
): number {
  let marked = 0;
  for (const text of texts) {
    const sourceGroup = text.match(MAILMAN_HANDOFF_RE)?.[1]?.toLowerCase();
    if (!sourceGroup) continue;
    const parsed = parseMailmanHandoff(text);
    if (parsed && store.findAction && store.markActionMailmanStarted) {
      const match = store.findAction({
        actionId: parsed.actionId,
        groupFolder: sourceGroup,
        recipient: parsed.recipient,
        approvedContentSha256: hashApprovedEmailContent(
          parsed.subject,
          parsed.body,
        ),
      });
      if (match.action?.actionId && !match.ambiguous) {
        marked += store.markActionMailmanStarted(
          match.action.actionId,
          now.toISOString(),
        );
        continue;
      }
    }
    const to = text.match(TO_RE)?.[1]?.toLowerCase();
    if (!to) continue;
    marked += store.markMailmanStarted(sourceGroup, to, now.toISOString());
  }
  if (marked > 0) {
    logger.info(
      { marked },
      'send-watchdog: Mailman started routed email handoff',
    );
  }
  return marked;
}

/**
 * The only thing that discharges an approval: Gmail accepted the message. Called
 * from the gmail IPC handlers after a successful send/reply, with the REAL
 * recipient — for gmail_send that is the original address, never the
 * GMAIL_TEST_RECIPIENT override, or a test redirect would clear the expectation
 * for a customer who was never written to.
 */
export function observeConfirmedSend(
  recipient: string | undefined,
  store: Pick<SendWatchdogStore, 'clearPendingSendsByRecipient'>,
): void {
  if (!recipient) return;
  const addr = recipient.match(/<([^>]+)>/)?.[1] ?? recipient;
  const cleared = store.clearPendingSendsByRecipient(addr.trim().toLowerCase());
  if (cleared > 0) {
    logger.info(
      { to: addr, cleared },
      'send-watchdog: send confirmed, expectation cleared',
    );
  }
}

function alertText(row: PendingSend): string {
  const who = row.recipient ? ` to ${row.recipient}` : '';
  const lead = row.leadRef ? ` (${row.leadRef})` : '';
  if (row.state === 'executing') {
    return (
      `[EMAIL DELIVERY UNCERTAIN]${lead} execution began at ` +
      `${row.executionStartedAt ?? row.approvedAt}, but no Gmail receipt was ` +
      `committed. The email${who} MAY have gone out. Do not resend or create a ` +
      `new action until an operator reconciles the Gmail Sent mailbox and the ` +
      `stored action ledger.`
    );
  }
  return (
    `[SEND NOT OBSERVED]${lead} approved at ${row.approvedAt}, but Gmail has ` +
    `never confirmed a send. The email${who} has NOT gone out.\n\n` +
    `Common causes, in order of likelihood: the outbound content or recipient ` +
    `guard blocked it (look for a 🚫 [EMAIL BLOCKED] line in #gru-chief naming ` +
    `the violation), the agent lost the approval, or the Gmail call failed.\n\n` +
    `The approved draft is the message this replies to — send that text, do not ` +
    `redraft it. Reply here with what happened if it cannot be sent.`
  );
}

function mailmanStartAlertText(row: PendingSend): string {
  const who = row.recipient ? ` to ${row.recipient}` : '';
  const lead = row.leadRef ? ` (${row.leadRef})` : '';
  return (
    `[MAILMAN NOT STARTED]${lead} the approved handoff${who} was routed at ` +
    `${row.handoffObservedAt ?? 'an unknown time'}, but Mailman's message loop ` +
    `has not claimed it. The email has NOT gone out.\n\n` +
    `This is a host routing or queue failure, not an email-content refusal. ` +
    `Check the Mailman queue/container and the stored handoff before retrying; ` +
    `do not redraft or create a second send.`
  );
}

/** Alert once when routing succeeded but Mailman never claimed the handoff. */
export async function sweepStalledMailmanHandoffs(
  now: Date,
  deps: SendWatchdogDeps,
): Promise<number> {
  const cutoff = new Date(now.getTime() - MAILMAN_START_GRACE_MS).toISOString();
  const stalled = deps.store.listStalledHandoffs(cutoff);
  let alerted = 0;
  for (const row of stalled) {
    try {
      await deps.postThread(
        row.chatJid,
        mailmanStartAlertText(row),
        row.threadTs,
      );
      deps.store.markHandoffAlerted(row.draftTs, now.toISOString());
      alerted++;
      logger.error(
        {
          group: row.groupFolder,
          recipient: row.recipient,
          lead: row.leadRef,
          handoffObservedAt: row.handoffObservedAt,
        },
        'send-watchdog: routed handoff was not claimed by Mailman',
      );
    } catch (err) {
      logger.error(
        { err, draftTs: row.draftTs },
        'send-watchdog: failed to post Mailman-start alert',
      );
    }
  }
  return alerted;
}

/** Alert once while preserving the action and its non-retryable state. */
/**
 * Grace before the host emits the handoff itself. Long enough that a healthy
 * sales run (which hands off within ~30s of approval) is never pre-empted.
 */
export const HANDOFF_RESCUE_MS = 90 * 1000;

export interface HandoffRescueDeps extends SendWatchdogDeps {
  /** The approved card, by its Slack ts. Null when it can no longer be read. */
  getApprovedCard(draftTs: string): string | null;
  /** Write a `[HANDOFF: sales→mailman]` IPC message as `groupFolder`. */
  emitHandoff(groupFolder: string, text: string): void;
  /**
   * Pipeline entry id for a recipient address, resolved at rescue time.
   *
   * This is what re-drives a send that was blocked for a missing party. Gaye
   * Montgomery (2026-07-31) was approved at 22:40:53Z and refused at 22:41:39Z
   * because no party existed; chief onboarded her 33s later. Resolving here
   * rather than at approval means the retry sees the record that has since
   * appeared. Optional — without it a card carrying no `Lead #N` simply hands
   * off without an Entry ID, exactly as before.
   */
  resolveEntryIdByEmail?(email: string): Promise<number | undefined>;
}

/**
 * Emit the approved send's handoff when the agent did not.
 *
 * The sales agent has dropped this step three times (Entry 938, Lead #962,
 * Lead #871), each time after the operator had already approved, and each time
 * the only signal was silence followed by an alert. The host holds the approved
 * card and the recipient, so it can finish the job deterministically.
 *
 * Duplicate safety, in order:
 *   - only rows with NO observed handoff are considered, so a working agent run
 *     is never raced;
 *   - `markHandoff` is an atomic conditional update and the rescue proceeds only
 *     when it claims the row, so two ticks cannot both emit;
 *   - the body is sliced verbatim from the approved card, never regenerated;
 *   - an unparsable card emits nothing and leaves the alert path untouched.
 */
export async function rescueUnhandedSends(
  now: Date,
  deps: HandoffRescueDeps,
): Promise<number> {
  const cutoff = new Date(now.getTime() - HANDOFF_RESCUE_MS).toISOString();
  const candidates = deps.store
    .listOverdueSends(cutoff)
    .filter((row) => !row.handoffObservedAt && row.recipient);

  let rescued = 0;
  for (const row of candidates) {
    const card = deps.getApprovedCard(row.draftTs);
    if (!card) continue;

    // Resolved now, not at approval: a send blocked for a missing party is
    // retried here, and by this point the onboarding that unblocked it has
    // usually landed. A lookup failure must not stop the rescue.
    let entryId: number | undefined;
    if (deps.resolveEntryIdByEmail && row.recipient) {
      try {
        entryId = await deps.resolveEntryIdByEmail(row.recipient);
      } catch (err) {
        logger.warn(
          { err, recipient: row.recipient },
          'send-watchdog: entry lookup failed, handing off without an Entry ID',
        );
      }
    }

    const built = buildApprovedHandoff(card, {
      entryId,
      actionId: row.actionId,
      sourceGroup: row.groupFolder,
    });
    if (!built || built.recipient !== row.recipient) {
      logger.warn(
        { draftTs: row.draftTs, recipient: row.recipient },
        'send-watchdog: approved card is not machine-sendable — leaving it to the operator',
      );
      continue;
    }

    // Claim first. If another tick (or a late agent handoff) already marked
    // this row, changes is 0 and we must not emit.
    const claimed =
      row.actionId && deps.store.markActionHandoff
        ? deps.store.markActionHandoff(
            row.actionId,
            `host-rescue-${row.draftTs}`,
            now.toISOString(),
          )
        : deps.store.markHandoff(
            row.groupFolder,
            row.recipient,
            `host-rescue-${row.draftTs}`,
            now.toISOString(),
          );
    if (claimed === 0) continue;

    try {
      deps.emitHandoff(row.groupFolder, built.text);
      rescued++;
      logger.warn(
        {
          group: row.groupFolder,
          recipient: row.recipient,
          lead: row.leadRef,
          approvedAt: row.approvedAt,
        },
        'send-watchdog: agent never emitted the handoff — host emitted the approved send',
      );
      await deps.postThread(
        row.chatJid,
        `:gear: The agent did not hand this off after approval, so the host emitted the approved send verbatim. Watching for Gmail confirmation.`,
        row.threadTs,
      );
    } catch (err) {
      logger.error(
        { err, draftTs: row.draftTs },
        'send-watchdog: host handoff emit failed',
      );
    }
  }
  return rescued;
}

export async function sweepPendingSends(
  now: Date,
  deps: SendWatchdogDeps,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SEND_GRACE_MS).toISOString();
  const overdue = deps.store.listOverdueSends(cutoff);
  let alerted = 0;
  for (const row of overdue) {
    try {
      await deps.postThread(row.chatJid, alertText(row), row.threadTs);
      deps.store.markAlerted(row.draftTs);
      alerted++;
      logger.error(
        {
          group: row.groupFolder,
          recipient: row.recipient,
          lead: row.leadRef,
          approvedAt: row.approvedAt,
        },
        'send-watchdog: approved send was never confirmed by Gmail',
      );
    } catch (err) {
      // Leave the row in place so the next sweep retries the alert.
      logger.error(
        { err, draftTs: row.draftTs },
        'send-watchdog: failed to post alert',
      );
    }
  }
  return alerted;
}
