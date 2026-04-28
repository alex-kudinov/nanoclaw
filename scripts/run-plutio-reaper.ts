#!/usr/bin/env npx tsx
/**
 * Entry point for the Plutio outbox reaper cron job.
 * Invoked by the NanoClaw scheduler every 15 minutes.
 *
 * Exit codes:
 *   0 — success (including zero-pending-rows case)
 *   1 — unrecoverable failure
 */

import { runReaper } from '../src/plutio-outbox-reaper.js';
import { initDatabase } from '../src/db.js';
import { logger } from '../src/logger.js';

async function main(): Promise<void> {
  // SQLite must be init'd before alertChief can resolve the chief
  // jid via getAllRegisteredGroups. Standalone script = fresh process
  // = always needs init.
  initDatabase();
  logger.info('run-plutio-reaper: starting');
  const result = await runReaper();
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

main().catch((err) => {
  logger.error({ err }, 'run-plutio-reaper: fatal');
  process.exit(1);
});
