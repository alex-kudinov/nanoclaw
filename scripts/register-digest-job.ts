#!/usr/bin/env npx tsx
/**
 * Register the two daily digest jobs in data/jobs.json (digest-alex, digest-cherie).
 *
 * Idempotent on `name`: re-running replaces existing entries rather than duplicating.
 *
 * Usage:
 *   npx tsx scripts/register-digest-job.ts           # registers with enabled=false (safe default)
 *   npx tsx scripts/register-digest-job.ts --enable  # registers with enabled=true
 *
 * NEVER call upsertJobDefinition() directly from a script — data/jobs.json is
 * the single source of truth, and src/job-registry.ts:loadJobRegistry() will
 * auto-disable any DB job missing from this file on the next watcher tick.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JOBS_FILE = resolve(__dirname, '..', 'data', 'jobs.json');

const ENABLE_FLAG = process.argv.includes('--enable');

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

function buildJob(recipient: 'alex' | 'cherie'): JobEntry {
  return {
    name: `digest-${recipient}`,
    description: `Daily Important Email digest for ${recipient.charAt(0).toUpperCase() + recipient.slice(1)}`,
    project: 'nanoclaw',
    script: 'tools/digest/run-digest.sh',
    args: ['--recipient', recipient],
    cron: '0 7 * * *',
    timezone: 'America/Chicago',
    retries: 1,
    retry_delay_ms: 300_000,
    alert_level: 'alert',
    timeout_ms: 600_000,
    lockfile: `/tmp/nanoclaw-digest-${recipient}.lock`,
    enabled: ENABLE_FLAG,
  };
}

function main(): void {
  const raw = readFileSync(JOBS_FILE, 'utf-8');
  const config = JSON.parse(raw) as { projects: Record<string, string>; jobs: JobEntry[] };
  if (!Array.isArray(config.jobs)) {
    throw new Error(`register-digest-job: ${JOBS_FILE} has no "jobs" array`);
  }
  const newJobs = [buildJob('cherie'), buildJob('alex')];
  let added = 0;
  let updated = 0;
  for (const job of newJobs) {
    const existingIdx = config.jobs.findIndex((j) => j.name === job.name);
    if (existingIdx >= 0) {
      config.jobs[existingIdx] = job;
      updated++;
    } else {
      config.jobs.push(job);
      added++;
    }
  }
  writeFileSync(JOBS_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(
    `register-digest-job: ${added} added, ${updated} updated (enabled=${ENABLE_FLAG})`,
  );
  console.log(`  File: ${JOBS_FILE}`);
  if (!ENABLE_FLAG) {
    console.log('\nJobs registered but DISABLED. Re-run with --enable to turn them on.');
  }
}

main();
