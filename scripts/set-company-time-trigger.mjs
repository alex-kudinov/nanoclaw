#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundleRoot = path.resolve(scriptDir, '..');

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node ${path.join(scriptDir, 'set-company-time-trigger.mjs')} --env-file <absolute-path> --expected-release <full-commit> --mode <off|on> [options]
  node ${path.join(scriptDir, 'set-company-time-trigger.mjs')} --env-file <absolute-path> --expected-release <full-commit> --restore <absolute-backup-path> --confirm-host <hostname>

Options:
  --task-id <id>              Required in on mode; one exact scheduled task
  --scheduled-for <ISO time>  Required in on mode; one exact intended boundary
  --dry-run                   Validate and print a value-redacted plan (default)
  --apply                     Back up and atomically update the environment file
  --confirm-host <hostname>   Required for apply/restore; must equal ${os.hostname()}
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
let applyFlag;
const valueArgs = new Set([
  '--env-file',
  '--expected-release',
  '--mode',
  '--task-id',
  '--scheduled-for',
  '--restore',
  '--confirm-host',
]);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') usage();
  if (arg === '--apply' || arg === '--dry-run') {
    if (applyFlag) usage(`cannot combine ${applyFlag} with ${arg}`);
    applyFlag = arg;
    apply = arg === '--apply';
    continue;
  }
  if (!valueArgs.has(arg) || index + 1 >= args.length) {
    usage(`invalid argument: ${arg}`);
  }
  if (values.has(arg)) usage(`duplicate argument: ${arg}`);
  values.set(arg, args[++index]);
}

const envFile = values.get('--env-file');
const expectedRelease = values.get('--expected-release');
if (!envFile) usage('--env-file is required');
if (!expectedRelease || !/^[0-9a-f]{40}$/.test(expectedRelease)) {
  usage('--expected-release requires a full 40-character commit');
}
const release = JSON.parse(
  fs.readFileSync(path.join(bundleRoot, 'RELEASE.json'), 'utf8'),
);
if (release.commit !== expectedRelease) {
  throw new Error('expected release does not match this immutable bundle');
}

const { restoreCompanyTimeTriggerConfig, setCompanyTimeTriggerConfig } =
  await import(
    new URL('../dist/company-time-trigger-config-file.js', import.meta.url)
  );

const restore = values.get('--restore');
let result;
if (restore) {
  if (
    applyFlag ||
    values.has('--mode') ||
    values.has('--task-id') ||
    values.has('--scheduled-for')
  ) {
    usage('--restore cannot be combined with mode/task/boundary/apply flags');
  }
  result = restoreCompanyTimeTriggerConfig({
    envFile,
    backupFile: restore,
    confirmHost: values.get('--confirm-host') ?? '',
  });
} else {
  const mode = values.get('--mode');
  if (mode !== 'off' && mode !== 'on') usage('--mode must be off or on');
  result = setCompanyTimeTriggerConfig({
    envFile,
    mode,
    taskId: values.get('--task-id'),
    scheduledFor: values.get('--scheduled-for'),
    apply,
    confirmHost: values.get('--confirm-host'),
  });
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
