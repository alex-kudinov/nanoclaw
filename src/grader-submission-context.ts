/**
 * Host-side resolution of "which assignment is this submission, and whose is it".
 *
 * The grading pack under ~/dev/grading carries assignment SNAPSHOTS taken at
 * course-onboarding time. Live Heartbeat has since diverged from three of the
 * six Foundation-program written assignments (M2's client profile, M4's
 * observation form, M5's feedback framing), so a snapshot cannot be allowed to
 * outrank the prompt the student actually answered. This module decides which
 * registry entry a submission is, and `grader-assignment-fetch.ts` then obtains
 * the current text for it.
 *
 * Everything here is derived from two host-controlled inputs: the registered
 * `additionalMounts` entry that defines the grading root, and the Slack root
 * message's first two nonblank lines. Both the assignment label and the student
 * name are UNTRUSTED text, so nothing is inferred from them — a label matches a
 * registered label exactly after normalization or it does not match at all, and
 * the name is carried through verbatim for the identity rule to compare against.
 *
 * Failure is never silent and never optimistic: an unreadable root, an
 * unreadable registry, an unknown label, or an ambiguous label all produce a
 * `blocked` result carrying only a fixed code. The caller turns that into an
 * operator notice and refuses to stage student-facing copy.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AdditionalMount } from './types.js';

/** Container path (bare name) of the grading-root mount in register-grader.ts. */
const GRADING_MOUNT_NAME = 'grading';
/**
 * Registry size ceiling. The real file is ~19 KB; this bounds a corrupted or
 * hostile file before it is parsed, since the host reads it on every graded
 * submission.
 */
export const REGISTRY_MAX_BYTES = 512 * 1024;
/** Header lines are labels and names, never prose. */
const MAX_HEADER_LINE_CHARS = 200;
const FEEDBACK_LANGUAGE_BY_LOCALE: Record<string, string> = {
  'en-US': 'en',
  'fr-FR': 'fr',
  'ja-JP': 'ja',
  'es-419': 'es',
};

export interface HeartbeatAssignmentRef {
  workspace: string;
  courseId: string;
  lessonId: string;
  canonicalTitle: string;
}

export interface RegistryAssignment {
  code: string;
  title: string;
  aliases: string[];
  logicalCode?: string;
  courseVariant?: string;
  completionCourse?: string;
  locale?: string;
  feedbackLanguage?: string;
  localeProfile?: string;
  sharedPrecedentCode?: string;
  liveAssignmentRequired: boolean;
  heartbeat?: HeartbeatAssignmentRef;
}

export type SubmissionContextBlockCode =
  | 'grading-root-unavailable'
  | 'registry-unreadable'
  | 'assignment-unresolved'
  | 'assignment-ambiguous'
  | 'heartbeat-mapping-missing';

export type SubmissionContextResult =
  /** Not a submission header (help, status, roster). No grading context needed. */
  | { kind: 'no-submission' }
  | { kind: 'resolved'; studentName: string; assignment: RegistryAssignment }
  | { kind: 'blocked'; code: SubmissionContextBlockCode };

/**
 * Fold a label for matching. Mirrors `norm_label()` in ~/dev/grading/validate.py,
 * which fails the registry when two assignments share a folded label — the two
 * implementations must agree or the validator's uniqueness guarantee is void.
 */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Resolve the grading root from host-controlled registration, never a message. */
export function resolveGradingRoot(
  mounts: AdditionalMount[] | undefined,
): string | undefined {
  const mount = mounts?.find(
    (m) => m.containerPath?.replace(/^\/+|\/+$/g, '') === GRADING_MOUNT_NAME,
  );
  if (!mount?.hostPath) return undefined;
  const expanded = mount.hostPath.startsWith('~')
    ? path.join(os.homedir(), mount.hostPath.slice(1))
    : mount.hostPath;
  return path.resolve(expanded);
}

function readHeartbeatRef(raw: unknown): HeartbeatAssignmentRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const hb = raw as Record<string, unknown>;
  const fields = ['workspace', 'course_id', 'lesson_id', 'canonical_title'];
  if (fields.some((f) => typeof hb[f] !== 'string' || !hb[f])) return undefined;
  return {
    workspace: hb.workspace as string,
    courseId: hb.course_id as string,
    lessonId: hb.lesson_id as string,
    canonicalTitle: hb.canonical_title as string,
  };
}

/**
 * Load the assignment registry. Returns undefined on any failure — a missing,
 * oversized, malformed, or structurally wrong registry all mean "the host cannot
 * say what this submission is", which blocks rather than degrades.
 */
export function loadRegistryAssignments(
  gradingRoot: string,
): RegistryAssignment[] | undefined {
  const file = path.join(gradingRoot, 'registry.json');
  try {
    if (fs.statSync(file).size > REGISTRY_MAX_BYTES) return undefined;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    const list = (parsed as { assignments?: unknown })?.assignments;
    if (!Array.isArray(list)) return undefined;
    const out: RegistryAssignment[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return undefined;
      }
      const a = item as Record<string, unknown>;
      if (
        typeof a.code !== 'string' ||
        !a.code.trim() ||
        typeof a.title !== 'string' ||
        !a.title.trim() ||
        !Array.isArray(a.aliases) ||
        a.aliases.some((alias) => typeof alias !== 'string')
      ) {
        return undefined;
      }
      const heartbeat = readHeartbeatRef(a.heartbeat);
      // A malformed live mapping must never silently become snapshot-only.
      // That would grade a mapped Foundation submission against stale text.
      if (Object.hasOwn(a, 'heartbeat') && !heartbeat) return undefined;
      const liveAssignmentRequired = a.live_assignment_required === true;
      if (heartbeat && !liveAssignmentRequired) return undefined;
      const variantFields = [
        'logical_code',
        'course_variant',
        'completion_course',
        'locale',
        'feedback_language',
        'locale_profile',
        'shared_precedent_code',
      ] as const;
      if (
        liveAssignmentRequired &&
        variantFields.some(
          (field) =>
            typeof a[field] !== 'string' || !a[field]?.toString().trim(),
        )
      ) {
        return undefined;
      }
      if (
        liveAssignmentRequired &&
        FEEDBACK_LANGUAGE_BY_LOCALE[a.locale as string] !== a.feedback_language
      ) {
        return undefined;
      }
      out.push({
        code: a.code,
        title: a.title,
        aliases: a.aliases as string[],
        logicalCode: a.logical_code as string | undefined,
        courseVariant: a.course_variant as string | undefined,
        completionCourse: a.completion_course as string | undefined,
        locale: a.locale as string | undefined,
        feedbackLanguage: a.feedback_language as string | undefined,
        localeProfile: a.locale_profile as string | undefined,
        sharedPrecedentCode: a.shared_precedent_code as string | undefined,
        liveAssignmentRequired,
        heartbeat,
      });
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Every label an assignment answers to, folded. */
function labelsFor(assignment: RegistryAssignment): string[] {
  const labels = [assignment.code, assignment.title, ...assignment.aliases];
  if (assignment.heartbeat) labels.push(assignment.heartbeat.canonicalTitle);
  return labels.map(normalizeLabel).filter(Boolean);
}

/**
 * Assignments whose registered labels equal this one exactly after folding.
 *
 * Exact-set membership, never substring or prefix: "module 1" must not select
 * "module 1 part 2", and a submission body's first line must not accidentally
 * match by containing a registered phrase.
 */
export function matchAssignments(
  assignments: RegistryAssignment[],
  label: string,
): RegistryAssignment[] {
  const key = normalizeLabel(label);
  if (!key) return [];
  return assignments.filter((a) => labelsFor(a).includes(key));
}

/** First two nonblank lines, length-capped. The rest of the root is submission. */
export function parseRootHeader(rootText: string): string[] {
  return rootText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .filter((line) => line.length <= MAX_HEADER_LINE_CHARS);
}

/**
 * Split a legacy one-line `grade <student> <assignment>` command.
 *
 * The two-line header is the Heartbeat workflow's format, but the grader prompt
 * still documents this typed form and operators still use it, so dropping it
 * would strand live traffic. The split is exact rather than inferred: only a
 * suffix that is itself a registered label can end the command, and the longest
 * such suffix wins, so `grade Paulo acc bars` yields "Paulo" (suffix "acc bars")
 * and never "Paulo acc" (suffix "bars"). No resolving suffix means no match.
 */
function splitGradeCommand(
  assignments: RegistryAssignment[],
  line: string,
): { studentName: string; label: string } | undefined {
  const rest = /^grade\s+(.+)$/i.exec(line)?.[1]?.trim();
  if (!rest) return undefined;
  const words = rest.split(/\s+/);
  for (let start = 1; start < words.length; start++) {
    const label = words.slice(start).join(' ');
    if (matchAssignments(assignments, label).length === 1) {
      return { studentName: words.slice(0, start).join(' '), label };
    }
  }
  return undefined;
}

function resolveFrom(
  assignments: RegistryAssignment[],
  studentName: string,
  label: string,
): SubmissionContextResult {
  const matches = matchAssignments(assignments, label);
  if (matches.length === 1 && studentName) {
    if (matches[0].liveAssignmentRequired && !matches[0].heartbeat) {
      return { kind: 'blocked', code: 'heartbeat-mapping-missing' };
    }
    return { kind: 'resolved', studentName, assignment: matches[0] };
  }
  if (matches.length > 1)
    return { kind: 'blocked', code: 'assignment-ambiguous' };
  return { kind: 'blocked', code: 'assignment-unresolved' };
}

/**
 * Resolve one submission root into a grading context.
 *
 * A root with a single header line is operator traffic (help, status, roster):
 * it carries no submission, so it needs no context and gets none. Anything that
 * looks like a submission and does not resolve is blocked, never waved through.
 */
export function resolveSubmissionContext(
  rootText: string,
  mounts: AdditionalMount[] | undefined,
): SubmissionContextResult {
  const gradingRoot = resolveGradingRoot(mounts);
  if (!gradingRoot)
    return { kind: 'blocked', code: 'grading-root-unavailable' };
  const assignments = loadRegistryAssignments(gradingRoot);
  if (!assignments) return { kind: 'blocked', code: 'registry-unreadable' };

  const header = parseRootHeader(rootText);
  if (header.length === 0) return { kind: 'no-submission' };
  const command = splitGradeCommand(assignments, header[0]);
  if (command) {
    return resolveFrom(assignments, command.studentName, command.label);
  }
  if (header.length < 2) return { kind: 'no-submission' };
  const studentName =
    /^grade\s+(.+)$/i.exec(header[0])?.[1]?.trim() ?? header[0];
  return resolveFrom(assignments, studentName, header[1]);
}
