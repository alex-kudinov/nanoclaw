#!/usr/bin/env npx tsx
/**
 * Entry point for the Hive sync reaper cron job.
 * Invoked via tools/hive/run-reaper.sh by the NanoClaw scheduler every 15 min.
 *
 * Exit codes:
 *   0 — success (including zero-stale-rows case)
 *   1 — unrecoverable failure
 */

import { runReaper } from '../src/hive-sync-reaper.js';
import { initDatabase } from '../src/db.js';
import { logger } from '../src/logger.js';

async function main(): Promise<void> {
  // SQLite must be init'd before alertChief can resolve the chief
  // jid via getAllRegisteredGroups. Standalone script = fresh process
  // = always needs init.
  initDatabase();
  logger.info('run-hive-reaper: starting');
  const result = await runReaper();
  logger.info(
    {
      processed: result.processed,
      recovered: result.recovered,
      retried: result.retried,
      deadLettered: result.deadLettered,
    },
    'run-hive-reaper: done',
  );
}

main().catch((err) => {
  logger.error({ err }, 'run-hive-reaper: fatal');
  process.exit(1);
});
