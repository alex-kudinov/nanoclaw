/** Weekly aggregate-only Stripe/outbox/Chaos reconciliation wrapper. */

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);
const CODE_ROOT = process.env.NANOCLAW_CODE_ROOT || process.cwd();
const SCRIPT = path.resolve(
  CODE_ROOT,
  'tools/contador/reconcile-chaos-lifecycle.cjs',
);
const PSQL_DIR = '/opt/homebrew/opt/postgresql@16/bin';

export async function runChaosLifecycleReconciliation(): Promise<
  Record<string, unknown>
> {
  const config = readEnvFile([
    'STRIPE_RESTRICTED_KEY',
    'STRIPE_SECRET_KEY_ALT',
    'CHAOS_COHORT_URL',
    'CHAOS_EXPORT_API_TOKEN',
    'CHAOS_LIFECYCLE_COVERAGE_START',
  ]);
  const { stdout } = await execFileAsync(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      ...config,
      PGDATABASE: 'nanoclaw_business',
      PATH: `${process.env.PATH ?? ''}:${PSQL_DIR}`,
    },
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const report = JSON.parse(stdout) as Record<string, unknown>;
  logger.info({ report }, 'chaos-lifecycle-reconciliation: weekly readout');
  return report;
}
