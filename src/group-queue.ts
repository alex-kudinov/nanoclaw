import { ChildProcess, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

import { recordFailure, getCircuitStatus } from './circuit-breaker.js';
import {
  DATA_DIR,
  LIVENESS_CHECK_INTERVAL_MS,
  MAX_CONCURRENT_CONTAINERS,
  STALE_OUTPUT_THRESHOLD_MS,
} from './config.js';
import { stopContainer } from './container-runtime.js';
import { logger } from './logger.js';

interface QueuedTask {
  id: string;
  groupJid: string;
  fn: () => Promise<void>;
}

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5000;
const STOP_CONTAINER_TIMEOUT_MS = 5_000;

export type MessageId = string;

export interface PipedMessageRecord {
  messageId: MessageId;
  text: string;
  timestampMs: number;
  ipcPath: string;
}

export interface PipedWriteResult {
  wrote: boolean;
  messageId?: MessageId;
  ipcPath?: string;
  timestampMs?: number;
}

export interface GroupStatusEntry {
  active: boolean;
  containerName: string | null;
  containerAgeSec: number;
  idleWaiting: boolean;
  pendingMessages: boolean;
  pendingTaskCount: number;
  pipedMessageCount: number;
  isTaskContainer: boolean;
  retryCount: number;
}

export interface QueueStatus {
  activeCount: number;
  maxConcurrent: number;
  waitingGroups: string[];
  groupStates: Record<string, GroupStatusEntry>;
  error?: string;
}

export interface CleanupOpts {
  reason: string;
}

interface GroupState {
  active: boolean;
  idleWaiting: boolean;
  isTaskContainer: boolean;
  pendingMessages: boolean;
  pendingTasks: QueuedTask[];
  process: ChildProcess | null;
  containerName: string | null;
  groupFolder: string | null;
  retryCount: number;
  pipedMessages: Map<MessageId, PipedMessageRecord>;
  resetIdleTimer?: () => void;
  activeSinceMs?: number;
  deadLetterProcessed?: boolean;
  lastOutputAt?: number;
}

export class GroupQueue {
  private groups = new Map<string, GroupState>();
  private activeCount = 0;
  private waitingGroups: string[] = [];
  private processMessagesFn:
    | ((chatJid: string, threadTs?: string) => Promise<boolean>)
    | null = null;
  private rollbackTimestampFn:
    | ((groupJid: string, isoTimestamp: string) => void)
    | null = null;
  private shuttingDown = false;
  private livenessInterval: ReturnType<typeof setInterval> | null = null;

  private getGroup(groupJid: string): GroupState {
    let state = this.groups.get(groupJid);
    if (!state) {
      state = {
        active: false,
        idleWaiting: false,
        isTaskContainer: false,
        pendingMessages: false,
        pendingTasks: [],
        process: null,
        containerName: null,
        groupFolder: null,
        retryCount: 0,
        pipedMessages: new Map(),
      };
      this.groups.set(groupJid, state);
    }
    return state;
  }

  setProcessMessagesFn(
    fn: (chatJid: string, threadTs?: string) => Promise<boolean>,
  ): void {
    this.processMessagesFn = fn;
  }

  setRollbackTimestampFn(
    fn: (groupJid: string, isoTimestamp: string) => void,
  ): void {
    this.rollbackTimestampFn = fn;
  }

  /**
   * Update the idle-timer reset callback for a group. The callback lives
   * inside processGroupMessages closure and is registered before runAgent
   * is called. Used by sendMessage to keep the container alive when new
   * piped messages arrive during the idle countdown.
   */
  setResetIdleTimer(groupJid: string, fn: () => void): void {
    const state = this.getGroup(groupJid);
    state.resetIdleTimer = fn;
  }

  /**
   * Update the lastOutputAt timestamp for a group. Called by streaming
   * output callbacks (container-runner stdout, ipc watcher) so the
   * liveness checker can detect frozen containers (PID alive, VM silent).
   */
  setLastOutputAt(groupJid: string): void {
    const state = this.groups.get(groupJid);
    if (!state) return;
    state.lastOutputAt = Date.now();
  }

  /**
   * Find the group by containerName and update lastOutputAt. Used from
   * ipc.ts which only knows the groupFolder, not the composite key.
   */
  setLastOutputAtByFolder(groupFolder: string): void {
    for (const [, state] of this.groups) {
      if (state.active && state.groupFolder === groupFolder) {
        state.lastOutputAt = Date.now();
      }
    }
  }

  /**
   * Enqueue a message check for a (chatJid, threadTs) pair.
   * Internal key: `${chatJid}||${threadTs || 'root'}`.
   */
  enqueueMessageCheck(chatJid: string, threadTs?: string): void {
    const groupJid = `${chatJid}||${threadTs || 'root'}`;
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    if (state.active) {
      state.pendingMessages = true;
      logger.debug({ groupJid }, 'Container active, message queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingMessages = true;
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.info(
        {
          event: 'container.lifecycle.starvation',
          groupJid,
          activeCount: this.activeCount,
          maxConcurrent: MAX_CONCURRENT_CONTAINERS,
          waitingGroupCount: this.waitingGroups.length,
        },
        'At concurrency limit, message queued',
      );
      return;
    }

    this.runForGroup(groupJid, 'messages').catch((err) =>
      logger.error({ groupJid, err }, 'Unhandled error in runForGroup'),
    );
  }

  /**
   * Enqueue a (chatJid, threadTs) pair for processing without competing
   * for an immediate spawn slot. The group is parked in waitingGroups and
   * processed by drainWaiting() once a slot frees up. Used by startup
   * recovery (T08) to reserve slots for new incoming traffic.
   */
  deferMessageCheck(chatJid: string, threadTs?: string): void {
    const groupJid = `${chatJid}||${threadTs || 'root'}`;
    if (this.shuttingDown) return;
    const state = this.getGroup(groupJid);
    if (state.active) {
      state.pendingMessages = true;
      return;
    }
    state.pendingMessages = true;
    if (!this.waitingGroups.includes(groupJid)) {
      this.waitingGroups.push(groupJid);
    }
  }

  enqueueTask(groupJid: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Prevent double-queuing of the same task
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      logger.debug({ groupJid, taskId }, 'Task already queued, skipping');
      return;
    }

    if (state.active) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (state.idleWaiting) {
        this.closeStdin(groupJid);
      }
      logger.debug({ groupJid, taskId }, 'Container active, task queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.info(
        {
          event: 'container.lifecycle.starvation',
          groupJid,
          taskId,
          activeCount: this.activeCount,
          maxConcurrent: MAX_CONCURRENT_CONTAINERS,
          waitingGroupCount: this.waitingGroups.length,
        },
        'At concurrency limit, task queued',
      );
      return;
    }

    // Run immediately
    this.runTask(groupJid, { id: taskId, groupJid, fn }).catch((err) =>
      logger.error({ groupJid, taskId, err }, 'Unhandled error in runTask'),
    );
  }

  registerProcess(
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder?: string,
  ): void {
    const state = this.getGroup(groupJid);
    state.process = proc;
    state.containerName = containerName;
    if (groupFolder) state.groupFolder = groupFolder;
  }

  /**
   * Mark the container as idle-waiting (finished work, waiting for IPC input).
   * If tasks are pending, preempt the idle container immediately.
   */
  notifyIdle(groupJid: string): void {
    const state = this.getGroup(groupJid);
    state.idleWaiting = true;
    if (state.pendingTasks.length > 0) {
      this.closeStdin(groupJid);
    }
  }

  /**
   * Send a follow-up message to the active container via IPC file.
   * Returns a PipedWriteResult with tracking metadata on success, or
   * { wrote: false } if no active container or the write failed.
   *
   * NOTE: The return value is ALWAYS a PipedWriteResult object — callers
   * MUST branch on `result.wrote`, NOT on the object itself (any object
   * is truthy). This is a contract guarded by the TypeScript return type.
   */
  sendMessage(groupJid: string, text: string): PipedWriteResult {
    const state = this.getGroup(groupJid);
    if (!state.active || !state.groupFolder || state.isTaskContainer)
      return { wrote: false };
    state.idleWaiting = false; // Agent is about to receive work, no longer idle

    const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      const timestampMs = Date.now();
      const messageId = `${new Date(timestampMs)
        .toISOString()
        .replace(/[:.]/g, '-')}__${Math.random().toString(36).slice(2, 6)}`;
      const filename = `${messageId}.json`;
      const filepath = path.join(inputDir, filename);
      const tempPath = `${filepath}.tmp`;
      const payload = JSON.stringify({
        type: 'message',
        message_id: messageId,
        timestamp_ms: timestampMs,
        text,
      });
      fs.writeFileSync(tempPath, payload);
      fs.renameSync(tempPath, filepath);

      // Track for dead-letter recovery
      state.pipedMessages.set(messageId, {
        messageId,
        text,
        timestampMs,
        ipcPath: filepath,
      });

      // Reset idle timer so the container isn't closed while processing
      // freshly piped work. Wrap in try/catch: if the callback throws
      // (e.g., closure already disposed) we log and clear the reference
      // but do NOT fail the write — liveness check will catch container death.
      try {
        state.resetIdleTimer?.();
      } catch (err) {
        logger.warn(
          { groupJid, err },
          'resetIdleTimer callback threw — clearing reference',
        );
        state.resetIdleTimer = undefined;
      }

      logger.info(
        {
          event: 'container.lifecycle.pipe',
          groupJid,
          containerName: state.containerName,
          ipcPath: filepath,
          messageId,
          messageLength: text.length,
        },
        'Piped message to active container',
      );

      // Defense-in-depth: detect "wrote to ghost container" where the IPC
      // write succeeded but the ChildProcess is already dead. The liveness
      // checker on its next tick will perform full cleanup and dead-letter
      // recovery — this log surfaces it sooner for operators.
      const pid = state.process?.pid;
      if (pid != null) {
        try {
          process.kill(pid, 0);
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'ESRCH') {
            logger.warn(
              {
                event: 'container.lifecycle.pipe_suspect',
                groupJid,
                containerName: state.containerName,
                pid,
                messageId,
              },
              'Pipe succeeded but ChildProcess is dead — liveness will recover',
            );
          } else {
            logger.debug(
              { groupJid, pid, code },
              'pipe_suspect PID probe non-ESRCH error (treating as alive)',
            );
          }
        }
      }

      return { wrote: true, messageId, ipcPath: filepath, timestampMs };
    } catch (err) {
      logger.warn({ groupJid, err }, 'Failed to write piped message IPC file');
      return { wrote: false };
    }
  }

  /**
   * Remove a piped message from tracking after the agent-runner acked it.
   * Called by ipc.ts when an ack file is processed.
   */
  acknowledgePipedMessage(groupFolder: string, messageId: MessageId): void {
    for (const [, state] of this.groups) {
      if (
        state.groupFolder === groupFolder &&
        state.pipedMessages.has(messageId)
      ) {
        state.pipedMessages.delete(messageId);
        logger.debug(
          {
            event: 'container.lifecycle.pipe_ack',
            groupFolder,
            messageId,
            remaining: state.pipedMessages.size,
          },
          'Piped message acknowledged',
        );
        return;
      }
    }
  }

  /**
   * Signal the active container to wind down by writing a close sentinel.
   */
  closeStdin(groupJid: string): void {
    const state = this.getGroup(groupJid);
    if (!state.active || !state.groupFolder) return;

    const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, '_close'), '');
    } catch {
      // ignore
    }
  }

  private async runForGroup(
    groupJid: string,
    reason: 'messages' | 'drain',
  ): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.idleWaiting = false;
    state.isTaskContainer = false;
    state.pendingMessages = false;
    state.activeSinceMs = Date.now();
    state.lastOutputAt = Date.now();
    state.deadLetterProcessed = false;
    this.activeCount++;

    // Decompose composite key: chatJid||threadTs
    const [chatJid, rawThreadTs] = groupJid.split('||');
    const threadTs = rawThreadTs === 'root' ? undefined : rawThreadTs;

    logger.debug(
      { groupJid, chatJid, threadTs, reason, activeCount: this.activeCount },
      'Starting container for group',
    );

    let runSucceeded = false;
    try {
      if (this.processMessagesFn) {
        const success = await this.processMessagesFn(chatJid, threadTs);
        if (success) {
          state.retryCount = 0;
          runSucceeded = true;
        } else {
          this.scheduleRetry(groupJid, state);
        }
      }
    } catch (err) {
      logger.error({ groupJid, err }, 'Error processing messages for group');
      this.scheduleRetry(groupJid, state);
    } finally {
      // Dead-letter recovery for any piped messages the container didn't ack.
      // Only trigger on failure — successful completion means the agent-runner
      // should have acked everything it pulled from the IPC input dir.
      const exitedNonZero =
        !runSucceeded ||
        (state.process != null &&
          state.process.exitCode !== null &&
          state.process.exitCode !== 0) ||
        (state.process != null && state.process.signalCode != null);
      if (exitedNonZero && state.pipedMessages.size > 0) {
        this.processPipedMessageRecovery(groupJid, state, 'run_exit');
      }

      if (state.active) {
        state.active = false;
        this.activeCount--;
      }
      state.process = null;
      state.containerName = null;
      state.groupFolder = null;
      state.resetIdleTimer = undefined;
      state.activeSinceMs = undefined;
      state.lastOutputAt = undefined;
      this.drainGroup(groupJid);
    }
  }

  private async runTask(groupJid: string, task: QueuedTask): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.idleWaiting = false;
    state.isTaskContainer = true;
    state.activeSinceMs = Date.now();
    state.lastOutputAt = Date.now();
    this.activeCount++;

    logger.debug(
      { groupJid, taskId: task.id, activeCount: this.activeCount },
      'Running queued task',
    );

    try {
      await task.fn();
    } catch (err) {
      logger.error({ groupJid, taskId: task.id, err }, 'Error running task');
    } finally {
      if (state.active) {
        state.active = false;
        this.activeCount--;
      }
      state.isTaskContainer = false;
      state.process = null;
      state.containerName = null;
      state.groupFolder = null;
      state.resetIdleTimer = undefined;
      state.activeSinceMs = undefined;
      state.lastOutputAt = undefined;
      this.drainGroup(groupJid);
    }
  }

  private scheduleRetry(groupJid: string, state: GroupState): void {
    state.retryCount++;
    if (state.retryCount > MAX_RETRIES) {
      logger.error(
        { groupJid, retryCount: state.retryCount },
        'Max retries exceeded, dropping messages (will retry on next incoming message)',
      );
      state.retryCount = 0;
      return;
    }

    const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
    logger.info(
      { groupJid, retryCount: state.retryCount, delayMs },
      'Scheduling retry with backoff',
    );
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.enqueueMessageCheck(groupJid);
      }
    }, delayMs);
  }

  private drainGroup(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Tasks first (they won't be re-discovered from SQLite like messages)
    if (state.pendingTasks.length > 0) {
      const task = state.pendingTasks.shift()!;
      this.runTask(groupJid, task).catch((err) =>
        logger.error(
          { groupJid, taskId: task.id, err },
          'Unhandled error in runTask (drain)',
        ),
      );
      return;
    }

    // Then pending messages
    if (state.pendingMessages) {
      this.runForGroup(groupJid, 'drain').catch((err) =>
        logger.error(
          { groupJid, err },
          'Unhandled error in runForGroup (drain)',
        ),
      );
      return;
    }

    // Nothing pending for this group; check if other groups are waiting for a slot
    this.drainWaiting();
  }

  private drainWaiting(): void {
    while (
      this.waitingGroups.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextJid = this.waitingGroups.shift()!;
      const state = this.getGroup(nextJid);

      // Prioritize tasks over messages
      if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextJid, task).catch((err) =>
          logger.error(
            { groupJid: nextJid, taskId: task.id, err },
            'Unhandled error in runTask (waiting)',
          ),
        );
      } else if (state.pendingMessages) {
        this.runForGroup(nextJid, 'drain').catch((err) =>
          logger.error(
            { groupJid: nextJid, err },
            'Unhandled error in runForGroup (waiting)',
          ),
        );
      }
      // If neither pending, skip this group
    }
  }

  /**
   * Start the periodic liveness checker. Call AFTER all callbacks
   * (processMessagesFn, rollbackTimestampFn, cooldown expiry) are registered
   * so failure paths triggered by the checker have their dependencies wired.
   */
  startLivenessChecker(): void {
    if (this.livenessInterval) return;
    if (LIVENESS_CHECK_INTERVAL_MS <= 0) {
      logger.warn(
        { interval: LIVENESS_CHECK_INTERVAL_MS },
        'LIVENESS_CHECK_INTERVAL_MS <= 0, skipping liveness checker',
      );
      return;
    }
    this.livenessInterval = setInterval(() => {
      try {
        this.checkLiveness();
      } catch (err) {
        logger.error({ err }, 'Liveness checker tick failed');
      }
    }, LIVENESS_CHECK_INTERVAL_MS);
    logger.info(
      { intervalMs: LIVENESS_CHECK_INTERVAL_MS },
      'Liveness checker started',
    );
  }

  stopLivenessChecker(): void {
    if (this.livenessInterval) {
      clearInterval(this.livenessInterval);
      this.livenessInterval = null;
    }
  }

  private checkLiveness(): void {
    if (this.shuttingDown) return;
    const now = Date.now();
    for (const [groupJid, state] of this.groups) {
      if (!state.active || !state.process) continue;

      // Primary check: PID liveness (catches normal death, OOM, crash)
      const pid = state.process.pid;
      if (pid != null) {
        try {
          process.kill(pid, 0);
          // Alive — fall through to secondary checks
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'ESRCH') {
            logger.error(
              {
                event: 'container.lifecycle.liveness_fail',
                groupJid,
                containerName: state.containerName,
                pid,
              },
              'Container process is dead, forcing cleanup',
            );
            this.forceCleanupByGroupKey(groupJid, { reason: 'liveness_fail' });
            continue;
          }
          // EPERM or other non-ESRCH errors: treat as alive, log at debug
          logger.debug(
            { groupJid, pid, code },
            'Liveness PID probe returned non-ESRCH error (treating as alive)',
          );
        }
      }

      // Secondary check: exitCode !== null means the process already exited
      if (state.process.exitCode !== null) {
        logger.error(
          {
            event: 'container.lifecycle.liveness_fail',
            groupJid,
            containerName: state.containerName,
            pid,
            exitCode: state.process.exitCode,
          },
          'Container process exitCode is set, forcing cleanup',
        );
        this.forceCleanupByGroupKey(groupJid, { reason: 'liveness_fail' });
        continue;
      }

      // Tertiary check: frozen container (XPC freeze) — PID alive but VM silent.
      // Set STALE_OUTPUT_THRESHOLD_MS=0 (or negative) to disable this check
      // entirely while still keeping PID-based liveness detection active.
      if (
        STALE_OUTPUT_THRESHOLD_MS > 0 &&
        state.lastOutputAt != null &&
        now - state.lastOutputAt > STALE_OUTPUT_THRESHOLD_MS
      ) {
        logger.error(
          {
            event: 'container.lifecycle.frozen_container',
            groupJid,
            containerName: state.containerName,
            pid,
            silentFor: now - state.lastOutputAt,
          },
          'Container appears frozen (no IPC output), forcing cleanup',
        );
        this.forceCleanupByGroupKey(groupJid, { reason: 'frozen_container' });
        continue;
      }
    }
  }

  /**
   * Shared cleanup path invoked by the liveness checker and watchdog kill
   * signal handler. Best-effort stops the container, kills the PID,
   * processes dead-letter recovery for any unacked piped messages, and
   * resets all GroupState fields.
   */
  forceCleanupByGroupKey(groupJid: string, opts: CleanupOpts): void {
    const state = this.groups.get(groupJid);
    if (!state) return;

    const containerName = state.containerName;
    const groupFolder = state.groupFolder;

    logger.warn(
      {
        event: 'container.lifecycle.force_cleanup',
        groupJid,
        containerName,
        groupFolder,
        reason: opts.reason,
      },
      'Forcing cleanup of group',
    );

    // Best-effort stop the container (host-side)
    if (containerName) {
      try {
        exec(
          stopContainer(containerName),
          { timeout: STOP_CONTAINER_TIMEOUT_MS },
          (err) => {
            if (err) {
              logger.debug(
                { groupJid, containerName, err: err.message },
                'stopContainer during forceCleanup returned error',
              );
            }
          },
        );
      } catch (err) {
        logger.debug(
          { groupJid, containerName, err },
          'stopContainer during forceCleanup threw',
        );
      }
    }

    // Best-effort kill the host PID
    const proc = state.process;
    if (proc) {
      try {
        proc.kill('SIGKILL');
      } catch (err) {
        logger.debug(
          { groupJid, err },
          'SIGKILL during forceCleanup threw (PID likely gone)',
        );
      }
    }

    // Dead-letter recovery for unacked piped messages
    if (state.pipedMessages.size > 0) {
      this.processPipedMessageRecovery(groupJid, state, opts.reason);
    }

    // Record failure in circuit breaker
    if (groupFolder) {
      try {
        recordFailure(groupFolder);
      } catch (err) {
        logger.error({ groupJid, groupFolder, err }, 'recordFailure threw');
      }
    }

    // Reset all state fields
    if (state.active) {
      state.active = false;
      this.activeCount--;
    }
    state.idleWaiting = false;
    state.isTaskContainer = false;
    state.process = null;
    state.containerName = null;
    state.groupFolder = null;
    state.resetIdleTimer = undefined;
    state.activeSinceMs = undefined;
    state.lastOutputAt = undefined;
    state.retryCount = 0;

    this.drainGroup(groupJid);
  }

  /**
   * Find the group whose container matches the given name and force-clean it.
   * Used by the watchdog kill signal handler which only knows containerName.
   * If no match is found, best-effort stop the orphaned container.
   */
  forceCleanupByContainerName(containerName: string, opts: CleanupOpts): void {
    for (const [groupJid, state] of this.groups) {
      if (state.containerName === containerName) {
        this.forceCleanupByGroupKey(groupJid, opts);
        return;
      }
    }
    // Stale signal — no matching group. Best-effort clean the orphan.
    logger.info(
      {
        event: 'container.lifecycle.orphan_kill',
        containerName,
        reason: opts.reason,
      },
      'Watchdog kill signal has no matching group, stopping orphan container',
    );
    try {
      exec(
        stopContainer(containerName),
        { timeout: STOP_CONTAINER_TIMEOUT_MS },
        () => undefined,
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Re-enqueue unacked piped messages as pending work and roll back the
   * lastAgentTimestamp cursor to the earliest unacked message so the next
   * DB re-query picks them up. Idempotent via deadLetterProcessed flag.
   */
  private processPipedMessageRecovery(
    groupJid: string,
    state: GroupState,
    reason: string,
  ): void {
    if (state.deadLetterProcessed === true) {
      logger.debug(
        { groupJid, reason },
        'Dead-letter already processed for this container, skipping',
      );
      return;
    }
    if (state.deadLetterProcessed === undefined) {
      logger.debug(
        { groupJid, reason },
        'deadLetterProcessed undefined at recovery time — state may be reset mid-flight',
      );
    }

    const now = Date.now();
    try {
      // Find the earliest unacked message by timestampMs
      let earliestMs: number | null = null;
      for (const record of state.pipedMessages.values()) {
        if (record.timestampMs < 0) {
          logger.error(
            {
              groupJid,
              messageId: record.messageId,
              timestampMs: record.timestampMs,
            },
            'Piped message has invalid timestamp, skipping in rollback',
          );
          continue;
        }
        if (earliestMs == null || record.timestampMs < earliestMs) {
          earliestMs = record.timestampMs;
        }
      }

      // Mark for re-enqueue
      state.pendingMessages = true;

      // Roll back the cursor so the next processGroupMessages DB re-query
      // picks up these messages again.
      if (earliestMs != null && earliestMs <= now) {
        if (!this.rollbackTimestampFn) {
          logger.error(
            { groupJid, earliestMs },
            'rollbackTimestampFn not registered, cannot roll back cursor (DB re-query on next poll will still retry)',
          );
        } else {
          try {
            const iso = new Date(earliestMs).toISOString();
            this.rollbackTimestampFn(groupJid, iso);
          } catch (err) {
            logger.error(
              { groupJid, earliestMs, err },
              'rollbackTimestampFn threw',
            );
          }
        }
      } else if (earliestMs != null) {
        logger.warn(
          { groupJid, earliestMs, now },
          'Earliest piped message is in the future, skipping rollback',
        );
      }

      logger.info(
        {
          event: 'container.lifecycle.dead_letter',
          groupJid,
          reason,
          messageCount: state.pipedMessages.size,
          rolledBackTo:
            earliestMs != null ? new Date(earliestMs).toISOString() : null,
        },
        'Dead-letter recovery: re-enqueuing unacked piped messages',
      );

      state.deadLetterProcessed = true;
    } finally {
      // Clear the tracking Map so a retry doesn't re-re-enqueue
      state.pipedMessages.clear();
    }
  }

  /**
   * Return a snapshot of queue state for the health endpoint. Tolerates
   * per-entry errors and always returns 200 OK data. Errors on individual
   * groups are captured in the top-level `error` field.
   */
  getStatus(): QueueStatus {
    const now = Date.now();
    const result: QueueStatus = {
      activeCount: this.activeCount,
      maxConcurrent: MAX_CONCURRENT_CONTAINERS,
      waitingGroups: [...this.waitingGroups],
      groupStates: {},
    };
    try {
      for (const [groupJid, state] of this.groups) {
        try {
          const containerAgeSec = state.activeSinceMs
            ? Math.max(0, Math.floor((now - state.activeSinceMs) / 1000))
            : 0;
          result.groupStates[groupJid] = {
            active: state.active,
            containerName: state.containerName,
            containerAgeSec,
            idleWaiting: state.idleWaiting,
            pendingMessages: state.pendingMessages,
            pendingTaskCount: state.pendingTasks.length,
            pipedMessageCount: state.pipedMessages
              ? state.pipedMessages.size
              : 0,
            isTaskContainer: state.isTaskContainer,
            retryCount: state.retryCount,
          };
        } catch (err) {
          logger.error({ groupJid, err }, 'getStatus entry build failed');
        }
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'getStatus failed, returning partial');
    }
    return result;
  }

  /**
   * Return a snapshot of circuit breaker status for the health endpoint.
   * Wrapping getCircuitStatus() here keeps index.ts import lean.
   */
  getCircuitBreakerStatus(): ReturnType<typeof getCircuitStatus> {
    return getCircuitStatus();
  }

  async shutdown(gracePeriodMs: number): Promise<void> {
    this.shuttingDown = true;
    this.stopLivenessChecker();

    const activeContainers: { name: string; proc: ChildProcess }[] = [];
    for (const [, state] of this.groups) {
      if (state.process && !state.process.killed && state.containerName) {
        activeContainers.push({
          name: state.containerName,
          proc: state.process,
        });
      }
    }

    if (activeContainers.length === 0) {
      logger.info('GroupQueue shutting down (no active containers)');
      return;
    }

    logger.info(
      { activeCount: activeContainers.length, gracePeriodMs },
      'GroupQueue shutting down — stopping active containers',
    );

    // Graceful stop with timeout, then SIGKILL stragglers
    const stopPromises = activeContainers.map(
      ({ name, proc }) =>
        new Promise<void>((resolve) => {
          const forceKill = setTimeout(() => {
            logger.warn(
              { container: name },
              'Graceful stop timed out, force killing',
            );
            proc.kill('SIGKILL');
            resolve();
          }, gracePeriodMs);

          exec(stopContainer(name), { timeout: gracePeriodMs }, () => {
            clearTimeout(forceKill);
            resolve();
          });
        }),
    );

    await Promise.all(stopPromises);
    logger.info({ stopped: activeContainers.length }, 'All containers stopped');
  }
}
