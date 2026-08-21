import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  getBusinessPool,
  resetBusinessPool,
  withTransaction,
} from './business-db.js';
import {
  COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
  runCompanyWorkOutcomeAssessment,
  type CompanyWorkOutcomeAssessment,
  type CompanyWorkOutcomeAssessmentInput,
  type CompanyWorkOutcomeAssessmentMode,
  type CompanyWorkOutcomeAssessmentReport,
} from './company-work-outcome-quality-assessment.js';
import {
  verifyRuntimeRelease,
  type ReleaseIdentity,
} from './release-integrity.js';

export interface CompanyWorkOutcomeAssessmentCliOptions extends CompanyWorkOutcomeAssessmentInput {
  confirmHost: string | null;
  expectedRelease: string | null;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function setOnce(
  values: Map<string, string>,
  flag: string,
  value: string,
): void {
  if (values.has(flag)) throw new Error(`${flag} may appear only once`);
  values.set(flag, value);
}

function required(values: Map<string, string>, flag: string): string {
  const value = values.get(flag);
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

function parseVersion(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('--delivery-event-version must be a nonnegative integer');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('--delivery-event-version must be a safe integer');
  }
  return parsed;
}

export function parseCompanyWorkOutcomeAssessmentArgs(
  args: string[],
): CompanyWorkOutcomeAssessmentCliOptions {
  let mode: CompanyWorkOutcomeAssessmentMode = 'dry_run';
  let modeSeen = false;
  const values = new Map<string, string>();
  const valueFlags = new Set([
    '--work-item-id',
    '--delivery-event-version',
    '--assessment',
    '--source-key-sha256',
    '--evidence-sha256',
    '--assessor-key-sha256',
    '--evidence-occurred-at',
    '--assessed-at',
    '--expected-plan-sha256',
    '--confirm-apply',
    '--confirm-host',
    '--expected-release',
  ]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run' || arg === '--apply') {
      if (modeSeen) throw new Error('mode may appear only once');
      modeSeen = true;
      mode = arg === '--apply' ? 'apply' : 'dry_run';
    } else if (valueFlags.has(arg)) {
      setOnce(values, arg, requiredValue(args, index, arg));
      index++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  const expectedPlanSha256 = values.get('--expected-plan-sha256') ?? null;
  const confirmation = values.get('--confirm-apply') ?? null;
  const confirmHost = values.get('--confirm-host') ?? null;
  const expectedRelease = values.get('--expected-release') ?? null;
  if (mode === 'apply') {
    if (!expectedPlanSha256) {
      throw new Error('--expected-plan-sha256 is required with --apply');
    }
    if (confirmation !== COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION) {
      throw new Error('exact --confirm-apply value is required with --apply');
    }
    if (!confirmHost)
      throw new Error('--confirm-host is required with --apply');
    if (!expectedRelease || !/^[0-9a-f]{40}$/.test(expectedRelease)) {
      throw new Error(
        '--expected-release must be a lowercase full commit with --apply',
      );
    }
  } else if (
    expectedPlanSha256 !== null ||
    confirmation !== null ||
    confirmHost !== null ||
    expectedRelease !== null
  ) {
    throw new Error('apply confirmation flags are not valid for dry-run');
  }

  return {
    mode,
    workItemId: required(values, '--work-item-id'),
    deliveryEventVersion: parseVersion(
      required(values, '--delivery-event-version'),
    ),
    assessment: required(
      values,
      '--assessment',
    ) as CompanyWorkOutcomeAssessment,
    sourceKeySha256: required(values, '--source-key-sha256'),
    evidenceSha256: required(values, '--evidence-sha256'),
    assessorKeySha256: required(values, '--assessor-key-sha256'),
    evidenceOccurredAt: required(values, '--evidence-occurred-at'),
    assessedAt: required(values, '--assessed-at'),
    expectedPlanSha256,
    confirmation:
      mode === 'apply' ? COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION : null,
    confirmHost,
    expectedRelease,
  };
}

export function formatCompanyWorkOutcomeAssessmentReport(input: {
  report: CompanyWorkOutcomeAssessmentReport;
  runtime: ReleaseIdentity | null;
}): string {
  return `${JSON.stringify(
    {
      ...input.report,
      runtime:
        input.runtime === null
          ? { requiredForApply: true, verified: null }
          : {
              requiredForApply: true,
              verified: input.runtime.verified,
              commit: input.runtime.commit,
              sourceTree: input.runtime.sourceTree,
              artifactHash: input.runtime.artifactHash,
              nodeVersion: input.runtime.nodeVersion,
              codeRootMatchesRelease: input.runtime.codeRootMatchesRelease,
            },
    },
    null,
    2,
  )}\n`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCompanyWorkOutcomeAssessmentArgs(args);
  let runtime: ReleaseIdentity | null = null;
  if (options.mode === 'apply') {
    const hostname = os.hostname();
    if (options.confirmHost !== hostname) {
      throw new Error(`--apply requires --confirm-host ${hostname}`);
    }
    runtime = verifyRuntimeRelease({
      requireManifest: true,
      expectedCommit: options.expectedRelease ?? undefined,
      codeRoot: path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
      ),
    });
    if (
      runtime.mode !== 'release' ||
      !runtime.verified ||
      !runtime.codeRootMatchesRelease
    ) {
      throw new Error('apply requires an exact verified release runtime');
    }
  }
  try {
    const pool = getBusinessPool();
    const report = await runCompanyWorkOutcomeAssessment(options, {
      query: pool.query.bind(pool),
      withTransaction,
      now: () => new Date().toISOString(),
    });
    process.stdout.write(
      formatCompanyWorkOutcomeAssessmentReport({ report, runtime }),
    );
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
      `Company outcome assessment refused: ${error instanceof Error ? error.message : 'invalid invocation'}\n`,
    );
    process.exitCode = 1;
  });
}
