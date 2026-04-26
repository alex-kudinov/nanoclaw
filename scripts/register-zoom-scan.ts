#!/usr/bin/env npx tsx
/**
 * Register the Zoom recording scan job with NanoClaw's scheduler.
 * Run on Mac Mini: npx tsx scripts/register-zoom-scan.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JOBS_FILE = resolve(__dirname, '..', 'data', 'jobs.json');

const zoomJob = {
  name: 'zoom-recording-scan',
  description: 'Poll Zoom accounts for new recordings and process them',
  script: `${process.env.HOME}/dev/toolbox/shared/zoom/tools/zoom/scan-recordings.sh`,
  project_root: resolve(__dirname, '..'),
  cron: '15 * * * *',           // :15 past every hour (avoids :00 congestion)
  timezone: 'America/Chicago',
  lockfile: '/tmp/zoom-scan.lock',
  retries: 1,
  retry_delay_ms: 60000,
  alert_level: 'warn',
  timeout_ms: 600000,           // 10 min (downloads can be large)
  enabled: true,
};

// Load existing jobs
let jobs: any[] = [];
if (existsSync(JOBS_FILE)) {
  jobs = JSON.parse(readFileSync(JOBS_FILE, 'utf-8'));
}

// Check if already registered
const existing = jobs.findIndex((j: any) => j.name === zoomJob.name);
if (existing >= 0) {
  jobs[existing] = zoomJob;
  console.log(`Updated existing job: ${zoomJob.name}`);
} else {
  jobs.push(zoomJob);
  console.log(`Registered new job: ${zoomJob.name}`);
}

writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2) + '\n');
console.log(`Jobs file: ${JOBS_FILE} (${jobs.length} jobs)`);
console.log(`Schedule: ${zoomJob.cron} (${zoomJob.timezone})`);
console.log('\nDon\'t forget to add Zoom credentials to ~/dev/.env.shared:');
console.log('  ZOOM_TANDEM_ACCOUNT_ID=...');
console.log('  ZOOM_TANDEM_CLIENT_ID=...');
console.log('  ZOOM_TANDEM_CLIENT_SECRET=...');
console.log('  ZOOM_TRAINING_ACCOUNT_ID=...');
console.log('  ZOOM_TRAINING_CLIENT_ID=...');
console.log('  ZOOM_TRAINING_CLIENT_SECRET=...');
