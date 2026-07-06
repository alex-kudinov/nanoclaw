/**
 * autonomy-ledger — derives draft outcomes from the messages table and
 * maintains per-(group, category) trust state.
 *
 * The messages DB is already the event log: bot drafts, operator feedback,
 * injected "✅ Approved by …" rows and later drafts are all stored messages.
 * The ledger is a deterministic state machine over those rows — no LLM, no
 * live hooks. Outcomes per draft:
 *
 *   approved_clean — an approval arrived with no operator feedback first
 *                    (streak++, may promote L1→L2)
 *   corrected      — operator replied with feedback before approving
 *                    (streak=0, demote to L1)
 *   superseded     — the agent posted a newer draft first (neutral; the
 *                    final draft in the chain decides)
 *   auto_approved  — the L2 hold window expired and the host approved
 *                    (counted, but does NOT build streak — only humans do)
 *   vetoed         — operator 👎'd a held L2 draft (streak=0, demote)
 *   expired        — no response within DRAFT_EXPIRY_HOURS (neutral)
 */
import {
  getAutonomyThreadMessagesAfter,
  getAutonomyTrust,
  getBotMessagesSince,
  getPendingAutonomyDraftEvents,
  getRouterState,
  hasAutonomyDraftEvent,
  insertAutonomyDraftEvent,
  resolveAutonomyDraftEvent,
  setAutonomyPendingStatus,
  setRouterState,
  upsertAutonomyTrust,
  type AutonomyDraftEventRow,
  type AutonomyTrustRow,
} from './db.js';
import type { NewMessage } from './types.js';
import { logger } from './logger.js';
import {
  AUTONOMY_LEVELS,
  DRAFT_EXPIRY_HOURS,
  GUARDED_CATEGORIES,
  heuristicCategory,
  isApprovalMessage,
  isAutoApprovalMessage,
  isOperatorApprovalText,
  isDraftMessage,
  parseDraftCategory,
  shouldPromote,
} from './autonomy-policy.js';

export interface GroupChannel {
  folder: string;
  jid: string;
}

export interface NewL2Draft {
  draft_id: string;
  chat_jid: string;
  group_folder: string;
  category: string;
  draft_ts: string;
  thread_ts: string | null;
}

export interface Promotion {
  group_folder: string;
  category: string;
  streak: number;
  jid: string;
}

export interface IngestResult {
  newL2Drafts: NewL2Draft[];
  promotions: Promotion[];
}

function trustFor(groupFolder: string, category: string): AutonomyTrustRow {
  return (
    getAutonomyTrust(groupFolder, category) ?? {
      group_folder: groupFolder,
      category,
      level: AUTONOMY_LEVELS.L1,
      streak: 0,
      drafts: 0,
      approved_clean: 0,
      corrected: 0,
      vetoed: 0,
      auto_approved: 0,
      updated_at: null,
    }
  );
}

function saveTrust(t: AutonomyTrustRow, nowIso: string): void {
  t.updated_at = nowIso;
  upsertAutonomyTrust(t);
}

/** Record newly posted drafts for a group; returns those eligible for L2 hold. */
function ingestNewDrafts(
  g: GroupChannel,
  watermark: string,
  nowIso: string,
): NewL2Draft[] {
  const out: NewL2Draft[] = [];
  const rows = getBotMessagesSince(g.jid, watermark);
  for (const m of rows) {
    if (!m.content || !isDraftMessage(m.content)) continue;
    if (m.from_group && m.from_group !== g.folder) continue;
    if (hasAutonomyDraftEvent(m.id)) continue;
    const category = parseDraftCategory(m.content) ?? heuristicCategory(m.content);
    insertAutonomyDraftEvent({
      draft_id: m.id,
      chat_jid: g.jid,
      group_folder: g.folder,
      category,
      outcome: 'pending',
      draft_ts: m.timestamp,
      thread_ts: m.thread_ts ?? null,
      resolved_ts: null,
    });
    const t = trustFor(g.folder, category);
    t.drafts += 1;
    saveTrust(t, nowIso);
    if (t.level >= AUTONOMY_LEVELS.L2 && !GUARDED_CATEGORIES.has(category)) {
      out.push({
        draft_id: m.id,
        chat_jid: g.jid,
        group_folder: g.folder,
        category,
        draft_ts: m.timestamp,
        thread_ts: m.thread_ts ?? null,
      });
    }
  }
  return out;
}

/** Chronological thread scan → first decisive event wins. Exported for the
 * historical report script (scripts/autonomy-report.ts). */
export function classifyOutcome(
  ev: AutonomyDraftEventRow,
  msgs: NewMessage[],
  nowMs: number,
): { outcome: string; at: string } | undefined {
  for (const m of msgs) {
    const text = (m.content || '').trim();
    if (!text) continue;
    if (m.is_from_me) {
      // A newer draft from the same group supersedes this one.
      if (m.from_group === ev.group_folder && isDraftMessage(text))
        return { outcome: 'superseded', at: m.timestamp };
      continue; // other bot output (acks, echoes) is noise
    }
    if (isApprovalMessage(text)) {
      return {
        outcome: isAutoApprovalMessage(text) ? 'auto_approved' : 'approved_clean',
        at: m.timestamp,
      };
    }
    if (!m.is_bot_message) {
      // A whole-message affirmative ("approved") is an approval, not feedback.
      return {
        outcome: isOperatorApprovalText(text) ? 'approved_clean' : 'corrected',
        at: m.timestamp,
      };
    }
    // bot-flagged non-draft rows (handoff echoes from other minions): noise
  }
  const ageMs = nowMs - Date.parse(ev.draft_ts);
  if (ageMs > DRAFT_EXPIRY_HOURS * 3_600_000)
    return { outcome: 'expired', at: new Date(nowMs).toISOString() };
  return undefined;
}

function applyOutcome(
  ev: AutonomyDraftEventRow,
  outcome: string,
  nowIso: string,
): Promotion | undefined {
  const t = trustFor(ev.group_folder, ev.category);
  let promotion: Promotion | undefined;
  if (outcome === 'approved_clean') {
    t.approved_clean += 1;
    t.streak += 1;
    if (shouldPromote(t.level, t.streak, ev.category)) {
      t.level = AUTONOMY_LEVELS.L2;
      promotion = {
        group_folder: ev.group_folder,
        category: ev.category,
        streak: t.streak,
        jid: ev.chat_jid,
      };
    }
  } else if (outcome === 'corrected') {
    t.corrected += 1;
    t.streak = 0;
    t.level = AUTONOMY_LEVELS.L1;
    setAutonomyPendingStatus(ev.draft_id, 'cancelled');
  } else if (outcome === 'auto_approved') {
    t.auto_approved += 1;
  } else if (outcome === 'superseded' || outcome === 'expired') {
    setAutonomyPendingStatus(ev.draft_id, 'cancelled');
  }
  saveTrust(t, nowIso);
  return promotion;
}

/** Operator 👎 on a held L2 draft: hard demote. Called by autonomy-hold. */
export function recordVeto(
  groupFolder: string,
  category: string,
  nowIso: string,
): void {
  const t = trustFor(groupFolder, category);
  t.vetoed += 1;
  t.streak = 0;
  t.level = AUTONOMY_LEVELS.L1;
  saveTrust(t, nowIso);
}

/** Host auto-approval fired: count it (no streak credit). */
export function recordAutoApproved(
  groupFolder: string,
  category: string,
  nowIso: string,
): void {
  const t = trustFor(groupFolder, category);
  t.auto_approved += 1;
  saveTrust(t, nowIso);
}

/**
 * One ledger pass: discover new drafts since the per-group watermark, then
 * resolve outstanding drafts from their thread history. Pure DB in/out.
 */
export function ingest(groups: GroupChannel[], now: Date): IngestResult {
  const nowIso = now.toISOString();
  const result: IngestResult = { newL2Drafts: [], promotions: [] };
  for (const g of groups) {
    const wmKey = `autonomy_wm_${g.folder}`;
    // First run starts from "now": history is the report script's job, and
    // seeding live trust from unaudited history would be trust inflation.
    const watermark = getRouterState(wmKey) ?? nowIso;
    if (!getRouterState(wmKey)) setRouterState(wmKey, nowIso);

    result.newL2Drafts.push(...ingestNewDrafts(g, watermark, nowIso));
    setRouterState(wmKey, nowIso);

    for (const ev of getPendingAutonomyDraftEvents(g.folder)) {
      const msgs = getAutonomyThreadMessagesAfter(
        ev.chat_jid,
        ev.thread_ts,
        ev.draft_ts,
      );
      const res = classifyOutcome(ev, msgs, now.getTime());
      if (!res) continue;
      resolveAutonomyDraftEvent(ev.draft_id, res.outcome, res.at);
      const promo = applyOutcome(ev, res.outcome, nowIso);
      if (promo) result.promotions.push(promo);
      logger.info(
        { draft: ev.draft_id, category: ev.category, outcome: res.outcome },
        'autonomy: draft resolved',
      );
    }
  }
  return result;
}
