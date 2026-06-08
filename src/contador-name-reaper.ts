/**
 * Contador name reaper — periodic backstop that repairs "Unknown" student names.
 *
 * Heartbeat (the course/community platform) creates the Stripe customer and
 * fires `payment_intent.succeeded` BEFORE writing `customer.name`, so the
 * payment webhook handler races and sometimes records "Unknown". process-
 * payment.cjs retries to win that race in the common case; this reaper catches
 * any straggler whose name landed in Stripe slower than that window.
 *
 * Thin, mechanical wrapper around tools/contador/backfill-names.cjs --apply
 * (zero LLM, no container). Mirrors stripe-payment-host.ts / trafft-sweeper.ts.
 * The script is idempotent: it only fills names that are currently blank and
 * never overwrites a manually-corrected one.
 */

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();
const SCRIPT = path.resolve(PROJECT_ROOT, 'tools/contador/backfill-names.cjs');
const SA_JSON = path.join(
  DATA_DIR,
  'service-accounts',
  'sheets-service-account.json',
);
/** psql is not on the launchd PATH; backfill-names.cjs shells `psql`. */
const PSQL_DIR = '/opt/homebrew/opt/postgresql@16/bin';

/** Build the child env backfill-names.cjs needs (Stripe keys, Sheets, psql). */
function buildScriptEnv(): NodeJS.ProcessEnv {
  const cfg = readEnvFile([
    'STRIPE_RESTRICTED_KEY',
    'STRIPE_SECRET_KEY_ALT',
    'SHEETS_ROSTER_ID',
    'SHEETS_PAYMENTS_ID',
  ]);
  return {
    ...process.env,
    ...cfg,
    SHEETS_SA_JSON: SA_JSON,
    PGDATABASE: 'nanoclaw_business',
    PATH: `${process.env.PATH ?? ''}:${PSQL_DIR}`,
  };
}

/** Run the backfill in apply mode; log only when it actually fixed something. */
export async function runNameReaper(): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [SCRIPT, '--apply'],
    {
      env: buildScriptEnv(),
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const summary = stdout.trim();
  // The script's last line is: "… done — fixed N, unresolvable M".
  const doneLine = summary.split('\n').find((l) => l.includes('done —')) || '';
  if (/fixed [1-9]/.test(doneLine)) {
    logger.info({ summary: doneLine }, 'contador-name-reaper: repaired names');
  } else {
    logger.debug(
      { summary: doneLine },
      'contador-name-reaper: nothing to repair',
    );
  }
  return summary;
}
