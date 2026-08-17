import { describe, expect, it, vi } from 'vitest';

import { normalizeCompanyTrigger } from './company-trigger.js';
import {
  buildCompanyTimeTriggerInput,
  CompanyTimeTriggerObserver,
  resolveCompanyTimeTriggerConfig,
  type CompanyTimeTriggerConfig,
} from './company-time-trigger.js';

const TASK = {
  id: 'task-followup-daily',
  schedule_type: 'cron' as const,
  schedule_value: '0 9 * * 1-5',
};
const BOUNDARY = '2026-08-17T14:00:00.000Z';

function config(
  overrides: Partial<CompanyTimeTriggerConfig> = {},
): CompanyTimeTriggerConfig {
  return {
    enabled: true,
    active: true,
    taskId: TASK.id,
    scheduledFor: BOUNDARY,
    configurationError: null,
    ...overrides,
  };
}

describe('Company scheduled-time trigger config', () => {
  it('is default-off and requires one valid task and exact boundary', () => {
    expect(resolveCompanyTimeTriggerConfig({})).toMatchObject({
      enabled: false,
      active: false,
      taskId: null,
      scheduledFor: null,
      configurationError: null,
    });
    expect(
      resolveCompanyTimeTriggerConfig({
        COMPANY_TIME_TRIGGER_ENABLED: '1',
      }),
    ).toMatchObject({
      active: false,
      configurationError: 'invalid_task_id',
    });
    expect(
      resolveCompanyTimeTriggerConfig({
        COMPANY_TIME_TRIGGER_ENABLED: '1',
        COMPANY_TIME_TRIGGER_TASK_ID: TASK.id,
        COMPANY_TIME_TRIGGER_SCHEDULED_FOR: BOUNDARY,
      }),
    ).toEqual(config());
  });

  it('rejects loose dates, impossible dates, and unsafe task identities', () => {
    expect(
      resolveCompanyTimeTriggerConfig({
        COMPANY_TIME_TRIGGER_ENABLED: '1',
        COMPANY_TIME_TRIGGER_TASK_ID: 'task with spaces',
        COMPANY_TIME_TRIGGER_SCHEDULED_FOR: BOUNDARY,
      }).configurationError,
    ).toBe('invalid_task_id');
    for (const scheduledFor of ['2026-08-17', '2026-02-31T14:00:00Z']) {
      expect(
        resolveCompanyTimeTriggerConfig({
          COMPANY_TIME_TRIGGER_ENABLED: '1',
          COMPANY_TIME_TRIGGER_TASK_ID: TASK.id,
          COMPANY_TIME_TRIGGER_SCHEDULED_FOR: scheduledFor,
        }).configurationError,
      ).toBe('invalid_scheduled_boundary');
    }
  });
});

describe('Company scheduled-time trigger observer', () => {
  it('builds a content-free stable trigger from bounded schedule facts', () => {
    const input = buildCompanyTimeTriggerInput(TASK, BOUNDARY);
    const occurrence = normalizeCompanyTrigger(input);

    expect(occurrence).toMatchObject({
      kind: 'time',
      sourceSystem: 'scheduled_task',
      occurrenceKey: BOUNDARY,
      observedAt: BOUNDARY,
      actionAuthority: 'none',
      workRequest: {
        operation: 'create',
        workflowType: 'scheduled_task',
        sourceSystem: 'scheduled_task',
      },
    });
    expect(occurrence.sourceKey).not.toContain(TASK.id);
    expect(occurrence.workRequest.sourceKey).not.toContain(TASK.id);
    expect(JSON.stringify(input)).not.toMatch(
      /prompt|chat|result|message|group|agent|skill|action/i,
    );
    expect(buildCompanyTimeTriggerInput(TASK, BOUNDARY)).toEqual(input);
  });

  it('records one exact armed boundary and exposes only aggregate status', async () => {
    const record = vi.fn(async (input: unknown) => ({
      occurrence: normalizeCompanyTrigger(input),
      applied: true,
      duplicate: false,
    }));
    const observer = new CompanyTimeTriggerObserver(
      { record, now: () => new Date('2026-08-17T13:59:00.000Z') },
      () => config(),
    );

    const result = await observer.observeClaim(TASK, BOUNDARY);

    expect(result.outcome).toBe('applied');
    expect(record).toHaveBeenCalledOnce();
    expect(observer.getStatus()).toMatchObject({
      mode: 'armed',
      taskCount: 1,
      scheduledFor: BOUNDARY,
      boundaryState: 'pending',
      totalCalls: 1,
      matchedCalls: 1,
      applied: 1,
      duplicates: 0,
      failures: 0,
      lastOutcome: 'applied',
    });
    expect(JSON.stringify(observer.getStatus())).not.toContain(TASK.id);
  });

  it('classifies exact replay as duplicate', async () => {
    const record = vi.fn(async (input: unknown) => ({
      occurrence: normalizeCompanyTrigger(input),
      applied: false,
      duplicate: true,
    }));
    const observer = new CompanyTimeTriggerObserver(
      { record, now: () => new Date(BOUNDARY) },
      () => config(),
    );

    expect((await observer.observeClaim(TASK, BOUNDARY)).outcome).toBe(
      'duplicate',
    );
    expect(observer.getStatus()).toMatchObject({
      duplicates: 1,
      applied: 0,
      boundaryState: 'reached',
    });
  });

  it.each([
    ['disabled', config({ enabled: false, active: false })],
    [
      'misconfigured',
      config({
        active: false,
        taskId: null,
        configurationError: 'invalid_task_id',
      }),
    ],
  ])(
    'refuses %s configuration without touching the store',
    async (outcome, resolved) => {
      const record = vi.fn();
      const observer = new CompanyTimeTriggerObserver(
        { record, now: () => new Date(BOUNDARY) },
        () => resolved,
      );

      expect((await observer.observeClaim(TASK, BOUNDARY)).outcome).toBe(
        outcome,
      );
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('refuses a different task or intended boundary without touching the store', async () => {
    const record = vi.fn();
    const observer = new CompanyTimeTriggerObserver(
      { record, now: () => new Date(BOUNDARY) },
      () => config(),
    );

    expect(
      (await observer.observeClaim({ ...TASK, id: 'another-task' }, BOUNDARY))
        .outcome,
    ).toBe('out_of_scope');
    expect(
      (await observer.observeClaim(TASK, '2026-08-18T14:00:00.000Z')).outcome,
    ).toBe('outside_boundary');
    expect(record).not.toHaveBeenCalled();
  });

  it('contains a store failure and makes it health-visible', async () => {
    const observer = new CompanyTimeTriggerObserver(
      {
        record: vi.fn().mockRejectedValue(new Error('database unavailable')),
        now: () => new Date(BOUNDARY),
      },
      () => config(),
    );

    await expect(observer.observeClaim(TASK, BOUNDARY)).resolves.toEqual({
      outcome: 'failed',
      occurrenceId: null,
      errorCode: 'record_failed',
    });
    await observer.observeClaim({ ...TASK, id: 'another-task' }, BOUNDARY);
    expect(observer.getStatus()).toMatchObject({
      running: false,
      failures: 1,
      lastOutcome: 'out_of_scope',
      lastErrorCode: 'record_failed',
    });
  });
});
