/**
 * Phase 4 trust model (docs/SELF-HEALING-ORCHESTRATED-DIAGNOSIS.md §5).
 *
 * Every diagnosis carries a TRUST verdict — confidence, whether it found the
 * root cause or a mere symptom, and the concrete evidence it rests on — and the
 * 👍 is GATED on it. `isTrustworthy` is the single gate consulted by the
 * proposal renderer, the command-approval path (isActionable), and the
 * code_bug auto-implement loader. Type-only imports back to remediation keep
 * the runtime dependency graph acyclic (remediation → trust, never the reverse).
 */

import type { ProposedFix, RemediationClass } from './remediation.js';

/** How much to believe a diagnosis. `low` (or missing) is never 👍-actionable. */
export type Confidence = 'high' | 'medium' | 'low';

/** Did the diagnosis reach the root cause, or stop at a symptom? */
export type CauseKind = 'root_cause' | 'symptom' | 'unknown';

/** The adversarial refuter's verdict (Phase 4c), persisted in the review column. */
export interface Refutation {
  refuted: boolean;
  reason: string;
  better_cause?: string;
}

/**
 * A full diagnosis verdict — what parseDiagnosis (one-shot) and parseInvestigation
 * (agentic) both produce, and what saveDiagnosis persists. Trust fields are
 * optional: an un-investigated one-shot defaults to low/unknown (untrustworthy).
 */
export interface DiagnosisResult {
  root_cause: string;
  klass: RemediationClass;
  fix: ProposedFix;
  confidence?: Confidence;
  cause_or_symptom?: CauseKind;
  evidence?: string[];
}

/** Audit metadata saved alongside a diagnosis (refuter review + transcript path). */
export interface DiagnosisMeta {
  review?: Refutation;
  investigation_log?: string;
}

/** Evidence gate used while adversarial review is still in progress. */
export function hasEvidenceTrust(inc: {
  confidence?: Confidence | null;
  cause_or_symptom?: CauseKind | null;
}): boolean {
  return (
    (inc.confidence === 'high' || inc.confidence === 'medium') &&
    inc.cause_or_symptom === 'root_cause'
  );
}

/** A failed or unparsable refuter is not a passed adversarial review. */
export function hasPassedReview(inc: { review?: Refutation | null }): boolean {
  const review = inc.review;
  return (
    review?.refuted === false &&
    review.reason !== 'refuter unavailable' &&
    review.reason !== 'unparseable refutation'
  );
}

/**
 * Final trust gate: evidence confidence/root-cause AND a completed,
 * non-refuting adversarial review are both required. Missing review state is
 * manual-only.
 */
export function isTrustworthy(inc: {
  confidence?: Confidence | null;
  cause_or_symptom?: CauseKind | null;
  review?: Refutation | null;
}): boolean {
  return hasEvidenceTrust(inc) && hasPassedReview(inc);
}
