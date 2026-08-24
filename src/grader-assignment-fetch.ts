/**
 * Read-only retrieval of the CURRENT Heartbeat assignment text for one lesson.
 *
 * The grading container never sees the Heartbeat credential and never calls this
 * API: `container-runner.ts` injects `HEARTBEAT_API_KEY` into the `courses` group
 * only, and that stays true. The host performs exactly one GET per graded
 * submission, hands the resulting text to the run as curriculum context, and
 * keeps the credential on its own side of the boundary.
 *
 * Every check here is a fail-closed equality, not a heuristic. A response that
 * is late, oversized, unparseable, or describes a different lesson than the one
 * requested produces a failure code and no content, because grading against the
 * wrong assignment is indistinguishable to a student from grading badly.
 *
 * Nothing in this module logs or persists assignment content or the credential.
 * The content hash exists so an operator can compare two runs without either of
 * them writing the text anywhere.
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import type { HeartbeatAssignmentRef } from './grader-submission-context.js';

const HEARTBEAT_API = 'https://api.heartbeat.chat/v0';
/** One GET, bounded. A slow API must not hold a grading run open. */
export const FETCH_TIMEOUT_MS = 15000;
/** Transport ceiling for the whole response body. */
export const RESPONSE_MAX_BYTES = 512 * 1024;
/** Content ceiling after parsing. An assignment prompt is a page, not a book. */
export const CONTENT_MAX_CHARS = 60000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const WORKSPACE_ENV_KEYS: Record<string, string> = {
  main: 'HEARTBEAT_API_KEY',
  circle: 'HEARTBEAT_CIRCLE_API_KEY',
};

export interface LiveAssignment {
  lessonId: string;
  canonicalTitle: string;
  content: string;
  fetchedAt: string;
  /** sha256 of the content, truncated. Safe to log; the content is not. */
  contentHash: string;
  contentChars: number;
}

export type AssignmentFetchFailureCode =
  | 'assignment-not-allowlisted'
  | 'heartbeat-credential-missing'
  | 'heartbeat-request-failed'
  | 'heartbeat-response-invalid'
  | 'heartbeat-lesson-mismatch'
  | 'heartbeat-content-empty';

export type AssignmentFetchResult =
  | { ok: true; assignment: LiveAssignment }
  | { ok: false; code: AssignmentFetchFailureCode };

export interface AssignmentFetchDeps {
  /** Secret lookup. Must not place the value in process.env or any log. */
  readSecret: (key: string) => string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Read at most `maxBytes`; abort rather than buffer an unbounded body. */
async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<string | undefined> {
  const declared = Number(response.headers?.get?.('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body?.getReader) {
    const text = await response.text();
    return Buffer.byteLength(text, 'utf-8') > maxBytes ? undefined : text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Heartbeat returns lesson fields at the top level or nested under `data`. */
function readField(payload: Record<string, unknown>, field: string): unknown {
  const nested = payload.data as Record<string, unknown> | undefined;
  return payload[field] ?? nested?.[field];
}

function hashContent(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content, 'utf-8')
    .digest('hex')
    .slice(0, 16);
}

/**
 * Validate a parsed lesson payload against the registry entry that requested it.
 *
 * The returned id and title must equal the registered ones. A silent redirect,
 * a renamed lesson, or a copy-paste error in the registry all surface here
 * rather than as an assignment the student never saw.
 */
function validatePayload(
  ref: HeartbeatAssignmentRef,
  payload: Record<string, unknown>,
): AssignmentFetchResult {
  const id = readField(payload, 'id');
  const title = readField(payload, 'title');
  if (typeof id !== 'string' || id !== ref.lessonId) {
    return { ok: false, code: 'heartbeat-lesson-mismatch' };
  }
  if (
    typeof title !== 'string' ||
    title.trim().normalize('NFKC') !==
      ref.canonicalTitle.trim().normalize('NFKC')
  ) {
    return { ok: false, code: 'heartbeat-lesson-mismatch' };
  }
  // Heartbeat deployments do not all return course_id on a lesson GET. When it
  // is present, bind it to the registered variant as an additional defense
  // against copying a sibling locale's course id onto an otherwise valid lesson.
  const courseId = readField(payload, 'course_id');
  if (courseId !== undefined && courseId !== ref.courseId) {
    return { ok: false, code: 'heartbeat-lesson-mismatch' };
  }
  const content = readField(payload, 'content');
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, code: 'heartbeat-content-empty' };
  }
  if (content.length > CONTENT_MAX_CHARS) {
    return { ok: false, code: 'heartbeat-response-invalid' };
  }
  return {
    ok: true,
    assignment: {
      lessonId: ref.lessonId,
      canonicalTitle: ref.canonicalTitle,
      content,
      fetchedAt: '',
      contentHash: hashContent(content),
      contentChars: content.length,
    },
  };
}

/**
 * Fetch the live assignment for one registered lesson.
 *
 * `ref.lessonId` is the allowlist: it comes from the tracked registry, is
 * re-checked against the UUID shape here, and is the only value ever
 * interpolated into the URL.
 */
export async function fetchLiveAssignment(
  ref: HeartbeatAssignmentRef,
  deps: AssignmentFetchDeps,
): Promise<AssignmentFetchResult> {
  if (!UUID_RE.test(ref.lessonId)) {
    return { ok: false, code: 'assignment-not-allowlisted' };
  }
  const envKey = WORKSPACE_ENV_KEYS[ref.workspace];
  const token = envKey ? deps.readSecret(envKey) : undefined;
  if (!token) return { ok: false, code: 'heartbeat-credential-missing' };

  const doFetch = deps.fetchImpl ?? fetch;
  let raw: string | undefined;
  try {
    const response = await doFetch(`${HEARTBEAT_API}/lessons/${ref.lessonId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Status only. A body can echo request detail and is not read on failure.
      logger.warn(
        { lessonId: ref.lessonId, status: response.status },
        'Heartbeat lesson fetch returned a non-success status',
      );
      return { ok: false, code: 'heartbeat-request-failed' };
    }
    raw = await readBounded(response, RESPONSE_MAX_BYTES);
  } catch {
    // The error is not logged: a fetch error message can embed the request URL
    // and, on some runtimes, request headers.
    logger.warn(
      { lessonId: ref.lessonId },
      'Heartbeat lesson fetch failed or timed out',
    );
    return { ok: false, code: 'heartbeat-request-failed' };
  }
  if (raw === undefined)
    return { ok: false, code: 'heartbeat-response-invalid' };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'heartbeat-response-invalid' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: 'heartbeat-response-invalid' };
  }
  const result = validatePayload(ref, payload as Record<string, unknown>);
  if (!result.ok) return result;
  const fetchedAt = (deps.now?.() ?? new Date()).toISOString();
  logger.info(
    {
      lessonId: ref.lessonId,
      contentHash: result.assignment.contentHash,
      contentChars: result.assignment.contentChars,
    },
    'Live assignment fetched for grading context',
  );
  return { ok: true, assignment: { ...result.assignment, fetchedAt } };
}
