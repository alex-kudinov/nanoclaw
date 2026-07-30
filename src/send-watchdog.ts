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

import { logger } from './logger.js';

/**
 * Grace period between approval and the expected mailman handoff. Generous
 * enough to cover a Thread-ID recovery round-trip (the 2026-07-28 run took
 * ~2 min to search Gmail) without letting a real drop sit unnoticed.
 */
export const SEND_GRACE_MS = 5 * 60 * 1000;

/** How often to look for approvals whose send never arrived. */
export const SEND_WATCHDOG_TICK_MS = 60 * 1000;

export interface PendingSend {
  draftTs: string;
  groupFolder: string;
  chatJid: string;
  threadTs?: string;
  gmailThreadId?: string;
  recipient?: string;
  leadRef?: string;
  approvedAt: string;
}

export interface SendWatchdogStore {
  recordPendingSend(row: PendingSend): void;
  /** Clear unfulfilled rows for a group, optionally narrowed by recipient. */
  clearPendingSends(groupFolder: string, recipient?: string): number;
  /**
   * Clear the oldest matching recipient across every group. The send is
   * executed by mailman's IPC, but the expectation belongs to the group whose
   * card was approved, so group folder cannot be the join key.
   */
  clearPendingSendsByRecipient(recipient: string): number;
  listOverdueSends(cutoffIso: string): PendingSend[];
  markAlerted(draftTs: string): void;
}

export interface SendWatchdogDeps {
  store: SendWatchdogStore;
  postThread(chatJid: string, text: string, threadTs?: string): Promise<void>;
}

const CARD_RE = /\[(?:SALES REVIEW|SUPPORT-DRAFT)\]/;
const EMAIL_RE = /^\s*(?:Email|To)\s*:\s*([^\s<>,;]+@[^\s<>,;]+)\s*$/im;
const LEAD_RE = /\[SALES REVIEW\]\s*(Lead\s*#\s*\d+)/i;
const MAILMAN_HANDOFF_RE = /\[HANDOFF:\s*\w+\s*(?:→|->)\s*mailman\]/;
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
  const row: PendingSend = {
    draftTs: opts.draftTs,
    groupFolder: opts.groupFolder,
    chatJid: opts.chatJid,
    threadTs: opts.threadTs,
    gmailThreadId:
      opts.approvedGmailThreadId ?? extractApprovedGmailThreadId(opts.cardText),
    recipient: opts.cardText.match(EMAIL_RE)?.[1]?.toLowerCase(),
    leadRef: opts.cardText.match(LEAD_RE)?.[1],
    approvedAt: opts.now.toISOString(),
  };
  store.recordPendingSend(row);
  logger.info(
    { group: opts.groupFolder, recipient: row.recipient, lead: row.leadRef },
    'send-watchdog: approval recorded, awaiting Gmail-confirmed send',
  );
  return row;
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
export function observeOutbound(groupFolder: string, text: string): void {
  if (!MAILMAN_HANDOFF_RE.test(text)) return;
  const to = text.match(TO_RE)?.[1]?.toLowerCase();
  logger.info(
    { group: groupFolder, to },
    'send-watchdog: mailman handoff observed (progress only — awaiting confirmed send)',
  );
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

/**
 * Alert on approvals whose send never materialised. One alert per approval:
 * `markAlerted` removes the row so a stuck send cannot spam the channel.
 */
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
