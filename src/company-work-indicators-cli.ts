import { pathToFileURL } from 'node:url';

import { resetBusinessPool } from './business-db.js';
import {
  MAX_COMPANY_WORK_INDICATOR_WINDOW_DAYS,
  safeReadCompanyWorkIndicatorReport,
  type CompanyWorkIndicatorOptions,
  type CompanyWorkIndicatorResult,
} from './company-work-indicators.js';

interface CliOptions extends CompanyWorkIndicatorOptions {
  json: boolean;
}

function windowDays(raw: string | undefined): number {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('--window-days requires a positive integer');
  }
  const value = Number(raw);
  if (value > MAX_COMPANY_WORK_INDICATOR_WINDOW_DAYS) {
    throw new Error(
      `--window-days cannot exceed ${MAX_COMPANY_WORK_INDICATOR_WINDOW_DAYS}`,
    );
  }
  return value;
}

export function parseCompanyWorkIndicatorArgs(args: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--window-days') {
      options.windowDays = windowDays(args[++index]);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function formatOk(
  result: Extract<CompanyWorkIndicatorResult, { status: 'ok' }>,
): string {
  const completion = result.acceptedVersusCompleted;
  const latency = result.completionLatencyMs;
  const rate =
    completion.completionRate === null
      ? 'unavailable'
      : `${(completion.completionRate * 100).toFixed(2)}%`;
  const latencyText =
    latency.sampleSize === 0
      ? 'unavailable (no completed samples)'
      : `p50=${latency.p50}ms p95=${latency.p95}ms max=${latency.max}ms n=${latency.sampleSize}`;
  return (
    [
      `Company work service indicators — ${result.generatedAt}`,
      `workflow=sales_email window=${result.window.days}d accepted=${completion.accepted} completed=${completion.completed} incomplete=${completion.incomplete} completion_rate=${rate}`,
      `completion_latency=${latencyText}`,
      `customer_visible_defect_reversal=unavailable (${result.customerVisibleDefectReversal.reason})`,
    ].join('\n') + '\n'
  );
}

export function formatCompanyWorkIndicatorResult(
  result: CompanyWorkIndicatorResult,
  json: boolean,
): string {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'unavailable') {
    return `Company work service indicators unavailable — ${result.errorCode} (${result.generatedAt})\n`;
  }
  return formatOk(result);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCompanyWorkIndicatorArgs(args);
  try {
    const result = await safeReadCompanyWorkIndicatorReport(options);
    process.stdout.write(
      formatCompanyWorkIndicatorResult(result, options.json),
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
      `Company work service indicators refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
