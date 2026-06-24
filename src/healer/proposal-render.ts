/**
 * Slack rendering for a diagnosis proposal (Phase 4a, design §5).
 *
 * Split from remediation.ts so incident persistence and Slack presentation stay
 * separate responsibilities. The renderer's whole job is the TRUST gate's
 * surface: a trustworthy diagnosis shows the 👍 path; an untrustworthy one posts
 * as ":warning: needs a human look" with evidence + dissent and NO apply CTA —
 * the operator judges the claim, never a diff we can't vouch for.
 */

import type { OpenIncident } from './remediation.js';
import { isTrustworthy } from './trust.js';

/** Confidence + basis line, always shown so the operator can judge the claim. */
function trustLine(inc: OpenIncident): string {
  return `*Confidence:* ${inc.confidence ?? 'low'}  ·  *Basis:* ${inc.cause_or_symptom ?? 'unknown'}`;
}

/** Evidence bullets the conclusion rests on (capped). '' when none recorded. */
function evidenceBlock(evidence: string[] | null): string {
  if (!evidence?.length) return '';
  return (
    '*Evidence:*\n' +
    evidence
      .slice(0, 8)
      .map((e) => `• ${e}`)
      .join('\n')
  );
}

/** Untrustworthy → "needs a human look": evidence + dissent, NO apply/implement CTA. */
function needsHumanText(inc: OpenIncident): string {
  const fix = inc.proposed_fix;
  const head = `:warning: *Needs a human look — ${inc.source}* (×${inc.occurrences}, ${inc.severity})`;
  const cause = `*Root cause:* ${inc.diagnosis ?? '(none)'}`;
  const klass = `*Class:* \`${inc.remediation_class}\``;
  const sug = `*Possible fix (manual):* ${fix?.summary ?? '(none)'}`;
  const why =
    '_Low-confidence or symptom-level — no auto-apply offered; investigate before acting._';
  return [
    head,
    cause,
    klass,
    trustLine(inc),
    evidenceBlock(inc.evidence),
    sug,
    why,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Trustworthy → the 👍 path: apply for command/rerun, auto-implement for code_bug. */
function trustedText(inc: OpenIncident, actionable: boolean): string {
  const fix = inc.proposed_fix;
  const head = `:mag: *Diagnosis — ${inc.source}* (×${inc.occurrences}, ${inc.severity})`;
  const cause = `*Root cause:* ${inc.diagnosis ?? '(none)'}`;
  const klass = `*Class:* \`${inc.remediation_class}\``;
  const cta =
    inc.remediation_class === 'code_bug'
      ? ':+1: to auto-implement (dev-pipeline → draft PR you review)  ·  :x: to dismiss'
      : ':+1:/:white_check_mark: react or reply to apply  ·  :x: to dismiss';
  const body = actionable
    ? `*Proposed fix:* ${fix?.summary}\n\`\`\`${fix?.command ?? ''}\`\`\`\n${cta}`
    : `*Suggested fix (:+1: to auto-implement):* ${fix?.summary ?? '(none)'}` +
      (fix?.command ? `\n\`\`\`${fix.command}\`\`\`` : '') +
      (fix?.diff ? `\n\`\`\`${fix.diff.slice(0, 2500)}\`\`\`` : '') +
      `\n${cta}`;
  return [head, cause, klass, trustLine(inc), evidenceBlock(inc.evidence), body]
    .filter(Boolean)
    .join('\n');
}

/** The proposal message text, trust-gated. */
export function proposalText(inc: OpenIncident, actionable: boolean): string {
  return isTrustworthy(inc)
    ? trustedText(inc, actionable)
    : needsHumanText(inc);
}
