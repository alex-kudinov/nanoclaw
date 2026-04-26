#!/usr/bin/env npx tsx
/**
 * Register the hive-sync-reaper job in data/jobs.json.
 *
 * Idempotent on `name`: re-running replaces the existing entry rather than
 * duplicating. Enabled by default — the reaper's whole purpose is keeping
 * hive_synced rows flowing, so there's no value in a pre-enable soak.
 *
 * Usage:
 *   npx tsx scripts/register-hive-reaper.ts
 *
 * NEVER call upsertJobDefinition() directly from a script — data/jobs.json
 * is the single source of truth, and loadJobRegistry() will auto-disable any
 * DB job missing from this file on the next watcher tick.
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
  name: 'hive-sync-reaper',
  description: 'Retry failed Hive Firestore writes for classified emails',
  project: 'nanoclaw',
  script: 'tools/hive/run-reaper.sh',
  args: [],
  cron: '*/15 * * * *',
  timezone: 'America/Chicago',
  retries: 0,
  retry_delay_ms: 0,
  alert_level: 'warn',
  timeout_ms: 600_000,
  lockfile: '/tmp/nanoclaw-hive-reaper.lock',
  enabled: true,
};

function main(): void {
  const raw = readFileSync(JOBS_FILE, 'utf-8');
  const config = JSON.parse(raw) as {
    projects: Record<string, string>;
    jobs: JobEntry[];
  };
  if (!Array.isArray(config.jobs)) {
    throw new Error(`register-hive-reaper: ${JOBS_FILE} has no "jobs" array`);
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
  console.log(`register-hive-reaper: ${action} ${JOB.name} (enabled=${JOB.enabled})`);
  console.log(`  File: ${JOBS_FILE}`);
  console.log(`  Schedule: ${JOB.cron} ${JOB.timezone}`);
}

main();
