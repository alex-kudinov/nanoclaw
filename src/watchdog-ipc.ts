/**
 * Watchdog → NanoClaw kill signal handler.
 *
 * The external bash watchdog (`scripts/nanoclaw-watchdog.sh`) writes
 * Contract D JSON files into `data/watchdog-kills/` when it kills a
 * zombie/wedged container. This module polls that directory and asks
 * the GroupQueue to force-clean the corresponding group state so the
 * in-process queue stays in sync with the actual container set.
 *
 * Polling (5s) over `fs.watch` because `fs.watch` is unreliable on
 * macOS for bind-mounted directories — matches the existing IPC
 * watcher pattern in `ipc.ts`.
 */
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { GroupQueue } from './group-queue.js';
import { logger } from './logger.js';

const WATCHDOG_KILL_DIR = path.join(DATA_DIR, 'watchdog-kills');
const POLL_INTERVAL_MS = 5_000;
const RETRY_DELETE_ATTEMPTS = 3;
const RETRY_DELETE_DELAY_MS = 100;

interface KillSignal {
  killed_at_ms: number;
  container_name: string;
  age_sec?: number;
  reason?: string;
}

function ensureDir(): void {
  try {
    fs.mkdirSync(WATCHDOG_KILL_DIR, { recursive: true });
  } catch (err) {
    logger.debug({ err }, 'mkdir watchdog-kills dir failed (non-fatal)');
  }
}

function deleteWithRetry(filePath: string): boolean {
  for (let attempt = 0; attempt < RETRY_DELETE_ATTEMPTS; attempt++) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return true;
      if (attempt === RETRY_DELETE_ATTEMPTS - 1) {
        logger.warn(
          { filePath, err },
          'Failed to delete watchdog kill signal after retries',
        );
        return false;
      }
      // Synchronous busy-wait — short and bounded (3 * 100ms = 300ms max)
      const waitUntil = Date.now() + RETRY_DELETE_DELAY_MS;
      while (Date.now() < waitUntil) {
        /* spin */
      }
    }
  }
  return false;
}

function processSignalFile(queue: GroupQueue, filePath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return;
    logger.warn({ filePath, err }, 'Failed to read kill signal file');
    deleteWithRetry(filePath);
    return;
  }

  let signal: KillSignal;
  try {
    signal = JSON.parse(raw);
  } catch (err) {
    logger.warn(
      { filePath, err },
      'Malformed watchdog kill signal JSON, deleting',
    );
    deleteWithRetry(filePath);
    return;
  }

  if (!signal.container_name || typeof signal.killed_at_ms !== 'number') {
    logger.warn(
      { filePath, signal },
      'Watchdog kill signal missing required fields, deleting',
    );
    deleteWithRetry(filePath);
    return;
  }

  logger.warn(
    {
      event: 'container.lifecycle.watchdog_kill_seen',
      containerName: signal.container_name,
      reason: signal.reason || 'unknown',
      killedAtMs: signal.killed_at_ms,
      ageSec: signal.age_sec,
    },
    'Processing watchdog kill signal',
  );

  try {
    queue.forceCleanupByContainerName(signal.container_name, {
      reason: signal.reason || 'watchdog_kill',
    });
  } catch (err) {
    logger.error(
      { err, containerName: signal.container_name },
      'forceCleanupByContainerName threw',
    );
  }

  if (!deleteWithRetry(filePath)) {
    // Schedule a one-time retry instead of blocking the polling loop
    setTimeout(() => deleteWithRetry(filePath), 60_000);
  }
}

function listSignalFiles(): string[] {
  try {
    return fs
      .readdirSync(WATCHDOG_KILL_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(WATCHDOG_KILL_DIR, f));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') {
      ensureDir();
      return [];
    }
    logger.error({ err }, 'Failed to read watchdog-kills directory');
    return [];
  }
}

/**
 * Process any kill signal files left over from a previous NanoClaw run.
 * Called once during startup before recoverPendingMessages so killed
 * groups are cleaned up before they get re-enqueued.
 */
export function drainWatchdogKills(queue: GroupQueue): void {
  ensureDir();
  const files = listSignalFiles();
  if (files.length === 0) return;
  // Process oldest-first by killed_at_ms — fall back to filename order on
  // unparseable files (those go to processSignalFile which deletes them).
  const sorted: { path: string; killedAt: number }[] = [];
  for (const f of files) {
    let killedAt = 0;
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (typeof data.killed_at_ms === 'number') killedAt = data.killed_at_ms;
    } catch {
      /* ignore — processSignalFile will delete malformed */
    }
    sorted.push({ path: f, killedAt });
  }
  sorted.sort((a, b) => a.killedAt - b.killedAt);
  logger.info(
    { count: sorted.length },
    'Draining pending watchdog kill signals from previous run',
  );
  for (const { path: filePath } of sorted) {
    processSignalFile(queue, filePath);
  }
}

let pollerRunning = false;

/**
 * Start the periodic poller for new watchdog kill signals.
 * Idempotent — calling twice is a no-op.
 */
export function startWatchdogIpc(queue: GroupQueue): void {
  if (pollerRunning) return;
  pollerRunning = true;
  ensureDir();
  const tick = (): void => {
    try {
      const files = listSignalFiles();
      for (const f of files) {
        processSignalFile(queue, f);
      }
    } catch (err) {
      logger.error({ err }, 'Watchdog IPC poll tick failed');
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  };
  setTimeout(tick, POLL_INTERVAL_MS);
  logger.info(
    { dir: WATCHDOG_KILL_DIR, intervalMs: POLL_INTERVAL_MS },
    'Watchdog IPC poller started',
  );
}
