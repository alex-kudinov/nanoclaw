#!/usr/bin/env npx tsx
/**
 * Register the plutio-outbox-reaper job in data/jobs.json.
 *
 * Idempotent on `name`: re-running replaces the existing entry.
 *
 * Usage:
 *   npx tsx scripts/register-plutio-reaper.ts
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
  name: 'plutio-outbox-reaper',
  description:
    'Process pending Plutio outbox rows — sync parties, create proposals/invoices/contracts',
  project: 'nanoclaw',
  script: 'tools/plutio/run-reaper.sh',
  args: [],
  cron: '*/15 * * * *',
  timezone: 'America/Chicago',
  retries: 0,
  retry_delay_ms: 0,
  alert_level: 'warn',
  timeout_ms: 600_000,
  lockfile: '/tmp/nanoclaw-plutio-reaper.lock',
  enabled: true,
};

function main(): void {
  const raw = readFileSync(JOBS_FILE, 'utf-8');
  const config = JSON.parse(raw) as {
    projects: Record<string, string>;
    jobs: JobEntry[];
  };
  if (!Array.isArray(config.jobs)) {
    throw new Error(
      `register-plutio-reaper: ${JOBS_FILE} has no "jobs" array`,
    );
  }
  const existingIdx = config.jobs.findIndex((j) => j.name === JOB.name);
  let action: 'added' | 'updated';
  if (existingIdx >= 0) {
    config.jobs[existingIdx] = JOB;
    action = 'updated';
  } else {
    config.jobs.push(JOB);
    action = 'added';
  }
  writeFileSync(JOBS_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(
    `register-plutio-reaper: ${action} ${JOB.name} (enabled=${JOB.enabled})`,
  );
  console.log(`  File: ${JOBS_FILE}`);
  console.log(`  Schedule: ${JOB.cron} ${JOB.timezone}`);
}

main();
