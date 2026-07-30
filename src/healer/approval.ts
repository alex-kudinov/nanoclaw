/**
 * Phase 1 approval poll (design §3.3.1). The healer is daemon-independent, so it
 * can't receive real-time Slack reaction events — instead each fast loop it polls
 * open proposals for a named operator ✅/👍 (substitutable) or an "apply" reply,
 * and a ✖️/👎/"dismiss" the other way. Approval applies the proposed command and
 * hands off to the verify loop; rejection closes the incident as wont_fix.
 *
 * Every execution is fail-closed at the final boundary: global action policy,
 * exact operator, current proposal epoch/nonce, freshness, current trust/class,
 * and an atomic one-time database claim must all still agree.
 */

import { query } from '../business-db.js';
import { logger } from '../logger.js';
import { getReactions, getReplies } from './slack.js';
import {
  currentActionPolicy,
  fixApprovalIsCurrent,
  isNamedOperator,
} from './action-policy.js';
import { redact } from './incident-store.js';
import {
  isActionable,
  postIncidentThread,
  recordAction,
  runShell,
  type OpenIncident,
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

/** Exact named operator; no broad "any non-bot human" fallback. */
export function isOperator(uid: string): boolean {
  return isNamedOperator(uid);
}

export interface ApprovalVerdict {
  decision: 'approve' | 'reject';
  user: string;
}

export function emojiVerdict(
  reactions: Array<{ name: string; users: string[] }>,
): ApprovalVerdict | null {
  // A named rejection always wins over approval when Slack contains both.
  for (const r of reactions) {
    const user = r.users.find(isOperator);
    if (user && REJECT_EMOJI.has(r.name)) return { decision: 'reject', user };
  }
  for (const r of reactions) {
    const user = r.users.find(isOperator);
    if (user && APPROVE_EMOJI.has(r.name)) return { decision: 'approve', user };
  }
  return null;
}

export function replyVerdict(
  replies: Array<{ user: string; text: string }>,
): ApprovalVerdict | null {
  for (const m of replies) {
    if (!isOperator(m.user)) continue;
    const t = m.text.toLowerCase();
    if (/dismiss|👎|❌|✖️|\bno\b/.test(t)) {
      return { decision: 'reject', user: m.user };
    }
    if (/apply|approve|implement|👍|✅|\byes\b/.test(t)) {
      return { decision: 'approve', user: m.user };
    }
  }
  return null;
}

interface PendingRow extends OpenIncident {
  proposal_channel: string;
  proposal_ts: string;
  proposed_fix: ProposedFix | null;
}

async function loadPending(): Promise<PendingRow[]> {
  const r = await query<PendingRow>(
    `SELECT id, source, severity, occurrences, status, raw_context,
            remediation_class, diagnosis, proposed_fix, confidence,
            cause_or_symptom, evidence, review, thread_ts, thread_channel,
            last_seen::text AS last_seen, proposal_channel, proposal_ts
       FROM business_v2.incidents
      WHERE status = 'awaiting_approval'
        AND proposal_channel IS NOT NULL AND proposal_ts IS NOT NULL`,
  );
  return r.rows;
}

async function recoverStaleClaims(): Promise<number> {
  // Five minutes exceeds runShell's 120-second timeout, leaving room to persist
  // its result before a genuinely abandoned claim is disarmed.
  const r = await query<{ id: number }>(
    `UPDATE business_v2.incidents
        SET status = 'needs_human', outcome = 'escalated',
            proposed_fix = proposed_fix - 'action_epoch' - 'approval_nonce'
              - 'approval_created_at',
            proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
      WHERE status = 'triaging'
        AND applied_action->>'kind' IN (
          'approval_claimed', 'implement_claimed', 'auto_rerun_claimed'
        )
        AND updated_at < now() - interval '5 minutes'
      RETURNING id`,
  );
  return r.rows.length;
}

async function disarmProposal(inc: PendingRow, reason: string): Promise<void> {
  await query(
    `UPDATE business_v2.incidents
        SET status = 'needs_human', outcome = 'escalated',
            proposed_fix = proposed_fix - 'action_epoch' - 'approval_nonce'
              - 'approval_created_at',
            proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
      WHERE id = $1 AND status = 'awaiting_approval' AND proposal_ts = $2`,
    [inc.id, inc.proposal_ts],
  );
  await postIncidentThread(
    inc,
    `:warning: Proposal for *${inc.source}* was disarmed (${reason}); no command ran.`,
  );
}

async function claimApproval(
  inc: PendingRow,
  verdict: ApprovalVerdict,
): Promise<boolean> {
  const nonce = inc.proposed_fix?.approval_nonce;
  if (!nonce) return false;
  const r = await query<{ id: number }>(
    `UPDATE business_v2.incidents
        SET status = 'triaging',
            applied_action = $4::jsonb,
            proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
      WHERE id = $1 AND status = 'awaiting_approval' AND proposal_ts = $2
        AND proposed_fix->>'approval_nonce' = $3
      RETURNING id`,
    [
      inc.id,
      inc.proposal_ts,
      nonce,
      JSON.stringify({
        kind: 'approval_claimed',
        approved_by: verdict.user,
        approval_nonce: nonce,
        at: new Date().toISOString(),
      }),
    ],
  );
  return r.rows.length === 1;
}

async function applyApproved(
  inc: PendingRow,
  verdict: ApprovalVerdict,
): Promise<boolean> {
  const cmd = inc.proposed_fix?.command;
  if (!cmd) {
    await disarmProposal(inc, 'missing executable command');
    return false;
  }
  if (!(await claimApproval(inc, verdict))) return false;
  const res = await runShell(cmd);
  await recordAction(inc.id, {
    kind: 'approved_apply',
    command: redact(cmd),
    ok: res.ok,
    out: redact(res.out),
    approved_by: verdict.user,
    approval_nonce: inc.proposed_fix?.approval_nonce,
    at: new Date().toISOString(),
  });
  await query(
    `UPDATE business_v2.incidents
        SET status = 'remediating', updated_at = now()
      WHERE id = $1 AND status = 'triaging'
        AND applied_action->>'approval_nonce' = $2`,
    [inc.id, inc.proposed_fix?.approval_nonce],
  );
  await postIncidentThread(
    inc,
    `:white_check_mark: Applied fix for *${inc.source}* — ${res.ok ? 'ran ok' : 'command errored'}. Verifying…`,
  );
  return true;
}

async function rejectProposal(
  inc: PendingRow,
  verdict: ApprovalVerdict,
): Promise<boolean> {
  const r = await query<{ id: number }>(
    `UPDATE business_v2.incidents
        SET status = 'wont_fix', outcome = 'escalated',
            applied_action = $3::jsonb,
            proposed_fix = proposed_fix - 'action_epoch' - 'approval_nonce'
              - 'approval_created_at',
            proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
      WHERE id = $1 AND status = 'awaiting_approval' AND proposal_ts = $2
      RETURNING id`,
    [
      inc.id,
      inc.proposal_ts,
      JSON.stringify({
        kind: 'proposal_rejected',
        rejected_by: verdict.user,
        at: new Date().toISOString(),
      }),
    ],
  );
  if (r.rows.length !== 1) return false;
  await postIncidentThread(inc, `:x: Dismissed proposal for *${inc.source}*.`);
  return true;
}

async function decideOne(inc: PendingRow): Promise<ApprovalVerdict | null> {
  const [reactions, replies] = await Promise.all([
    getReactions(inc.proposal_channel, inc.proposal_ts),
    getReplies(inc.proposal_channel, inc.proposal_ts),
  ]);
  return emojiVerdict(reactions) ?? replyVerdict(replies);
}

/** Fast-loop step: resolve operator verdicts on open proposals. */
export async function runApprovals(): Promise<number> {
  const policy = currentActionPolicy();
  if (!policy.enabled) return 0;
  const recovered = await recoverStaleClaims();
  if (recovered) {
    logger.warn({ recovered }, 'healer: stale approval claims disarmed');
  }
  const pending = await loadPending();
  let acted = 0;
  for (const inc of pending) {
    const verdict = await decideOne(inc);
    if (!verdict) continue;
    if (verdict.decision === 'approve') {
      if (!fixApprovalIsCurrent(inc.proposed_fix)) {
        await disarmProposal(inc, 'stale or unbound approval');
        continue;
      }
      if (!isActionable(inc)) {
        await disarmProposal(
          inc,
          'current trust, class, or fix kind is unsafe',
        );
        continue;
      }
      if (await applyApproved(inc, verdict)) acted++;
    } else if (await rejectProposal(inc, verdict)) {
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
