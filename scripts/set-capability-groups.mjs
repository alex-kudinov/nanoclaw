#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { setCapabilityEnforcedGroups } = await import(
  new URL('../dist/capability-config-file.js', import.meta.url)
);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node ${path.join(scriptDir, 'set-capability-groups.mjs')} --env-file <absolute-path> --groups <comma-separated-folders> [options]

Options:
  --dry-run                   Validate and print the plan without mutation (default)
  --apply                     Back up and atomically update the environment file
  --confirm-host <hostname>   Required with --apply; must equal ${os.hostname()}
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') usage();
  if (arg === '--apply') {
    apply = true;
    continue;
  }
  if (arg === '--dry-run') {
    apply = false;
    continue;
  }
  if (!arg.startsWith('--') || index + 1 >= args.length) {
    usage(`invalid argument: ${arg}`);
  }
  values.set(arg, args[++index]);
}

const envFile = values.get('--env-file');
const groups = values.get('--groups');
if (!envFile) usage('--env-file is required');
if (groups === undefined) usage('--groups is required');

const result = setCapabilityEnforcedGroups({
  envFile,
  groups,
  apply,
  confirmHost: values.get('--confirm-host'),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
