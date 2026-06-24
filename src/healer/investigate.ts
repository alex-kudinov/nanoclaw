/**
 * Phase 4b/4c — the read-only agentic INVESTIGATOR + adversarial REFUTER
 * (docs/SELF-HEALING-ORCHESTRATED-DIAGNOSIS.md §3, §4, §8).
 *
 * The one-shot triage brain reasons over a static log snapshot and guesses. The
 * investigator instead OPENS the implicated files, greps the error, and checks
 * git before concluding — the way every real diagnosis this session was done —
 * and returns an evidence-grounded DiagnosisResult. The refuter then independently
 * tries to DISPROVE that verdict (cause or symptom? what's missing?).
 *
 * SAFETY (design §8): both are READ-ONLY. Write/Edit are never in the toolset, so
 * the agent cannot mutate the repo. Bash is OFF by default — claude's allowedTools
 * is tool-level, not command-level, so enabling "Bash" under bypassPermissions
 * grants ALL of bash, too sharp for the production host without a curated
 * allowlist (which claude -p does not offer). Opt in with HEALER_INVESTIGATE_BASH=1
 * for richer evidence (git blame, dry-runs); the prompt forbids mutation regardless.
 * Read/Grep/Glob alone already satisfy the acceptance test (read backfill-names.cjs).
 */

import { logger } from '../logger.js';
import { redact } from './incident-store.js';
import { runAgenticClaude } from './agentic.js';
import { parseDiagnosis, recentCommits } from './diagnose.js';
import type { OpenIncident } from './remediation.js';
import type { DiagnosisResult, Refutation } from './trust.js';

// A thorough investigation (open several files, grep, check git) genuinely runs
// minutes — a 180s cap killed it mid-read in the field, forcing a triage fallback
// so Phase 4 never engaged. 300s gives it room; tune via HEALER_INVESTIGATE_TIMEOUT_MS.
const INVESTIGATE_TIMEOUT_MS = Number(
  process.env.HEALER_INVESTIGATE_TIMEOUT_MS || 300_000,
);

/** Read-only by default; Bash opt-in via HEALER_INVESTIGATE_BASH=1 (design §8). */
function investigateTools(): string {
  return process.env.HEALER_INVESTIGATE_BASH === '1'
    ? 'Read Grep Glob Bash'
    : 'Read Grep Glob';
}

const READ_ONLY_RULE =
  'READ-ONLY: you may ONLY read. Never use Write or Edit. Never run any command ' +
  'that mutates the repo, filesystem, git, or any remote (no edits, commits, ' +
  'push, rm, mv, install, migrations, or network writes) — reasoning only.';

const JSON_SCHEMA =
  'Output ONLY a JSON object (no prose, no markdown fence): ' +
  '{"root_cause":"the specific defect","remediation_class":' +
  '"transient|config|code_bug|external_outage|data","fix":{"kind":' +
  '"rerun|command|diff|none","summary":"smallest correct fix","command":' +
  '"optional safe idempotent shell","diff":"optional unified diff"},' +
  '"confidence":"high|medium|low","cause_or_symptom":' +
  '"root_cause|symptom|unknown","evidence":["file:line — finding","..."]}. ' +
  'Claim high confidence ONLY with concrete file:line proof; evidence MUST be ' +
  'non-empty for a root_cause verdict.';

/** The SRE investigation prompt — investigate first, then conclude with evidence. */
export function buildInvestigatePrompt(
  inc: OpenIncident,
  commits: string,
): string {
  const ctx = redact(JSON.stringify(inc.raw_context, null, 2).slice(0, 4000));
  return (
    `You are the on-call SRE for NanoClaw (Node.js/TypeScript daemon running ` +
    `Claude agents in Apple containers). The repo root is your CURRENT WORKING ` +
    `DIRECTORY.\n\nINCIDENT #${inc.id} — source: ${inc.source}, severity: ` +
    `${inc.severity}, occurrences: ${inc.occurrences}.\n\nRecent commits:\n` +
    `${commits}\n\nIncident context (redacted):\n${ctx}\n\n` +
    `INVESTIGATE before you conclude — do NOT guess from the snapshot. Read the ` +
    `implicated source files end-to-end, grep the codebase for the error string ` +
    `and the symbols involved, and check recent commits for what changed. ` +
    `Distinguish ROOT CAUSE from SYMPTOM: a swallowed error, a log line, or a ` +
    `downstream failure is a symptom — keep digging until you find the actual ` +
    `defect (the wrong line of code or config) and can cite it.\n\n` +
    `${READ_ONLY_RULE}\n\n${JSON_SCHEMA}`
  );
}

/** Same validation as parseDiagnosis (incl. trust fields) — shared validator. */
export function parseInvestigation(text: string): DiagnosisResult | null {
  return parseDiagnosis(text);
}

/**
 * Run the agentic investigator. Returns an evidence-grounded verdict, or null on
 * no-token / timeout / non-zero exit / unparseable output — the orchestrator then
 * falls back to cheap triage.
 */
export async function investigate(
  inc: OpenIncident,
): Promise<DiagnosisResult | null> {
  const commits = await recentCommits();
  const res = await runAgenticClaude(buildInvestigatePrompt(inc, commits), {
    allowedTools: investigateTools(),
    timeoutMs: INVESTIGATE_TIMEOUT_MS,
  });
  if (!res.ok) {
    logger.warn({ id: inc.id }, 'healer: investigate run failed');
    return null;
  }
  const dx = parseInvestigation(res.stdout);
  if (!dx) logger.warn({ id: inc.id }, 'healer: investigation unparseable');
  return dx;
}

/** The adversarial second look — investigate independently, try to DISPROVE. */
export function buildRefutePrompt(inc: OpenIncident, dx: DiagnosisResult): string {
  return (
    `You are a SKEPTICAL senior SRE doing an INDEPENDENT second look at NanoClaw ` +
    `incident #${inc.id} (source: ${inc.source}). The repo root is your CURRENT ` +
    `WORKING DIRECTORY. Another engineer concluded:\n` +
    `ROOT CAUSE: ${dx.root_cause}\nCLASS: ${dx.klass}\nEVIDENCE:\n` +
    `${(dx.evidence ?? []).map((e) => `- ${e}`).join('\n') || '- (none given)'}\n\n` +
    `Your job is to DISPROVE this. Investigate INDEPENDENTLY — read the files ` +
    `yourself, grep, check git; do NOT take their word. Ask: is this the actual ` +
    `ROOT CAUSE or merely a SYMPTOM? Is the cited evidence real and sufficient? ` +
    `Is there a simpler or different cause they missed? What is absent?\n\n` +
    `${READ_ONLY_RULE}\n\nOutput ONLY a JSON object (no prose): ` +
    `{"refuted": true|false, "reason": "why it does or does not hold up", ` +
    `"better_cause": "the real root cause if you found a better one — omit if none"}. ` +
    `Set refuted=true ONLY with concrete evidence the conclusion is wrong, ` +
    `incomplete, or a symptom; if it holds up, refuted=false.`
  );
}

/**
 * Extract the refuter verdict. Defaults to NOT refuted (verdict stands) on
 * unparseable output — a broken adversary must not silently downgrade an
 * evidenced diagnosis; the operator still gates the 👍.
 */
export function parseRefutation(text: string): Refutation {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start)
    return { refuted: false, reason: 'unparseable refutation' };
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const better =
      typeof obj.better_cause === 'string' && obj.better_cause
        ? { better_cause: obj.better_cause }
        : {};
    return {
      refuted: obj.refuted === true,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      ...better,
    };
  } catch {
    return { refuted: false, reason: 'unparseable refutation' };
  }
}

/**
 * Run the adversarial refuter against a proposed verdict. On no-token / timeout /
 * non-zero exit the verdict stands unrefuted (the refuter shares investigate's
 * transport, so if investigate succeeded this rarely fails).
 */
export async function refute(
  inc: OpenIncident,
  dx: DiagnosisResult,
): Promise<Refutation> {
  const res = await runAgenticClaude(buildRefutePrompt(inc, dx), {
    allowedTools: investigateTools(),
    timeoutMs: INVESTIGATE_TIMEOUT_MS,
  });
  if (!res.ok) {
    logger.warn({ id: inc.id }, 'healer: refute run failed — verdict stands');
    return { refuted: false, reason: 'refuter unavailable' };
  }
  return parseRefutation(res.stdout);
}
