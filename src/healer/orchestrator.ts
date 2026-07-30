/**
 * Phase 4b — the deterministic diagnosis ORCHESTRATOR (design §3, §4).
 *
 * Plain TypeScript control flow — never an interactive LLM that could hang — that
 * drives each incident through the diagnosis lifecycle and deploys the agentic
 * investigator at the leaf. It must be MORE robust than the daemon it heals
 * (who-watches-the-watchman), so all loops/gates/fallbacks live here, not in a model.
 *
 * Escalation policy (design §4, "spend for quality"): severity != info → agentic
 * investigate(); on no-token / timeout / unparseable it falls back to the cheap
 * one-shot triage(). The verdict is persisted with its trust fields, then routed
 * by class. The 👍 gate (isTrustworthy) downstream means a low-evidence verdict
 * posts as "needs a human look". Phase 4c inserts the adversarial refuter +
 * synthesize() between investigate and persist.
 */

import { logger } from '../logger.js';
import {
  loadOpen,
  postIncidentThread,
  saveDiagnosis,
  setStatus,
  type OpenIncident,
} from './remediation.js';
import { route, triage } from './diagnose.js';
import { investigate, refute } from './investigate.js';
import {
  hasEvidenceTrust,
  type DiagnosisResult,
  type Refutation,
} from './trust.js';

// Synchronous base (design §7): each agentic run is awaited, so the cap is kept
// LOW — Task 10 adds the concurrency guard. 2 keeps a 5-min loop from overrunning.
const MAX_PER_RUN = Number(process.env.HEALER_DIAGNOSE_MAX_PER_RUN || 2);

/** Master kill switch for the whole diagnosis path (design §8). Default on. */
function enabled(): boolean {
  return (
    process.env.HEALER_DIAGNOSE_ENABLED !== '0' &&
    process.env.HEALER_QUIET !== '1'
  );
}

/** Low escalation bar: anything above info gets the agentic investigator. */
function escalates(inc: OpenIncident): boolean {
  return inc.severity !== 'info';
}

/** A diagnosis verdict plus the refuter review that produced it (if escalated). */
interface Synthesis {
  verdict: DiagnosisResult;
  review?: Refutation;
}

/** Append the refuter's dissent to the evidence and drop the verdict to untrusted. */
function downgrade(dx: DiagnosisResult, r: Refutation): DiagnosisResult {
  const dissent = [
    `REFUTED: ${r.reason}`,
    ...(r.better_cause ? [`BETTER_CAUSE: ${r.better_cause}`] : []),
  ];
  return {
    ...dx,
    confidence: 'low',
    cause_or_symptom: 'unknown',
    evidence: [...(dx.evidence ?? []), ...dissent],
  };
}

/**
 * Reconcile investigator vs refuter (design §4). A clean refutation preserves the
 * verdict. A sustained one breaks the tie with a THIRD independent investigation:
 * if that tie-breaker is itself a confident root-cause verdict, the finding holds
 * (2 of 3 confident) and we adopt the freshest confident verdict; otherwise the
 * tie-breaker agrees with the refuter (or can't confirm) → downgrade to untrusted
 * so it posts as "needs a human look". (v1 does not semantically diff free-text
 * causes — a confident tie-breaker is taken to corroborate the original thrust;
 * the refuter dissent is always stored in `review` for the audit trail.)
 */
export async function synthesize(
  inc: OpenIncident,
  dx: DiagnosisResult,
  refutation: Refutation,
): Promise<Synthesis> {
  if (!refutation.refuted) return { verdict: dx, review: refutation };
  const tieBreaker = await investigate(inc);
  if (tieBreaker && hasEvidenceTrust(tieBreaker)) {
    return {
      verdict: {
        ...tieBreaker,
        evidence: [
          ...(tieBreaker.evidence ?? []),
          `INITIAL_REFUTATION: ${refutation.reason}`,
        ],
      },
      review: {
        refuted: false,
        reason: 'independent tie-breaker confirmed an evidenced root cause',
      },
    };
  }
  return { verdict: downgrade(dx, refutation), review: refutation };
}

/**
 * Produce a verdict for one incident: escalated → agentic investigate, then ALWAYS
 * refute + synthesize; falling back to cheap triage on no-token/timeout/unparseable;
 * un-escalated → triage (no evidenced claim to attack, so no refuter).
 */
async function diagnose(inc: OpenIncident): Promise<Synthesis | null> {
  if (escalates(inc)) {
    await setStatus(inc.id, 'investigating');
    // Heads-up + thread ROOT: an agentic investigation runs minutes, so tell the
    // operator the healer picked it up — and root the incident's thread here so the
    // diagnosis/proposal/outcome all reply under it instead of a flat list.
    await postIncidentThread(
      inc,
      `:mag: Investigating *${inc.source}* (#${inc.id}, ${inc.severity}) — agentic diagnosis under way; verdict in a few minutes.`,
    );
    const dx = await investigate(inc);
    if (dx) {
      await setStatus(inc.id, 'adversarial_review');
      return synthesize(inc, dx, await refute(inc, dx));
    }
    logger.info(
      { id: inc.id },
      'healer: investigate unavailable → triage fallback',
    );
  }
  const t = await triage(inc);
  return t ? { verdict: t } : null;
}

/** Drive one incident: diagnose → persist (trust + refuter review) → route by class. */
export async function diagnoseIncident(inc: OpenIncident): Promise<boolean> {
  const result = await diagnose(inc);
  if (!result) {
    // Both brains failed after we may have moved it to 'investigating'. Revert to
    // 'new' so the next run re-picks it (loadOpen scans 'new') — never orphan an
    // incident in an intermediate state where nothing will ever look at it again.
    if (escalates(inc)) await setStatus(inc.id, 'new');
    return false;
  }
  await saveDiagnosis(
    inc.id,
    result.verdict,
    result.review ? { review: result.review } : {},
  );
  await route({ ...inc, review: result.review ?? null }, result.verdict);
  return true;
}

/** Fast-loop step: diagnose up to MAX_PER_RUN new incidents (cap honored). */
export async function runDiagnose(): Promise<number> {
  if (!enabled()) return 0;
  const incidents = await loadOpen('new', MAX_PER_RUN);
  let done = 0;
  for (const inc of incidents) if (await diagnoseIncident(inc)) done++;
  if (incidents.length)
    logger.info({ done, seen: incidents.length }, 'healer: diagnose complete');
  return done;
}
