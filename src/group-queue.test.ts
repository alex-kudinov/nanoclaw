import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';

import { GroupQueue } from './group-queue.js';

// Mock config to control concurrency limit
vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/nanoclaw-test-data',
  MAX_CONCURRENT_CONTAINERS: 2,
}));

// Mock fs operations used by sendMessage/closeStdin
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
    },
  };
});

describe('GroupQueue', () => {
  let queue: GroupQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new GroupQueue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves thread context only from an active registered source container', async () => {
    let release!: () => void;
    const activeRun = new Promise<void>((resolve) => {
      release = resolve;
    });
    queue.setProcessMessagesFn(async () => {
      queue.registerProcess(
        'slack:SALES||1785230544.590929',
        {} as never,
        'nanoclaw-sales-thread-1',
        'sales',
      );
      await activeRun;
      return true;
    });
    queue.enqueueMessageCheck('slack:SALES', '1785230544.590929');
    await vi.advanceTimersByTimeAsync(0);

    expect(
      queue.resolveContainerContext('sales', 'nanoclaw-sales-thread-1'),
    ).toEqual({
      chatJid: 'slack:SALES',
      threadTs: '1785230544.590929',
    });
    expect(
      queue.resolveContainerContext('sales', 'nanoclaw-sales-other'),
    ).toBeUndefined();
    expect(
      queue.resolveContainerContext('chief', 'nanoclaw-sales-thread-1'),
    ).toBeUndefined();

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      queue.resolveContainerContext('sales', 'nanoclaw-sales-thread-1'),
    ).toBeUndefined();
  });

  // --- Single group at a time ---

  it('only runs one container per group at a time', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const processMessages = vi.fn(async (groupJid: string) => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 100));
      concurrentCount--;
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Enqueue two messages for the same group
    queue.enqueueMessageCheck('group1@g.us');
    queue.enqueueMessageCheck('group1@g.us');

    // Advance timers to let the first process complete
    await vi.advanceTimersByTimeAsync(200);

    // Second enqueue should have been queued, not concurrent
    expect(maxConcurrent).toBe(1);
  });

  // --- Global concurrency limit ---

  it('respects global concurrency limit', async () => {
    let activeCount = 0;
    let maxActive = 0;
    const completionCallbacks: Array<() => void> = [];

    const processMessages = vi.fn(async (groupJid: string) => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise<void>((resolve) => completionCallbacks.push(resolve));
      activeCount--;
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Enqueue 3 groups (limit is 2)
    queue.enqueueMessageCheck('group1@g.us');
    queue.enqueueMessageCheck('group2@g.us');
    queue.enqueueMessageCheck('group3@g.us');

    // Let promises settle
    await vi.advanceTimersByTimeAsync(10);

    // Only 2 should be active (MAX_CONCURRENT_CONTAINERS = 2)
    expect(maxActive).toBe(2);
    expect(activeCount).toBe(2);

    // Complete one — third should start
    completionCallbacks[0]();
    await vi.advanceTimersByTimeAsync(10);

    expect(processMessages).toHaveBeenCalledTimes(3);
  });

  // --- Tasks prioritized over messages ---

  it('drains tasks before messages for same group', async () => {
    const executionOrder: string[] = [];
    let resolveFirst: () => void;

    const processMessages = vi.fn(async (groupJid: string) => {
      if (executionOrder.length === 0) {
        // First call: block until we release it
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      executionOrder.push('messages');
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Start processing messages (takes the active slot)
    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(10);

    // While active, enqueue both a task and pending messages
    const taskFn = vi.fn(async () => {
      executionOrder.push('task');
    });
    queue.enqueueTask('group1@g.us', 'task-1', taskFn);
    queue.enqueueMessageCheck('group1@g.us');

    // Release the first processing
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(10);

    // Task should have run before the second message check
    expect(executionOrder[0]).toBe('messages'); // first call
    expect(executionOrder[1]).toBe('task'); // task runs first in drain
    // Messages would run after task completes
  });

  // --- Retry with backoff on failure ---

  it('retries with exponential backoff on failure', async () => {
    let callCount = 0;

    const processMessages = vi.fn(async () => {
      callCount++;
      return false; // failure
    });

    queue.setProcessMessagesFn(processMessages);
    queue.enqueueMessageCheck('group1@g.us');

    // First call happens immediately
    await vi.advanceTimersByTimeAsync(10);
    expect(callCount).toBe(1);

    // First retry after 5000ms (BASE_RETRY_MS * 2^0)
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(10);
    expect(callCount).toBe(2);

    // Second retry after 10000ms (BASE_RETRY_MS * 2^1)
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10);
    expect(callCount).toBe(3);
  });

  // --- Shutdown prevents new enqueues ---

  it('prevents new enqueues after shutdown', async () => {
    const processMessages = vi.fn(async () => true);
    queue.setProcessMessagesFn(processMessages);

    await queue.shutdown(1000);

    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(100);

    expect(processMessages).not.toHaveBeenCalled();
  });

  // --- Max retries exceeded ---

  it('stops retrying after MAX_RETRIES and resets', async () => {
    let callCount = 0;

    const processMessages = vi.fn(async () => {
      callCount++;
      return false; // always fail
    });

    queue.setProcessMessagesFn(processMessages);
    queue.enqueueMessageCheck('group1@g.us');

    // Run through all 5 retries (MAX_RETRIES = 5)
    // Initial call
    await vi.advanceTimersByTimeAsync(10);
    expect(callCount).toBe(1);

    // Retry 1: 5000ms, Retry 2: 10000ms, Retry 3: 20000ms, Retry 4: 40000ms, Retry 5: 80000ms
    const retryDelays = [5000, 10000, 20000, 40000, 80000];
    for (let i = 0; i < retryDelays.length; i++) {
      await vi.advanceTimersByTimeAsync(retryDelays[i] + 10);
      expect(callCount).toBe(i + 2);
    }

    // After 5 retries (6 total calls), should stop — no more retries
    const countAfterMaxRetries = callCount;
    await vi.advanceTimersByTimeAsync(200000); // Wait a long time
    expect(callCount).toBe(countAfterMaxRetries);
  });

  // --- Waiting groups get drained when slots free up ---

  it('drains waiting groups when active slots free up', async () => {
    const processed: string[] = [];
    const completionCallbacks: Array<() => void> = [];

    const processMessages = vi.fn(async (groupJid: string) => {
      processed.push(groupJid);
      await new Promise<void>((resolve) => completionCallbacks.push(resolve));
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Fill both slots
    queue.enqueueMessageCheck('group1@g.us');
    queue.enqueueMessageCheck('group2@g.us');
    await vi.advanceTimersByTimeAsync(10);

    // Queue a third
    queue.enqueueMessageCheck('group3@g.us');
    await vi.advanceTimersByTimeAsync(10);

    expect(processed).toEqual(['group1@g.us', 'group2@g.us']);

    // Free up a slot
    completionCallbacks[0]();
    await vi.advanceTimersByTimeAsync(10);

    expect(processed).toContain('group3@g.us');
  });

  // --- Idle preemption ---

  it('does NOT preempt active container when not idle', async () => {
    const fs = await import('fs');
    let resolveProcess: () => void;

    const processMessages = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveProcess = resolve;
      });
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Start processing (takes the active slot)
    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(10);

    // Register a process so closeStdin has a groupFolder
    queue.registerProcess(
      'group1@g.us',
      {} as any,
      'container-1',
      'test-group',
    );

    // Enqueue a task while container is active but NOT idle
    const taskFn = vi.fn(async () => {});
    queue.enqueueTask('group1@g.us', 'task-1', taskFn);

    // _close should NOT have been written (container is working, not idle)
    const writeFileSync = vi.mocked(fs.default.writeFileSync);
    const closeWrites = writeFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].endsWith('_close'),
    );
    expect(closeWrites).toHaveLength(0);

    resolveProcess!();
    await vi.advanceTimersByTimeAsync(10);
  });

  it('preempts idle container when task is enqueued', async () => {
    const fs = await import('fs');
    let resolveProcess: () => void;

    const processMessages = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveProcess = resolve;
      });
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Start processing
    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(10);

    // Register process and mark idle
    queue.registerProcess(
      'group1@g.us',
      {} as any,
      'container-1',
      'test-group',
    );
    queue.notifyIdle('group1@g.us');

    // Clear previous writes, then enqueue a task
    const writeFileSync = vi.mocked(fs.default.writeFileSync);
    writeFileSync.mockClear();

    const taskFn = vi.fn(async () => {});
    queue.enqueueTask('group1@g.us', 'task-1', taskFn);

    // _close SHOULD have been written (container is idle)
    const closeWrites = writeFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].endsWith('_close'),
    );
    expect(closeWrites).toHaveLength(1);

    resolveProcess!();
    await vi.advanceTimersByTimeAsync(10);
  });

  it('sendMessage resets idleWaiting so a subsequent task enqueue does not preempt', async () => {
    const fs = await import('fs');
    let resolveProcess: () => void;

    const processMessages = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveProcess = resolve;
      });
      return true;
    });

    queue.setProcessMessagesFn(processMessages);
    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(10);
    queue.registerProcess(
      'group1@g.us',
      {} as any,
      'container-1',
      'test-group',
    );

    // Container becomes idle
    queue.notifyIdle('group1@g.us');

    // A new user message arrives — resets idleWaiting
    queue.sendMessage('group1@g.us', 'hello');

    // Task enqueued after message reset — should NOT preempt (agent is working)
    const writeFileSync = vi.mocked(fs.default.writeFileSync);
    writeFileSync.mockClear();

    const taskFn = vi.fn(async () => {});
    queue.enqueueTask('group1@g.us', 'task-1', taskFn);

    const closeWrites = writeFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].endsWith('_close'),
    );
    expect(closeWrites).toHaveLength(0);

    resolveProcess!();
    await vi.advanceTimersByTimeAsync(10);
  });

  it('sendMessage addresses the piped payload to the target container (prevents cross-session theft)', async () => {
    const fs = await import('fs');
    // adoptContainer marks a container active synchronously (no fake-timer
    // dance), giving sendMessage a live target to pipe into.
    queue.adoptContainer(
      'group1@g.us',
      'nanoclaw-sales-42',
      'sales',
      12345,
      Date.now(),
    );

    const writeFileSync = vi.mocked(fs.default.writeFileSync);
    writeFileSync.mockClear();
    const result = queue.sendMessage('group1@g.us', 'hello');
    expect(result.wrote).toBe(true);

    // The message payload (a .json write, not the _close sentinel) must carry
    // target_container so the agent-runner only lets the owning session drain it.
    const payloadCall = writeFileSync.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].endsWith('.json.tmp') &&
        typeof call[1] === 'string' &&
        call[1].includes('"type":"message"'),
    );
    expect(payloadCall).toBeDefined();
    const payload = JSON.parse(payloadCall![1] as string);
    expect(payload.target_container).toBe('nanoclaw-sales-42');
    expect(payload.chat_cursor_recoverable).toBe(true);
    expect(payload.text).toBe('hello');
  });

  it('carries a grader run id outside the prompt bytes', async () => {
    const fs = await import('fs');
    queue.adoptContainer(
      'group1@g.us',
      'nanoclaw-grader-42',
      'grader',
      12345,
      Date.now(),
    );
    const writeFileSync = vi.mocked(fs.default.writeFileSync);
    writeFileSync.mockClear();

    const result = queue.sendMessage('group1@g.us', 'follow-up', {
      runId: '8f49f42f-105f-4b14-8e68-1846f9a7271b',
    });
    expect(result.wrote).toBe(true);

    const payloadCall = writeFileSync.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].endsWith('.json.tmp') &&
        typeof call[1] === 'string' &&
        call[1].includes('"type":"message"'),
    );
    const payload = JSON.parse(payloadCall![1] as string);
    expect(payload.run_id).toBe('8f49f42f-105f-4b14-8e68-1846f9a7271b');
    expect(payload.text).toBe('follow-up');
  });

  it('does not enroll ephemeral targeted results in chat-cursor rollback', async () => {
    const rollback = vi.fn();
    queue.setRollbackTimestampFn(rollback);
    let writeResult: ReturnType<GroupQueue['sendMessage']> | undefined;
    queue.setProcessMessagesFn(async () => {
      queue.registerProcess(
        'group1@g.us',
        {} as any,
        'nanoclaw-sales-ephemeral',
        'sales',
      );
      writeResult = queue.sendMessage('group1@g.us', 'gmail result', {
        trackForRecovery: false,
      });
      return false;
    });

    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(10);

    expect(writeResult?.wrote).toBe(true);
    const payloadCall = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].endsWith('.json.tmp') &&
          typeof call[1] === 'string' &&
          call[1].includes('gmail result'),
      );
    expect(JSON.parse(payloadCall![1] as string).chat_cursor_recoverable).toBe(
      false,
    );
    expect(rollback).not.toHaveBeenCalled();
    expect(
      queue.getStatus().groupStates['group1@g.us||root']?.pipedMessageCount,
    ).toBe(0);
  });

  it('sendMessage returns false for task containers so user messages queue up', async () => {
    let resolveTask: () => void;

    const taskFn = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveTask = resolve;
      });
    });

    // Start a task (sets isTaskContainer = true)
    queue.enqueueTask('group1@g.us', 'task-1', taskFn);
    await vi.advanceTimersByTimeAsync(10);
    queue.registerProcess(
      'group1@g.us',
      {} as any,
      'container-1',
      'test-group',
    );

    // sendMessage should return wrote: false — user messages must not go to task containers
    const result = queue.sendMessage('group1@g.us', 'hello');
    expect(result.wrote).toBe(false);

    resolveTask!();
    await vi.advanceTimersByTimeAsync(10);
  });

  it('preempts when idle arrives with pending tasks', async () => {
    const fs = await import('fs');
    let resolveProcess: () => void;

    const processMessages = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveProcess = resolve;
      });
      return true;
    });

    queue.setProcessMessagesFn(processMessages);

    // Start processing
    queue.enqueueMessageCheck('group1@g.us');
    await vi.advanceTimersByTimeAsync(10);

    // Register process and enqueue a task (no idle yet — no preemption)
    queue.registerProcess(
      'group1@g.us',
      {} as any,
      'container-1',
      'test-group',
    );

    const writeFileSync = vi.mocked(fs.default.writeFileSync);
    writeFileSync.mockClear();

    const taskFn = vi.fn(async () => {});
    queue.enqueueTask('group1@g.us', 'task-1', taskFn);

    let closeWrites = writeFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].endsWith('_close'),
    );
    expect(closeWrites).toHaveLength(0);

    // Now container becomes idle — should preempt because task is pending
    writeFileSync.mockClear();
    queue.notifyIdle('group1@g.us');

    closeWrites = writeFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].endsWith('_close'),
    );
    expect(closeWrites).toHaveLength(1);

    resolveProcess!();
    await vi.advanceTimersByTimeAsync(10);
  });

  // --- LRU eviction (warm containers yield slots on demand) ---

  it('evicts the longest-idle warm container when a slot is needed', async () => {
    const fs = await import('fs');
    const writeSpy = vi.mocked(fs.default.writeFileSync);
    writeSpy.mockClear();

    const completion: Record<string, () => void> = {};
    const processMessages = vi.fn(async (chatJid: string) => {
      await new Promise<void>((resolve) => {
        completion[chatJid] = resolve;
      });
      return true;
    });
    queue.setProcessMessagesFn(processMessages);

    // Fill both slots (MAX_CONCURRENT_CONTAINERS = 2)
    queue.enqueueMessageCheck('groupA@g.us');
    queue.enqueueMessageCheck('groupB@g.us');
    await vi.advanceTimersByTimeAsync(10);

    // Register container identities (closeStdin targets by name)
    queue.registerProcess(
      'groupA@g.us||root',
      { pid: 111, killed: false, exitCode: null } as never,
      'nanoclaw-a-1',
      'folder-a',
    );
    queue.registerProcess(
      'groupB@g.us||root',
      { pid: 222, killed: false, exitCode: null } as never,
      'nanoclaw-b-1',
      'folder-b',
    );

    // A goes idle first, then B
    queue.notifyIdle('groupA@g.us||root');
    await vi.advanceTimersByTimeAsync(5);
    queue.notifyIdle('groupB@g.us||root');

    // Third group arrives — should park AND evict A (longest idle)
    queue.enqueueMessageCheck('groupC@g.us');
    await vi.advanceTimersByTimeAsync(5);

    const closeWrites = writeSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((f) => f.includes('_close'));
    expect(closeWrites.some((f) => f.includes('_close-nanoclaw-a-1'))).toBe(
      true,
    );
    expect(closeWrites.some((f) => f.includes('_close-nanoclaw-b-1'))).toBe(
      false,
    );
    expect(queue.getStatus().waitingGroups).toContain('groupC@g.us||root');

    // Victim exits -> slot frees -> C runs
    completion['groupA@g.us']();
    await vi.advanceTimersByTimeAsync(10);
    expect(processMessages).toHaveBeenCalledTimes(3);
  });

  it('never evicts a busy container', async () => {
    const fs = await import('fs');
    const writeSpy = vi.mocked(fs.default.writeFileSync);
    writeSpy.mockClear();

    const processMessages = vi.fn(async () => {
      await new Promise<void>(() => undefined); // never completes
      return true;
    });
    queue.setProcessMessagesFn(processMessages);

    queue.enqueueMessageCheck('groupA@g.us');
    queue.enqueueMessageCheck('groupB@g.us');
    await vi.advanceTimersByTimeAsync(10);
    // Neither goes idle. Third group must park without any _close write.
    queue.enqueueMessageCheck('groupC@g.us');
    await vi.advanceTimersByTimeAsync(5);

    const closeWrites = writeSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((f) => f.includes('_close'));
    expect(closeWrites).toHaveLength(0);
    expect(queue.getStatus().waitingGroups).toContain('groupC@g.us||root');
  });

  // --- Adoption accounting ---

  it('adoptContainer claims a slot and finalizeAdopted releases it', () => {
    queue.adoptContainer(
      'chat@g.us||1234.5678',
      'nanoclaw-grader-99',
      'grader',
      4242,
      Date.now() - 60_000,
    );
    let status = queue.getStatus();
    expect(status.activeCount).toBe(1);
    expect(status.groupStates['chat@g.us||1234.5678'].active).toBe(true);
    expect(status.groupStates['chat@g.us||1234.5678'].containerName).toBe(
      'nanoclaw-grader-99',
    );

    queue.finalizeAdopted('chat@g.us||1234.5678');
    status = queue.getStatus();
    expect(status.activeCount).toBe(0);
    expect(status.groupStates['chat@g.us||1234.5678'].active).toBe(false);
  });

  it('finalizeAdopted is a no-op for non-adopted groups', () => {
    queue.finalizeAdopted('never-adopted@g.us||root');
    expect(queue.getStatus().activeCount).toBe(0);
  });
});
