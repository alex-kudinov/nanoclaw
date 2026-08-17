import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from './business-db.js';
import {
  makeCompanyJobWorkProjectionDeps,
  runCompanyJobWorkProjection,
  type CompanyJobWorkProjectionWindow,
} from './company-job-work-shadow.js';
import { openReadOnlyJobRunProjectionSource } from './db.js';

const CONFIRMATION = 'NC-017-HOST-JOB-SHADOW';

export interface CompanyJobWorkShadowCliOptions extends CompanyJobWorkProjectionWindow {
  confirmation: string;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function boundedLimit(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('--batch-limit requires a positive integer');
  }
  const value = Number(raw);
  if (value > 250) throw new Error('--batch-limit cannot exceed 250');
  return value;
}

function exactTimestamp(raw: string, flag: string): string {
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} is not a timestamp`);
  return new Date(parsed).toISOString();
}

export function parseCompanyJobWorkShadowArgs(
  args: string[],
  now = new Date(),
): CompanyJobWorkShadowCliOptions {
  let since: string | null = null;
  let through: string | null = null;
  let batchLimit: number | null = null;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--since') {
      since = exactTimestamp(requiredValue(args, index, '--since'), '--since');
      index++;
    } else if (arg === '--through') {
      through = exactTimestamp(
        requiredValue(args, index, '--through'),
        '--through',
      );
      index++;
    } else if (arg === '--batch-limit') {
      batchLimit = boundedLimit(requiredValue(args, index, '--batch-limit'));
      index++;
    } else if (arg === '--confirm-shadow-projection') {
      confirmation = requiredValue(args, index, '--confirm-shadow-projection');
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!since || !through || batchLimit === null) {
    throw new Error('--since, --through, and --batch-limit are required');
  }
  if (confirmation !== CONFIRMATION) {
    throw new Error('exact shadow-projection confirmation is required');
  }
  if (Date.parse(through) < Date.parse(since)) {
    throw new Error('--through must not precede --since');
  }
  if (Date.parse(through) > now.getTime()) {
    throw new Error('--through must be a closed historical bound');
  }
  return { since, through, batchLimit, confirmation };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCompanyJobWorkShadowArgs(args);
  const source = openReadOnlyJobRunProjectionSource();
  try {
    const summary = await runCompanyJobWorkProjection(
      makeCompanyJobWorkProjectionDeps(source.listRuns),
      options,
    );
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (Object.keys(summary.errors).length > 0) process.exitCode = 1;
  } finally {
    source.close();
    await resetBusinessPool();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `Company job shadow refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
