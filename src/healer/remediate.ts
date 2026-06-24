/**
 * Phase 2 — auto-rerun idempotent transient failures + verify-fixed loop
 * (design §5, §6). This is the only path that ACTS on the machine without a
 * human, so it is fenced three ways: (1) a kill switch HEALER_AUTO_REMEDIATE
 * (default off — ship dark, arm after watching proposals), (2) an idempotency
 * allowlist (only sources proven safe to rerun, default empty → propose
 * instead), (3) a per-incident circuit breaker (≤MAX_AUTO reruns, then escalate).
 * Anything not provably safe is proposed for a human ✅, never auto-run.
 */

import { logger } from '../logger.js';
import {
  loadOpen,
  proposeFix,
  recordAction,
  runShell,
  setStatus,
  type OpenIncident,
} from './remediation.js';
import { query } from '../business-db.js';

const MAX_AUTO = 2; // per-incident circuit breaker
const VERIFY_QUIET_MS = 6 * 60_000; // recurrence-free window before "fixed"

function autoEnabled(): boolean {
  return process.env.HEALER_AUTO_REMEDIATE === '1';
}

/** source → idempotent rerun command. Default empty; populate only verified entries. */
export function allowlist(): Record<string, string> {
  try {
    return JSON.parse(process.env.HEALER_RERUN_ALLOWLIST || '{}');
  } catch {
    return {};
  }
}

async function attempts(id: number): Promise<number> {
  const r = await query<{ restart_attempts: number }>(
    `SELECT restart_attempts FROM business_v2.incidents WHERE id = $1`,
    [id],
  );
  return r.rows[0]?.restart_attempts ?? 0;
}

/** Execute an incident's proposed rerun command; record + flip to remediating. */
async function autoRun(inc: OpenIncident, cmd: string): Promise<void> {
  const res = await runShell(cmd);
  await query(
    `UPDATE business_v2.incidents
        SET restart_attempts = restart_attempts + 1, updated_at = now()
      WHERE id = $1`,
    [inc.id],
  );
  await recordAction(inc.id, {
    kind: 'auto_rerun',
    command: cmd,
    ok: res.ok,
    out: res.out,
    at: new Date().toISOString(),
  });
  await setStatus(inc.id, 'remediating');
  logger.info(
    { id: inc.id, source: inc.source, ok: res.ok },
    'healer: auto-rerun',
  );
}

/** Diagnosed transient incidents: auto-rerun if proven-safe, else propose. */
async function remediateTransient(): Promise<number> {
  const list = allowlist();
  const incidents = (await loadOpen('diagnosed', 20)).filter(
    (i) => i.remediation_class === 'transient',
  );
  let acted = 0;
  for (const inc of incidents) {
    const cmd = list[inc.source] || inc.proposed_fix?.command;
    const safe =
      autoEnabled() && list[inc.source] && (await attempts(inc.id)) < MAX_AUTO;
    if (safe && cmd) {
      await autoRun(inc, cmd);
      acted++;
    } else {
      await proposeFix(inc); // not on allowlist / cap hit / disabled → human ✅
    }
  }
  return acted;
}

/**
 * Verify-fixed loop: an incident in 'remediating' is resolved once it stops
 * recurring for VERIFY_QUIET_MS; if it re-fires it escalates (retry under the
 * breaker, else propose to a human). Drives both auto-reruns and approved fixes.
 */
async function verifyRemediating(): Promise<number> {
  const incidents = await loadOpen('remediating', 50);
  let closed = 0;
  for (const inc of incidents) {
    const r = await query<{ acted_at: string | null }>(
      `SELECT (applied_action->>'at') AS acted_at FROM business_v2.incidents WHERE id = $1`,
      [inc.id],
    );
    const actedAt = r.rows[0]?.acted_at ? Date.parse(r.rows[0].acted_at) : 0;
    const recurred = Date.parse(inc.last_seen) > actedAt;
    if (!recurred && Date.now() - actedAt > VERIFY_QUIET_MS) {
      await setStatus(inc.id, 'resolved', 'verified_fixed');
      closed++;
    } else if (recurred) {
      if ((await attempts(inc.id)) >= MAX_AUTO) {
        await setStatus(inc.id, 'recurring', 'still_failing');
        await proposeFix(inc);
      } else {
        await setStatus(inc.id, 'diagnosed'); // breaker lets one more auto-rerun
      }
    }
  }
  return closed;
}

/** Fast-loop step: act on transient diagnoses, then verify prior remediations. */
export async function runRemediate(): Promise<{
  acted: number;
  closed: number;
}> {
  if (process.env.HEALER_QUIET === '1') return { acted: 0, closed: 0 };
  const acted = await remediateTransient();
  const closed = await verifyRemediating();
  if (acted || closed)
    logger.info({ acted, closed }, 'healer: remediate complete');
  return { acted, closed };
}
