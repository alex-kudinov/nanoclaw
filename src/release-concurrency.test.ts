import { describe, expect, it } from 'vitest';

import {
  assertTaskAdmissionBarrierObserved,
  assertReleaseConcurrencySafe,
  assessReleaseConcurrency,
  taskAdmissionBarrierSupported,
} from './release-concurrency.js';

function health(
  states: Record<string, Record<string, unknown>> = {},
  options: {
    waiting?: string[];
    outgoing?: number;
    runtimeCount?: number;
  } = {},
) {
  const activeCount = Object.values(states).filter(
    (state) => state.active === true,
  ).length;
  return {
    activeContainers: options.runtimeCount ?? activeCount,
    queue: {
      activeCount,
      waitingGroups: options.waiting ?? [],
      groupStates: states,
    },
    channels: {
      slack: {
        diagnostics: { outgoingQueueDepth: options.outgoing ?? 0 },
      },
    },
  };
}

describe('release concurrency gate', () => {
  it('allows active conversational containers that can survive and be adopted', () => {
    const result = assessReleaseConcurrency(
      health({
        sales: {
          active: true,
          containerName: 'nanoclaw-sales-1',
          isTaskContainer: false,
          pendingTaskCount: 0,
        },
        chief: {
          active: true,
          containerName: 'nanoclaw-chief-1',
          isTaskContainer: false,
          pendingTaskCount: 0,
        },
      }),
    );

    expect(result).toMatchObject({
      safeForRestart: true,
      activeContainers: 2,
      adoptableMessageContainers: 2,
      blockingTaskContainers: 0,
      waitingGroups: 0,
      outgoingQueueDepth: 0,
    });
    expect(result.reasons).toEqual([]);
  });

  it('blocks in-process task containers and pending task closures', () => {
    const result = assessReleaseConcurrency(
      health({
        scheduler: {
          active: true,
          containerName: 'nanoclaw-task-1',
          isTaskContainer: true,
          pendingTaskCount: 1,
        },
      }),
    );

    expect(result.safeForRestart).toBe(false);
    expect(result.reasons.map((value) => value.code)).toEqual(
      expect.arrayContaining(['task_container_active', 'pending_task_work']),
    );
  });

  it('blocks waiting work, pending delivery, and queue/runtime disagreement', () => {
    const result = assessReleaseConcurrency({
      ...health({}, { waiting: ['sales'], outgoing: 2, runtimeCount: 1 }),
      queue: {
        activeCount: 2,
        waitingGroups: ['sales'],
        groupStates: {},
      },
    });

    expect(result.safeForRestart).toBe(false);
    expect(result.reasons.map((value) => value.code)).toEqual(
      expect.arrayContaining([
        'waiting_work_present',
        'outgoing_delivery_pending',
        'queue_active_count_mismatch',
        'runtime_active_count_mismatch',
      ]),
    );
  });

  it('fails closed when restart-safety fields are missing', () => {
    expect(() => assertReleaseConcurrencySafe({ queue: {} })).toThrow(
      /release restart concurrency gate failed/,
    );
  });

  it('blocks active host jobs and verifies the live admission barrier', () => {
    const value = {
      ...health(),
      releaseActivation: {
        taskAdmissionPaused: true,
        valid: true,
        expectedCurrentCommit: 'a'.repeat(40),
        activeHostJobs: 1,
      },
    };
    expect(assessReleaseConcurrency(value).reasons).toContainEqual({
      code: 'host_job_active',
      count: 1,
    });
    expect(taskAdmissionBarrierSupported(value)).toBe(true);
    expect(() =>
      assertTaskAdmissionBarrierObserved(value, 'a'.repeat(40)),
    ).toThrow(/barrier was not validly observed/);
    value.releaseActivation.activeHostJobs = 0;
    expect(() =>
      assertTaskAdmissionBarrierObserved(value, 'a'.repeat(40)),
    ).not.toThrow();
  });
});
