import { pathToFileURL } from 'node:url';

import { initDatabase } from './db.js';
import { logger } from './logger.js';
import { runReaper, type ReaperResult } from './plutio-outbox-reaper.js';

interface ReaperCliDeps {
  initDatabase: () => void;
  runReaper: () => Promise<ReaperResult>;
}

const defaultDeps: ReaperCliDeps = { initDatabase, runReaper };

/** Run the host-owned Plutio reaper from an immutable compiled release. */
export async function runPlutioOutboxReaperCli(
  deps: ReaperCliDeps = defaultDeps,
): Promise<ReaperResult> {
  deps.initDatabase();
  return deps.runReaper();
}

export async function main(): Promise<void> {
  logger.info('run-plutio-reaper: starting');
  const result = await runPlutioOutboxReaperCli();
  logger.info(
    {
      processed: result.processed,
      succeeded: result.succeeded,
      retried: result.retried,
      deadLettered: result.deadLettered,
    },
    'run-plutio-reaper: done',
  );
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'run-plutio-reaper: fatal');
    process.exitCode = 1;
  });
}
