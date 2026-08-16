#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  node scripts/run-booking-plutio-marker-canary.mjs [options]

Options:
  --dry-run                    Verify the installed release and print the plan (default)
  --apply                      Perform the one stable synthetic Plutio canary
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
  if (!['--confirm-host', '--confirm-release'].includes(arg)) {
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
  throw new Error('Booking Plutio marker canary requires a verified release');
}

const markerCanary = await import(
  pathToFileURL(path.join(distDir, 'booking-plutio-marker-canary.js')).href
);
const bookingHost = await import(
  pathToFileURL(path.join(distDir, 'booking-plutio-host.js')).href
);
const event = bookingHost.parseBookingPlutioEvent(
  markerCanary.BOOKING_PLUTIO_MARKER_CANARY_PAYLOAD,
);
const base = {
  host: os.hostname(),
  releaseCommit: release.commit,
  codeRoot: release.codeRoot,
  eventId: event.eventId,
  marker: event.marker,
  retainedEvidence: 'one stable synthetic Plutio person/activity record',
};

if (!apply) {
  process.stdout.write(
    JSON.stringify(
      {
        mode: 'dry-run',
        ...base,
        externalEffects: [
          'upsert or find the stable synthetic canary person',
          'append the stable marker only when absent',
          'read the marker back and replay with duplicate-write refusal',
        ],
        productionDatabaseWrites: 0,
        customerMessages: 0,
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(0);
}

if (values.get('--confirm-host') !== os.hostname()) {
  throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
}
if (!confirmRelease || confirmRelease !== release.commit) {
  throw new Error(`--apply requires --confirm-release ${release.commit}`);
}

const result = await markerCanary.runBookingPlutioMarkerCanary();
process.stdout.write(
  JSON.stringify(
    {
      mode: 'applied',
      ...base,
      ...result,
      productionDatabaseWrites: 0,
      customerMessages: 0,
    },
    null,
    2,
  ) + '\n',
);
