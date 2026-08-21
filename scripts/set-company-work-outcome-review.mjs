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
  node ${path.join(scriptDir, 'set-company-work-outcome-review.mjs')} --env-file <absolute-path> --expected-release <full-commit> --mode <off|on> [options]
  node ${path.join(scriptDir, 'set-company-work-outcome-review.mjs')} --env-file <absolute-path> --expected-release <full-commit> --restore <absolute-backup-path> --confirm-host <hostname>

Options:
  --operator-source-key <key>  On-mode source; only COMPANY_WORK_EXCEPTION_OPERATOR_UIDS is allowed
  --operator-uid-file <path>   On-mode source: owner-only file containing exactly one UID
  --interval-ms <integer>      Default 86400000
  --window-days <integer>      Default 30
  --candidate-limit <integer>  Default 25
  --dry-run                    Validate and print a value-redacted plan (default)
  --apply                      Back up and atomically update the environment file
  --confirm-host <hostname>    Required for apply/restore; must equal ${os.hostname()}
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
  '--operator-source-key',
  '--operator-uid-file',
  '--interval-ms',
  '--window-days',
  '--candidate-limit',
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
const releasePath = path.join(bundleRoot, 'RELEASE.json');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
if (release.commit !== expectedRelease) {
  throw new Error('expected release does not match this immutable bundle');
}

const {
  restoreCompanyWorkOutcomeReviewConfig,
  setCompanyWorkOutcomeReviewConfig,
} = await import(
  new URL('../dist/company-work-outcome-review-config-file.js', import.meta.url)
);

const restore = values.get('--restore');
let result;
if (restore) {
  if (
    applyFlag ||
    values.has('--mode') ||
    values.has('--operator-source-key') ||
    values.has('--operator-uid-file')
  ) {
    usage('--restore cannot be combined with mode/operator-source/apply flags');
  }
  result = restoreCompanyWorkOutcomeReviewConfig({
    envFile,
    backupFile: restore,
    confirmHost: values.get('--confirm-host') ?? '',
  });
} else {
  const mode = values.get('--mode');
  if (mode !== 'off' && mode !== 'on') usage('--mode must be off or on');
  const integer = (flag) => {
    const raw = values.get(flag);
    if (raw === undefined) return undefined;
    if (!/^[1-9][0-9]*$/.test(raw)) {
      usage(`${flag} requires a positive integer`);
    }
    return Number(raw);
  };
  result = setCompanyWorkOutcomeReviewConfig({
    envFile,
    mode,
    operatorSourceKey: values.get('--operator-source-key'),
    operatorUidFile: values.get('--operator-uid-file'),
    intervalMs: integer('--interval-ms'),
    windowDays: integer('--window-days'),
    candidateLimit: integer('--candidate-limit'),
    apply,
    confirmHost: values.get('--confirm-host'),
  });
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
