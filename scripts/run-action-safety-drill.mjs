#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { runActionSafetyProductionDrill } = await import(
  new URL('../dist/action-safety-drill-exec.js', import.meta.url)
);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node ${path.join(scriptDir, 'run-action-safety-drill.mjs')} --env-file <absolute-path> --expected-release <full-commit> [options]

Options:
  --health-url <url>            Health endpoint (default: http://127.0.0.1:8088/health)
  --timeout-ms <milliseconds>   Bounded health wait (default: 10000)
  --dry-run                     Validate and print the plan without mutation (default)
  --apply                       Arm, prove, and automatically restore global safe mode
  --confirm-host <hostname>     Required with --apply; must equal ${os.hostname()}
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
let modeFlag;
const allowedValueArguments = new Set([
  '--env-file',
  '--expected-release',
  '--health-url',
  '--timeout-ms',
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
const expectedRelease = values.get('--expected-release');
if (!envFile) usage('--env-file is required');
if (!expectedRelease) usage('--expected-release is required');

const result = await runActionSafetyProductionDrill(
  {
    envFile,
    expectedRelease,
    healthUrl: values.get('--health-url') ?? 'http://127.0.0.1:8088/health',
    timeoutMs: Number(values.get('--timeout-ms') ?? '10000'),
    apply,
    confirmHost: values.get('--confirm-host'),
  },
  {
    onArmed: (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  },
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
