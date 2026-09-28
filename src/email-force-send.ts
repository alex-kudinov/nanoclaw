/**
 * Owner force-send from Slack (NC-20260927-001).
 *
 * Before this, an approved email that a host guard blocked could only go out
 * if Claude or Codex hand-patched production, edited the ledger, or ran a
 * one-off script (eleven such sends between 2026-07-30 and 2026-08-16, one of
 * which landed in the test inbox while the ledger said "delivered"). This is
 * the one supported override:
 *
 *   force send: <reason>
 *
 * typed in the approval thread by an allow-listed Slack user. It targets the
 * thread's newest approval card (arming it when nobody has yet), reopens its
 * blocked, held or uncertain action, records who and why in
 * `email_send_events`, and sends the exact approved bytes through the normal
 * host executor and receipt ledger. One force send per thread runs at a time. It never sends a copy Gmail already
 * accepted, never changes the approved bytes, and never bypasses the
 * external-write safety control.
 */

import type { EmailSendActionRow } from './db.js';
import type { HostExecutionOutcome } from './host-email-executor.js';

const FORCE_SEND_RE = /^\s*force[\s-]+send\s*[:\-–—]\s*([\s\S]*?)\s*$/i;
export const FORCE_REASON_MIN_LENGTH = 10;

/** The reason text when a message is a force-send command, else undefined. */
export function parseForceSendCommand(text: string): string | undefined {
  const match = FORCE_SEND_RE.exec(text || '');
  return match ? match[1] : undefined;
}

/**
 * Allow-listed Slack user IDs from the comma-separated
 * EMAIL_FORCE_SEND_SLACK_USERS setting (`.env` or the process environment).
 */
export function forceSendActors(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export interface ForceSendRequest {
  chatJid: string;
  threadTs: string;
  actorUid: string;
  actorName: string;
  reason: string;
}

export interface ForceSendDeps {
  allowedActors(): Set<string>;
  listThreadActions(chatJid: string, threadTs: string): EmailSendActionRow[];
  /** Slack ts of the newest approval card in the thread, if any. */
  latestCardTs(chatJid: string, threadTs: string): string | undefined;
  /** Arm that card as approved, without the cancel-window notice. */
  armCard(draftTs: string): Promise<EmailSendActionRow | undefined>;
  /** Throws when Gmail Sent cannot be read; the caller then refuses. */
  findSentCopy(
    action: EmailSendActionRow,
  ): Promise<{ messageId: string; threadId: string } | undefined>;
  reconcileAsSent(
    action: EmailSendActionRow,
    sent: { messageId: string; threadId: string },
    actor: string,
  ): number;
  reopen(
    action: EmailSendActionRow,
    actor: string,
    reason: string,
  ): EmailSendActionRow | undefined;
  execute(actionId: string): Promise<HostExecutionOutcome>;
  postThread(text: string): Promise<void>;
}

/**
 * The action a force send means: the newest card's own action, or that card
 * armed now. An older approval never goes out in place of a newer card.
 */
async function resolveTarget(
  req: ForceSendRequest,
  deps: ForceSendDeps,
): Promise<EmailSendActionRow | undefined> {
  const actions = deps
    .listThreadActions(req.chatJid, req.threadTs)
    .filter((a) => a.lastErrorCode !== 'superseded_by_newer_approval');
  const latestCard = deps.latestCardTs(req.chatJid, req.threadTs);
  if (!latestCard) return actions[0];
  const own = actions.find((action) => action.draftTs === latestCard);
  return own ?? deps.armCard(latestCard);
}

async function resolveUncertain(
  target: EmailSendActionRow,
  req: ForceSendRequest,
  deps: ForceSendDeps,
): Promise<string | undefined> {
  let sent: { messageId: string; threadId: string } | undefined;
  try {
    sent = await deps.findSentCopy(target);
  } catch {
    return 'Force send stopped: Gmail Sent could not be read to rule out an earlier delivery, so nothing was sent. Try again shortly.';
  }
  if (!sent) return undefined;
  deps.reconcileAsSent(target, sent, req.actorUid);
  return `✅ Gmail Sent already holds this email (message ${sent.messageId}). Action ${target.actionId} is now recorded as sent; nothing was resent.`;
}

const OUTCOME_TEXT: Partial<Record<HostExecutionOutcome, string>> = {
  in_progress:
    'A Gmail attempt for this action is already in progress; wait for its receipt here.',
  unknown: 'The action could not be found after reopening; nothing was sent.',
};

function refusal(
  req: ForceSendRequest,
  deps: ForceSendDeps,
): string | undefined {
  if (!deps.allowedActors().has(req.actorUid)) {
    return 'Force send is limited to the Slack users listed in EMAIL_FORCE_SEND_SLACK_USERS. Nothing was sent.';
  }
  if (req.reason.trim().length < FORCE_REASON_MIN_LENGTH) {
    return `Force send needs a reason of at least ${FORCE_REASON_MIN_LENGTH} characters, e.g. \`force send: customer is waiting, contact record comes later\`. Nothing was sent.`;
  }
  return undefined;
}

async function forceSend(
  req: ForceSendRequest,
  deps: ForceSendDeps,
): Promise<string | undefined> {
  const reason = req.reason.trim();
  const target = await resolveTarget(req, deps);
  if (!target?.actionId) {
    return 'Force send found no approval card in this thread that the host can send exactly as written. Nothing was sent.';
  }
  if (target.state === 'confirmed') {
    return `Action ${target.actionId} was already sent (Gmail receipt ${target.gmailMessageId ?? 'recorded'}). Nothing was resent.`;
  }
  if (target.state === 'executing') return OUTCOME_TEXT.in_progress;
  if (target.state === 'uncertain') {
    const settled = await resolveUncertain(target, req, deps);
    if (settled) return settled;
  }
  const reopened = deps.reopen(target, req.actorUid, reason);
  if (!reopened?.actionId) {
    return `Action ${target.actionId} is in state ${target.state} and cannot be force-sent. Nothing was sent.`;
  }
  await deps.postThread(
    `📤 [FORCE SEND] ${req.actorName} is sending Action ${reopened.actionId} as approved. Reason: ${reason}`,
  );
  return OUTCOME_TEXT[await deps.execute(reopened.actionId)];
}

/** Threads with a force send in flight; a second command waits its turn. */
const running = new Set<string>();

/** Handle one force-send command. Returns the reply to post, if any. */
export async function handleForceSend(
  req: ForceSendRequest,
  deps: ForceSendDeps,
): Promise<string | undefined> {
  const refused = refusal(req, deps);
  if (refused) return refused;
  const key = `${req.chatJid}|${req.threadTs}`;
  if (running.has(key)) {
    return 'A force send for this thread is already running; wait for its result here. Nothing else was sent.';
  }
  running.add(key);
  try {
    return await forceSend(req, deps);
  } finally {
    running.delete(key);
  }
}
