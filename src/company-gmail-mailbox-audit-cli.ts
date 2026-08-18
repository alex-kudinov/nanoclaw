import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from './business-db.js';
import {
  advanceCompanyGmailMailboxAudit,
  beginCompanyGmailMailboxAudit,
  COMPANY_GMAIL_MAILBOX_AUDIT_MAX_PAGES_PER_ADVANCE,
  createCompanyGmailMailboxAuditReadOnlyPort,
  type CompanyGmailMailboxAuditProgress,
} from './company-gmail-mailbox-audit.js';
import { openReadOnlyGmailMailboxAuditAccounting } from './company-gmail-mailbox-audit-source.js';
import { companyGmailMailboxAuditPostgresStore } from './company-gmail-mailbox-audit-store.js';
import { getGmailClient } from './gmail-auth.js';

export const COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION =
  'NC-20260818-002-GMAIL-READ-ONLY-AUDIT' as const;

export type CompanyGmailMailboxAuditCliOptions =
  | {
      mode: 'start';
      auditId: null;
      maxPages: number;
      confirmation: typeof COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION;
    }
  | {
      mode: 'resume';
      auditId: string;
      maxPages: number;
      confirmation: typeof COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION;
    };

function value(args: string[], index: number, flag: string): string {
  const next = args[index + 1];
  if (!next || next.startsWith('--'))
    throw new Error(`${flag} requires a value`);
  return next;
}

export function parseCompanyGmailMailboxAuditArgs(
  args: string[],
): CompanyGmailMailboxAuditCliOptions {
  let mode: 'start' | 'resume' | null = null;
  let auditId: string | null = null;
  let maxPages: number | null = null;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--start') {
      if (mode !== null) throw new Error('exactly one audit mode is required');
      mode = 'start';
    } else if (arg === '--resume') {
      if (mode !== null) throw new Error('exactly one audit mode is required');
      mode = 'resume';
      auditId = value(args, index, '--resume');
      index++;
    } else if (arg === '--max-pages') {
      if (maxPages !== null)
        throw new Error('--max-pages may appear only once');
      maxPages = Number(value(args, index, '--max-pages'));
      index++;
    } else if (arg === '--confirm-read-only') {
      if (confirmation !== null) {
        throw new Error('--confirm-read-only may appear only once');
      }
      confirmation = value(args, index, '--confirm-read-only');
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (mode === null) throw new Error('exactly one audit mode is required');
  if (
    !Number.isSafeInteger(maxPages) ||
    maxPages === null ||
    maxPages < 1 ||
    maxPages > COMPANY_GMAIL_MAILBOX_AUDIT_MAX_PAGES_PER_ADVANCE
  ) {
    throw new Error(
      `--max-pages must be between 1 and ${COMPANY_GMAIL_MAILBOX_AUDIT_MAX_PAGES_PER_ADVANCE}`,
    );
  }
  if (confirmation !== COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION) {
    throw new Error('exact read-only audit confirmation is required');
  }
  if (mode === 'resume') {
    if (!auditId || !/^[0-9a-f]{64}$/.test(auditId)) {
      throw new Error('--resume requires a lowercase SHA-256 audit ID');
    }
    return {
      mode,
      auditId,
      maxPages,
      confirmation: COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
    };
  }
  if (auditId !== null) throw new Error('--start cannot include an audit ID');
  return {
    mode,
    auditId: null,
    maxPages,
    confirmation: COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
  };
}

export function formatCompanyGmailMailboxAuditReport(
  report: CompanyGmailMailboxAuditProgress,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCompanyGmailMailboxAuditArgs(args);
  const accounting = openReadOnlyGmailMailboxAuditAccounting();
  try {
    if (!accounting.quickCheck()) throw new Error('SQLite quick-check failed');
    const port = createCompanyGmailMailboxAuditReadOnlyPort(getGmailClient(), {
      now: () => new Date().toISOString(),
      accountCandidate: accounting.accountCandidate,
    });
    const auditId =
      options.mode === 'start'
        ? (
            await beginCompanyGmailMailboxAudit(
              port,
              companyGmailMailboxAuditPostgresStore,
            )
          ).auditId
        : options.auditId;
    const report = await advanceCompanyGmailMailboxAudit(
      auditId,
      options.maxPages,
      port,
      companyGmailMailboxAuditPostgresStore,
    );
    process.stdout.write(formatCompanyGmailMailboxAuditReport(report));
  } finally {
    accounting.close();
    await resetBusinessPool();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `Company Gmail mailbox audit refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
