#!/usr/bin/env npx tsx
/**
 * Entry point for the program-facts-drift cron job.
 * Invoked via tools/facts/run-program-facts-drift.sh by the NanoClaw
 * scheduler (data/jobs.json → program-facts-drift, daily).
 *
 * Notify-only: posts a Slack alert when curated facts/programs.yaml diverges
 * from products.json or the sales KB. Exit 0 even on drift (drift is a
 * notification, not a job failure); exit 1 only on unrecoverable error.
 */
import { WebClient } from '@slack/web-api';

import { readEnvFile } from '../src/env.js';
import { logger } from '../src/logger.js';
import {
  runProgramFactsDrift,
  type DriftResult,
} from '../src/program-facts-drift.js';

const DEFAULT_CHANNEL = 'C0AHV1SGT6W'; // #gru-sales

function formatMessage(r: DriftResult): string {
  const lines = r.findings.map((f) => `• *${f.program}* — ${f.detail}`);
  return [
    `:warning: *Program-facts drift* — ${r.findings.length} issue(s) across ${r.checked} program(s).`,
    'Curated `facts/programs.yaml` diverges from products.json / the sales KB. ' +
      'Reconcile the facts file + KB (or fix the source) — this guard never auto-overwrites.',
    ...lines,
  ].join('\n');
}

async function notify(text: string): Promise<void> {
  const token = readEnvFile(['SLACK_BOT_TOKEN']).SLACK_BOT_TOKEN;
  if (!token) {
    logger.warn('program-facts-drift: SLACK_BOT_TOKEN missing, cannot alert');
    return;
  }
  const channel = process.env.PROGRAM_FACTS_DRIFT_CHANNEL || DEFAULT_CHANNEL;
  await new WebClient(token).chat.postMessage({ channel, text });
}

async function main(): Promise<void> {
  const result = await runProgramFactsDrift();
  logger.info(
    { checked: result.checked, drift: result.findings.length },
    'program-facts-drift: done',
  );
  if (result.findings.length > 0) {
    logger.warn({ findings: result.findings }, 'program-facts-drift: DRIFT');
    await notify(formatMessage(result));
  }
}

main().catch((err) => {
  logger.error({ err }, 'program-facts-drift: fatal');
  process.exit(1);
});
