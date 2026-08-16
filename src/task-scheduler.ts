import { ChildProcess } from 'child_process';
import crypto from 'crypto';
import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';

import { ASSISTANT_NAME, SCHEDULER_POLL_INTERVAL, TIMEZONE } from './config.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  claimTaskRun,
  failOrphanedOnceTasks,
  getAllTasks,
  getDueTasks,
  getDueJobs,
  getTaskById,
  insertJobRunLog,
  logTaskRun,
  updateJobRunLog,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { runJob, type JobRunnerDeps } from './job-runner.js';
import { reportJobResult } from './job-reporter.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { requiresProcurementSourceReceipt } from './procurement-task-completion.js';
import {
  beginProcurementTaskRun,
  endProcurementTaskRun,
} from './procurement-task-run.js';
import { RegisteredGroup, ScheduledTask, SendMessageFn } from './types.js';

export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  onProcess: (
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder: string,
    capabilityFingerprint?: string,
  ) => void;
  sendMessage: SendMessageFn;
  validateTaskCompletion: (
    task: ScheduledTask,
    startedAtMs: number,
    result: string | null,
  ) => Promise<void>;
}

export interface HostJobDeps {
  sendMessage: SendMessageFn;
  reportChannel: string;
  writeJobsSnapshot: () => void;
}

export async function processHostJobs(deps: HostJobDeps): Promise<void> {
  const now = new Date().toISOString();
  const dueJobs = getDueJobs(now);

  for (const job of dueJobs) {
    // Fire-and-forget with error catch
    const runnerDeps: JobRunnerDeps = {
      sendMessage: deps.sendMessage,
      reportChannel: deps.reportChannel,
      writeJobsSnapshot: deps.writeJobsSnapshot,
    };

    runJob(job, 'cron', runnerDeps).catch((err) => {
      logger.error({ err, job: job.name }, 'Host job dispatch failed');
      // Record dispatch error
      const runId = crypto.randomUUID();
      insertJobRunLog({
        id: runId,
        job_name: job.name,
        triggered_by: 'cron',
        started_at: new Date().toISOString(),
        status: 'dispatch_error',
        pid: null,
        retry_attempt: 0,
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
        duration_ms: 0,
      });
      reportJobResult(
        {
          name: job.name,
          status: 'dispatch_error',
          duration_ms: 0,
          output: null,
          error: err instanceof Error ? err.message : String(err),
          exit_code: null,
          retry_attempts: 0,
          run_id: runId,
          log_file: null,
        },
        deps.reportChannel,
        deps.sendMessage,
      ).catch(() => {
        /* best effort */
      });
    });
  }
}

async function runTask(
  task: ScheduledTask,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(task.group_folder);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Stop retry churn for malformed legacy rows.
    updateTask(task.id, { status: 'paused' });
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder, error },
      'Task has invalid group folder',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error,
    });
    return;
  }
  fs.mkdirSync(groupDir, { recursive: true });

  // Advance next_run immediately to prevent re-fire while the container is running.
  // The scheduler loop checks every 60s; containers can take 5+ minutes.
  // Without this, getDueTasks() returns the same task on every tick.
  let claimedNextRun: string | null;
  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    claimedNextRun = interval.next().toISOString();
  } else if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    claimedNextRun = new Date(Date.now() + ms).toISOString();
  } else {
    claimedNextRun = null;
  }
  if (!task.next_run || !claimTaskRun(task.id, task.next_run, claimedNextRun)) {
    logger.info(
      { taskId: task.id, group: task.group_folder },
      'Scheduled task was already claimed',
    );
    return;
  }

  logger.info(
    { taskId: task.id, group: task.group_folder },
    'Running scheduled task',
  );

  const groups = deps.registeredGroups();
  const group = Object.values(groups).find(
    (g) => g.folder === task.group_folder,
  );

  if (!group) {
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder },
      'Group not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Group not found: ${task.group_folder}`,
    });
    return;
  }

  // Update tasks snapshot for container to read (filtered by group)
  const isMain = group.isMain === true;
  const tasks = getAllTasks();
  writeTasksSnapshot(
    task.group_folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  let result: string | null = null;
  let error: string | null = null;
  const receiptRequired = requiresProcurementSourceReceipt(task);
  let activeRunToken: string | null = null;

  // For group context mode, use the group's current session
  const sessions = deps.getSessions();
  const sessionId =
    task.context_mode === 'group' ? sessions[task.group_folder] : undefined;

  // A scheduled task may be multi-turn: Gmail tools return immediately and
  // deliver their exact-thread result asynchronously into this same container.
  // Keep a bounded continuation window after every result, and reset it after
  // each subsequent turn. The completion validator rejects "waiting" prose
  // without a durable business artifact, so this cannot fail silently.
  const TASK_CLOSE_DELAY_MS = 60_000;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Closing task container after result');
      deps.queue.closeStdin(task.chat_jid);
    }, TASK_CLOSE_DELAY_MS);
  };

  try {
    if (receiptRequired) {
      activeRunToken = beginProcurementTaskRun(
        task.group_folder,
        task.id,
        startTime,
      );
    }
    const output = await runContainerAgent(
      group,
      {
        prompt: task.prompt,
        sessionId,
        groupFolder: task.group_folder,
        chatJid: task.chat_jid,
        isMain,
        isScheduledTask: true,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName, capabilityFingerprint) =>
        deps.onProcess(
          task.chat_jid,
          proc,
          containerName,
          task.group_folder,
          capabilityFingerprint,
        ),
      async (streamedOutput: ContainerOutput) => {
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // Receipt-required final text is held until the host validates the
          // causally bound source run. Other task behavior is unchanged.
          if (!receiptRequired) {
            await deps.sendMessage(task.chat_jid, streamedOutput.result, {
              fromGroup: task.group_folder,
            });
          }
          scheduleClose();
        }
        if (streamedOutput.status === 'success') {
          deps.queue.notifyIdle(task.chat_jid);
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
        }
      },
      () => {
        // Proof-of-life for the freeze detector — see runAgent in index.ts.
        deps.queue.setLastOutputAt(task.chat_jid);
      },
    );

    if (closeTimer) clearTimeout(closeTimer);

    if (output.status === 'error') {
      error = output.error || 'Unknown error';
    } else if (output.result) {
      // Messages are sent via MCP tool (IPC), result text is just logged
      result = output.result;
    }

    logger.info(
      { taskId: task.id, durationMs: Date.now() - startTime },
      'Task completed',
    );
  } catch (err) {
    if (closeTimer) clearTimeout(closeTimer);
    error = err instanceof Error ? err.message : String(err);
    logger.error({ taskId: task.id, error }, 'Task failed');
  } finally {
    if (activeRunToken) {
      endProcurementTaskRun(task.group_folder, activeRunToken);
    }
  }

  if (!error) {
    try {
      await deps.validateTaskCompletion(task, startTime, result);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error(
        { taskId: task.id, group: task.group_folder, error },
        'Task completion receipt validation failed',
      );
      await deps
        .sendMessage(task.chat_jid, `[SCHEDULED TASK NOT COMPLETE] ${error}`, {
          fromGroup: task.group_folder,
        })
        .catch((sendError) => {
          logger.error(
            { taskId: task.id, err: sendError },
            'Task completion failure alert could not be delivered',
          );
        });
    }
  }

  if (!error && receiptRequired && result) {
    await deps
      .sendMessage(task.chat_jid, result, { fromGroup: task.group_folder })
      .catch((sendError) => {
        logger.error(
          { taskId: task.id, err: sendError },
          'Validated task result could not be delivered',
        );
      });
  }

  const durationMs = Date.now() - startTime;

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: error ? 'error' : 'success',
    result,
    error,
  });

  let nextRun: string | null = null;
  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    nextRun = interval.next().toISOString();
  } else if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    nextRun = new Date(Date.now() + ms).toISOString();
  }
  // 'once' tasks have no next run

  const resultSummary = error
    ? `Error: ${error}`
    : result
      ? result.slice(0, 200)
      : 'Completed';
  updateTaskAfterRun(task.id, nextRun, resultSummary);
}

let schedulerRunning = false;

export function startSchedulerLoop(
  deps: SchedulerDependencies,
  hostJobDeps?: HostJobDeps,
): void {
  if (schedulerRunning) {
    logger.debug('Scheduler loop already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;
  logger.info('Scheduler loop started');

  for (const task of failOrphanedOnceTasks()) {
    logger.error(
      { taskId: task.id, group: task.group_folder },
      'One-time task was claimed but never completed before daemon restart',
    );
    deps
      .sendMessage(
        task.chat_jid,
        `[SCHEDULED TASK NOT COMPLETE] Task ${task.id} was claimed but never completed before daemon restart; it was not re-run automatically.`,
        { fromGroup: task.group_folder },
      )
      .catch((err) => {
        logger.error(
          { taskId: task.id, err },
          'Orphaned one-time task alert could not be delivered',
        );
      });
  }

  const loop = async () => {
    try {
      const dueTasks = getDueTasks();
      if (dueTasks.length > 0) {
        logger.info({ count: dueTasks.length }, 'Found due tasks');
      }

      for (const task of dueTasks) {
        // Re-check task status in case it was paused/cancelled
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          continue;
        }

        deps.queue.enqueueTask(currentTask.chat_jid, currentTask.id, () =>
          runTask(currentTask, deps),
        );
      }

      if (hostJobDeps) {
        await processHostJobs(hostJobDeps);
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop');
    }

    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}

/** @internal - for tests only. */
export function _resetSchedulerLoopForTests(): void {
  schedulerRunning = false;
}
