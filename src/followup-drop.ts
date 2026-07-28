/**
 * Operator "drop" for daily sales-lead follow-ups — host-enforced and verified.
 *
 * The daily cron drafts a follow-up for every lead in
 * `business_v2.v_sales_followup_queue`. A lead only leaves that queue by
 * advancing out of the active stages, a fresh reply, an open proposal, or the
 * follow-up cap — and `follow_up_count` only rises on a SENT nudge. So declining
 * a draft sends nothing, the count stays put, and the same lead is re-drafted
 * every weekday forever.
 *
 * Two production failures made the container-side drop untrustworthy:
 *   • 2026-07-24 the sales agent reported "Entry #213 (Namrata Kohli) marked
 *     lost" and executed fn_advance_pipeline_stage(213,'qualifying','lost') —
 *     stage and reason transposed. Valid stage, void return, nothing read back,
 *     so she was re-drafted 2026-07-25 and 2026-07-27.
 *   • Renee Fisher #345 drew "[SKIP — DB TRACKING ANOMALY]" on five consecutive
 *     weekdays; skipping writes nothing, so she was re-drafted each morning and
 *     received two unwanted nudges before anyone caught it.
 *
 * So the drop now runs on the HOST, is PARTY-scoped (migration 113 — Namrata had
 * two pipeline entries, Renee Carr two parties; entry-scoped drops leaked), and
 * REPORTS WHAT THE DATABASE ACTUALLY DID rather than what was intended. It
 * accepts both the 👎 reaction and — the path this operator actually uses — a
 * typed instruction in #gru-sales.
 */

import {
  parseDropInstruction,
  matchLeadsByName,
  type DropTargets,
} from './followup-drop-parse.js';

/** Minimal shape of a stored Slack card, as returned by getMessageById. */
export interface FollowupCard {
  content: string;
  from_group?: string | null;
  chat_jid: string;
}

/** One lead currently due a nudge. */
export interface QueuedLead {
  pipeline_entry_id: number;
  party_id: number;
  display_name: string;
  primary_email?: string | null;
}

/** What `fn_drop_followups` reported it changed. */
export interface DropResult {
  entryIds: number[];
}

export interface FollowupDropDeps {
  /** Look up a stored message row by its Slack ts. */
  getCard(ts: string): FollowupCard | undefined;
  /** Live `v_sales_followup_queue` rows — the only leads that can be dropped. */
  queue(): Promise<QueuedLead[]>;
  /** Party + name behind a pipeline entry, regardless of queue membership. */
  lookupEntry(entryId: number): Promise<QueuedLead | undefined>;
  /** `SELECT * FROM business_v2.fn_drop_followups($1,$2)` — returns moved entries. */
  dropParty(partyId: number, reason: string): Promise<DropResult>;
  /** Post a confirmation reply under the message. */
  postThread(jid: string, ts: string, text: string): Promise<void>;
}

// Only the daily follow-up cards drop a lead. A 👎 on a `[SALES REVIEW]` (first
// reply) or `[COLD]` card means something else and must NOT suppress the lead.
const FOLLOWUP_CARD_RE = /^\s*\[FOLLOW-UP[^\]]*\][^\n]*?\bLead\s*#(\d+)\b/i;

/** Extract the pipeline_entry_id from a follow-up card, or null if not one. */
export function parseFollowupLeadId(content: string): number | null {
  const m = content.match(FOLLOWUP_CARD_RE);
  if (!m) return null;
  const id = Number.parseInt(m[1], 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Drop one resolved lead and describe, from the DB's answer, what happened. */
async function dropLead(
  lead: QueuedLead,
  reason: string,
  deps: FollowupDropDeps,
): Promise<string> {
  const res = await deps.dropParty(lead.party_id, reason);
  const parked =
    res.entryIds.length > 0
      ? `parked ${res.entryIds.map((i) => `#${i}`).join(', ')}`
      : 'no open entries to park';
  return `${lead.display_name} (party ${lead.party_id}) — ${parked}; will not be followed up again.`;
}

/**
 * Handle a 👎 that may be a follow-up drop. Returns true when it acted (the card
 * was a sales follow-up), false otherwise. The return value is informational —
 * the observer runs regardless of the reject claim-chain.
 *
 * Party-scoped: drops every entry for the person on the card, not just entry N.
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

  const lead = await deps.lookupEntry(entryId);
  if (!lead) {
    await deps.postThread(
      card.chat_jid,
      ts,
      `Could not drop Lead #${entryId} — no such pipeline entry. Nothing changed.`,
    );
    return true;
  }

  const line = await dropLead(
    lead,
    `operator ${reactor} dropped from follow-ups (👎)`,
    deps,
  );
  await deps.postThread(
    card.chat_jid,
    ts,
    `Dropped from follow-ups — ${line} Reverse with \`resume follow-ups #${entryId}\`.`,
  );
  return true;
}

/** Resolve parsed candidates against the live queue. */
async function resolveTargets(
  targets: DropTargets,
  deps: FollowupDropDeps,
): Promise<{ leads: QueuedLead[]; ambiguous: string[]; unknown: string[] }> {
  const queue = await deps.queue();
  const byId = new Map(queue.map((l) => [l.pipeline_entry_id, l]));
  const leads = new Map<number, QueuedLead>();
  const ambiguous: string[] = [];
  const unknown: string[] = [];

  for (const id of targets.ids) {
    const hit = byId.get(id);
    if (hit) leads.set(hit.party_id, hit);
    // Only an id the operator wrote as `#N` is worth a "matched nothing" reply.
    // A bare number ("drop those 2 - responded separately") is usually a count.
    else if (targets.explicitIds.includes(id)) unknown.push(`#${id}`);
  }
  for (const name of targets.names) {
    const hits = matchLeadsByName(name, queue);
    const parties = new Set(hits.map((h) => h.party_id));
    if (parties.size === 1) leads.set(hits[0].party_id, hits[0]);
    else if (parties.size > 1) ambiguous.push(name);
    // An unmatched phrase is dropped in silence: "drop the pricing" and "drop
    // accredication pending" are draft edits for the agent, not lead drops.
  }
  return { leads: [...leads.values()], ambiguous, unknown };
}

/** A threaded reply under a `[FOLLOW-UP …]` card targets that lead, no parsing. */
async function dropFromParentCard(
  threadTs: string,
  reason: string,
  deps: FollowupDropDeps,
): Promise<string | null> {
  const parent = deps.getCard(threadTs);
  const entryId = parent ? parseFollowupLeadId(parent.content) : null;
  if (entryId === null) return null;
  const lead = await deps.lookupEntry(entryId);
  return lead ? dropLead(lead, reason, deps) : null;
}

/**
 * Handle a typed operator instruction in the sales channel. Returns true when a
 * drop instruction was both recognised AND reported on — including when nothing
 * resolved, because silently doing nothing is the failure this module exists to
 * end. Returns false for "drop the pricing"-style edits that name no lead, so
 * the sales agent still handles them as draft feedback.
 */
export async function handleTypedDrop(
  msg: { chat_jid: string; ts: string; text: string; threadTs?: string | null },
  operator: string,
  deps: FollowupDropDeps,
): Promise<boolean> {
  const targets = parseDropInstruction(msg.text);
  if (!targets) return false;

  const reply = (t: string) => deps.postThread(msg.chat_jid, msg.ts, t);
  const reason = `operator ${operator} dropped from follow-ups (typed)`;

  if (msg.threadTs) {
    const line = await dropFromParentCard(msg.threadTs, reason, deps);
    if (line) {
      await reply(`Dropped from follow-ups — ${line}`);
      return true;
    }
  }

  const { leads, ambiguous, unknown } = await resolveTargets(targets, deps);
  if (leads.length === 0 && ambiguous.length === 0) {
    // Nothing nameable at all → ordinary draft edit ("drop the pricing"). Leave
    // it to the agent. Something nameable that missed → say so, never silence.
    if (unknown.length === 0) return false;
    await reply(
      `Heard "drop" but matched no lead in the follow-up queue (${unknown.join(', ')}). ` +
        `Nothing changed — reply with the Lead #id if that was meant as a drop.`,
    );
    return true;
  }

  const lines: string[] = [];
  for (const lead of leads)
    lines.push(`• ${await dropLead(lead, reason, deps)}`);
  if (ambiguous.length > 0)
    lines.push(
      `• Ambiguous, NOT dropped: ${ambiguous.join(', ')} — more than one queued lead matches. Give the Lead #id.`,
    );
  if (unknown.length > 0)
    lines.push(
      `• Not in the follow-up queue, nothing to do: ${unknown.join(', ')}`,
    );
  await reply(`Follow-up drop:\n${lines.join('\n')}`);
  return true;
}
