/**
 * Phase 1 approval poll (design §3.3.1). The healer is daemon-independent, so it
 * can't receive real-time Slack reaction events — instead each fast loop it polls
 * open proposals for an operator ✅/👍 (substitutable) or an "apply" reply, and a
 * ✖️/👎/"dismiss" the other way. Approval applies the proposed command and hands
 * off to the verify loop; rejection closes the incident as wont_fix. Gated to a
 * human (non-bot) reactor so the bot can't approve its own proposals.
 */

import { query } from '../business-db.js';
import { logger } from '../logger.js';
import { getReactions, getReplies } from './slack.js';
import {
  postIncidentThread,
  recordAction,
  runShell,
  setStatus,
  type ProposedFix,
} from './remediation.js';

const APPROVE_EMOJI = new Set([
  'white_check_mark',
  'heavy_check_mark',
  'ballot_box_with_check',
  '+1',
  'thumbsup',
]);
const REJECT_EMOJI = new Set([
  'x',
  'negative_squared_cross_mark',
  'no_entry',
  'no_entry_sign',
  '-1',
  'thumbsdown',
]);

function botUid(): string {
  return process.env.SLACK_BOT_USER_ID || 'U0AJ7UDBD6D';
}

/** A human (not the bot), optionally pinned to HEALER_OPERATOR_UID. */
export function isOperator(uid: string): boolean {
  const pinned = process.env.HEALER_OPERATOR_UID;
  return pinned ? uid === pinned : uid !== botUid();
}

export function emojiVerdict(
  reactions: Array<{ name: string; users: string[] }>,
): 'approve' | 'reject' | null {
  for (const r of reactions) {
    const byOp = r.users.some(isOperator);
    if (!byOp) continue;
    if (APPROVE_EMOJI.has(r.name)) return 'approve';
    if (REJECT_EMOJI.has(r.name)) return 'reject';
  }
  return null;
}

export function replyVerdict(
  replies: Array<{ user: string; text: string }>,
): 'approve' | 'reject' | null {
  for (const m of replies) {
    if (!isOperator(m.user)) continue;
    const t = m.text.toLowerCase();
    if (/dismiss|👎|❌|✖️|\bno\b/.test(t)) return 'reject';
    if (/apply|approve|implement|👍|✅|\byes\b/.test(t)) return 'approve';
  }
  return null;
}

interface PendingRow {
  id: number;
  source: string;
  proposal_channel: string;
  proposal_ts: string;
  proposed_fix: ProposedFix | null;
  thread_ts: string | null;
  thread_channel: string | null;
}

async function loadPending(): Promise<PendingRow[]> {
  const r = await query<PendingRow>(
    `SELECT id, source, proposal_channel, proposal_ts, proposed_fix,
            thread_ts, thread_channel
       FROM business_v2.incidents
      WHERE status = 'awaiting_approval'
        AND proposal_channel IS NOT NULL AND proposal_ts IS NOT NULL`,
  );
  return r.rows;
}

async function applyApproved(inc: PendingRow): Promise<void> {
  const cmd = inc.proposed_fix?.command;
  if (!cmd) {
    await setStatus(inc.id, 'wont_fix', 'escalated');
    return;
  }
  const res = await runShell(cmd);
  await recordAction(inc.id, {
    kind: 'approved_apply',
    command: cmd,
    ok: res.ok,
    out: res.out,
    at: new Date().toISOString(),
  });
  await setStatus(inc.id, 'remediating');
  await postIncidentThread(
    inc,
    `:white_check_mark: Applied fix for *${inc.source}* — ${res.ok ? 'ran ok' : 'command errored'}. Verifying…`,
  );
}

async function decideOne(
  inc: PendingRow,
): Promise<'approve' | 'reject' | null> {
  const [reactions, replies] = await Promise.all([
    getReactions(inc.proposal_channel, inc.proposal_ts),
    getReplies(inc.proposal_channel, inc.proposal_ts),
  ]);
  return emojiVerdict(reactions) ?? replyVerdict(replies);
}

/** Fast-loop step: resolve operator verdicts on open proposals. */
export async function runApprovals(): Promise<number> {
  const pending = await loadPending();
  let acted = 0;
  for (const inc of pending) {
    const verdict = await decideOne(inc);
    if (verdict === 'approve') {
      await applyApproved(inc);
      acted++;
    } else if (verdict === 'reject') {
      await setStatus(inc.id, 'wont_fix', 'escalated');
      await postIncidentThread(inc, `:x: Dismissed proposal for *${inc.source}*.`);
      acted++;
    }
  }
  if (pending.length)
    logger.info(
      { pending: pending.length, acted },
      'healer: approvals complete',
    );
  return acted;
}
