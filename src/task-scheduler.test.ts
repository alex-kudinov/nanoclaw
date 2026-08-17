import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./container-runner.js', async () => {
  const actual = await vi.importActual<typeof import('./container-runner.js')>(
    './container-runner.js',
  );
  return {
    ...actual,
    runContainerAgent: vi.fn(),
    writeTasksSnapshot: vi.fn(),
  };
});

import { _initTestDatabase, createTask, getTaskById } from './db.js';
import { runContainerAgent } from './container-runner.js';
import { _resetProcurementTaskRunsForTests } from './procurement-task-run.js';
import {
  _resetSchedulerLoopForTests,
  startSchedulerLoop,
} from './task-scheduler.js';

describe('task scheduler', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
    _resetProcurementTaskRunsForTests();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses due tasks with invalid group folders to prevent retry churn', async () => {
    createTask({
      id: 'task-invalid-folder',
      group_folder: '../../outside',
      chat_jid: 'bad@g.us',
      prompt: 'run',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    const enqueueTask = vi.fn(
      (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );

    startSchedulerLoop({
      registeredGroups: () => ({}),
      getSessions: () => ({}),
      queue: { enqueueTask } as any,
      onProcess: () => {},
      sendMessage: async () => {},
      validateTaskCompletion: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);

    const task = getTaskById('task-invalid-folder');
    expect(task?.status).toBe('paused');
  });

  it('claims one-time tasks before a slow container can be queued again', async () => {
    createTask({
      id: 'task-once-slow',
      group_folder: 'procurement',
      chat_jid: 'procurement@example.test',
      prompt: 'run once',
      schedule_type: 'once',
      schedule_value: '',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-08-09T00:00:00.000Z',
    });

    let finishContainer!: (value: {
      status: 'success';
      result: string;
    }) => void;
    vi.mocked(runContainerAgent).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishContainer = resolve;
        }),
    );
    const enqueueTask = vi.fn(
      (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );

    startSchedulerLoop({
      registeredGroups: () => ({
        procurement: {
          name: 'Procurement',
          folder: 'procurement',
          trigger: '',
          added_at: '2026-08-09T00:00:00.000Z',
        },
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask,
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage: async () => {},
      validateTaskCompletion: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(getTaskById('task-once-slow')?.next_run).toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(enqueueTask).toHaveBeenCalledTimes(1);

    finishContainer({ status: 'success', result: 'done' });
    await vi.advanceTimersByTimeAsync(10);
    expect(getTaskById('task-once-slow')?.status).toBe('completed');
  });

  it('observes the exact pre-claim boundary without letting observer failure block the task', async () => {
    const scheduledFor = new Date(Date.now() - 60_000).toISOString();
    createTask({
      id: 'task-trigger-observer',
      group_folder: 'sales',
      chat_jid: 'sales@example.test',
      prompt: 'ordinary scheduled work',
      schedule_type: 'once',
      schedule_value: scheduledFor,
      context_mode: 'isolated',
      next_run: scheduledFor,
      status: 'active',
      created_at: '2026-08-17T00:00:00.000Z',
    });
    vi.mocked(runContainerAgent).mockResolvedValue({
      status: 'success',
      result: 'done',
    });
    const observeScheduledTaskClaim = vi
      .fn()
      .mockRejectedValue(new Error('observer unavailable'));

    startSchedulerLoop({
      registeredGroups: () => ({
        sales: {
          name: 'Sales',
          folder: 'sales',
          trigger: '',
          added_at: '2026-08-17T00:00:00.000Z',
        },
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask: (
          _groupJid: string,
          _taskId: string,
          fn: () => Promise<void>,
        ) => void fn(),
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage: async () => {},
      validateTaskCompletion: async () => {},
      observeScheduledTaskClaim,
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(observeScheduledTaskClaim).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-trigger-observer' }),
      scheduledFor,
    );
    expect(runContainerAgent).toHaveBeenCalledOnce();
    expect(getTaskById('task-trigger-observer')?.status).toBe('completed');
  });

  it('resets the close window after each asynchronous continuation turn', async () => {
    createTask({
      id: 'task-followup-daily',
      group_folder: 'sales',
      chat_jid: 'slack:SALES',
      prompt: 'Daily follow-up check.',
      schedule_type: 'cron',
      schedule_value: '0 9 * * 1-5',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-08-11T00:00:00.000Z',
    });

    let emitOutput!: (output: {
      status: 'success';
      result: string;
    }) => Promise<void>;
    let finishContainer!: (value: {
      status: 'success';
      result: string;
    }) => void;
    vi.mocked(runContainerAgent).mockImplementation(
      (_group, _input, _onProcess, onOutput) =>
        new Promise((resolve) => {
          emitOutput = onOutput!;
          finishContainer = resolve;
        }),
    );
    const closeStdin = vi.fn();
    startSchedulerLoop({
      registeredGroups: () => ({
        sales: {
          name: 'Sales',
          folder: 'sales',
          trigger: '',
          added_at: '2026-08-11T00:00:00.000Z',
        },
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask: (
          _groupJid: string,
          _taskId: string,
          fn: () => Promise<void>,
        ) => void fn(),
        closeStdin,
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage: async () => {},
      validateTaskCompletion: async () => {},
    });
    await vi.advanceTimersByTimeAsync(10);

    await emitOutput({ status: 'success', result: 'Waiting for Gmail.' });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(closeStdin).not.toHaveBeenCalled();

    await emitOutput({ status: 'success', result: 'Drafts posted.' });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(closeStdin).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(closeStdin).toHaveBeenCalledOnce();

    finishContainer({ status: 'success', result: 'Drafts posted.' });
    await vi.advanceTimersByTimeAsync(10);
  });

  it('records and reports a host completion-receipt rejection as task error', async () => {
    createTask({
      id: 'task-receipt-missing',
      group_folder: 'procurement',
      chat_jid: 'procurement@example.test',
      prompt: 'rescan caleprocure',
      schedule_type: 'once',
      schedule_value: '',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-08-09T00:00:00.000Z',
    });
    vi.mocked(runContainerAgent).mockResolvedValue({
      status: 'success',
      result: 'model says complete',
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const validateTaskCompletion = vi
      .fn()
      .mockRejectedValue(new Error('missing host receipt'));

    startSchedulerLoop({
      registeredGroups: () => ({
        procurement: {
          name: 'Procurement',
          folder: 'procurement',
          trigger: '',
          added_at: '2026-08-09T00:00:00.000Z',
        },
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask: (
          _groupJid: string,
          _taskId: string,
          fn: () => Promise<void>,
        ) => void fn(),
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage,
      validateTaskCompletion,
    });

    await vi.advanceTimersByTimeAsync(20);

    const completed = getTaskById('task-receipt-missing');
    expect(completed?.status).toBe('completed');
    expect(completed?.last_result).toBe('Error: missing host receipt');
    expect(sendMessage).toHaveBeenCalledWith(
      'procurement@example.test',
      '[SCHEDULED TASK NOT COMPLETE] missing host receipt',
      { fromGroup: 'procurement' },
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      'procurement@example.test',
      'model says complete',
      expect.anything(),
    );
  });

  it('delivers receipt-required final text exactly once after validation', async () => {
    createTask({
      id: 'task-receipt-complete',
      group_folder: 'procurement',
      chat_jid: 'procurement@example.test',
      prompt: 'rescan caleprocure',
      schedule_type: 'once',
      schedule_value: '',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-08-09T00:00:00.000Z',
    });
    vi.mocked(runContainerAgent).mockResolvedValue({
      status: 'success',
      result: 'validated scan complete',
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const validateTaskCompletion = vi.fn().mockResolvedValue(undefined);

    startSchedulerLoop({
      registeredGroups: () => ({
        procurement: {
          name: 'Procurement',
          folder: 'procurement',
          trigger: '',
          added_at: '2026-08-09T00:00:00.000Z',
        },
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask: (
          _groupJid: string,
          _taskId: string,
          fn: () => Promise<void>,
        ) => void fn(),
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage,
      validateTaskCompletion,
    });

    await vi.advanceTimersByTimeAsync(20);

    expect(validateTaskCompletion).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      'procurement@example.test',
      'validated scan complete',
      { fromGroup: 'procurement' },
    );
    expect(validateTaskCompletion.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[0],
    );
  });

  it('keeps a deferred queue entry singular until its callback claims the task', async () => {
    createTask({
      id: 'task-once-deferred',
      group_folder: 'procurement',
      chat_jid: 'procurement@example.test',
      prompt: 'run once',
      schedule_type: 'once',
      schedule_value: '',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-08-09T00:00:00.000Z',
    });
    vi.mocked(runContainerAgent).mockResolvedValue({
      status: 'success',
      result: 'done',
    });
    let deferred: (() => Promise<void>) | undefined;
    let accepted = 0;
    const pendingIds = new Set<string>();

    startSchedulerLoop({
      registeredGroups: () => ({
        procurement: {
          name: 'Procurement',
          folder: 'procurement',
          trigger: '',
          added_at: '2026-08-09T00:00:00.000Z',
        },
      }),
      getSessions: () => ({}),
      queue: {
        enqueueTask: (
          _groupJid: string,
          taskId: string,
          fn: () => Promise<void>,
        ) => {
          if (pendingIds.has(taskId)) return;
          pendingIds.add(taskId);
          accepted += 1;
          deferred = fn;
        },
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage: async () => {},
      validateTaskCompletion: async () => {},
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(accepted).toBe(1);
    expect(runContainerAgent).not.toHaveBeenCalled();

    await deferred?.();
    expect(runContainerAgent).toHaveBeenCalledTimes(1);
    expect(getTaskById('task-once-deferred')?.status).toBe('completed');
  });

  it('fails loud instead of rerunning a claimed one-time task after restart', async () => {
    createTask({
      id: 'task-once-orphaned',
      group_folder: 'procurement',
      chat_jid: 'procurement@example.test',
      prompt: 'rescan caleprocure',
      schedule_type: 'once',
      schedule_value: '',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2026-08-09T00:00:00.000Z',
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    startSchedulerLoop({
      registeredGroups: () => ({}),
      getSessions: () => ({}),
      queue: { enqueueTask: vi.fn() } as any,
      onProcess: () => {},
      sendMessage,
      validateTaskCompletion: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);

    const orphaned = getTaskById('task-once-orphaned');
    expect(orphaned?.status).toBe('error');
    expect(orphaned?.last_result).toContain('claimed but never completed');
    expect(runContainerAgent).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      'procurement@example.test',
      expect.stringContaining('was claimed but never completed'),
      { fromGroup: 'procurement' },
    );
  });
});
