#!/usr/bin/env npx tsx
/** Source-tree compatibility wrapper; production should run the compiled job. */
import { logger } from '../src/logger.js';
import { main } from '../src/program-facts-drift-job.js';

main().catch((err) => {
  logger.error({ err }, 'program-facts-drift: fatal');
  process.exit(1);
});
