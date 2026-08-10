/**
 * Host-side contract for grader output offered to an operator for Heartbeat.
 *
 * This module deliberately does not claim to prove human authorship. It catches
 * deterministic release failures before student-facing copy reaches Slack. The
 * caller must still run evidence-grounding and blind human review at the corpus
 * stages described in docs/GRADER-RECALIBRATION-IMPLEMENTATION-PLAN.md.
 *
 * The gate never rewrites feedback. A violation blocks the original bytes and
 * produces only rule codes for the operator, so rejected text is not put back in
 * copy range by the error path.
 */

import { scanAiTells } from './ai-tells.js';
import { hasWrongStudentSalutation } from './grader-salutation.js';

export const GRADER_OPERATOR_PREFIX =
  'OPERATOR ONLY - DO NOT COPY TO HEARTBEAT';
export const GRADER_STUDENT_MAX_CHARS = 1500;
/**
 * Hard ceiling for one student staging unit, chosen below Slack's 4000-character
 * message limit so a passing copy always fits in a single post.
 *
 * The expanded-feedback ceiling is clamped to this and cannot be raised past it
 * by any caller. Slack splits an over-length post into chunks and persists each
 * chunk separately, so a split copy unit both fractures what the operator pastes
 * into Heartbeat and hides the verdict line from delivery-state derivation.
 * Blocking is the safe direction; splitting is not.
 */
export const GRADER_STUDENT_ABSOLUTE_MAX_CHARS = 3500;

export type GraderOutputKind = 'student' | 'operator';

export type GraderOutputViolationCode =
  | 'duplicate-student-message'
  | 'invalid-verdict-line'
  | 'paste-unit-formatting'
  | 'operator-marker-in-student-copy'
  | 'operator-vocabulary'
  | 'internal-criterion-id'
  | 'markdown-formatting'
  | 'em-dash'
  | 'unfilled-placeholder'
  | 'ai-style-phrase'
  | 'stock-praise-phrase'
  | 'formulaic-feedback-phrase'
  | 'requirement-compliance-phrase'
  | 'salutation-name-mismatch'
  | 'student-copy-too-long';

export interface GraderOutputContext {
  /**
   * True only after one student copy passed the gate and Slack confirmed it.
   * Block notices, operator messages, and failed sends must not set this flag.
   */
  studentCopyAlreadyDelivered?: boolean;
  /** Host-owned override for the separately authorized expanded-feedback mode. */
  studentCopyMaxChars?: number;
  /**
   * Student name exactly as the host parsed it from the submission root header.
   * Supplied only when a run context proves which submission this is; the
   * salutation rule is skipped without it rather than guessed at.
   */
  expectedStudentName?: string;
}

export interface GraderOutputCheck {
  ok: boolean;
  kind: GraderOutputKind;
  violations: GraderOutputViolationCode[];
}

const OPERATOR_VOCABULARY_RES = [
  /\b(?:AI|artificial intelligence|large language model|language model)\b/i,
  /\b(?:automated|automation|generated feedback|system process)\b/i,
  /\b(?:grading prompt|grader prompt|rubric parsing|grading confidence)\b/i,
  /\b(?:heartbeat|quiz|certificate|certifier|rubric|calibration)\b/i,
  /\b(?:record\.json|ledger(?:\.csv)?|compendium|grading pack)\b/i,
  /\b(?:the record shows|recorded in heartbeat)\b/i,
  /\b(?:verdict|remediation|fail[ _]criteria)\b/i,
  /\b(?:course|written)[ -]?complete\b/i,
  /\bmodules? passed\b/i,
  /\b(?:persistence status|extraction confidence|source limit)\b/i,
  /\bresubmit(?:tal)?\s*(?:number|no\.?|#)\s*\d+\b/i,
];

const INTERNAL_CRITERION_ID_RES = [
  /\bcriterion\s+(?:id\s*)?[:#-]?\s*[a-z0-9]+(?:[_-][a-z0-9]+)+\b/i,
  /\bfail_criteria\b/i,
  /\blatest_verdict\b/i,
];

const MARKDOWN_RES = [
  /^\s{0,3}(?:[-*+] |\d+[.)] |#{1,6}\s)/m,
  /```/,
  /\[[^\]\n]+\]\([^\s)]+\)/,
  /(?:^|\s)\*\*[^*\n]+\*\*/,
];

const PLACEHOLDER_RES = [
  /\[insert[^\]]*\]/i,
  /\{\{\s*\w+\s*\}\}/,
  /\[(?:name|student|link|date|criterion|feedback)\]/i,
  /\bTBD\b/,
  /\blorem ipsum\b/i,
];

const SYNTHETIC_PRAISE_RES = [
  /\b(?:great job|excellent work|well done)\b/i,
  /\b(?:strong|thoughtful|excellent|impressive) submission\b/i,
  /\b(?:glow|grow)\s*:/i,
];

/**
 * Cohort-visible grading templates found in the 2026-08 recalibration corpus.
 * A phrase can sound harmless in one message while becoming an authorship tell
 * when most of a class receives the same bridge. Block these known templates at
 * the release boundary; the operator can re-run with evidence stated directly.
 */
const FORMULAIC_FEEDBACK_RES = [
  /\bone thing (?:to|worth)\b/i,
  /\bgoing forward\b/i,
  /\bworth (?:adding|noting|sharpening|watching)\b/i,
  /\b(?:stands out|is a standout|the strongest part)\b/i,
];

const REQUIREMENT_PRAISE_RES = [
  /\b(?:meets|met|satisfies|satisfied|addresses|addressed)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:assignment\s+)?requirements\b/i,
  /\b(?:covered|included|completed)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?required\s+(?:elements|sections|items)\b/i,
];

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Normalize for detection only. The original bytes are never rewritten. */
function normalizeForChecks(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/^(?:[ \t]*\n)+/, '');
}

/**
 * Layout is checked on the offered bytes, with only transport line endings
 * folded. Content normalization must not make a malformed paste unit look
 * well-formed: the operator needs exactly one blank line between the verdict
 * marker and the student-facing body so the body can be selected on its own.
 */
function hasValidPasteUnitLayout(text: string): boolean {
  const lineFolded = text.replace(/\r\n?/g, '\n');
  return /^(?:PASS|NO PASS)\n\n\S/.test(lineFolded);
}

/**
 * True when a message is structurally a student staging unit: its normalized
 * first line is exactly the verdict line.
 *
 * The host derives "a student copy was already delivered in this thread" from
 * this predicate over stored rows, deliberately NOT by re-running
 * `checkGraderOutput`. Delivery is a historical fact. Every voice rule in this
 * module is mutable \u2014 P0.2 tightens them by design, and `GRADER_AI_TELLS_EXTRA`
 * is read from the environment on every call \u2014 so replaying current policy over
 * old bytes would let one rule or env edit reclassify a delivered copy as
 * undelivered and permit a second student post into the same thread.
 *
 * Sufficient without a schema change because the gate is the only path that can
 * produce such a row: every other grader producer either fails
 * `invalid-verdict-line` (acks, help, status, holds), carries the operator
 * marker (block notices, operator messages), or is destination-scoped out
 * (the certifier handoff).
 */
export function isGraderStudentVerdictUnit(text: string): boolean {
  const firstLine = normalizeForChecks(text).split('\n', 1)[0];
  return firstLine === 'PASS' || firstLine === 'NO PASS';
}

/**
 * Classify and validate one grader-authored Slack message.
 *
 * Operator messages are identified only by the exact first-line marker. Every
 * other message is treated as student-facing and must pass all deterministic
 * checks. Prior delivery state is explicit input so integration can derive it
 * from host-owned message state rather than model claims.
 */
export function checkGraderOutput(
  text: string,
  context: GraderOutputContext = {},
): GraderOutputCheck {
  const normalized = normalizeForChecks(text);
  const firstLine = normalized.split('\n', 1)[0];
  const isOperator = firstLine === GRADER_OPERATOR_PREFIX;
  const violations: GraderOutputViolationCode[] = [];

  if (isOperator) {
    return { ok: true, kind: 'operator', violations: [] };
  }

  if (context.studentCopyAlreadyDelivered) {
    violations.push('duplicate-student-message');
  }

  if (firstLine !== 'PASS' && firstLine !== 'NO PASS') {
    violations.push('invalid-verdict-line');
  }
  if (!hasValidPasteUnitLayout(text)) {
    violations.push('paste-unit-formatting');
  }
  if (
    normalized.includes(GRADER_OPERATOR_PREFIX) ||
    /\boperator[\s:_-]*only\b/i.test(normalized) ||
    /\bdo[\s:_-]*not[\s:_-]*copy\b/i.test(normalized)
  ) {
    violations.push('operator-marker-in-student-copy');
  }
  if (anyMatch(normalized, OPERATOR_VOCABULARY_RES)) {
    violations.push('operator-vocabulary');
  }
  if (anyMatch(normalized, INTERNAL_CRITERION_ID_RES)) {
    violations.push('internal-criterion-id');
  }
  if (anyMatch(normalized, MARKDOWN_RES)) {
    violations.push('markdown-formatting');
  }
  if (/[–—―]/.test(normalized)) {
    violations.push('em-dash');
  }
  if (anyMatch(normalized, PLACEHOLDER_RES)) {
    violations.push('unfilled-placeholder');
  }
  if (
    scanAiTells(normalized, {
      extraPhrasesEnvVar: 'GRADER_AI_TELLS_EXTRA',
    }).length > 0
  ) {
    violations.push('ai-style-phrase');
  }
  if (anyMatch(normalized, SYNTHETIC_PRAISE_RES)) {
    violations.push('stock-praise-phrase');
  }
  if (anyMatch(normalized, FORMULAIC_FEEDBACK_RES)) {
    violations.push('formulaic-feedback-phrase');
  }
  if (firstLine === 'PASS' && anyMatch(normalized, REQUIREMENT_PRAISE_RES)) {
    violations.push('requirement-compliance-phrase');
  }
  // The salutation belongs to the body, not the verdict line, so the check runs
  // on everything after it. Feedback that opens with no salutation is normal
  // and unaffected; only a positively identified different name blocks.
  const body = normalized.slice(firstLine.length).replace(/^\n+/, '');
  if (hasWrongStudentSalutation(body, context.expectedStudentName)) {
    violations.push('salutation-name-mismatch');
  }
  // The expanded-mode override raises the ceiling but can never clear the
  // absolute one-message cap; over-cap copy blocks rather than splits.
  const maxChars = Math.min(
    context.studentCopyMaxChars ?? GRADER_STUDENT_MAX_CHARS,
    GRADER_STUDENT_ABSOLUTE_MAX_CHARS,
  );
  // Length follows the same normalized string as the content rules and counts
  // Unicode code points, not UTF-16 code units. The original bytes still post
  // unchanged when every rule passes.
  if ([...normalized].length > maxChars) {
    violations.push('student-copy-too-long');
  }
  // The policy ceiling counts Unicode code points; Slack's transport counts
  // UTF-16 code units. Enforce both here so astral-heavy text gets the normal
  // operator block notice instead of failing later as a silent IPC quarantine.
  if (text.length > GRADER_STUDENT_ABSOLUTE_MAX_CHARS) {
    violations.push('student-copy-too-long');
  }

  const deduped = unique(violations);
  return { ok: deduped.length === 0, kind: 'student', violations: deduped };
}

/**
 * Build an operator-only notice without echoing any rejected student text.
 *
 * Accepts the boundary's own codes as well as this module's: a context failure
 * and a voice failure produce the same shape of notice, and neither reproduces
 * the offered bytes.
 */
export function formatGraderOutputBlock(violations: readonly string[]): string {
  const codes = unique(violations);
  const recovery = codes.includes('missing-submission-context')
    ? 'No student-facing feedback was posted. Operator: post a new submission root with the student name on line 1 and the exact assignment label on line 2.'
    : 'No student-facing feedback was posted. Operator: review the submission and re-trigger the grading run.';
  return [
    GRADER_OPERATOR_PREFIX,
    'GRADER OUTPUT BLOCKED',
    `Rules: ${codes.join(', ') || 'unknown'}`,
    // Addressed to the operator, not the agent: the grader container is one-shot
    // per submission and is already gone when this notice posts, so "revise and
    // run the gate again" addressed nobody. Recovery is operator-owned.
    recovery,
  ].join('\n');
}
