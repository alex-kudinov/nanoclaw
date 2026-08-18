import path from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';

import { resetBusinessPool, withTransaction } from './business-db.js';
import {
  COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION,
  deriveCompanyGmailHistoryIdSha256,
  runCompanyGmailSourceBootstrap,
  type CompanyGmailSourceBootstrapMode,
  type CompanyGmailSourceBootstrapReport,
} from './company-gmail-source-bootstrap.js';
import {
  recordCompanyTriggerWatermarkWithClient,
  registerCompanyTriggerSourceWithClient,
} from './company-trigger-source.js';
import { STORE_DIR } from './config.js';

export interface CompanyGmailSourceBootstrapCliOptions {
  mode: CompanyGmailSourceBootstrapMode;
  expectedHistoryIdSha256: string;
  observedAt: string;
  confirmation: typeof COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION | null;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseCompanyGmailSourceBootstrapArgs(
  args: string[],
): CompanyGmailSourceBootstrapCliOptions {
  let mode: CompanyGmailSourceBootstrapMode | null = null;
  let expectedHistoryIdSha256: string | null = null;
  let observedAt: string | null = null;
  let confirmation: string | null = null;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (mode !== null) throw new Error('exactly one mode is required');
      mode = arg === '--apply' ? 'apply' : 'dry_run';
    } else if (arg === '--expected-history-id-sha256') {
      if (expectedHistoryIdSha256 !== null) {
        throw new Error('--expected-history-id-sha256 may appear only once');
      }
      expectedHistoryIdSha256 = requiredValue(
        args,
        index,
        '--expected-history-id-sha256',
      );
      index++;
    } else if (arg === '--observed-at') {
      if (observedAt !== null) {
        throw new Error('--observed-at may appear only once');
      }
      observedAt = requiredValue(args, index, '--observed-at');
      index++;
    } else if (arg === '--confirm-apply') {
      if (confirmation !== null) {
        throw new Error('--confirm-apply may appear only once');
      }
      confirmation = requiredValue(args, index, '--confirm-apply');
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (mode === null) throw new Error('exactly one mode is required');
  if (
    expectedHistoryIdSha256 === null ||
    !/^[0-9a-f]{64}$/.test(expectedHistoryIdSha256)
  ) {
    throw new Error(
      '--expected-history-id-sha256 is required and must be lowercase SHA-256',
    );
  }
  if (observedAt === null) throw new Error('--observed-at is required');
  if (
    mode === 'apply' &&
    confirmation !== COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION
  ) {
    throw new Error('exact apply confirmation is required');
  }
  if (mode === 'dry_run' && confirmation !== null) {
    throw new Error('--confirm-apply is not valid for dry-run');
  }
  return {
    mode,
    expectedHistoryIdSha256,
    observedAt,
    confirmation:
      mode === 'apply' ? COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION : null,
  };
}

export function formatCompanyGmailSourceBootstrapReport(
  report: CompanyGmailSourceBootstrapReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function main(
  args = process.argv.slice(2),
  now = new Date(),
): Promise<void> {
  const options = parseCompanyGmailSourceBootstrapArgs(args);
  const database = new Database(path.join(STORE_DIR, 'messages.db'), {
    readonly: true,
    fileMustExist: true,
  });
  database.pragma('query_only = ON');
  try {
    if (database.pragma('quick_check', { simple: true }) !== 'ok') {
      throw new Error('SQLite quick-check failed');
    }
    const cursorStatement = database.prepare(
      "SELECT value FROM router_state WHERE key = 'gmail_history_id'",
    );
    const readHistoryId = (): string => {
      const row = cursorStatement.get() as { value?: unknown } | undefined;
      if (!row || typeof row.value !== 'string') {
        throw new Error('durable Gmail history cursor is unavailable');
      }
      return row.value;
    };
    const expectedHistoryId = readHistoryId();
    if (
      deriveCompanyGmailHistoryIdSha256(expectedHistoryId) !==
      options.expectedHistoryIdSha256
    ) {
      throw new Error('durable Gmail history cursor fingerprint changed');
    }
    const report = await runCompanyGmailSourceBootstrap(
      {
        mode: options.mode,
        expectedHistoryId,
        observedAt: options.observedAt,
      },
      {
        readHistoryId,
        now: () => now.toISOString(),
        withTransaction,
        registerSource: registerCompanyTriggerSourceWithClient,
        recordWatermark: recordCompanyTriggerWatermarkWithClient,
      },
    );
    process.stdout.write(formatCompanyGmailSourceBootstrapReport(report));
    if (!report.sqlite.cursorStable) process.exitCode = 2;
  } finally {
    database.close();
    await resetBusinessPool();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `Company Gmail source bootstrap refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
