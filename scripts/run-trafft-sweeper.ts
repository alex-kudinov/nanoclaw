#!/usr/bin/env npx tsx
/**
 * Manual one-off invocation of the Trafft sweeper. Useful for backfilling
 * historical missed events without waiting for the in-daemon 6h cycle.
 *
 * IMPORTANT: must run on the same machine as the daemon (Mac Mini) so it
 * can resolve registered groups + share PG access. Does NOT spawn agents
 * itself — synthesizes envelopes and lets the in-daemon webhook-inbox-reaper
 * dispatch them within 5 min.
 */

import { logger } from '../src/logger.js';
import { runSweep } from '../src/trafft-sweeper.js';
import { initDatabase, getAllRegisteredGroups } from '../src/db.js';

async function main(): Promise<void> {
  // Standalone scripts must init the SQLite layer before any
  // db-backed call (the in-daemon path inits at startup, but this
  // script doesn't share that context). Without this, alertChief on
  // the freeze path throws TypeError at db.prepare and clobbers the
  // sweep result.
  initDatabase();
  logger.info('run-trafft-sweeper: starting');
  const result = await runSweep({
    getRegisteredGroups: () => getAllRegisteredGroups(),
  });
  logger.info(result, 'run-trafft-sweeper: done');
  if (!result.watermark_advanced && result.synthesized > 0) {
    process.exit(2); // partial — chief alert was sent
  }
}

main().catch((err) => {
  logger.error({ err }, 'run-trafft-sweeper: fatal');
  process.exit(1);
});
