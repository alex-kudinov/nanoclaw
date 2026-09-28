/**
 * Host execution of a human-approved email action (NC-20260927-001).
 *
 * Mailman used to relay every approved card: the Sales agent emitted a
 * handoff, Mailman called a Gmail tool, and the host then rebuilt every field
 * from the approved card anyway. Each hop added a way for an approved email to
 * stall (lost handoffs, unbound tool calls, a reply-target mismatch). The host
 * already holds the card, the Action-ID and the exact approved hash, so it now
 * sends the card itself once the cancel window has passed.
 *
 * What still stops a send: the card no longer matches its approval hash,
 * recipient or CC; the recipient is malformed, reserved or our own mailbox;
 * the external-write safety control or global test routing is on (a hold, not
 * a kill); the action is already confirmed or has an uncertain Gmail attempt.
 */

import { buildHostApprovedEmailExecution } from './approved-email-execution.js';
import { isExternalWriteDeniedError } from './action-safety.js';
import type { EmailSendActionRow } from './db.js';
import type { GmailIpcPayload } from './gmail-ipc-handlers.js';
import { approvedEmailHoldMs } from './email-thread-notices.js';
import {
  blockAction,
  FORCE_HINT,
  recoverFromSendError,
  sendOnce,
  type HostEmailExecutorDeps,
  type HostExecutionOutcome,
} from './host-email-send.js';
import { logger } from './logger.js';

export {
  approvedEmailHoldMs,
  armedActionText,
  cancelOutcomeText,
} from './email-thread-notices.js';
export {
  gmailRejectedStatus,
  type HostEmailExecutorDeps,
  type HostExecutionOutcome,
} from './host-email-send.js';

const PRE_EXECUTION = new Set([
  'approved',
  'handoff_routed',
  'mailman_started',
]);

function prepareExecution(
  action: EmailSendActionRow,
  deps: HostEmailExecutorDeps,
):
  | { ok: true; payload: GmailIpcPayload; sha: string }
  | { ok: false; code: string; reason: string } {
  const card = deps.getCardText(action);
  if (!card) {
    return {
      ok: false,
      code: 'approved_card_missing',
      reason: 'the exact approved Slack card is unavailable',
    };
  }
  const request: GmailIpcPayload = {
    type: 'gmail_send',
    groupFolder: action.groupFolder,
    timestamp: deps.now().toISOString(),
  };
  const built = buildHostApprovedEmailExecution(action, card, request);
  if (!built.ok) return built;
  return { ok: true, payload: built.payload, sha: built.approvedContentSha256 };
}

async function holdForSafety(
  action: EmailSendActionRow,
  deps: HostEmailExecutorDeps,
): Promise<boolean> {
  let code: string | undefined;
  try {
    deps.assertGmailWritable();
  } catch (err) {
    if (!isExternalWriteDeniedError(err)) throw err;
    code = `action_safety_${err.code}`;
  }
  if (!code && deps.testRoutingActive()) code = 'global_test_routing_active';
  if (!code) return false;
  if (deps.hold(action.actionId!, code, deps.now().toISOString()) > 0) {
    await deps.postThread(
      action,
      `⏸️ [EMAIL HELD] Action ${action.actionId} was NOT sent: ${code.replaceAll('_', ' ')}. ` +
        `Gmail was not called and the approval is kept. ${FORCE_HINT}`,
    );
  }
  return true;
}

/** The outcome for a state that must not be executed now, else undefined. */
function settledOutcome(state: string): HostExecutionOutcome | undefined {
  if (state === 'confirmed') return 'already_sent';
  if (state === 'executing') return 'in_progress';
  if (state === 'uncertain') return 'uncertain';
  if (state === 'blocked') return 'blocked';
  // Held actions (safety control, test routing, watchdog) move again only
  // after an owner force send reopens them to `approved`.
  if (state === 'attention_required') return 'held';
  if (PRE_EXECUTION.has(state)) return undefined;
  return 'unknown';
}

/**
 * Execute one approved action exactly once. Terminal and in-flight states are
 * reported to the caller without a Slack post; the outcome was already posted.
 */
export async function executeApprovedEmailAction(
  actionId: string,
  deps: HostEmailExecutorDeps,
): Promise<HostExecutionOutcome> {
  const action = deps.getAction(actionId);
  if (!action?.actionId) return 'unknown';
  const settled = settledOutcome(action.state);
  if (settled) return settled;
  const prepared = prepareExecution(action, deps);
  if (!prepared.ok) {
    return blockAction(action, prepared.code, prepared.reason, deps);
  }
  if (await holdForSafety(action, deps)) return 'held';
  const at = deps.now().toISOString();
  const claim = deps.claim(actionId, prepared.sha, action.recipient, at);
  if (claim.status === 'confirmed') return 'already_sent';
  if (claim.status === 'held') {
    logger.info({ actionId, reason: claim.reason }, 'Host email not claimed');
    return 'in_progress';
  }
  try {
    return await sendOnce(action, prepared.payload, deps);
  } catch (err) {
    logger.error({ err, actionId }, 'Host email failed at the Gmail boundary');
    return recoverFromSendError(action, prepared.payload, err, deps);
  }
}

/** How often the host looks for approved actions whose cancel window ended. */
export const HOST_EMAIL_SEND_TICK_MS = 5 * 1000;
/**
 * Older approvals are not sent automatically (for example after a long outage
 * or while the safety control was on); the watchdog alert and `force send:`
 * cover them so nothing surprising goes out on restart.
 */
export const HOST_EMAIL_MAX_AUTO_AGE_MS = 15 * 60 * 1000;

export interface HostEmailSweepDeps extends HostEmailExecutorDeps {
  listExecutable(cutoffIso: string, notBeforeIso: string): EmailSendActionRow[];
  isApprovalCard(text: string): boolean;
}

/** Send every approved card whose cancel window has passed. */
export async function runHostEmailSendSweep(
  now: Date,
  deps: HostEmailSweepDeps,
): Promise<number> {
  const cutoff = new Date(now.getTime() - approvedEmailHoldMs()).toISOString();
  const notBefore = new Date(
    now.getTime() - HOST_EMAIL_MAX_AUTO_AGE_MS,
  ).toISOString();
  let sent = 0;
  for (const action of deps.listExecutable(cutoff, notBefore)) {
    // Host-owned drafts (proposal follow-ups) run their own executor and are
    // never Sales-style approval cards; leave them alone.
    const card = deps.getCardText(action);
    if (!card || !deps.isApprovalCard(card)) continue;
    if ((await executeApprovedEmailAction(action.actionId!, deps)) === 'sent') {
      sent++;
    }
  }
  return sent;
}
