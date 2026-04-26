#!/usr/bin/env npx tsx
/**
 * Register the gmail-label-poll job in data/jobs.json.
 *
 * Idempotent on `name`. Enabled by default — the poller is safe on a clean
 * mailbox (bootstraps historyId and returns zero) and only emits IPCs when
 * Gmail label drift is detected, so there's no risk in leaving it on.
 *
 * Usage:
 *   npx tsx scripts/register-label-poll.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JOBS_FILE = resolve(__dirname, '..', 'data', 'jobs.json');

interface JobEntry {
  name: string;
  description: string;
  project: string;
  script: string;
  args: string[];
  cron: string;
  timezone: string;
  retries: number;
  retry_delay_ms: number;
  alert_level: string;
  timeout_ms: number;
  lockfile: string;
  enabled: boolean;
}

const JOB: JobEntry = {
  name: 'gmail-label-poll',
  description: 'Detect operator corrections via Gmail label changes → route_lesson',
  project: 'nanoclaw',
  script: 'tools/gmail/run-label-poll.sh',
  args: [],
  cron: '*/5 * * * *',
  timezone: 'America/Chicago',
  retries: 0,
  retry_delay_ms: 0,
  alert_level: 'warn',
  timeout_ms: 180_000,
  lockfile: '/tmp/nanoclaw-gmail-label-poll.lock',
  enabled: true,
};

function main(): void {
  const raw = readFileSync(JOBS_FILE, 'utf-8');
  const config = JSON.parse(raw) as {
    projects: Record<string, string>;
    jobs: JobEntry[];
  };
  if (!Array.isArray(config.jobs)) {
    throw new Error(`register-label-poll: ${JOBS_FILE} has no "jobs" array`);
  }
  const idx = config.jobs.findIndex((j) => j.name === JOB.name);
  const action = idx >= 0 ? 'updated' : 'added';
  if (idx >= 0) config.jobs[idx] = JOB;
  else config.jobs.push(JOB);
  writeFileSync(JOBS_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`register-label-poll: ${action} ${JOB.name} (enabled=${JOB.enabled})`);
  console.log(`  File: ${JOBS_FILE}`);
  console.log(`  Schedule: ${JOB.cron} ${JOB.timezone}`);
}

main();
