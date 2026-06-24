/**
 * Shared remediation types + the propose/close helpers used across the
 * diagnose → propose → apply → verify loop (self-healing Phases 1-2, design §5).
 *
 * One place owns: the incident row shape the healer reasons over, the proposal
 * post (which records channel+ts so the fast loop can poll for a ✅), and the
 * status/outcome transitions — so diagnose.ts, remediate.ts and approval.ts
 * never hand-roll SQL for the same column twice.
 */

import { execFile } from 'child_process';

import { query } from '../business-db.js';
import { logger } from '../logger.js';
import { postIncidentsRef } from './slack.js';
import { proposalText } from './proposal-render.js';
import {
  isTrustworthy,
  type CauseKind,
  type Confidence,
  type DiagnosisMeta,
  type DiagnosisResult,
} from './trust.js';

/** Run a shell command from the repo root. Resolves (never throws) with a tail of output. */
export function runShell(cmd: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      'bash',
      ['-lc', cmd],
      { cwd: process.cwd(), timeout: 120_000 },
      (err, stdout, stderr) =>
        resolve({ ok: !err, out: (stdout || stderr || '').slice(-500) }),
    );
  });
}

export type RemediationClass =
  | 'transient'
  | 'config'
  | 'code_bug'
  | 'external_outage'
  | 'data';

export interface ProposedFix {
  kind: 'rerun' | 'command' | 'diff' | 'none';
  summary: string;
  command?: string;
  diff?: string;
}

export interface OpenIncident {
  id: number;
  source: string;
  severity: string;
  occurrences: number;
  status: string;
  raw_context: Record<string, unknown>;
  remediation_class: RemediationClass | null;
  diagnosis: string | null;
  proposed_fix: ProposedFix | null;
  confidence: Confidence | null;
  cause_or_symptom: CauseKind | null;
  evidence: string[] | null;
  last_seen: string;
}

const COLS = `id, source, severity, occurrences, status, raw_context,
  remediation_class, diagnosis, proposed_fix, confidence, cause_or_symptom,
  evidence, last_seen::text AS last_seen`;

/** Open incidents in a given status, worst-first, capped. */
export async function loadOpen(
  status: string,
  limit: number,
): Promise<OpenIncident[]> {
  const r = await query<OpenIncident>(
    `SELECT ${COLS} FROM business_v2.incidents
      WHERE status = $1
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1
                 WHEN 'warn' THEN 2 ELSE 3 END, occurrences DESC
      LIMIT $2`,
    [status, limit],
  );
  return r.rows;
}

/**
 * Persist a diagnosis verdict + its trust fields; status → 'diagnosed'. Trust
 * defaults to low/unknown so any caller that omits them lands UNtrustworthy
 * (un-investigated = untrusted by construction). The refuter review and the
 * investigation transcript path are COALESCEd so a re-save never wipes them.
 */
export async function saveDiagnosis(
  id: number,
  dx: DiagnosisResult,
  meta: DiagnosisMeta = {},
): Promise<void> {
  await query(
    `UPDATE business_v2.incidents
        SET diagnosis = $2, remediation_class = $3, proposed_fix = $4::jsonb,
            confidence = $5, cause_or_symptom = $6, evidence = $7::jsonb,
            review = COALESCE($8::jsonb, review),
            investigation_log = COALESCE($9, investigation_log),
            status = 'diagnosed', updated_at = now()
      WHERE id = $1`,
    [
      id,
      dx.root_cause,
      dx.klass,
      JSON.stringify(dx.fix),
      dx.confidence ?? 'low',
      dx.cause_or_symptom ?? 'unknown',
      JSON.stringify(dx.evidence ?? []),
      meta.review ? JSON.stringify(meta.review) : null,
      meta.investigation_log ?? null,
    ],
  );
}

/** Move an incident to a terminal/holding status with an outcome note. */
export async function setStatus(
  id: number,
  status: string,
  outcome?: string,
): Promise<void> {
  await query(
    `UPDATE business_v2.incidents
        SET status = $2, outcome = COALESCE($3, outcome), updated_at = now()
      WHERE id = $1`,
    [id, status, outcome ?? null],
  );
}

/** Record what the healer actually ran (audit trail). */
export async function recordAction(
  id: number,
  action: Record<string, unknown>,
): Promise<void> {
  await query(
    `UPDATE business_v2.incidents
        SET applied_action = $2::jsonb, updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(action)],
  );
}

/**
 * A fix the healer may execute via a raw shell on ✅. Restricted to
 * command/rerun fixes that are NOT code_bug: a code change needs the full
 * build/test/deploy cycle (Phase 3), so shell-running it (e.g. a proposed
 * `git revert … && git push`) would be both wrong and dangerous — those stay
 * manual suggestions no matter what kind the model returned.
 */
export function isActionable(inc: OpenIncident): boolean {
  const kind = inc.proposed_fix?.kind;
  if (kind !== 'command' && kind !== 'rerun') return false;
  if (inc.remediation_class === 'code_bug') return false;
  return isTrustworthy(inc); // untrustworthy → never auto-applied on ✅
}

/**
 * The post-proposal status (design §6). An actionable command/rerun arms the
 * approval poll (awaiting_approval). A trustworthy-but-manual fix (code_bug, diff)
 * stays 'diagnosed' so the 👍-implement path stays open. An UNtrustworthy verdict
 * lands 'needs_human' — excluded from auto-apply and the 👍, shown in the digest.
 */
function proposalStatus(inc: OpenIncident, actionable: boolean): string {
  if (actionable) return 'awaiting_approval';
  return isTrustworthy(inc) ? 'diagnosed' : 'needs_human';
}

/**
 * Post the diagnosis + proposed fix to #gru-incidents and set the post-proposal
 * status. Actionable fixes arm the approval poll; manual-but-trustworthy fixes
 * stay 'diagnosed'; untrustworthy ones go 'needs_human' (no false "✅ to apply").
 */
export async function proposeFix(inc: OpenIncident): Promise<boolean> {
  const actionable = isActionable(inc);
  const ref = await postIncidentsRef(proposalText(inc, actionable));
  if (!ref) {
    logger.warn({ id: inc.id }, 'healer: proposal post failed');
    return false;
  }
  await query(
    `UPDATE business_v2.incidents
        SET proposal_channel = $2, proposal_ts = $3,
            status = $4, updated_at = now()
      WHERE id = $1`,
    [inc.id, ref.channel, ref.ts, proposalStatus(inc, actionable)],
  );
  return true;
}
