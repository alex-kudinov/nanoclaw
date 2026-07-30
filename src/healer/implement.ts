/**
 * Phase 3 — agentic auto-implement for code_bug proposals (design §7, deferred
 * tier). An operator 👍/✅ (same approval signal as everything else) or an
 * apply/implement reply on a code_bug diagnosis hands the root cause + proposed
 * diff to the in-repo dev-pipeline, run HEADLESS and DETACHED (minutes) on branch
 * `healer/fix-{id}`. It only ever produces a DRAFT PR on origin for human
 * review — never merges, never pushes main or upstream.
 *
 * Fenced like Phase 2: HEALER_IMPLEMENT_ENABLED (default off — ship dark until
 * the headless pipeline invocation is verified). The dev-pipeline lead is
 * interactive (uses AskUserQuestion), so the task prompt forbids questions and
 * the run uses bypassPermissions. The detached process is polled from a
 * completion marker; it does not yet have a process timeout, which is one reason
 * the implementation switch remains off by default.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import { activeOAuthToken } from './agentic.js';
import { getReactions, getReplies } from './slack.js';
import {
  emojiVerdict,
  replyVerdict,
  type ApprovalVerdict,
} from './approval.js';
import { query } from '../business-db.js';
import {
  fixApprovalIsCurrent,
  healerImplementationEnabled,
} from './action-policy.js';
import {
  postIncidentThread,
  recordAction,
  type OpenIncident,
} from './remediation.js';
import { isTrustworthy } from './trust.js';

const BRANCH_PREFIX = 'healer/fix-';
const DONE_MARKER = 'HEALER_IMPLEMENT_DONE:';

function logPath(id: number): string {
  const dir =
    process.env.HEALER_IMPLEMENT_LOGDIR || path.join(process.cwd(), 'logs');
  return path.join(dir, `implement-${id}.log`);
}

/** Branch name for an incident's fix. */
export function branchName(id: number): string {
  return `${BRANCH_PREFIX}${id}`;
}

/** The non-interactive task handed to the dev-pipeline. */
export function buildTask(inc: OpenIncident, branch: string): string {
  const fix = inc.proposed_fix;
  return (
    `/pipeline Fix NanoClaw incident #${inc.id} (${inc.source}) on the CURRENT ` +
    `git branch ${branch}. You are running NON-INTERACTIVELY: never call ` +
    `AskUserQuestion — make reasonable assumptions and proceed. Root cause: ` +
    `${inc.diagnosis}. Proposed change: ${fix?.summary ?? ''}. ` +
    (fix?.diff
      ? `Suggested diff (starting point, verify before applying):\n${fix.diff}\n`
      : '') +
    `Implement the smallest correct fix, add/adjust a test, run the full test ` +
    `suite, and only when it is green commit and open a DRAFT PR to origin with ` +
    `gh. Do NOT merge, do NOT push to main/master or the upstream remote.`
  );
}

/** Extract the first GitHub PR URL from pipeline output, if any. */
export function extractPrUrl(text: string): string | null {
  const m = text.match(/https:\/\/github\.com\/[^\s"']+\/pull\/\d+/);
  return m ? m[0] : null;
}

/**
 * code_bug diagnoses with a posted proposal, eligible for a 👍 auto-implement.
 * TRUST-GATED (Phase 4): only a non-low-confidence ROOT-CAUSE diagnosis qualifies.
 * An untrustworthy code_bug posted as "needs a human look" stays out of this set,
 * so a stray 👍 on it can never dispatch the dev-pipeline on a wrong root cause.
 */
async function loadImplementable(): Promise<OpenIncident[]> {
  const r = await query<
    OpenIncident & { proposal_channel: string; proposal_ts: string }
  >(
    `SELECT id, source, severity, occurrences, status, raw_context,
            remediation_class, diagnosis, proposed_fix, confidence,
            cause_or_symptom, evidence, review, thread_ts, thread_channel,
            last_seen::text AS last_seen, proposal_channel, proposal_ts
       FROM business_v2.incidents
      WHERE status = 'diagnosed' AND remediation_class = 'code_bug'
        AND proposal_channel IS NOT NULL AND proposal_ts IS NOT NULL
        AND confidence IS DISTINCT FROM 'low' AND cause_or_symptom = 'root_cause'`,
  );
  return r.rows.filter(
    (inc) =>
      inc.proposed_fix?.kind === 'diff' &&
      fixApprovalIsCurrent(inc.proposed_fix) &&
      isTrustworthy(inc),
  );
}

/**
 * code_bug proposals are triggered by the SAME operator approval signal as
 * everything else — 👍 / ✅ (substitutable) or an apply/implement reply. There's
 * no overlap with the command-approval poll: code_bug incidents stay 'diagnosed'
 * while command fixes are 'awaiting_approval', so the two pollers read disjoint
 * sets and one 👍 can't double-fire.
 */
async function operatorRequestedImplement(
  channel: string,
  ts: string,
): Promise<ApprovalVerdict | null> {
  const [reactions, replies] = await Promise.all([
    getReactions(channel, ts),
    getReplies(channel, ts),
  ]);
  const verdict = emojiVerdict(reactions) ?? replyVerdict(replies);
  return verdict?.decision === 'approve' ? verdict : null;
}

/** Spawn the dev-pipeline headless+detached on a fresh branch; never awaited. */
function spawnPipeline(inc: OpenIncident, branch: string, token: string): void {
  const log = logPath(inc.id);
  const task = buildTask(inc, branch).replace(/'/g, `'\\''`);
  const script =
    `git checkout -b ${branch} 2>>'${log}' || git checkout ${branch} 2>>'${log}'; ` +
    `claude -p '${task}' --permission-mode bypassPermissions >>'${log}' 2>&1; ` +
    `echo "${DONE_MARKER}$?" >>'${log}'`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_CODE_OAUTH_TOKEN: token,
  };
  delete env.ANTHROPIC_API_KEY; // OAuth token + API key together confuse auth
  const child = spawn('bash', ['-lc', script], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
}

/** Returns true if a pipeline was actually dispatched. */
async function dispatch(
  inc: OpenIncident & { proposal_ts: string },
  verdict: ApprovalVerdict,
): Promise<boolean> {
  // Trust can change after proposal publication. Re-check at the last boundary
  // before reading credentials or attempting the one-time database claim.
  if (!isTrustworthy(inc)) return false;
  const token = activeOAuthToken();
  if (!token) {
    await postIncidentThread(
      inc,
      `:warning: Can't auto-implement *${inc.source}* (#${inc.id}) — no active Claude token. Left as a manual fix.`,
    );
    return false; // don't spawn a guaranteed-401 run; leave status 'diagnosed'
  }
  const nonce = inc.proposed_fix?.approval_nonce;
  if (!nonce || !fixApprovalIsCurrent(inc.proposed_fix)) return false;
  const claim = await query<{ id: number }>(
    `UPDATE business_v2.incidents
        SET status = 'triaging', applied_action = $4::jsonb,
            proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
      WHERE id = $1 AND status = 'diagnosed' AND proposal_ts = $2
        AND proposed_fix->>'approval_nonce' = $3
      RETURNING id`,
    [
      inc.id,
      inc.proposal_ts,
      nonce,
      JSON.stringify({
        kind: 'implement_claimed',
        approved_by: verdict.user,
        approval_nonce: nonce,
        at: new Date().toISOString(),
      }),
    ],
  );
  if (claim.rows.length === 0) return false;
  const branch = branchName(inc.id);
  fs.writeFileSync(logPath(inc.id), `dispatched ${new Date().toISOString()}\n`);
  spawnPipeline(inc, branch, token);
  await recordAction(inc.id, {
    kind: 'implement_dispatched',
    branch,
    approved_by: verdict.user,
    approval_nonce: nonce,
    at: new Date().toISOString(),
  });
  await query(
    `UPDATE business_v2.incidents
        SET status = 'remediating', updated_at = now()
      WHERE id = $1 AND status = 'triaging'
        AND applied_action->>'approval_nonce' = $2`,
    [inc.id, nonce],
  );
  await postIncidentThread(
    inc,
    `:wrench: Implementing *${inc.source}* (#${inc.id}) on \`${branch}\` via the dev-pipeline — draft PR to follow.`,
  );
  return true;
}

/** Detached pipelines stamp DONE_MARKER on exit; report PR/outcome once seen. */
async function pollResults(): Promise<number> {
  const r = await query<{
    id: number;
    source: string;
    thread_ts: string | null;
    thread_channel: string | null;
  }>(
    `SELECT id, source, thread_ts, thread_channel FROM business_v2.incidents
      WHERE status = 'remediating' AND applied_action->>'kind' = 'implement_dispatched'`,
  );
  let reported = 0;
  for (const row of r.rows) {
    let out = '';
    try {
      out = fs.readFileSync(logPath(row.id), 'utf-8');
    } catch {
      continue;
    }
    if (!out.includes(DONE_MARKER)) continue; // still running
    const ok = /HEALER_IMPLEMENT_DONE:0\b/.test(out);
    const pr = extractPrUrl(out);
    if (ok && pr) {
      await query(
        `UPDATE business_v2.incidents
            SET status = 'needs_human', outcome = 'escalated',
                proposed_fix = proposed_fix - 'action_epoch'
                  - 'approval_nonce' - 'approval_created_at',
                proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
          WHERE id = $1 AND status = 'remediating'
            AND applied_action->>'kind' = 'implement_dispatched'`,
        [row.id],
      );
      await postIncidentThread(
        row,
        `:white_check_mark: Draft PR ready for human review for *${row.source}* (#${row.id}): ${pr}`,
      );
    } else {
      await query(
        `UPDATE business_v2.incidents
            SET status = 'recurring', outcome = 'still_failing',
                proposed_fix = proposed_fix - 'action_epoch'
                  - 'approval_nonce' - 'approval_created_at',
                proposal_channel = NULL, proposal_ts = NULL, updated_at = now()
          WHERE id = $1`,
        [row.id],
      );
      await postIncidentThread(
        row,
        `:warning: Implement run for *${row.source}* (#${row.id}) finished without a green PR — needs a look.`,
      );
    }
    reported++;
  }
  return reported;
}

/** Fast-loop step: dispatch 🔧-requested implements, then report finished ones. */
export async function runImplement(): Promise<number> {
  if (!healerImplementationEnabled()) return 0;
  const eligible = await loadImplementable();
  let dispatched = 0;
  for (const inc of eligible) {
    const ref = inc as OpenIncident & {
      proposal_channel: string;
      proposal_ts: string;
    };
    const verdict = await operatorRequestedImplement(
      ref.proposal_channel,
      ref.proposal_ts,
    );
    if (verdict && (await dispatch(ref, verdict))) {
      dispatched++;
    }
  }
  const reported = await pollResults();
  if (dispatched || reported)
    logger.info({ dispatched, reported }, 'healer: implement complete');
  return dispatched;
}
