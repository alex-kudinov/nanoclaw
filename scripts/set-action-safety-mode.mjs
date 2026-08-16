#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { restoreActionSafetyConfig, setActionSafetyMode } = await import(
  new URL('../dist/action-safety-config-file.js', import.meta.url)
);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node ${path.join(scriptDir, 'set-action-safety-mode.mjs')} --env-file <absolute-path> --mode <off|global|systems> [options]
  node ${path.join(scriptDir, 'set-action-safety-mode.mjs')} --env-file <absolute-path> --restore <absolute-backup-path> --confirm-host <hostname>

Options:
  --systems <comma-list>      Required only for systems mode
  --dry-run                   Validate and print the plan without mutation (default)
  --apply                     Back up and atomically update the environment file
  --restore <backup-path>     Restore an exact helper-created backup
  --confirm-host <hostname>   Required for apply/restore; must equal ${os.hostname()}
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
let modeFlag;
const allowedValueArguments = new Set([
  '--env-file',
  '--mode',
  '--systems',
  '--restore',
  '--confirm-host',
]);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') usage();
  if (arg === '--apply') {
    if (modeFlag) usage(`cannot combine ${modeFlag} with --apply`);
    modeFlag = '--apply';
    apply = true;
    continue;
  }
  if (arg === '--dry-run') {
    if (modeFlag) usage(`cannot combine ${modeFlag} with --dry-run`);
    modeFlag = '--dry-run';
    apply = false;
    continue;
  }
  if (!allowedValueArguments.has(arg) || index + 1 >= args.length) {
    usage(`invalid argument: ${arg}`);
  }
  if (values.has(arg)) usage(`duplicate argument: ${arg}`);
  values.set(arg, args[++index]);
}

const envFile = values.get('--env-file');
if (!envFile) usage('--env-file is required');
const restore = values.get('--restore');
if (restore) {
  if (modeFlag || values.has('--mode') || values.has('--systems')) {
    usage('--restore cannot be combined with mode, systems, apply, or dry-run');
  }
  const result = restoreActionSafetyConfig({
    envFile,
    backupFile: restore,
    confirmHost: values.get('--confirm-host') ?? '',
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

const mode = values.get('--mode');
if (!['off', 'global', 'systems'].includes(mode)) {
  usage('--mode must be off, global, or systems');
}
const result = setActionSafetyMode({
  envFile,
  mode,
  systems: values.get('--systems'),
  apply,
  confirmHost: values.get('--confirm-host'),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
