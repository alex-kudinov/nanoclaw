/**
 * Open-proposal follow-up orchestration (host-side, approval-gated).
 *
 * Daily pass: for each pending Plutio proposal, decide the due touch
 * (proposal-followup-cadence), generate customized copy (proposal-followup-email),
 * post a draft to Slack for ✅ approval, and record it. A ✅ reaction on a draft
 * is claimed by handleProposalApproval, which sends the email and marks it sent.
 *
 * All side effects are injected so the logic is unit-testable without Plutio,
 * the bridge, Postgres, or Slack. Production wiring lives in index.ts.
 */

import { logger } from './logger.js';
import type {
  EmailContext,
  GeneratedEmail,
} from './proposal-followup-email.js';
import {
  selectNextTouch,
  shouldCloseOut,
  type TouchMeta,
} from './proposal-followup-cadence.js';
import {
  resolveProposalUrl,
  resolveProposalEditUrl,
  type OpenProposal,
  type Recipient,
} from './plutio-proposals.js';

export interface FollowupState {
  lastSentSequence: number;
  firstFollowupAt: Date | null;
  lastSentAt: Date | null;
  hasPendingApproval: boolean;
  /** True once the proposal has been auto-cancelled in our records. */
  closedOut: boolean;
  existingSequences: Set<number>;
}

export interface DraftRecord {
  proposalId: string;
  proposalNumber: string;
  sequence: number;
  recipientEmail: string;
  recipientName: string;
  partyId: number | null;
  subject: string;
  body: string;
  url: string;
  slackTs: string;
}

/** One open-proposal recipient to shield from sales email follow-up nudges. */
export interface SuppressionRecord {
  proposalId: string;
  partyId: number | null;
  email: string; // lowercased
}

export interface FollowupStore {
  expireStale(days: number): Promise<number>;
  getState(proposalId: string): Promise<FollowupState>;
  recordDraft(d: DraftRecord): Promise<void>;
  recordCloseout(proposalId: string): Promise<void>;
  /** Upsert the open-proposal de-dup row (email_followup_suppressions). */
  recordSuppression(s: SuppressionRecord): Promise<void>;
}

export interface ProposalFollowupDeps {
  listOpenProposals(): Promise<OpenProposal[]>;
  resolveRecipient(clientId: string): Promise<Recipient | null>;
  generateEmail(ctx: EmailContext): Promise<GeneratedEmail>;
  resolvePartyId(email: string): Promise<number | null>;
  postDraft(text: string): Promise<string | undefined>;
  /** Post a non-approval notice (no ✅ gate), e.g. a cold-proposal close-out. */
  postNotice(text: string): Promise<void>;
  store: FollowupStore;
  maxPerRun: number;
  expireDays: number;
  now?(): Date;
}

export interface RunResult {
  scanned: number;
  drafted: number;
  skipped: number;
  expired: number;
  cancelled: number;
}

/** Slack notice posted when a cold proposal is auto-cancelled in our records. */
export function buildCloseoutMessage(p: OpenProposal): string {
  return [
    `📪 *Proposal went cold* (${p.number}) — "${p.title}"`,
    'No response after 4 follow-ups. Marked *cancelled* in our records.',
    `Void it in Plutio if you agree: ${resolveProposalEditUrl(p.id)}`,
  ].join('\n');
}

/** Build the Slack draft a human reviews before ✅-approving the send. */
export function buildDraftMessage(
  p: OpenProposal,
  recipient: Recipient,
  touch: TouchMeta,
  email: GeneratedEmail,
  url: string,
): string {
  const name =
    `${recipient.firstName} ${recipient.lastName}`.trim() || recipient.email;
  return [
    `📋 *Proposal follow-up #${touch.sequence} — ${touch.label}*  (${p.number})`,
    `*To:* ${name} <${recipient.email}>`,
    `*Subject:* ${email.subject}`,
    '',
    email.body,
    '',
    `_Proposal: ${url}_`,
    '_React ✅ to send this email, or ignore to skip._',
  ].join('\n');
}

/** Draft the due touch for one proposal. Returns true if a draft was posted. */
async function draftDue(
  p: OpenProposal,
  s: FollowupState,
  deps: ProposalFollowupDeps,
  now: Date,
): Promise<boolean> {
  if (s.closedOut) return false; // declined / 👎-skipped / closed out → stop entirely
  const touch = selectNextTouch({
    pendingAt: p.pendingAt,
    firstFollowupAt: s.firstFollowupAt,
    lastSentAt: s.lastSentAt,
    lastSentSequence: s.lastSentSequence,
    hasPendingApproval: s.hasPendingApproval,
    now,
  });
  if (!touch || s.existingSequences.has(touch.sequence)) return false;
  if (!p.clientId) {
    logger.warn({ proposal: p.number }, 'proposal-followup: no client id');
    return false;
  }
  const recipient = await deps.resolveRecipient(p.clientId);
  if (!recipient?.email) {
    logger.warn(
      { proposal: p.number },
      'proposal-followup: no recipient email',
    );
    return false;
  }
  const url = resolveProposalUrl(p.id);
  const email = await deps.generateEmail({
    firstName: recipient.firstName || 'there',
    touch,
    proposalTitle: p.title,
    proposalUrl: url,
  });
  const partyId = await deps.resolvePartyId(recipient.email);
  const slackTs = await deps.postDraft(
    buildDraftMessage(p, recipient, touch, email, url),
  );
  if (!slackTs) return false;
  await deps.store.recordDraft({
    proposalId: p.id,
    proposalNumber: p.number,
    sequence: touch.sequence,
    recipientEmail: recipient.email,
    recipientName: `${recipient.firstName} ${recipient.lastName}`.trim(),
    partyId,
    subject: email.subject,
    body: email.body,
    url,
    slackTs,
  });
  return true;
}

/**
 * Refresh the email-followup suppression set from the live open-proposal list,
 * so anyone with an unsigned Plutio proposal is shielded from the sales email
 * follow-up cron. Runs for EVERY open proposal — independent of whether a nudge
 * is due or the maxPerRun cap — because the de-dup must be complete, not capped.
 * Best-effort: a single failure never aborts the run.
 */
async function refreshSuppressions(
  proposals: OpenProposal[],
  deps: ProposalFollowupDeps,
): Promise<void> {
  for (const p of proposals) {
    if (!p.clientId) continue;
    try {
      const recipient = await deps.resolveRecipient(p.clientId);
      if (!recipient?.email) continue;
      const partyId = await deps.resolvePartyId(recipient.email);
      await deps.store.recordSuppression({
        proposalId: p.id,
        partyId,
        email: recipient.email.toLowerCase(),
      });
    } catch (err) {
      logger.warn(
        { err, proposal: p.number },
        'proposal-followup: suppression refresh failed',
      );
    }
  }
}

export async function runProposalFollowup(
  deps: ProposalFollowupDeps,
): Promise<RunResult> {
  const now = deps.now?.() ?? new Date();
  const expired = await deps.store.expireStale(deps.expireDays);
  const proposals = await deps.listOpenProposals();
  await refreshSuppressions(proposals, deps);
  const result: RunResult = {
    scanned: proposals.length,
    drafted: 0,
    skipped: 0,
    expired,
    cancelled: 0,
  };
  for (const p of proposals) {
    if (result.drafted >= deps.maxPerRun) break;
    try {
      const state = await deps.store.getState(p.id);
      if (
        shouldCloseOut({
          lastSentSequence: state.lastSentSequence,
          lastSentAt: state.lastSentAt,
          alreadyClosed: state.closedOut,
          now,
        })
      ) {
        await deps.store.recordCloseout(p.id);
        await deps.postNotice(buildCloseoutMessage(p));
        result.cancelled++;
        continue;
      }
      if (await draftDue(p, state, deps, now)) result.drafted++;
      else result.skipped++;
    } catch (err) {
      logger.warn(
        { err, proposal: p.number },
        'proposal-followup: draft failed',
      );
      result.skipped++;
    }
  }
  logger.info(result, 'proposal-followup: run complete');
  return result;
}

// ---- Approval (✅ reaction → send) ---------------------------------------

export interface PendingDraft {
  id: number;
  proposalId: string;
  sequence: number;
  recipientEmail: string;
  subject: string;
  body: string;
  partyId: number | null;
  threadId: string | null;
}

export interface ApprovalDeps {
  getPendingByTs(slackTs: string): Promise<PendingDraft | null>;
  sendEmail(d: PendingDraft): Promise<{ messageId: string; threadId: string }>;
  markSent(id: number, messageId: string, threadId?: string): Promise<void>;
  postThread(slackTs: string, text: string): Promise<void>;
}

/**
 * Handle a ✅ on a proposal-followup draft. Returns true if THIS feature owns
 * the reacted message (so the caller suppresses the normal agent-approval path),
 * false if the ts is not one of our drafts.
 */
export async function handleProposalApproval(
  slackTs: string,
  reactor: string,
  deps: ApprovalDeps,
): Promise<boolean> {
  const row = await deps.getPendingByTs(slackTs);
  if (!row) return false;
  try {
    const sent = await deps.sendEmail(row);
    await deps.markSent(row.id, sent.messageId, sent.threadId);
    await deps.postThread(
      slackTs,
      `✅ Sent to ${row.recipientEmail} (approved by ${reactor}).`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, slackTs }, 'proposal-followup: send failed');
    await deps.postThread(
      slackTs,
      `⚠️ Send failed: ${msg}. Draft left pending — fix and re-approve.`,
    );
  }
  return true;
}

// ---- Rejection (👎 reaction → skip) ---------------------------------------

export interface RejectDeps {
  getPendingByTs(slackTs: string): Promise<PendingDraft | null>;
  markCancelled(id: number): Promise<void>;
  postThread(slackTs: string, text: string): Promise<void>;
}

/**
 * Handle a 👎 on a proposal-followup draft: cancel it (the proposal's
 * follow-ups stop). Returns true if the ts is one of our drafts.
 */
export async function handleProposalRejection(
  slackTs: string,
  reactor: string,
  deps: RejectDeps,
): Promise<boolean> {
  const row = await deps.getPendingByTs(slackTs);
  if (!row) return false;
  await deps.markCancelled(row.id);
  await deps.postThread(
    slackTs,
    `🚫 Skipped by ${reactor} — follow-ups stopped for this proposal (${row.recipientEmail}).`,
  );
  return true;
}

// ---- Daily hour-gated tick ------------------------------------------------

let lastRunYmd: string | null = null;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** True when it is at/after targetHour locally and we have not run today. */
export function dueToRun(
  now: Date,
  targetHour: number,
  last: string | null,
): boolean {
  return now.getHours() >= targetHour && ymd(now) !== last;
}

/** Hourly-callable wrapper: runs the daily pass once per morning. */
export async function proposalFollowupTick(
  deps: ProposalFollowupDeps,
  targetHour: number,
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  if (!dueToRun(now, targetHour, lastRunYmd)) return;
  try {
    await runProposalFollowup(deps);
    lastRunYmd = ymd(now);
  } catch (err) {
    logger.error({ err }, 'proposal-followup: tick run failed; will retry');
  }
}

/** Test-only: reset the once-per-day guard. */
export function __resetTickState(): void {
  lastRunYmd = null;
}
