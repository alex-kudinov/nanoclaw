import fs from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  resolveProgramFactsCompanyWorkMode,
  runProgramFactsDriftJob,
  type ProgramFactsDriftJobDependencies,
} from './program-facts-drift-job.js';

const HASH = 'a'.repeat(64);

function detector(clean = false) {
  return {
    result: {
      checked: 3,
      findings: clean
        ? []
        : [
            {
              program: 'practitioner-series',
              kind: 'kb_missing_fact' as const,
              detail: 'missing expected cohort fact',
            },
          ],
    },
    evidence: {
      detectorVersion: 1 as const,
      factsSha256: HASH,
      salesKbSha256: HASH,
      productsSha256: HASH,
      productsAvailable: true,
      findingFingerprint: HASH,
      payloadSha256: HASH,
    },
  };
}

function dependencies(
  work: Record<string, unknown> | null,
): ProgramFactsDriftJobDependencies & {
  applyCompanyWork: ReturnType<typeof vi.fn>;
  postNotification: ReturnType<typeof vi.fn>;
} {
  return {
    runDetector: vi.fn().mockResolvedValue(detector()),
    applyCompanyWork: vi.fn().mockResolvedValue(work),
    postNotification: vi.fn().mockResolvedValue('posted'),
  } as never;
}

describe('program-facts scheduled job activation boundary', () => {
  it('defaults to legacy notify-only mode and accepts only explicit active', () => {
    expect(resolveProgramFactsCompanyWorkMode(undefined)).toBe('off');
    expect(resolveProgramFactsCompanyWorkMode('off')).toBe('off');
    expect(resolveProgramFactsCompanyWorkMode('active')).toBe('active');
    expect(() => resolveProgramFactsCompanyWorkMode('shadow')).toThrow(
      /must be off or active/,
    );
  });

  it('receives the exact durable scheduler run identity and start time', () => {
    const runner = fs.readFileSync(
      new URL('./job-runner.ts', import.meta.url),
      'utf8',
    );
    expect(runner).toContain('env.NANOCLAW_JOB_RUN_ID = runId');
    expect(runner).toContain('env.NANOCLAW_JOB_STARTED_AT = startedAt');
  });

  it('keeps off mode notify-only and never touches Company Work', async () => {
    const deps = dependencies(null);
    const result = await runProgramFactsDriftJob({
      mode: 'off',
      runKey: 'job-1',
      observedAt: '2026-08-20T14:00:00.000Z',
      dependencies: deps,
    });

    expect(result.notification).toBe('posted');
    expect(deps.applyCompanyWork).not.toHaveBeenCalled();
    expect(deps.postNotification).toHaveBeenCalledWith(
      expect.stringContaining('this alert is notify-only'),
    );
  });

  it('posts the durable work identity once and suppresses unchanged repeats', async () => {
    const workItem = {
      id: '42',
      disposition: 'blocked',
    };
    const opened = dependencies({
      outcome: 'opened',
      workItem,
      triggerApplied: true,
      observationApplied: true,
      shouldNotify: true,
    });
    await runProgramFactsDriftJob({
      mode: 'active',
      runKey: 'job-2',
      observedAt: '2026-08-20T15:00:00.000Z',
      dependencies: opened,
    });
    expect(opened.applyCompanyWork).toHaveBeenCalledWith(
      expect.objectContaining({ runKey: 'job-2' }),
    );
    expect(opened.postNotification).toHaveBeenCalledWith(
      expect.stringContaining('Company Work *#42*'),
    );

    const unchanged = dependencies({
      outcome: 'unchanged',
      workItem,
      triggerApplied: true,
      observationApplied: true,
      shouldNotify: false,
    });
    await expect(
      runProgramFactsDriftJob({
        mode: 'active',
        runKey: 'job-3',
        observedAt: '2026-08-20T16:00:00.000Z',
        dependencies: unchanged,
      }),
    ).resolves.toMatchObject({ notification: 'not_needed' });
    expect(unchanged.postNotification).not.toHaveBeenCalled();
  });
});
