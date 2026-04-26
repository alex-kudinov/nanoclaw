/**
 * register-social-jobs.ts — register host cron jobs for the social minion in data/jobs.json
 *
 * 4 jobs:
 *   1. social-daily-slot     (13:00 CT daily) — fires the rotation slot trigger to social channel
 *   2. linkedin-watch-catalog (hourly)         — runs watch-catalog.sh to detect new/updated blog posts
 *   3. linkedin-auth-refresh  (09:15 CT daily) — host-side auth-refresh (dual-runner with launchd at 09:00)
 *   4. linkedin-watchdog      (09:30 CT daily) — host-side expiry-watchdog (dual-runner)
 *
 * jobs.json is hot-reloaded by NanoClaw — no service restart needed.
 *
 * Usage: npx tsx scripts/register-social-jobs.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const JOBS_PATH = path.join(__dirname, '..', 'data', 'jobs.json');

interface JobEntry {
  id: string;
  cron: string;
  command: string;
  alert_level?: 'alert' | 'warn' | 'silent';
  enabled?: boolean;
  description?: string;
  cwd?: string;
}

const NEW_JOBS: JobEntry[] = [
  {
    id: 'social-daily-slot',
    cron: '0 13 * * *',
    command:
      'echo "Time slot — pick next queued post per rotation table in CLAUDE.md" | curl -s -X POST http://localhost:8088/hook/social-slot -H "Content-Type: text/plain" --data-binary @- || true',
    alert_level: 'warn',
    enabled: false,
    description: 'Daily 13:00 CT rotation slot trigger for #gru-social minion',
  },
  {
    id: 'linkedin-watch-catalog',
    cron: '0 * * * *',
    command:
      '/Users/xbohdpukc/dev/toolbox/shared/linkedin/tools/linkedin/watch-catalog.sh',
    alert_level: 'warn',
    enabled: false,
    description: 'Hourly diff of tandemweb blog catalog → generate-from-post on new/updated slugs',
  },
  {
    id: 'linkedin-auth-refresh',
    cron: '15 9 * * *',
    command:
      '/Users/xbohdpukc/dev/toolbox/shared/linkedin/tools/linkedin/auth-refresh.sh --account all',
    alert_level: 'alert',
    enabled: false,
    description: 'Daily 09:15 CT host-side auth-refresh (dual-runner with launchd at 09:00)',
  },
  {
    id: 'linkedin-watchdog',
    cron: '30 9 * * *',
    command:
      '/Users/xbohdpukc/dev/toolbox/shared/linkedin/tools/linkedin/expiry-watchdog.sh',
    alert_level: 'alert',
    enabled: false,
    description: 'Daily 09:30 CT expiry watchdog (clock skew + token health)',
  },
];

if (!fs.existsSync(JOBS_PATH)) {
  console.error(`ERROR: ${JOBS_PATH} does not exist`);
  process.exit(1);
}

const raw = fs.readFileSync(JOBS_PATH, 'utf-8');
const data = JSON.parse(raw);
data.jobs = data.jobs || [];

let added = 0;
let updated = 0;
for (const job of NEW_JOBS) {
  const idx = data.jobs.findIndex((j: JobEntry) => j.id === job.id);
  if (idx >= 0) {
    data.jobs[idx] = { ...data.jobs[idx], ...job };
    updated++;
  } else {
    data.jobs.push(job);
    added++;
  }
}

// Add toolbox project entry if missing (per ARFPF grounding R2 finding)
data.projects = data.projects || {};
if (!data.projects.toolbox) {
  data.projects.toolbox = {
    root: '/Users/xbohdpukc/dev/toolbox',
    description: 'Shared toolbox: cross-project tools (linkedin, plutio, sertifier, etc.)',
  };
}

// Atomic write
const tmp = `${JOBS_PATH}.tmp.${Date.now()}`;
fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
fs.renameSync(tmp, JOBS_PATH);

console.log(`Added: ${added}, Updated: ${updated}`);
console.log(`Total jobs: ${data.jobs.length}`);
console.log('');
console.log('NOTE: All 4 jobs are added with enabled=false.');
console.log('Enable them after smoke test by editing data/jobs.json (or via this script with ENABLE=1)');
