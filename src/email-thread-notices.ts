/**
 * Fixed Slack thread notices for the approved-email path (NC-20260927-001).
 * Every stop, cancel and arm gets a visible answer in the approval thread so
 * an operator never has to guess whether an email is still going out.
 */

import type { EmailSendActionRow } from './db.js';

/** A stop this soon after Gmail was reached is answered "too late". */
const LATE_STOP_WINDOW_MS = 10 * 60 * 1000;

/** Cancel window between approval and the host send; env read per call. */
export function approvedEmailHoldMs(): number {
  return (parseInt(process.env.MAILMAN_HOLD_SECONDS || '30', 10) || 0) * 1000;
}

/** Text posted in the approval thread once an Action-ID is armed. */
export function armedActionText(actionId: string): string {
  const seconds = Math.round(approvedEmailHoldMs() / 1000);
  return (
    `[EMAIL ACTION] Action-ID: ${actionId}\n` +
    `The host sends this exact approved card in ${seconds} seconds. ` +
    'Say `stop` or `cancel` in this thread before then to hold it. ' +
    'No Mailman handoff is needed; wait for the Gmail-confirmed receipt here.'
  );
}

function lateAction(
  thread: EmailSendActionRow[],
  now: Date,
): EmailSendActionRow | undefined {
  return thread.find((action) => {
    if (action.state !== 'executing' && action.state !== 'confirmed') {
      return false;
    }
    const reached = Date.parse(action.executionStartedAt ?? action.approvedAt);
    return now.getTime() - reached <= LATE_STOP_WINDOW_MS;
  });
}

/**
 * The thread's answer to a stop or an agent cancel. `cancelled` holds the
 * Action-IDs just stopped; `thread` is the thread's actions, newest first.
 * Returns undefined when the stop concerned no recent email.
 */
export function cancelOutcomeText(
  who: string,
  cancelled: string[],
  thread: EmailSendActionRow[],
  now: Date,
): string | undefined {
  if (cancelled.length > 0) {
    const what =
      cancelled.length === 1
        ? `Action ${cancelled[0]}`
        : `${cancelled.length} approved emails`;
    return `🛑 [EMAIL CANCELLED] ${who} stopped ${what} before Gmail. Nothing was sent. Approve a revised card, or say \`force send: <reason>\` to send this one after all.`;
  }
  const late = lateAction(thread, now);
  if (!late) return undefined;
  const outcome =
    late.state === 'confirmed'
      ? 'Gmail already accepted it'
      : 'it was already at Gmail';
  return `⚠️ Too late to stop Action ${late.actionId}: ${outcome}. Nothing was cancelled; watch this thread for the receipt.`;
}
