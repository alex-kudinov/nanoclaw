/**
 * Host-owned boundary for everything the grader publishes into its own channel.
 *
 * The release invariant is that a student must never reasonably infer or assume
 * grading was performed by AI. `grader-output-gate.ts` decides whether one
 * message is a student staging unit or operator-only text; this module is the
 * single place that decides whether it is allowed to reach Slack at all, and it
 * is the only path permitted to post grader-authored text into the grader
 * channel. The prompt asks the agent to cooperate; this is what enforces it.
 *
 * Four properties the integration depends on, each a defect found in review:
 *
 *  - Destination, not author, selects the boundary. `fromGroup: 'grader'` also
 *    tags the host's own "[PROCESSING]" ack and the grader→certifier certificate
 *    handoff, which is addressed to a different channel. Gating on the author
 *    blocks both. The caller supplies both the verified source directory and the
 *    resolved destination, and only source-and-destination-grader enters here.
 *  - Delivery state is structural, never a replay of current policy. See
 *    `isGraderStudentVerdictUnit`.
 *  - Posting is strict: no queue-on-disconnect, no split, no silent success. A
 *    rejection propagates so the IPC watcher quarantines the file without retry,
 *    which is at-most-once — the correct direction for student-facing copy.
 *  - Derive/check/post is serialized per thread, so two concurrent producers
 *    cannot both observe "no student copy yet".
 *
 * The module is pure with respect to I/O: persistence and transport arrive as
 * injected dependencies, so the whole matrix is testable without Slack or a
 * database, and no non-grader caller can reach this code by accident.
 */

import {
  checkGraderOutput,
  formatGraderOutputBlock,
  GRADER_OPERATOR_PREFIX,
  type GraderOutputViolationCode,
} from './grader-output-gate.js';

/** The registered folder name of the grader group. */
export const GRADER_GROUP_FOLDER = 'grader';

/** Which producer offered this text. Recorded for the caller's logs. */
export type GraderDeliverySource = 'ipc' | 'final-text' | 'adopted';

export type GraderDeliveryOutcome =
  /** Posted to Slack and persisted. */
  | 'delivered'
  /** Refused; nothing student-facing was posted. */
  | 'blocked'
  /** Abandoned before posting because the precondition no longer held. */
  | 'skipped';

export interface GraderDeliveryResult {
  outcome: GraderDeliveryOutcome;
  /** Which contract the message was judged under. */
  kind: 'student' | 'operator';
  /** Slack ts of what was actually posted, when anything was. */
  ts?: string;
  /** Rule codes for a block. Empty on delivery. */
  violations: GraderDeliveryViolationCode[];
  /** True when a block notice was posted for this decision. */
  noticePosted: boolean;
}

/**
 * Gate rule codes plus the codes this boundary owns. Neither of the boundary's
 * own codes is a voice rule. `missing-thread-context` means the host could not
 * identify the submission thread, so it cannot know whether a student copy
 * already exists there. `missing-submission-context` means the host has no
 * record that this run resolved a real submission — the state after a restart,
 * after adopting a container from a previous daemon, or when assignment
 * resolution failed — so it cannot vouch for what the feedback was graded
 * against or who it is addressed to.
 */
export type GraderDeliveryViolationCode =
  | GraderOutputViolationCode
  | 'missing-thread-context'
  | 'missing-submission-context';

/**
 * Post one prefix-free message and return its Slack ts. Must reject — never
 * resolve — on disconnect, API failure, missing timestamp, or over-length text,
 * and must never enqueue.
 */
export type GraderStrictPost = (
  jid: string,
  text: string,
  threadTs: string | undefined,
) => Promise<string>;

export interface GraderDeliveryDeps {
  /** True when this thread already holds a delivered student staging unit. */
  hasDeliveredStudentCopy: (chatJid: string, threadTs: string) => boolean;
  /** Transport for the one verdict-plus-feedback unit an operator may copy. */
  postStudentCopy: GraderStrictPost;
  /** Transport for operator-only text, including block notices. */
  postOperatorNotice: GraderStrictPost;
}

export interface GraderDeliveryRequest {
  /** Destination JID. Already known to be the grader's own channel. */
  jid: string;
  /** Submission thread. Absent means the host cannot place the message. */
  threadTs?: string;
  text: string;
  source: GraderDeliverySource;
  /** Separately authorized expanded-feedback ceiling, clamped by the gate. */
  studentCopyMaxChars?: number;
  /**
   * Re-checked INSIDE the per-thread lock, immediately before anything posts.
   * Return false to abandon. The missing-output notice uses this: its "did this
   * run publish anything?" read has to be the last thing that happens before the
   * post, or an IPC message landing in the same instant produces both a real
   * verdict and a notice claiming there was none.
   */
  precondition?: () => boolean;
  /**
   * Host proof that this run resolved a real submission, resolved before the
   * container started. Its absence blocks student-facing copy; operator-only
   * output (help, status, holds, block notices) never needs it.
   */
  submissionContext?: { studentName: string };
}

export type GraderMissingOutputReason =
  | 'submission-context-unavailable'
  | 'run-error'
  | 'final-text-without-thread-output'
  | 'no-agent-result';

export interface GraderMissingOutputSignals {
  submissionContextAvailable: boolean;
  runErrored: boolean;
  agentResultObserved: boolean;
  finalTextObserved: boolean;
}

/** Derive the operator-facing silence reason from host-owned run signals only. */
export function deriveGraderMissingOutputReason(
  signals: GraderMissingOutputSignals,
): GraderMissingOutputReason {
  if (!signals.submissionContextAvailable) {
    return 'submission-context-unavailable';
  }
  if (signals.runErrored) return 'run-error';
  if (signals.finalTextObserved || signals.agentResultObserved) {
    return 'final-text-without-thread-output';
  }
  return 'no-agent-result';
}

/**
 * Fixed operator notice for a run that ended having published nothing.
 *
 * Host-constructed and content-free by design: the raw final assistant text is
 * never wrapped, quoted, or echoed. Wrapping it would put ungated model prose —
 * a closing summary written for no audience — one careless copy away from a
 * student, which is the failure this whole boundary exists to prevent. The
 * operator gets the fact of the silence and the thread it happened in; the
 * transcript is in the logs.
 */
export function formatGraderMissingOutputNotice(
  reason: GraderMissingOutputReason = 'no-agent-result',
): string {
  const explanation: Record<GraderMissingOutputReason, string> = {
    'submission-context-unavailable':
      'The host could not resolve this thread to a real student submission, so no verdict was allowed.',
    'run-error':
      'The grader run ended with an error before a verdict or operator message reached this thread.',
    'final-text-without-thread-output':
      'The run returned final text, but no gated verdict or operator message reached this thread. The staging call may have been skipped or failed.',
    'no-agent-result':
      'The run ended without an agent result, verdict, or operator message reaching this thread.',
  };
  const recovery =
    reason === 'submission-context-unavailable'
      ? 'Operator: post a new submission root with the student name on line 1 and the exact assignment label on line 2.'
      : 'Operator: check the run log for this thread, then re-trigger the grading run.';
  return [
    GRADER_OPERATOR_PREFIX,
    'GRADER RUN PRODUCED NO ACTIONABLE OUTPUT',
    `Reason: ${reason}`,
    explanation[reason],
    recovery,
  ].join('\n');
}

// Serializes derive/check/post per submission thread. The IPC watcher is
// internally serial, but it is not the only producer: the final-text relay and
// the adopted-container relay run on their own call stacks, so the race is real
// and a promise tail inside any one of them would not cover it.
const threadLocks = new Map<string, Promise<unknown>>();

function withThreadLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = threadLocks.get(key) ?? Promise.resolve();
  // Both settle paths continue the chain: a rejected predecessor must not let
  // the next waiter skip the queue.
  const run = previous.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  threadLocks.set(key, tail);
  void tail.then(() => {
    // Self-evicting: only the current tail may remove the key, so a thread that
    // is still busy keeps its lock.
    if (threadLocks.get(key) === tail) threadLocks.delete(key);
  });
  return run;
}

/**
 * Decide and execute one grader publication.
 *
 * Operator-marked text passes through unchecked and never sets delivery state —
 * help, status, ambiguity questions, holds, and block notices must keep working
 * whether or not a verdict was ever posted. Everything else is student-facing by
 * default and must earn its way out.
 *
 * A blocked message never reaches Slack. Only the rule codes do: the rejected
 * bytes are not posted, persisted, or quoted, so the error path cannot put
 * failed copy back into the operator's copy range.
 */
export async function deliverGraderOutput(
  request: GraderDeliveryRequest,
  deps: GraderDeliveryDeps,
): Promise<GraderDeliveryResult> {
  const { jid, threadTs, text } = request;
  return withThreadLock(`${jid}||${threadTs ?? ''}`, async () => {
    if (request.precondition && !request.precondition()) {
      return {
        outcome: 'skipped',
        kind: 'operator',
        violations: [],
        noticePosted: false,
      };
    }
    const alreadyDelivered = threadTs
      ? deps.hasDeliveredStudentCopy(jid, threadTs)
      : false;
    const check = checkGraderOutput(text, {
      studentCopyAlreadyDelivered: alreadyDelivered,
      studentCopyMaxChars: request.studentCopyMaxChars,
      expectedStudentName: request.submissionContext?.studentName,
    });

    if (check.kind === 'operator') {
      const ts = await deps.postOperatorNotice(jid, text, threadTs);
      return {
        outcome: 'delivered',
        kind: 'operator',
        ts,
        violations: [],
        noticePosted: false,
      };
    }

    // Student-facing copy without a known thread fails closed. Derivation is
    // thread-scoped, so posting here could put a second verdict into a thread
    // that already has one, and a verdict in the wrong place is worse than a
    // verdict that is late.
    if (!threadTs) {
      return {
        outcome: 'blocked',
        kind: 'student',
        violations: ['missing-thread-context'],
        noticePosted: false,
      };
    }

    // Context first: without it the host cannot say which assignment this was
    // graded against or whose submission it is, which subsumes every voice
    // judgement the gate just made. Both sets of codes still reach the operator.
    const violations: GraderDeliveryViolationCode[] = request.submissionContext
      ? [...check.violations]
      : ['missing-submission-context', ...check.violations];

    if (violations.length > 0) {
      const ts = await deps.postOperatorNotice(
        jid,
        formatGraderOutputBlock(violations),
        threadTs,
      );
      return {
        outcome: 'blocked',
        kind: 'student',
        ts,
        violations,
        noticePosted: true,
      };
    }

    // A rejection propagates: the caller must not record delivery for a post it
    // cannot prove happened.
    const ts = await deps.postStudentCopy(jid, text, threadTs);
    return {
      outcome: 'delivered',
      kind: 'student',
      ts,
      violations: [],
      noticePosted: false,
    };
  });
}

/** Test-only: drop lock state between cases. */
export function _resetGraderDeliveryLocks(): void {
  threadLocks.clear();
}
