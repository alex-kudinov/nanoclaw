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
 * the run uses bypassPermissions; without a TTY a stray prompt would hang, so
 * each run is time-boxed and its outcome polled from a completion marker.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import { activeOAuthToken } from './agentic.js';
import { getReactions, getReplies } from './slack.js';
import { emojiVerdict, replyVerdict } from './approval.js';
import { query } from '../business-db.js';
import {
  postIncidentThread,
  recordAction,
  setStatus,
  type OpenIncident,
} from './remediation.js';

const BRANCH_PREFIX = 'healer/fix-';
const DONE_MARKER = 'HEALER_IMPLEMENT_DONE:';

function enabled(): boolean {
  return process.env.HEALER_IMPLEMENT_ENABLED === '1';
}

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
            cause_or_symptom, evidence, thread_ts, thread_channel,
            last_seen::text AS last_seen, proposal_channel, proposal_ts
       FROM business_v2.incidents
      WHERE status = 'diagnosed' AND remediation_class = 'code_bug'
        AND proposal_channel IS NOT NULL AND proposal_ts IS NOT NULL
        AND confidence IS DISTINCT FROM 'low' AND cause_or_symptom = 'root_cause'`,
  );
  return r.rows;
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
): Promise<boolean> {
  const [reactions, replies] = await Promise.all([
    getReactions(channel, ts),
    getReplies(channel, ts),
  ]);
  return (
    emojiVerdict(reactions) === 'approve' || replyVerdict(replies) === 'approve'
  );
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
async function dispatch(inc: OpenIncident): Promise<boolean> {
  const token = activeOAuthToken();
  if (!token) {
    await postIncidentThread(
      inc,
      `:warning: Can't auto-implement *${inc.source}* (#${inc.id}) — no active Claude token. Left as a manual fix.`,
    );
    return false; // don't spawn a guaranteed-401 run; leave status 'diagnosed'
  }
  const branch = branchName(inc.id);
  fs.writeFileSync(logPath(inc.id), `dispatched ${new Date().toISOString()}\n`);
  spawnPipeline(inc, branch, token);
  await recordAction(inc.id, {
    kind: 'implement_dispatched',
    branch,
    at: new Date().toISOString(),
  });
  await setStatus(inc.id, 'remediating');
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
      await setStatus(row.id, 'awaiting_approval');
      await postIncidentThread(
        row,
        `:white_check_mark: Draft PR ready for *${row.source}* (#${row.id}): ${pr}`,
      );
    } else {
      await setStatus(row.id, 'recurring', 'still_failing');
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
  if (!enabled() || process.env.HEALER_QUIET === '1') return 0;
  const eligible = await loadImplementable();
  let dispatched = 0;
  for (const inc of eligible) {
    const ref = inc as OpenIncident & {
      proposal_channel: string;
      proposal_ts: string;
    };
    if (
      (await operatorRequestedImplement(
        ref.proposal_channel,
        ref.proposal_ts,
      )) &&
      (await dispatch(inc))
    ) {
      dispatched++;
    }
  }
  const reported = await pollResults();
  if (dispatched || reported)
    logger.info({ dispatched, reported }, 'healer: implement complete');
  return dispatched;
}
