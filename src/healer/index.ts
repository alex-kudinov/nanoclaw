/**
 * Self-healing healer — entrypoint (Phase 0, docs/SELF-HEALING-DESIGN.md §3.3).
 *
 * Short-lived, launchd-invoked (not a long-running daemon) — fresh process per
 * run, launchd guarantees execution, no leaked state, and it survives the
 * NanoClaw daemon being down. Two modes:
 *   fast   — every 5 min: collect incidents + daemon-liveness check (+restart)
 *   digest — 18:00 CT: summarize open incidents to #gru-incidents
 */

import { pathToFileURL } from 'url';

import { resetBusinessPool } from '../business-db.js';
import { logger } from '../logger.js';
import { runFast } from './collector.js';
import { runDigest } from './digest.js';

/** Route a mode to its handler. Returns the process exit code. */
export async function dispatch(mode: string | undefined): Promise<number> {
  switch (mode) {
    case 'fast':
      await runFast();
      return 0;
    case 'digest':
      await runDigest();
      return 0;
    default:
      logger.error({ mode }, 'healer: unknown mode (use: fast | digest)');
      return 1;
  }
}

async function main(): Promise<void> {
  let code = 1;
  try {
    code = await dispatch(process.argv[2]);
  } catch (err) {
    logger.error({ err }, 'healer: fatal');
  } finally {
    await resetBusinessPool();
  }
  process.exit(code);
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
