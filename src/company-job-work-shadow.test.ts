import { describe, expect, it, vi } from 'vitest';

import {
  fingerprintCompanyJobWorkTransition,
  planCompanyJobWorkTransition,
  type CreateCompanyJobWorkItemInput,
  type CompanyWorkEventIdentity,
  type CompanyWorkItem,
  type TransitionCompanyJobWorkItemInput,
} from './company-work-ledger.js';
import {
  CompanyJobProjectionError,
  projectCompanyJobRun,
  type CompanyJobRunFact,
  type CompanyJobWorkShadowDeps,
} from './company-job-work-shadow.js';

const STARTED = '2026-08-16T20:00:00.000Z';
const FINISHED = '2026-08-16T20:01:00.000Z';

function run(overrides: Partial<CompanyJobRunFact> = {}): CompanyJobRunFact {
  return {
    id: 'run-123',
    jobName: 'calendar-refresh',
    triggeredBy: 'cron',
    startedAt: STARTED,
    finishedAt: FINISHED,
    durationMs: 60_000,
    exitCode: 0,
    pid: 12345,
    status: 'ok',
    retryAttempt: 0,
    timeoutMs: 300_000,
    ...overrides,
  };
}

function makeDeps() {
  let item: CompanyWorkItem | null = null;
  const events = new Map<string, CompanyWorkEventIdentity>();

  const createWorkItem = vi.fn(async (input: CreateCompanyJobWorkItemInput) => {
    if (item) return { item, applied: false, duplicate: true };
    item = {
      id: '900',
      workflowType: 'host_job_run',
      sourceSystem: input.sourceSystem,
      sourceKey: input.sourceKey,
      partyId: null,
      pipelineEntryId: null,
      completionDefinition: 'host_job_terminal_receipt',
      stage: 'accepted',
      disposition: 'open',
      version: 0,
      blockCode: null,
      failureCode: null,
      deadlineAt: input.deadlineAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      lastTransitionAt: input.occurredAt,
      lastTransitionBy: input.actor,
    };
    return { item, applied: true, duplicate: false };
  });

  const transitionWorkItem = vi.fn(
    async (input: TransitionCompanyJobWorkItemInput) => {
      if (!item) throw new Error('missing fake item');
      const planned = planCompanyJobWorkTransition(item, input.eventType, {
        evidenceSha256: input.evidenceSha256,
        exceptionCode: input.exceptionCode,
        receipt: input.receipt,
      });
      item = {
        ...item,
        stage: planned.stage,
        disposition: planned.disposition,
        blockCode: planned.blockCode,
        failureCode: planned.failureCode,
        version: item.version + 1,
        updatedAt: input.occurredAt,
        lastTransitionAt: input.occurredAt,
        lastTransitionBy: input.actor,
      };
      events.set(input.sourceEventKey, {
        workItemId: item.id,
        workItemVersion: item.version,
        eventFingerprint: fingerprintCompanyJobWorkTransition(input),
      });
      return { item, applied: true, duplicate: false };
    },
  );

  const getWorkItemBySource = vi.fn(async () => item);
  const getEventIdentity = vi.fn(
    async (_sourceSystem: string, sourceEventKey: string) =>
      events.get(sourceEventKey) ?? null,
  );
  const deps = {
    createWorkItem,
    transitionWorkItem,
    getWorkItemBySource,
    getEventIdentity,
  } as unknown as CompanyJobWorkShadowDeps;
  return { deps, createWorkItem, transitionWorkItem, current: () => item };
}

describe('dark Campanero host-job projection', () => {
  it('projects one successful run through accepted, started, and exact outcome', async () => {
    const fake = makeDeps();
    const projected = await projectCompanyJobRun(run(), fake.deps);

    expect(projected).toEqual({
      sourceKey: 'calendar-refresh:run-123',
      transitionsApplied: 3,
      duplicateFacts: 0,
      completed: true,
      failed: false,
    });
    expect(fake.createWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'sqlite_host_job_run',
        sourceKey: 'calendar-refresh:run-123',
        deadlineAt: '2026-08-16T20:10:00.000Z',
      }),
    );
    expect(
      fake.transitionWorkItem.mock.calls.map(([fact]) => fact.eventType),
    ).toEqual(['execution_started', 'outcome_validated']);
    expect(fake.transitionWorkItem.mock.calls[1][0]).toMatchObject({
      evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      receipt: {
        type: 'outcome_validation',
        system: 'sqlite_job_run_logs',
        externalActionId: 'run-123',
      },
    });
    expect(fake.current()).toMatchObject({
      partyId: null,
      pipelineEntryId: null,
      stage: 'outcome_validated',
      disposition: 'completed',
    });
  });

  it('records an exact failed-run receipt without retrying the job', async () => {
    const fake = makeDeps();
    const projected = await projectCompanyJobRun(
      run({ status: 'timeout', exitCode: null }),
      fake.deps,
    );

    expect(projected).toMatchObject({
      transitionsApplied: 3,
      failed: true,
      completed: false,
    });
    expect(fake.transitionWorkItem).toHaveBeenCalledTimes(2);
    expect(fake.transitionWorkItem.mock.calls[1][0]).toMatchObject({
      eventType: 'execution_failed',
      exceptionCode: 'job_run:timeout',
      receipt: { externalActionId: 'run-123' },
    });
    expect(fake.current()).toMatchObject({
      stage: 'execution_started',
      disposition: 'failed',
      failureCode: 'job_run:timeout',
    });
  });

  it('keeps an in-flight run open and makes staleness visible via its deadline', async () => {
    const fake = makeDeps();
    const projected = await projectCompanyJobRun(
      run({
        status: 'running',
        finishedAt: null,
        durationMs: null,
        exitCode: null,
      }),
      fake.deps,
    );

    expect(projected).toMatchObject({
      transitionsApplied: 2,
      completed: false,
      failed: false,
    });
    expect(fake.current()).toMatchObject({
      stage: 'execution_started',
      disposition: 'open',
      deadlineAt: '2026-08-16T20:10:00.000Z',
    });
  });

  it('fails closed on a successful row missing durable start evidence', async () => {
    const fake = makeDeps();
    const projected = await projectCompanyJobRun(run({ pid: null }), fake.deps);

    expect(projected).toMatchObject({
      transitionsApplied: 2,
      completed: false,
      failed: true,
    });
    expect(fake.transitionWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'failed',
        exceptionCode: 'source_gap:job_start_missing',
      }),
    );
  });

  it('projects an exact retry as duplicate-only facts', async () => {
    const fake = makeDeps();
    await projectCompanyJobRun(run(), fake.deps);
    const replay = await projectCompanyJobRun(run(), fake.deps);

    expect(replay).toEqual({
      sourceKey: 'calendar-refresh:run-123',
      transitionsApplied: 0,
      duplicateFacts: 3,
      completed: true,
      failed: false,
    });
    expect(fake.transitionWorkItem).toHaveBeenCalledTimes(2);
  });

  it('rejects content-shaped job identity before any ledger call', async () => {
    const fake = makeDeps();
    await expect(
      projectCompanyJobRun(run({ jobName: 'calendar refresh' }), fake.deps),
    ).rejects.toEqual(new CompanyJobProjectionError('invalid_job_name'));
    expect(fake.createWorkItem).not.toHaveBeenCalled();
  });
});
