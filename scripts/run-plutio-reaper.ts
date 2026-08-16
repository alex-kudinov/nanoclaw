#!/usr/bin/env npx tsx
/**
 * Entry point for the Plutio outbox reaper cron job.
 * Invoked by the NanoClaw scheduler every 15 minutes.
 *
 * Exit codes:
 *   0 — success (including zero-pending-rows case)
 *   1 — unrecoverable failure
 */

import { main } from '../src/plutio-outbox-reaper-cli.js';
import { logger } from '../src/logger.js';

main().catch((err) => {
  logger.error({ err }, 'run-plutio-reaper: fatal');
  process.exit(1);
});
