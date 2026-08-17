/**
 * Unwired Company OS projection for one authoritative SQLite host-job run.
 *
 * The per-run projector consumes already-read structural facts. NC-017 adds a
 * separately invoked, fixed-window source reader; it cannot run/pause/resume a
 * job, schedule polling, post to Slack, or import the daemon. PostgreSQL
 * receives only opaque job/run identity, timestamps, named status codes, and
 * SHA-256 evidence; output, error text, log paths, scripts, arguments, and
 * environment values are not accepted by the type.
 */

import { createHash } from 'crypto';

import {
  listJobRunsForProjection,
  type JobRunProjectionBatch,
  type JobRunProjectionFact,
} from './db.js';
import {
  createCompanyJobWorkItem,
  fingerprintCompanyJobWorkTransition,
  getCompanyJobWorkItemBySource,
  getCompanyWorkEventIdentity,
  transitionCompanyJobWorkItem,
  type CompanyWorkEventIdentity,
  type CompanyWorkItem,
  type CompanyWorkMutationResult,
  type TransitionCompanyJobWorkItemInput,
} from './company-work-ledger.js';

const SOURCE_SYSTEM = 'sqlite_host_job_run';
const ACTOR = 'company-job-work-shadow:host';
const STALE_GRACE_MS = 5 * 60_000;
const MAX_TIMEOUT_MS = 24 * 60 * 60_000;
const SAFE_JOB_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_TRIGGER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const JOB_RUN_STATUSES = new Set<CompanyJobRunStatus>([
  'running',
  'ok',
  'fail',
  'timeout',
  'dispatch_error',
]);

export type CompanyJobRunStatus =
  | 'running'
  | 'ok'
  | 'fail'
  | 'timeout'
  | 'dispatch_error';

/** Structural source facts only. Raw job result fields are deliberately absent. */
export interface CompanyJobRunFact {
  id: string;
  jobName: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  exitCode: number | null;
  pid: number | null;
  status: CompanyJobRunStatus;
  retryAttempt: number;
  timeoutMs: number;
}

export interface CompanyJobWorkShadowDeps {
  createWorkItem: typeof createCompanyJobWorkItem;
  transitionWorkItem: typeof transitionCompanyJobWorkItem;
  getWorkItemBySource: typeof getCompanyJobWorkItemBySource;
  getEventIdentity: typeof getCompanyWorkEventIdentity;
}

export interface CompanyJobWorkProjectionDeps extends CompanyJobWorkShadowDeps {
  listRuns(
    sinceIso: string,
    throughIso: string,
    limit: number,
  ): JobRunProjectionBatch;
}

export interface CompanyJobWorkProjectionWindow {
  since: string;
  through: string;
  batchLimit: number;
}

export interface CompanyJobWorkProjectionSummary {
  scanned: number;
  projected: number;
  transitionsApplied: number;
  duplicateFacts: number;
  completed: number;
  failed: number;
  truncated: boolean;
  skipped: Record<string, number>;
  errors: Record<string, number>;
}

export interface CompanyJobWorkProjectionResult {
  sourceKey: string;
  transitionsApplied: number;
  duplicateFacts: number;
  completed: boolean;
  failed: boolean;
}

type DesiredTransition = Omit<
  TransitionCompanyJobWorkItemInput,
  'workItemId' | 'expectedVersion'
>;

export class CompanyJobProjectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CompanyJobProjectionError';
  }
}

export function hashCompanyJobWorkEvidence(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function validTimestamp(value: string | null): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function validateFact(run: CompanyJobRunFact): void {
  if (!SAFE_RUN_ID_RE.test(run.id)) {
    throw new CompanyJobProjectionError('invalid_run_id');
  }
  if (!SAFE_JOB_NAME_RE.test(run.jobName)) {
    throw new CompanyJobProjectionError('invalid_job_name');
  }
  if (!SAFE_TRIGGER_RE.test(run.triggeredBy)) {
    throw new CompanyJobProjectionError('invalid_triggered_by');
  }
  if (!JOB_RUN_STATUSES.has(run.status)) {
    throw new CompanyJobProjectionError('invalid_status');
  }
  if (!validTimestamp(run.startedAt)) {
    throw new CompanyJobProjectionError('invalid_started_at');
  }
  if (!Number.isInteger(run.retryAttempt) || run.retryAttempt < 0) {
    throw new CompanyJobProjectionError('invalid_retry_attempt');
  }
  if (
    !Number.isInteger(run.timeoutMs) ||
    run.timeoutMs < 1_000 ||
    run.timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new CompanyJobProjectionError('invalid_timeout_ms');
  }
  if (run.pid !== null && (!Number.isInteger(run.pid) || run.pid <= 0)) {
    throw new CompanyJobProjectionError('invalid_pid');
  }
  if (
    run.durationMs !== null &&
    (!Number.isInteger(run.durationMs) || run.durationMs < 0)
  ) {
    throw new CompanyJobProjectionError('invalid_duration_ms');
  }
  if (
    run.exitCode !== null &&
    (!Number.isInteger(run.exitCode) || run.exitCode < 0)
  ) {
    throw new CompanyJobProjectionError('invalid_exit_code');
  }
}

function sourceKey(run: Pick<CompanyJobRunFact, 'jobName' | 'id'>): string {
  return `${run.jobName}:${run.id}`;
}

function eventKey(runId: string, suffix: string): string {
  return `job-run:${runId}:${suffix}`;
}

function desiredTransition(
  runId: string,
  suffix: string,
  input: Omit<
    DesiredTransition,
    'actor' | 'sourceSystem' | 'sourceEventKey' | 'idempotencyKey'
  >,
): DesiredTransition {
  return {
    ...input,
    actor: ACTOR,
    sourceSystem: SOURCE_SYSTEM,
    sourceEventKey: eventKey(runId, suffix),
    idempotencyKey: `company-job-shadow:v1:${runId}:${suffix}`,
  };
}

async function replayOrApplyTransition(
  deps: CompanyJobWorkShadowDeps,
  run: CompanyJobRunFact,
  desired: DesiredTransition,
): Promise<CompanyWorkMutationResult> {
  const existing: CompanyWorkEventIdentity | null = await deps.getEventIdentity(
    desired.sourceSystem,
    desired.sourceEventKey,
  );
  if (existing) {
    const replay: TransitionCompanyJobWorkItemInput = {
      ...desired,
      workItemId: existing.workItemId,
      expectedVersion: existing.workItemVersion - 1,
    };
    if (
      existing.workItemVersion < 1 ||
      existing.eventFingerprint !== fingerprintCompanyJobWorkTransition(replay)
    ) {
      throw new CompanyJobProjectionError('event_identity_conflict');
    }
    const item = await deps.getWorkItemBySource(SOURCE_SYSTEM, sourceKey(run));
    if (!item || item.id !== existing.workItemId) {
      throw new CompanyJobProjectionError('event_work_item_conflict');
    }
    return { item, applied: false, duplicate: true };
  }

  const item = await deps.getWorkItemBySource(SOURCE_SYSTEM, sourceKey(run));
  if (!item) throw new CompanyJobProjectionError('work_item_missing');
  return deps.transitionWorkItem({
    ...desired,
    workItemId: item.id,
    expectedVersion: item.version,
  });
}

function countMutation(
  result: CompanyWorkMutationResult,
  counts: { applied: number; duplicates: number },
): CompanyWorkItem {
  if (result.applied) counts.applied++;
  if (result.duplicate) counts.duplicates++;
  return result.item;
}

function terminalFactsAreComplete(
  run: CompanyJobRunFact,
): run is CompanyJobRunFact & { finishedAt: string; durationMs: number } {
  return (
    validTimestamp(run.finishedAt) &&
    Date.parse(run.finishedAt) >= Date.parse(run.startedAt) &&
    run.durationMs !== null
  );
}

function terminalFailureCode(run: CompanyJobRunFact): string {
  if (run.status === 'timeout') return 'job_run:timeout';
  if (run.status === 'dispatch_error') return 'job_run:dispatch_error';
  if (run.pid === null) return 'job_run:prelaunch_failure';
  if (run.exitCode !== null && run.exitCode !== 0) {
    return 'job_run:exit_nonzero';
  }
  return 'job_run:process_error';
}

async function applySourceGap(
  deps: CompanyJobWorkShadowDeps,
  run: CompanyJobRunFact,
  code: string,
  occurredAt: string,
  counts: { applied: number; duplicates: number },
): Promise<CompanyWorkItem> {
  return countMutation(
    await replayOrApplyTransition(
      deps,
      run,
      desiredTransition(run.id, `source-gap:${code}`, {
        eventType: 'failed',
        occurredAt,
        exceptionCode: `source_gap:${code}`,
        evidenceSha256: hashCompanyJobWorkEvidence([
          'host-job-source-gap-v1',
          run.id,
          run.jobName,
          run.status,
          code,
          run.startedAt,
          run.finishedAt,
          run.durationMs,
          run.exitCode,
          run.pid !== null,
          run.retryAttempt,
        ]),
      }),
    ),
    counts,
  );
}

/** Project one immutable run snapshot. It is intentionally not daemon-wired. */
export async function projectCompanyJobRun(
  run: CompanyJobRunFact,
  deps: CompanyJobWorkShadowDeps,
): Promise<CompanyJobWorkProjectionResult> {
  validateFact(run);
  const counts = { applied: 0, duplicates: 0 };
  const key = sourceKey(run);
  const deadlineAt = new Date(
    Date.parse(run.startedAt) + run.timeoutMs + STALE_GRACE_MS,
  ).toISOString();
  let item = countMutation(
    await deps.createWorkItem({
      sourceSystem: SOURCE_SYSTEM,
      sourceKey: key,
      sourceEventKey: eventKey(run.id, 'accepted'),
      idempotencyKey: `company-job-shadow:v1:${run.id}:accepted`,
      actor: ACTOR,
      evidenceSha256: hashCompanyJobWorkEvidence([
        'host-job-accepted-v1',
        run.id,
        run.jobName,
        run.triggeredBy,
        run.startedAt,
        run.retryAttempt,
      ]),
      occurredAt: run.startedAt,
      deadlineAt,
    }),
    counts,
  );

  if (run.pid !== null) {
    item = countMutation(
      await replayOrApplyTransition(
        deps,
        run,
        desiredTransition(run.id, 'execution-started', {
          eventType: 'execution_started',
          occurredAt: run.startedAt,
          evidenceSha256: hashCompanyJobWorkEvidence([
            'host-job-execution-started-v1',
            run.id,
            run.jobName,
            run.startedAt,
            run.pid,
            run.retryAttempt,
          ]),
        }),
      ),
      counts,
    );
  }

  if (run.status === 'running') {
    if (
      run.finishedAt !== null ||
      run.durationMs !== null ||
      run.exitCode !== null
    ) {
      item = await applySourceGap(
        deps,
        run,
        'running_has_terminal_fields',
        run.startedAt,
        counts,
      );
    }
    return {
      sourceKey: key,
      transitionsApplied: counts.applied,
      duplicateFacts: counts.duplicates,
      completed: item.disposition === 'completed',
      failed: item.disposition === 'failed',
    };
  }

  if (!terminalFactsAreComplete(run)) {
    item = await applySourceGap(
      deps,
      run,
      'terminal_fields_missing',
      validTimestamp(run.finishedAt) ? run.finishedAt : run.startedAt,
      counts,
    );
    return {
      sourceKey: key,
      transitionsApplied: counts.applied,
      duplicateFacts: counts.duplicates,
      completed: false,
      failed: item.disposition === 'failed',
    };
  }

  if (run.status === 'ok' && (run.pid === null || run.exitCode !== 0)) {
    item = await applySourceGap(
      deps,
      run,
      run.pid === null ? 'job_start_missing' : 'success_exit_mismatch',
      run.finishedAt,
      counts,
    );
    return {
      sourceKey: key,
      transitionsApplied: counts.applied,
      duplicateFacts: counts.duplicates,
      completed: false,
      failed: item.disposition === 'failed',
    };
  }

  const terminalEvidence = hashCompanyJobWorkEvidence([
    'host-job-terminal-v1',
    run.id,
    run.jobName,
    run.status,
    run.startedAt,
    run.finishedAt,
    run.durationMs,
    run.exitCode,
    run.pid !== null,
    run.retryAttempt,
  ]);
  const terminalReceipt = {
    type: 'outcome_validation' as const,
    system: 'sqlite_job_run_logs',
    key: eventKey(run.id, 'terminal-receipt'),
    evidenceSha256: terminalEvidence,
    externalActionId: run.id,
    occurredAt: run.finishedAt,
  };

  if (run.status === 'ok') {
    item = countMutation(
      await replayOrApplyTransition(
        deps,
        run,
        desiredTransition(run.id, 'outcome-validated', {
          eventType: 'outcome_validated',
          occurredAt: run.finishedAt,
          evidenceSha256: terminalEvidence,
          receipt: terminalReceipt,
        }),
      ),
      counts,
    );
  } else {
    item = countMutation(
      await replayOrApplyTransition(
        deps,
        run,
        desiredTransition(run.id, 'execution-failed', {
          eventType: 'execution_failed',
          occurredAt: run.finishedAt,
          evidenceSha256: terminalEvidence,
          exceptionCode: terminalFailureCode(run),
          receipt: terminalReceipt,
        }),
      ),
      counts,
    );
  }

  return {
    sourceKey: key,
    transitionsApplied: counts.applied,
    duplicateFacts: counts.duplicates,
    completed: item.disposition === 'completed',
    failed: item.disposition === 'failed',
  };
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function projectionErrorCode(error: unknown): string {
  if (error instanceof CompanyJobProjectionError) return error.code;
  if (error instanceof Error && /^[a-z0-9_:-]+$/.test(error.message)) {
    return error.message;
  }
  return 'projection_failed';
}

function toRunFact(
  row: JobRunProjectionFact & { timeoutMs: number },
): CompanyJobRunFact {
  return {
    id: row.id,
    jobName: row.jobName,
    triggeredBy: row.triggeredBy,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    exitCode: row.exitCode,
    pid: row.pid,
    status: row.status,
    retryAttempt: row.retryAttempt,
    timeoutMs: row.timeoutMs,
  };
}

/**
 * Run one bounded, fixed-window observation. It is deliberately not scheduled
 * or daemon-wired; a caller must supply both time bounds and a batch ceiling.
 */
export async function runCompanyJobWorkProjection(
  deps: CompanyJobWorkProjectionDeps,
  window: CompanyJobWorkProjectionWindow,
): Promise<CompanyJobWorkProjectionSummary> {
  const sinceMs = Date.parse(window.since);
  const throughMs = Date.parse(window.through);
  if (
    !Number.isFinite(sinceMs) ||
    !Number.isFinite(throughMs) ||
    throughMs < sinceMs
  ) {
    throw new CompanyJobProjectionError('invalid_projection_window');
  }
  if (
    !Number.isInteger(window.batchLimit) ||
    window.batchLimit < 1 ||
    window.batchLimit > 250
  ) {
    throw new CompanyJobProjectionError('invalid_projection_batch_limit');
  }

  const batch = deps.listRuns(
    new Date(sinceMs).toISOString(),
    new Date(throughMs).toISOString(),
    window.batchLimit,
  );
  if (batch.truncated) {
    throw new CompanyJobProjectionError('projection_window_truncated');
  }
  if (batch.rows.some((row) => row.timeoutMs === null)) {
    throw new CompanyJobProjectionError('job_definition_missing');
  }
  const runs = batch.rows.map((row) =>
    toRunFact({ ...row, timeoutMs: row.timeoutMs as number }),
  );
  for (const run of runs) validateFact(run);
  const summary: CompanyJobWorkProjectionSummary = {
    scanned: batch.rows.length,
    projected: 0,
    transitionsApplied: 0,
    duplicateFacts: 0,
    completed: 0,
    failed: 0,
    truncated: batch.truncated,
    skipped: {},
    errors: {},
  };
  for (const run of runs) {
    try {
      const result = await projectCompanyJobRun(run, deps);
      summary.projected++;
      summary.transitionsApplied += result.transitionsApplied;
      summary.duplicateFacts += result.duplicateFacts;
      if (result.completed) summary.completed++;
      if (result.failed) summary.failed++;
    } catch (error) {
      increment(summary.errors, projectionErrorCode(error));
    }
  }
  return summary;
}

export function makeCompanyJobWorkProjectionDeps(
  listRuns: CompanyJobWorkProjectionDeps['listRuns'] = listJobRunsForProjection,
): CompanyJobWorkProjectionDeps {
  return {
    listRuns,
    createWorkItem: createCompanyJobWorkItem,
    transitionWorkItem: transitionCompanyJobWorkItem,
    getWorkItemBySource: getCompanyJobWorkItemBySource,
    getEventIdentity: getCompanyWorkEventIdentity,
  };
}
