#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function run(file, args, options = {}) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      input: options.input,
      stdio: options.input === undefined ? ['ignore', 'pipe', 'pipe'] : undefined,
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    const detail = error && error.stderr ? String(error.stderr).trim() : '';
    throw new Error(`${path.basename(file)} failed${detail ? `: ${detail}` : ''}`);
  }
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node ${path.join(scriptDir, 'activate-healer-release.mjs')} --release-dir <absolute-path> [options]

Options:
  --plist <absolute-path>       Default: ~/Library/LaunchAgents/com.nanoclaw.healer.fast.plist
  --timeout-ms <integer>       Default: 120000
  --dry-run                    Validate without mutation (default)
  --apply                      Replace/reload and run one bounded fast cycle
  --confirm-host <hostname>    Required for apply; must equal ${os.hostname()}
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const values = new Map();
let apply = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') usage();
  if (arg === '--apply' || arg === '--dry-run') {
    apply = arg === '--apply';
    continue;
  }
  if (!arg.startsWith('--') || index + 1 >= args.length) {
    usage(`invalid argument: ${arg}`);
  }
  if (values.has(arg)) usage(`duplicate argument: ${arg}`);
  values.set(arg, args[++index]);
}

const releaseDir = values.get('--release-dir');
if (!releaseDir || !path.isAbsolute(releaseDir)) {
  usage('--release-dir requires an absolute path');
}
const plist =
  values.get('--plist') ??
  path.join(
    os.homedir(),
    'Library',
    'LaunchAgents',
    'com.nanoclaw.healer.fast.plist',
  );
const timeoutMs = Number(values.get('--timeout-ms') ?? '120000');
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
  usage('--timeout-ms requires an integer from 1000 to 300000');
}

const release = JSON.parse(
  fs.readFileSync(path.join(releaseDir, 'RELEASE.json'), 'utf8'),
);
if (!/^[0-9a-f]{40}$/.test(release.commit)) {
  throw new Error('release commit is invalid');
}
const installed = JSON.parse(
  run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]),
);
if (
  installed.Label !== 'com.nanoclaw.healer.fast' ||
  !Array.isArray(installed.ProgramArguments) ||
  installed.ProgramArguments.length !== 3 ||
  installed.ProgramArguments[2] !== 'fast'
) {
  throw new Error('installed plist is not the bounded fast-healer service');
}
const nodePath = installed.ProgramArguments[0];
if (!path.isAbsolute(nodePath)) throw new Error('healer Node path is not absolute');
const actualNode = run(nodePath, ['--version']).replace(/^v/, '');
if (actualNode !== release.nodePin) {
  throw new Error(`healer Node ${actualNode} differs from release ${release.nodePin}`);
}
run(nodePath, [
  path.join(releaseDir, 'scripts', 'verify-release.mjs'),
  releaseDir,
  '--runtime',
]);

const candidate = JSON.parse(JSON.stringify(installed));
candidate.EnvironmentVariables ??= {};
candidate.ProgramArguments[1] = path.join(releaseDir, 'dist', 'healer', 'index.js');
candidate.EnvironmentVariables.NANOCLAW_CODE_ROOT = releaseDir;
candidate.EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT = release.commit;
const changedPaths = [
  'EnvironmentVariables.NANOCLAW_CODE_ROOT',
  'EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT',
  'ProgramArguments.1',
];
if (installed.ProgramArguments[1] === candidate.ProgramArguments[1]) {
  throw new Error('target healer release is already active');
}

function launchState() {
  const output = run(
    '/bin/launchctl',
    ['print', `gui/${process.getuid()}/${installed.Label}`],
    { allowFailure: true },
  );
  const runs = Number(/^\s*runs = (\d+)\s*$/m.exec(output)?.[1] ?? '0');
  const state = /^\s*state = (.+)\s*$/m.exec(output)?.[1] ?? 'missing';
  const lastExit = Number(
    /^\s*last exit code = (-?\d+)\s*$/m.exec(output)?.[1] ?? '-1',
  );
  return { runs, state, lastExit };
}

const before = launchState();
if (before.state !== 'not running' || before.lastExit !== 0) {
  throw new Error('fast healer must be idle with last exit 0 before activation');
}
const result = {
  mode: apply ? 'applied' : 'dry-run',
  label: installed.Label,
  fromExecutable: installed.ProgramArguments[1],
  toExecutable: candidate.ProgramArguments[1],
  toCommit: release.commit,
  changedPaths,
  rollbackPath: null,
  runVerified: false,
};
if (!apply) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}
if (values.get('--confirm-host') !== os.hostname()) {
  throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
}

const lock = `${plist}.activation.lock`;
let lockFd;
try {
  lockFd = fs.openSync(lock, 'wx', 0o600);
  fs.writeFileSync(lockFd, String(process.pid));
} catch {
  throw new Error(`fast-healer activation lock exists: ${lock}`);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rollback = `${plist}.rollback-${path.basename(installed.ProgramArguments[1], '.js')}-${stamp}`;
fs.copyFileSync(plist, rollback, fs.constants.COPYFILE_EXCL);
const scratch = `${plist}.${process.pid}.candidate.json`;
const replacement = `${plist}.${process.pid}.candidate.plist`;
try {
  fs.writeFileSync(scratch, JSON.stringify(candidate), { mode: fs.statSync(plist).mode });
  run('/usr/bin/plutil', ['-convert', 'xml1', '-o', replacement, scratch]);
  run('/usr/bin/plutil', ['-lint', replacement]);
  run('/bin/launchctl', ['unload', plist]);
  fs.renameSync(replacement, plist);
  run('/bin/launchctl', ['load', plist]);
  run('/bin/launchctl', [
    'kickstart',
    `gui/${process.getuid()}/${installed.Label}`,
  ]);
  const deadline = Date.now() + timeoutMs;
  let after;
  do {
    await new Promise((resolve) => setTimeout(resolve, 250));
    after = launchState();
    if (after.runs > before.runs && after.state === 'not running') break;
  } while (Date.now() < deadline);
  if (!after || after.runs <= before.runs || after.state !== 'not running' || after.lastExit !== 0) {
    throw new Error('target fast-healer cycle did not finish cleanly');
  }
  result.rollbackPath = rollback;
  result.runVerified = true;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  try {
    run('/bin/launchctl', ['unload', plist], { allowFailure: true });
    fs.copyFileSync(rollback, plist);
    run('/bin/launchctl', ['load', plist]);
  } catch {}
  throw error;
} finally {
  if (fs.existsSync(scratch)) fs.unlinkSync(scratch);
  if (fs.existsSync(replacement)) fs.unlinkSync(replacement);
  if (lockFd !== undefined) fs.closeSync(lockFd);
  if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === String(process.pid)) {
    fs.unlinkSync(lock);
  }
}
