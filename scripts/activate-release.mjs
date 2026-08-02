#!/usr/bin/env node

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { activateRelease } = await import(
  new URL('../dist/release-activation-exec.js', import.meta.url)
);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node ${path.join(scriptDir, 'activate-release.mjs')} --release-dir <absolute-path> [options]

Options:
  --plist <absolute-path>       Installed plist (default: ~/Library/LaunchAgents/com.nanoclaw.plist)
  --health-url <url>            Health endpoint (default: http://127.0.0.1:8088/health)
  --timeout-ms <milliseconds>   Bounded stop/start wait (default: 30000)
  --dry-run                     Validate and print the plan without mutation (default)
  --apply                       Perform one activation attempt
  --recover-from-down           With --apply, allow an unhealthy/stopped current service
  --confirm-host <hostname>     Required with --apply; must equal ${os.hostname()}
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
let recoverFromDown = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') usage();
  if (arg === '--apply') {
    apply = true;
    continue;
  }
  if (arg === '--dry-run') {
    apply = false;
    continue;
  }
  if (arg === '--recover-from-down') {
    recoverFromDown = true;
    continue;
  }
  if (!arg.startsWith('--') || i + 1 >= args.length)
    usage(`invalid argument: ${arg}`);
  values.set(arg, args[++i]);
}

const releaseDir = values.get('--release-dir');
if (!releaseDir) usage('--release-dir is required');

const result = await activateRelease({
  releaseDir,
  plistPath:
    values.get('--plist') ??
    path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.nanoclaw.plist'),
  healthUrl: values.get('--health-url') ?? 'http://127.0.0.1:8088/health',
  timeoutMs: Number(values.get('--timeout-ms') ?? '30000'),
  apply,
  recoverFromDown,
  confirmHost: values.get('--confirm-host'),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
