#!/usr/bin/env npx tsx
/**
 * Entry point for the Gmail label-change poller cron job.
 * Invoked via tools/gmail/run-label-poll.sh every 5 minutes.
 *
 * Exit codes:
 *   0 — success (including bootstrap run)
 *   1 — unrecoverable failure
 */

import { initDatabase } from '../src/db.js';
import { runLabelChangePoll } from '../src/gmail-label-poll.js';
import { logger } from '../src/logger.js';

async function main(): Promise<void> {
  initDatabase();
  logger.info('run-label-poll: starting');
  const result = await runLabelChangePoll();
  logger.info(
    {
      processed: result.processed,
      corrections: result.corrections,
      skipped: result.skipped,
    },
    'run-label-poll: done',
  );
}

main().catch((err) => {
  logger.error({ err }, 'run-label-poll: fatal');
  process.exit(1);
});
