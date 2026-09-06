#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundleRoot = path.resolve(scriptDir, '..');

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    'Usage: register-capacity.mjs --project-root <absolute-path> --channel <C...> --expected-release <40-char-commit> [--dry-run|--apply --confirm-host <host>]\n',
  );
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
let modeSeen = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') usage();
  if (arg === '--apply' || arg === '--dry-run') {
    if (modeSeen) usage('choose exactly one of --dry-run or --apply');
    modeSeen = true;
    apply = arg === '--apply';
    continue;
  }
  if (!arg.startsWith('--') || !args[index + 1]) usage(`invalid argument: ${arg}`);
  if (values.has(arg)) usage(`duplicate argument: ${arg}`);
  values.set(arg, args[++index]);
}

const projectRoot = values.get('--project-root');
const channelId = values.get('--channel');
const expectedRelease = values.get('--expected-release');
if (!projectRoot || !path.isAbsolute(projectRoot))
  usage('--project-root must be absolute');
if (!channelId || !/^C[A-Z0-9]{8,20}$/.test(channelId))
  usage('--channel must be an exact Slack channel ID');
if (!expectedRelease || !/^[0-9a-f]{40}$/.test(expectedRelease))
  usage('--expected-release must be a full commit');
const release = JSON.parse(
  fs.readFileSync(path.join(bundleRoot, 'RELEASE.json'), 'utf8'),
);
if (release.commit !== expectedRelease)
  throw new Error('expected release does not match this immutable bundle');
const databasePath = path.join(projectRoot, 'store', 'messages.db');
if (!fs.lstatSync(databasePath).isFile())
  throw new Error('project root does not contain store/messages.db');

process.chdir(projectRoot);
const { getAllRegisteredGroups, initDatabase, setRegisteredGroup } =
  await import(new URL('../dist/db.js', import.meta.url));
initDatabase();
const target = {
  name: 'gru-capacity',
  folder: 'capacity',
  trigger: '',
  requiresTrigger: false,
  containerConfig: {
    model: 'sonnet',
    timeout: 600000,
    spawnTimeout: 600000,
    idleTimeout: 600000,
    memory: '1g',
    cpus: 1,
  },
};
const jid = `slack:${channelId}`;
const currentEntry = Object.entries(getAllRegisteredGroups()).find(
  ([, group]) => group.folder === 'capacity',
);
if (currentEntry && currentEntry[0] !== jid)
  throw new Error('capacity folder is already bound to a different channel');
const same =
  currentEntry?.[0] === jid &&
  currentEntry[1].name === target.name &&
  currentEntry[1].requiresTrigger === target.requiresTrigger &&
  JSON.stringify(currentEntry[1].containerConfig ?? {}) ===
    JSON.stringify(target.containerConfig);
if (same) {
  process.stdout.write(
    `${JSON.stringify({ mode: 'unchanged', jid, backupPath: null })}\n`,
  );
  process.exit(0);
}
if (!apply) {
  process.stdout.write(
    `${JSON.stringify({ mode: 'dry-run', jid, backupPath: null })}\n`,
  );
  process.exit(0);
}
if (values.get('--confirm-host') !== os.hostname())
  throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
if (currentEntry)
  throw new Error('capacity registration exists with different configuration');
const backupDir = path.join(projectRoot, 'data', 'backups', 'academy-capacity');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
fs.chmodSync(backupDir, 0o700);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `messages-pre-capacity-${stamp}.db`);
execFileSync('/usr/bin/sqlite3', [databasePath, `.backup '${backupPath}'`], {
  stdio: 'ignore',
});
fs.chmodSync(backupPath, 0o600);
setRegisteredGroup(jid, {
  ...target,
  added_at: new Date().toISOString(),
});
const readback = getAllRegisteredGroups()[jid];
if (
  !readback ||
  readback.folder !== 'capacity' ||
  readback.name !== target.name ||
  readback.requiresTrigger !== false ||
  JSON.stringify(readback.containerConfig ?? {}) !==
    JSON.stringify(target.containerConfig)
)
  throw new Error('capacity registration readback mismatch');
process.stdout.write(
  `${JSON.stringify({ mode: 'applied', jid, backupPath })}\n`,
);
