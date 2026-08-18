import path from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';

import { resetBusinessPool, withTransaction } from './business-db.js';
import {
  COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION,
  companyGmailRuntimeAlignmentDependencies,
  runCompanyGmailRuntimeAlignment,
  type CompanyGmailRuntimeAlignmentMode,
  type CompanyGmailRuntimeAlignmentReport,
} from './company-gmail-runtime-alignment.js';
import { createCompanyGmailRuntimeAlignmentReadOnlyPort } from './company-gmail-runtime-alignment-source.js';
import { openReadOnlyGmailMailboxAuditAccounting } from './company-gmail-mailbox-audit-source.js';
import { STORE_DIR } from './config.js';
import { getGmailClient } from './gmail-auth.js';

interface Options {
  mode: CompanyGmailRuntimeAlignmentMode;
  expectedSqliteCursorSha256: string;
  expectedWatermarkCursorSha256: string;
  observedAt: string;
  confirmation: typeof COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION | null;
}

function value(args: string[], index: number, flag: string): string {
  const next = args[index + 1];
  if (!next || next.startsWith('--'))
    throw new Error(`${flag} requires a value`);
  return next;
}

export function parseCompanyGmailRuntimeAlignmentArgs(args: string[]): Options {
  let mode: CompanyGmailRuntimeAlignmentMode | null = null;
  let expectedSqliteCursorSha256: string | null = null;
  let expectedWatermarkCursorSha256: string | null = null;
  let observedAt: string | null = null;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (mode !== null) throw new Error('exactly one mode is required');
      mode = arg === '--apply' ? 'apply' : 'dry_run';
    } else if (arg === '--expected-sqlite-cursor-sha256') {
      if (expectedSqliteCursorSha256 !== null)
        throw new Error(`${arg} may appear only once`);
      expectedSqliteCursorSha256 = value(args, index++, arg);
    } else if (arg === '--expected-watermark-cursor-sha256') {
      if (expectedWatermarkCursorSha256 !== null)
        throw new Error(`${arg} may appear only once`);
      expectedWatermarkCursorSha256 = value(args, index++, arg);
    } else if (arg === '--observed-at') {
      if (observedAt !== null) throw new Error(`${arg} may appear only once`);
      observedAt = value(args, index++, arg);
    } else if (arg === '--confirm-apply') {
      if (confirmation !== null) throw new Error(`${arg} may appear only once`);
      confirmation = value(args, index++, arg);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (mode === null) throw new Error('exactly one mode is required');
  for (const [flag, digest] of [
    ['--expected-sqlite-cursor-sha256', expectedSqliteCursorSha256],
    ['--expected-watermark-cursor-sha256', expectedWatermarkCursorSha256],
  ] as const) {
    if (!digest || !/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`${flag} is required and must be lowercase SHA-256`);
    }
  }
  if (!observedAt) throw new Error('--observed-at is required');
  if (
    mode === 'apply' &&
    confirmation !== COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION
  ) {
    throw new Error('exact apply confirmation is required');
  }
  if (mode === 'dry_run' && confirmation !== null) {
    throw new Error('--confirm-apply is not valid for dry-run');
  }
  return {
    mode,
    expectedSqliteCursorSha256: expectedSqliteCursorSha256!,
    expectedWatermarkCursorSha256: expectedWatermarkCursorSha256!,
    observedAt,
    confirmation:
      mode === 'apply' ? COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION : null,
  };
}

export function formatCompanyGmailRuntimeAlignmentReport(
  report: CompanyGmailRuntimeAlignmentReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCompanyGmailRuntimeAlignmentArgs(args);
  const sqlitePath = path.join(STORE_DIR, 'messages.db');
  const database = new Database(sqlitePath, {
    readonly: true,
    fileMustExist: true,
  });
  database.pragma('query_only = ON');
  const accounting = openReadOnlyGmailMailboxAuditAccounting({ sqlitePath });
  try {
    if (
      database.pragma('quick_check', { simple: true }) !== 'ok' ||
      !accounting.quickCheck()
    ) {
      throw new Error('SQLite quick-check failed');
    }
    const statement = database.prepare(
      "SELECT value FROM router_state WHERE key = 'gmail_history_id'",
    );
    const readSqliteCursor = (): string => {
      const row = statement.get() as { value?: unknown } | undefined;
      if (!row || typeof row.value !== 'string') {
        throw new Error('durable Gmail history cursor is unavailable');
      }
      return row.value;
    };
    const port = createCompanyGmailRuntimeAlignmentReadOnlyPort(
      getGmailClient(),
      accounting.accountCandidate,
    );
    const report = await runCompanyGmailRuntimeAlignment(options, {
      ...companyGmailRuntimeAlignmentDependencies,
      readSqliteCursor,
      listClosedRange: port.listClosedRange,
      withTransaction,
      now: () => new Date().toISOString(),
    });
    process.stdout.write(formatCompanyGmailRuntimeAlignmentReport(report));
  } finally {
    accounting.close();
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
      `Company Gmail runtime alignment refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
