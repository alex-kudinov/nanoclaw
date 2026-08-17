import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from './business-db.js';
import {
  safeReadCompanyWorkExceptionReport,
  type CompanyWorkExceptionReport,
  type CompanyWorkExceptionResult,
  type CompanyWorkReportOptions,
  type CompanyWorkReportWorkflowFilter,
} from './company-work-report.js';

interface CliOptions extends CompanyWorkReportOptions {
  json: boolean;
}

function positiveInteger(raw: string | undefined, flag: string): number {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return Number(raw);
}

function workflowFilter(
  raw: string | undefined,
): CompanyWorkReportWorkflowFilter {
  if (raw === 'all' || raw === 'sales_email' || raw === 'host_job_run') {
    return raw;
  }
  throw new Error('--workflow requires all, sales_email, or host_job_run');
}

export function parseCompanyWorkReportArgs(args: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--limit') {
      options.limit = positiveInteger(args[++index], '--limit');
    } else if (arg === '--stale-after-hours') {
      options.staleAfterHours = positiveInteger(
        args[++index],
        '--stale-after-hours',
      );
    } else if (arg === '--workflow') {
      options.workflow = workflowFilter(args[++index]);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function formatOkReport(report: CompanyWorkExceptionReport): string {
  const lines = [
    `Company work exceptions — ${report.generatedAt}`,
    `scanned=${report.scanned}/${report.totalAvailable} sales=${report.summary.byWorkflow.sales_email} jobs=${report.summary.byWorkflow.host_job_run} completed=${report.summary.completed} healthy_open=${report.summary.healthyOpen} exceptions=${report.summary.exceptionItems} critical=${report.summary.critical} attention=${report.summary.attention} watch=${report.summary.watch}`,
  ];
  if (report.truncated) {
    lines.push(
      'WARNING: report is truncated; raise --limit for full coverage.',
    );
  }
  if (report.exceptions.length === 0) {
    lines.push('No ledger exceptions in the bounded result.');
  }
  for (const item of report.exceptions) {
    const age = item.ageMinutes === null ? 'unknown' : `${item.ageMinutes}m`;
    lines.push(
      `[${item.severity.toUpperCase()}] workflow=${item.workflowType} work=${item.workItemId} source=${item.sourceSystem}/${item.sourceKey} party=${item.partyId ?? '-'} pipeline=${item.pipelineEntryId ?? '-'} state=${item.stage}/${item.disposition} age=${age} reasons=${item.reasons.map((reason) => `${reason.kind}:${reason.code}`).join(',')}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function formatCompanyWorkExceptionResult(
  result: CompanyWorkExceptionResult,
  json: boolean,
): string {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'unavailable') {
    return `Company work exceptions unavailable — ${result.errorCode} (${result.generatedAt})\n`;
  }
  return formatOkReport(result);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCompanyWorkReportArgs(args);
  try {
    const result = await safeReadCompanyWorkExceptionReport(options);
    process.stdout.write(
      formatCompanyWorkExceptionResult(result, options.json),
    );
    if (result.status === 'unavailable') process.exitCode = 1;
  } finally {
    await resetBusinessPool();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `Company work exceptions refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
