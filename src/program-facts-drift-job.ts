/** Compiled scheduled entrypoint for program-facts detection and pickup. */

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { WebClient } from '@slack/web-api';

import { resetBusinessPool } from './business-db.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import {
  applyProgramFactsCompanyWork,
  type ProgramFactsCompanyWorkResult,
} from './program-facts-company-work.js';
import {
  runProgramFactsDriftWithEvidence,
  type DriftResult,
  type ProgramFactsDriftRun,
} from './program-facts-drift.js';

const DEFAULT_CHANNEL = 'C0AHV1SGT6W'; // #gru-sales

export type ProgramFactsCompanyWorkMode = 'off' | 'active';

export interface ProgramFactsDriftJobResult {
  detector: DriftResult;
  companyWork: ProgramFactsCompanyWorkResult | null;
  notification: 'not_needed' | 'posted' | 'token_missing';
}

export interface ProgramFactsDriftJobDependencies {
  runDetector(): Promise<ProgramFactsDriftRun>;
  applyCompanyWork(
    input: Parameters<typeof applyProgramFactsCompanyWork>[0],
  ): Promise<ProgramFactsCompanyWorkResult>;
  postNotification(text: string): Promise<'posted' | 'token_missing'>;
}

export interface ProgramFactsDriftJobOptions {
  mode?: ProgramFactsCompanyWorkMode;
  runKey?: string;
  observedAt?: string;
  dependencies?: ProgramFactsDriftJobDependencies;
}

export function resolveProgramFactsCompanyWorkMode(
  value = process.env.PROGRAM_FACTS_COMPANY_WORK_MODE,
): ProgramFactsCompanyWorkMode {
  if (!value || value === 'off') return 'off';
  if (value === 'active') return 'active';
  throw new Error('PROGRAM_FACTS_COMPANY_WORK_MODE must be off or active');
}

function formatDriftMessage(
  result: DriftResult,
  work: ProgramFactsCompanyWorkResult | null,
): string {
  const lines = result.findings.map(
    (finding) => `• *${finding.program}* — ${finding.detail}`,
  );
  const backend = work?.workItem
    ? [
        `Backend pickup: Company Work *#${work.workItem.id}* is ${work.workItem.disposition}; Chief fact-authority review is required.`,
        'The backend records and routes the exception but never auto-overwrites a source.',
      ]
    : [
        'Backend pickup is not active for this run; this alert is notify-only.',
        'Reconcile the facts file + KB (or fix the source); this guard never auto-overwrites.',
      ];
  return [
    `:warning: *Program-facts drift* — ${result.findings.length} issue(s); ${result.checked} program(s) checked.`,
    ...backend,
    'Curated `facts/programs.yaml` diverges from products.json / the sales KB. ' +
      'Use the compared sources to determine the authoritative correction.',
    ...lines,
  ].join('\n');
}

function formatClosureMessage(workItemId: string): string {
  return [
    `:white_check_mark: *Program-facts drift closed* — Company Work *#${workItemId}* now has an exact clean-detector receipt.`,
    'No fact or knowledge source was auto-overwritten; closure reflects the reconciled detector result only.',
  ].join('\n');
}

async function postNotification(
  text: string,
): Promise<'posted' | 'token_missing'> {
  const values = readEnvFile([
    'SLACK_BOT_TOKEN',
    'PROGRAM_FACTS_DRIFT_CHANNEL',
  ]);
  const token = values.SLACK_BOT_TOKEN;
  if (!token) {
    logger.warn('program-facts-drift: SLACK_BOT_TOKEN missing, cannot alert');
    return 'token_missing';
  }
  const channel =
    process.env.PROGRAM_FACTS_DRIFT_CHANNEL ||
    values.PROGRAM_FACTS_DRIFT_CHANNEL ||
    DEFAULT_CHANNEL;
  await new WebClient(token).chat.postMessage({ channel, text });
  return 'posted';
}

const DEFAULT_DEPENDENCIES: ProgramFactsDriftJobDependencies = {
  runDetector: runProgramFactsDriftWithEvidence,
  applyCompanyWork: applyProgramFactsCompanyWork,
  postNotification,
};

export async function runProgramFactsDriftJob(
  options: ProgramFactsDriftJobOptions = {},
): Promise<ProgramFactsDriftJobResult> {
  const mode = options.mode ?? resolveProgramFactsCompanyWorkMode();
  const dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES;
  const detector = await dependencies.runDetector();
  const runKey =
    options.runKey ??
    process.env.NANOCLAW_JOB_RUN_ID ??
    `manual-${crypto.randomUUID()}`;
  const observedAt =
    options.observedAt ??
    process.env.NANOCLAW_JOB_STARTED_AT ??
    new Date().toISOString();
  let companyWork: ProgramFactsCompanyWorkResult | null = null;

  if (mode === 'active') {
    companyWork = await dependencies.applyCompanyWork({
      runKey,
      observedAt,
      result: detector.result,
      evidence: detector.evidence,
    });
  }

  logger.info(
    {
      checked: detector.result.checked,
      drift: detector.result.findings.length,
      companyWorkMode: mode,
      companyWorkId: companyWork?.workItem?.id ?? null,
      companyWorkOutcome: companyWork?.outcome ?? null,
    },
    'program-facts-drift: done',
  );

  if (detector.result.findings.length > 0) {
    logger.warn(
      { findings: detector.result.findings },
      'program-facts-drift: DRIFT',
    );
    if (mode === 'off' || companyWork?.shouldNotify) {
      return {
        detector: detector.result,
        companyWork,
        notification: await dependencies.postNotification(
          formatDriftMessage(detector.result, companyWork),
        ),
      };
    }
  } else if (
    companyWork?.outcome === 'closed' &&
    companyWork.shouldNotify &&
    companyWork.workItem
  ) {
    return {
      detector: detector.result,
      companyWork,
      notification: await dependencies.postNotification(
        formatClosureMessage(companyWork.workItem.id),
      ),
    };
  }

  return {
    detector: detector.result,
    companyWork,
    notification: 'not_needed',
  };
}

export async function main(): Promise<void> {
  try {
    await runProgramFactsDriftJob();
  } finally {
    await resetBusinessPool();
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (directEntry) {
  main().catch((err) => {
    logger.error({ err }, 'program-facts-drift: fatal');
    process.exitCode = 1;
  });
}
