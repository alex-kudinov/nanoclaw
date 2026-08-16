#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node scripts/set-booking-capability-boundary.mjs [options]

Options:
  --dry-run                    Verify the installed release and print the plan (default)
  --apply                      Back up and update Booking's registered mount config
  --restore <backup.json>      Restore a prior snapshot instead of removing mounts
  --confirm-host <hostname>    Required with --apply; must equal this machine
  --confirm-release <sha>      Required with --apply; must equal the full release commit
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
  if (!['--confirm-host', '--confirm-release', '--restore'].includes(arg)) {
    usage(`invalid argument: ${arg}`);
  }
  if (index + 1 >= args.length) usage(`missing value for ${arg}`);
  values.set(arg, args[++index]);
}

const codeRoot = fs.realpathSync(
  process.env.NANOCLAW_CODE_ROOT || process.cwd(),
);
const distDir = path.join(codeRoot, 'dist');
const releaseIntegrity = await import(
  pathToFileURL(path.join(distDir, 'release-integrity.js')).href
);
const confirmRelease = values.get('--confirm-release');
const release = releaseIntegrity.verifyRuntimeRelease({
  codeRoot,
  cwd: codeRoot,
  distDir,
  requireManifest: true,
  expectedCommit: apply ? confirmRelease : undefined,
});
if (!release.verified || !release.codeRootMatchesRelease || !release.commit) {
  throw new Error('Booking capability cutover requires a verified release');
}
if (apply && values.get('--confirm-host') !== os.hostname()) {
  throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
}
if (apply && (!confirmRelease || confirmRelease !== release.commit)) {
  throw new Error(`--apply requires --confirm-release ${release.commit}`);
}

const db = await import(pathToFileURL(path.join(distDir, 'db.js')).href);
const config = await import(
  pathToFileURL(path.join(distDir, 'config.js')).href
);
const cutover = await import(
  pathToFileURL(path.join(distDir, 'booking-capability-cutover.js')).href
);
db.initDatabase();

function oneBookingGroup() {
  const matches = Object.entries(db.getAllRegisteredGroups()).filter(
    ([, group]) => group.folder === 'booking',
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one registered Booking group; found ${matches.length}`,
    );
  }
  return matches[0];
}

const backupRoot = path.join(config.DATA_DIR, 'backups', 'booking-capability');
const restorePath = values.get('--restore');
let jid;
let current;
let desired;
let plan;

if (restorePath) {
  const absoluteRestore = fs.realpathSync(restorePath);
  const absoluteRoot = fs.realpathSync(backupRoot);
  if (!absoluteRestore.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('--restore must name a Booking capability backup');
  }
  const snapshot = JSON.parse(fs.readFileSync(absoluteRestore, 'utf8'));
  if (
    snapshot?.schema_version !== 1 ||
    typeof snapshot.jid !== 'string' ||
    snapshot.group?.folder !== 'booking'
  ) {
    throw new Error('Booking capability backup is invalid');
  }
  [jid, current] = oneBookingGroup();
  if (snapshot.jid !== jid) {
    throw new Error(
      'Booking capability backup JID does not match live registration',
    );
  }
  desired = snapshot.group;
  plan = {
    operation: 'restore',
    changed: JSON.stringify(current) !== JSON.stringify(desired),
    removedMountTargets: [],
    retainedMountTargets:
      desired.containerConfig?.additionalMounts?.map((mount) =>
        (mount.containerPath || path.basename(mount.hostPath))
          .split('/')
          .filter(Boolean)
          .at(-1),
      ) || [],
  };
} else {
  [jid, current] = oneBookingGroup();
  const removal = cutover.planBookingCapabilityCutover(current);
  cutover.assertBookingCapabilityCutoverPlan(removal);
  desired = removal.updatedGroup;
  plan = { operation: 'remove', ...removal };
  delete plan.updatedGroup;
}

const base = {
  host: os.hostname(),
  releaseCommit: release.commit,
  codeRoot: release.codeRoot,
  group: 'booking',
  ...plan,
};
if (!apply) {
  process.stdout.write(
    `${JSON.stringify({ mode: 'dry-run', ...base }, null, 2)}\n`,
  );
  process.exit(0);
}

fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const backupPath = path.join(backupRoot, `booking-${timestamp}.json`);
fs.writeFileSync(
  backupPath,
  `${JSON.stringify({ schema_version: 1, jid, group: current }, null, 2)}\n`,
  { flag: 'wx', mode: 0o600 },
);
if (plan.changed) db.setRegisteredGroup(jid, desired);

const [, verified] = oneBookingGroup();
if (JSON.stringify(verified) !== JSON.stringify(desired)) {
  throw new Error('Booking capability registration verification failed');
}
process.stdout.write(
  `${JSON.stringify({ mode: 'applied', ...base, backupPath }, null, 2)}\n`,
);
