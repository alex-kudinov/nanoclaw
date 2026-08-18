import { pathToFileURL } from 'node:url';

import { getBusinessPool, resetBusinessPool } from './business-db.js';
import { GMAIL_MONITORED_EMAIL } from './config.js';
import {
  deriveGmailHistoricalCoverageScopeIdentity,
  runGmailHistoricalCoverageAudit,
  type GmailHistoricalCoverageReport,
} from './gmail-historical-coverage.js';
import {
  makeReadOnlyClassificationEvidenceReader,
  MAX_GMAIL_HISTORICAL_COVERAGE_IDS,
  openReadOnlyGmailHistoricalCoverageSource,
} from './gmail-historical-coverage-source.js';

export const GMAIL_HISTORICAL_COVERAGE_CONFIRMATION =
  'NC-010-RETAINED-HOST-COVERAGE-READ-ONLY';

export interface GmailHistoricalCoverageCliOptions {
  maxIds: number;
  confirmation: typeof GMAIL_HISTORICAL_COVERAGE_CONFIRMATION;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function maxIds(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('--max-ids requires a positive integer');
  }
  const value = Number(raw);
  if (value > MAX_GMAIL_HISTORICAL_COVERAGE_IDS) {
    throw new Error(
      `--max-ids cannot exceed ${MAX_GMAIL_HISTORICAL_COVERAGE_IDS}`,
    );
  }
  return value;
}

export function parseGmailHistoricalCoverageArgs(
  args: string[],
): GmailHistoricalCoverageCliOptions {
  let boundedIds: number | null = null;
  let confirmation: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--max-ids') {
      boundedIds = maxIds(requiredValue(args, index, '--max-ids'));
      index++;
    } else if (arg === '--confirm-read-only') {
      confirmation = requiredValue(args, index, '--confirm-read-only');
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (boundedIds === null) throw new Error('--max-ids is required');
  if (confirmation !== GMAIL_HISTORICAL_COVERAGE_CONFIRMATION) {
    throw new Error('exact read-only coverage confirmation is required');
  }
  return {
    maxIds: boundedIds,
    confirmation: GMAIL_HISTORICAL_COVERAGE_CONFIRMATION,
  };
}

export function formatGmailHistoricalCoverageReport(
  report: GmailHistoricalCoverageReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function main(
  args = process.argv.slice(2),
  now = new Date(),
): Promise<void> {
  const options = parseGmailHistoricalCoverageArgs(args);
  const chatJid = `gmail:${GMAIL_MONITORED_EMAIL}`;
  const sqlite = openReadOnlyGmailHistoricalCoverageSource({
    chatJid,
    maxIds: options.maxIds,
  });
  try {
    const report = await runGmailHistoricalCoverageAudit({
      scopeIdentity: deriveGmailHistoricalCoverageScopeIdentity(chatJid),
      generatedAt: now.toISOString(),
      deps: {
        listCandidates: sqlite.listCandidates,
        listClassificationEvidence:
          makeReadOnlyClassificationEvidenceReader(getBusinessPool()),
      },
    });
    process.stdout.write(formatGmailHistoricalCoverageReport(report));
    if (report.unknown.total > 0) process.exitCode = 2;
  } finally {
    sqlite.close();
    await resetBusinessPool();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `Gmail historical coverage refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
