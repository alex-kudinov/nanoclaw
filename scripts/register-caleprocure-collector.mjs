#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    'Usage: register-caleprocure-collector.mjs [--enable|--disable] [--jobs-file <absolute-path>]\n',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let enabled = false;
let jobsFile = path.join(process.cwd(), 'data', 'jobs.json');
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--enable') enabled = true;
  else if (arg === '--disable') enabled = false;
  else if (arg === '--jobs-file' && args[index + 1]) {
    jobsFile = args[++index];
  } else usage(`Unknown argument: ${arg}`);
}
if (!path.isAbsolute(jobsFile)) usage('--jobs-file must be absolute');

const config = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
if (!config.projects?.nanoclaw || !Array.isArray(config.jobs)) {
  throw new Error(
    'jobs registry must define projects.nanoclaw and a jobs array',
  );
}

const job = {
  name: 'procurement-caleprocure-collector',
  description:
    'Deterministically collect and receipt public CaleProcure opportunities',
  project: 'nanoclaw',
  script: 'dist/procurement-caleprocure-job.js',
  args: [],
  cron: '0 8 * * *',
  timezone: 'America/Chicago',
  retries: 0,
  retry_delay_ms: 0,
  alert_level: 'warn',
  timeout_ms: 900_000,
  lockfile: null,
  enabled,
};
const existing = config.jobs.findIndex((entry) => entry.name === job.name);
if (existing >= 0) config.jobs[existing] = job;
else config.jobs.push(job);

const temporary = path.join(
  path.dirname(jobsFile),
  `.${path.basename(jobsFile)}.${process.pid}.tmp`,
);
try {
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: fs.statSync(jobsFile).mode,
  });
  JSON.parse(fs.readFileSync(temporary, 'utf8'));
  fs.renameSync(temporary, jobsFile);
} finally {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

process.stdout.write(
  `${JSON.stringify({ name: job.name, enabled, schedule: job.cron, timezone: job.timezone })}\n`,
);
