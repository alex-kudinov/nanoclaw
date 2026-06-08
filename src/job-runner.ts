import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import {
  getRunningJobNames,
  insertJobRunLog,
  updateJobRunLog,
  updateJobRunState,
  updateJobNextRun,
  getJob,
} from './db.js';
import { computeNextRunFrom } from './job-registry.js';
import { reportJobResult } from './job-reporter.js';
import { logger } from './logger.js';
import type { Job, JobRunResult } from './types.js';

export interface JobRunnerDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  reportChannel: string;
  writeJobsSnapshot: () => void;
}

function shouldReport(job: Job, status: JobRunResult['status']): boolean {
  if (job.alert_level === 'silent') return false;
  // A skipped run (a prior instance is still in flight) is a benign no-op —
  // never worth a Slack message, regardless of alert_level.
  if (status === 'already_running') return false;
  if (job.alert_level === 'warn' && status === 'ok') return false;
  return true;
}

export async function runJob(
  job: Job,
  triggeredBy: string,
  deps: JobRunnerDeps,
  retryAttempt = 0,
): Promise<JobRunResult> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // 1. Atomic already-running guard
  try {
    const running = getRunningJobNames();
    if (running.includes(job.name)) {
      // The previous run is still in flight. Advance next_run so the scheduler
      // stops re-firing — and re-skipping — this job on every poll tick.
      const nextRun = computeNextRunFrom(job.cron, job.timezone);
      if (nextRun) updateJobNextRun(job.name, nextRun);
      const result: JobRunResult = {
        name: job.name,
        status: 'already_running',
        duration_ms: 0,
        output: null,
        error: null,
        exit_code: null,
        retry_attempts: retryAttempt,
        run_id: null,
        log_file: null,
      };
      if (shouldReport(job, result.status)) {
        await reportJobResult(result, deps.reportChannel, deps.sendMessage);
      }
      return result;
    }
  } catch (err) {
    logger.error({ err, job: job.name }, 'Failed to check running status');
  }

  // Insert run log with status='running'
  insertJobRunLog({
    id: runId,
    job_name: job.name,
    triggered_by: triggeredBy,
    started_at: startedAt,
    status: 'running',
    pid: null,
    retry_attempt: retryAttempt,
  });

  // 2. Verify script exists
  const scriptPath = path.join(job.project_root, job.script);
  try {
    fs.accessSync(scriptPath, fs.constants.R_OK);
  } catch {
    const result: JobRunResult = {
      name: job.name,
      status: 'path_error',
      duration_ms: Date.now() - startMs,
      output: null,
      error: `Script not found: ${scriptPath}`,
      exit_code: null,
      retry_attempts: retryAttempt,
      run_id: runId,
      log_file: null,
    };
    updateJobRunLog(runId, {
      status: 'fail',
      error: result.error,
      finished_at: new Date().toISOString(),
      duration_ms: result.duration_ms,
    });
    // Advance next_run — without this a missing-script job re-fires (and
    // re-errors) on every poll tick.
    const nextRun = computeNextRunFrom(job.cron, job.timezone);
    if (nextRun) updateJobNextRun(job.name, nextRun);
    if (shouldReport(job, result.status)) {
      await reportJobResult(result, deps.reportChannel, deps.sendMessage);
    }
    return result;
  }

  // 3. Build environment (with usage-tracking metadata)
  const env = buildEnv(job.project_root);
  env.NANOCLAW_MINION = job.project;
  env.NANOCLAW_JOB = job.name;
  env.NANOCLAW_ACTION = path.basename(job.script, path.extname(job.script));

  // 4. Determine executable and spawn
  const ext = path.extname(job.script);
  let proc: ChildProcess;
  const args = job.args || [];

  if (ext === '.sh') {
    proc = spawn('/bin/bash', [scriptPath, ...args], {
      shell: false,
      detached: true,
      cwd: job.project_root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else if (ext === '.py') {
    const venvPython = path.join(
      job.project_root,
      'tools',
      '.venv',
      'bin',
      'python3',
    );
    const pythonExec = fs.existsSync(venvPython) ? venvPython : 'python3';
    proc = spawn(pythonExec, [scriptPath, ...args], {
      shell: false,
      detached: true,
      cwd: job.project_root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    proc = spawn(scriptPath, args, {
      shell: false,
      detached: true,
      cwd: job.project_root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  // Store PID
  if (proc.pid) {
    updateJobRunLog(runId, { pid: proc.pid });
  }

  // 5. Stream output to log file + buffer in memory
  const logsDir = path.join(DATA_DIR, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logsDir, `${job.name}-${timestamp}.log`);
  const logStream = fs.createWriteStream(logFile);

  let outputBuffer = '';
  const MAX_BUFFER = 10240; // 10KB

  const appendOutput = (chunk: Buffer) => {
    const text = chunk.toString();
    logStream.write(text);
    // Keep last MAX_BUFFER chars in memory
    outputBuffer += text;
    if (outputBuffer.length > MAX_BUFFER * 2) {
      outputBuffer = outputBuffer.slice(-MAX_BUFFER);
    }
  };

  proc.stdout?.on('data', appendOutput);
  proc.stderr?.on('data', appendOutput);

  // 6. Execute with timeout
  return new Promise<JobRunResult>((resolve) => {
    let timedOut = false;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      // Kill entire process group
      try {
        if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
      } catch {
        /* process may already be dead */
      }
      // Force kill after 5s
      setTimeout(() => {
        try {
          if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
        } catch {
          /* already dead */
        }
      }, 5000);
    }, job.timeout_ms);

    proc.on('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      logStream.end();

      const durationMs = Date.now() - startMs;
      const finalOutput =
        outputBuffer.length > MAX_BUFFER
          ? outputBuffer.slice(-MAX_BUFFER)
          : outputBuffer;

      // 7. Determine status
      let status: JobRunResult['status'];
      if (timedOut) {
        status = 'timeout';
      } else if (code === 0) {
        status = 'ok';
      } else {
        status = 'fail';
      }

      // Cleanup lockfile on any failure
      if (status !== 'ok' && job.lockfile) {
        try {
          fs.unlinkSync(job.lockfile);
          logger.info(
            { job: job.name, lockfile: job.lockfile },
            'Cleaned up lockfile after failure',
          );
        } catch {
          /* lockfile may not exist */
        }
      }

      // Update run log
      updateJobRunLog(runId, {
        status:
          status === 'ok' ? 'ok' : status === 'timeout' ? 'timeout' : 'fail',
        exit_code: code ?? null,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        output: finalOutput || null,
        log_file: logFile,
      });

      // Update job runtime state
      const nextRun = computeNextRunFrom(job.cron, job.timezone);
      updateJobRunState(job.name, {
        last_run: new Date().toISOString(),
        last_result: status,
        last_duration_ms: durationMs,
        last_output: finalOutput?.slice(0, 2000) || null,
        next_run: nextRun,
      });

      const result: JobRunResult = {
        name: job.name,
        status,
        duration_ms: durationMs,
        output: finalOutput || null,
        error: status !== 'ok' ? finalOutput || null : null,
        exit_code: code ?? null,
        retry_attempts: retryAttempt,
        run_id: runId,
        log_file: logFile,
      };

      // Report to Slack (respect alert_level)
      if (shouldReport(job, result.status)) {
        await reportJobResult(result, deps.reportChannel, deps.sendMessage);
      }

      // Refresh snapshot for any active campanero container
      try {
        deps.writeJobsSnapshot();
      } catch (err) {
        logger.warn({ err }, 'Failed to write jobs snapshot after run');
      }

      // 8. Retry logic
      if (status !== 'ok' && retryAttempt < job.retries) {
        // Re-check if job is still enabled before retrying
        const currentJob = getJob(job.name);
        if (currentJob && currentJob.enabled) {
          logger.info(
            {
              job: job.name,
              attempt: retryAttempt + 1,
              maxRetries: job.retries,
            },
            'Retrying job',
          );
          setTimeout(async () => {
            try {
              await runJob(job, triggeredBy, deps, retryAttempt + 1);
            } catch (err) {
              logger.error({ err, job: job.name }, 'Retry failed');
            }
          }, job.retry_delay_ms);
        } else {
          logger.info(
            { job: job.name },
            'Job disabled during retry - skipping',
          );
        }
      }

      resolve(result);
    });

    proc.on('error', async (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      logStream.end();

      const durationMs = Date.now() - startMs;
      const result: JobRunResult = {
        name: job.name,
        status: 'fail',
        duration_ms: durationMs,
        output: null,
        error: err.message,
        exit_code: null,
        retry_attempts: retryAttempt,
        run_id: runId,
        log_file: logFile,
      };

      updateJobRunLog(runId, {
        status: 'fail',
        error: err.message,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      });

      if (shouldReport(job, result.status)) {
        await reportJobResult(result, deps.reportChannel, deps.sendMessage);
      }
      resolve(result);
    });
  });
}

function buildEnv(projectRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Parse project's .env file
  const envFile = path.join(projectRoot, '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }

  // Prepend venv to PATH if it exists
  const venvBin = path.join(projectRoot, 'tools', '.venv', 'bin');
  if (fs.existsSync(venvBin)) {
    env.PATH = `${venvBin}:${env.PATH || ''}`;
  }

  return env;
}
