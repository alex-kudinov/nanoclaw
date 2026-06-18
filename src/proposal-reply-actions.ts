/**
 * Resolution of a pending decline action when the operator reacts on its card.
 * ✅ → set the Plutio proposal to declined + stop follow-ups. 👎 → dismiss.
 * Side effects injected (Plutio, store, Slack) for unit testing.
 */

import { logger } from './logger.js';
import type { PendingAction } from './proposal-reply.js';

export interface DeclineActionDeps {
  getActionByTs(slackTs: string): Promise<PendingAction | null>;
  setDeclined(proposalId: string): Promise<boolean>;
  stopFollowups(proposalId: string, reason: string): Promise<void>;
  markActionDone(id: number): Promise<void>;
  markActionDismissed(id: number): Promise<void>;
  postThread(slackTs: string, text: string): Promise<void>;
}

/** ✅ on a decline card → set Plutio declined + stop follow-ups. */
export async function handleDeclineApproval(
  slackTs: string,
  reactor: string,
  deps: DeclineActionDeps,
): Promise<boolean> {
  const a = await deps.getActionByTs(slackTs);
  if (!a) return false;
  try {
    const ok = await deps.setDeclined(a.proposalId);
    await deps.stopFollowups(a.proposalId, 'client declined by email');
    await deps.markActionDone(a.id);
    await deps.postThread(
      slackTs,
      ok
        ? `✅ ${a.proposalNumber} set to declined in Plutio + follow-ups stopped (by ${reactor}).`
        : `⚠️ Stopped follow-ups, but Plutio status did not confirm declined for ${a.proposalNumber} — check it.`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, slackTs }, 'proposal-reply: decline failed');
    await deps.postThread(slackTs, `⚠️ Decline failed: ${msg}.`);
  }
  return true;
}

/** 👎 on a decline card → dismiss (leave the proposal + follow-ups as-is). */
export async function handleDeclineDismissal(
  slackTs: string,
  reactor: string,
  deps: DeclineActionDeps,
): Promise<boolean> {
  const a = await deps.getActionByTs(slackTs);
  if (!a) return false;
  await deps.markActionDismissed(a.id);
  await deps.postThread(
    slackTs,
    `🚫 Dismissed by ${reactor} — ${a.proposalNumber} left active.`,
  );
  return true;
}
