/**
 * Operator "drop" for daily sales-lead follow-ups.
 *
 * The daily cron (`task-followup-daily`) drafts a follow-up for every lead in
 * `business_v2.v_sales_followup_queue`. A lead only leaves that queue by
 * advancing to won/lost/nurture/paused, a fresh reply, an open proposal, or the
 * follow-up cap — and `follow_up_count` only rises on a SENT nudge. So declining
 * a draft sends nothing, the count stays put, and the same lead is re-drafted the
 * next weekday forever (Kimberley Young #243 / Kate Fullbrook #354, 2026-07-16).
 *
 * This gives "drop" a durable, view-honored effect: a 👎 on a `[FOLLOW-UP …]
 * Lead #N` card moves entry N to the `nurture` hold stage (excluded by the queue
 * view, line 103). Reversible — move back to `qualifying` to re-enable. Runs as a
 * host-side reject OBSERVER, independent of the reject claim-chain, so it never
 * preempts the autonomy listener that must cancel a held draft's pending
 * auto-send.
 */

/** Minimal shape of a stored Slack card, as returned by getMessageById. */
export interface FollowupCard {
  content: string;
  from_group?: string | null;
  chat_jid: string;
}

export interface FollowupDropDeps {
  /** Look up the reacted message's stored row by its Slack ts. */
  getCard(ts: string): FollowupCard | undefined;
  /** Move the pipeline entry to the `nurture` hold stage. */
  moveToNurture(entryId: number, reason: string): Promise<void>;
  /** Post a confirmation reply under the card. */
  postThread(jid: string, ts: string, text: string): Promise<void>;
}

// Only the daily follow-up cards drop a lead. A 👎 on a `[SALES REVIEW]` (first
// reply) or `[COLD]` card means something else and must NOT nurture the lead.
const FOLLOWUP_CARD_RE = /^\s*\[FOLLOW-UP[^\]]*\][^\n]*?\bLead\s*#(\d+)\b/i;

/** Extract the pipeline_entry_id from a follow-up card, or null if not one. */
export function parseFollowupLeadId(content: string): number | null {
  const m = content.match(FOLLOWUP_CARD_RE);
  if (!m) return null;
  const id = Number.parseInt(m[1], 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Handle a 👎 that may be a follow-up drop. Returns true when it acted (the card
 * was a sales follow-up), false otherwise. The return value is informational —
 * the observer runs regardless of the reject claim-chain.
 */
export async function handleFollowupDrop(
  ts: string,
  reactor: string,
  deps: FollowupDropDeps,
): Promise<boolean> {
  const card = deps.getCard(ts);
  if (!card || card.from_group !== 'sales') return false;
  const entryId = parseFollowupLeadId(card.content);
  if (entryId === null) return false;

  await deps.moveToNurture(
    entryId,
    `operator ${reactor} dropped from follow-ups (👎)`,
  );
  await deps.postThread(
    card.chat_jid,
    ts,
    `Dropped Lead #${entryId} from follow-ups — moved to nurture, it won't be nudged again. ` +
      `Move it back to qualifying to re-enable.`,
  );
  return true;
}
