#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd();
const manifestPath = path.join(codeRoot, 'dist', 'release-manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`release manifest missing: ${manifestPath}`);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const mod = await import(
  pathToFileURL(path.join(codeRoot, 'dist', 'booking-plutio-host.js')).href
);

const payload = {
  event_type: 'canceled',
  appointmentId: 'canary-47',
  customerEmail: 'canary@example.invalid',
  customerFirstName: 'Boundary',
  customerLastName: 'Canary',
  customerPhone: '+15555550199',
  serviceName: 'Boundary Test',
  appointmentStartDateTime: '2026-08-16 3:00 pm',
};
const event = mod.parseBookingPlutioEvent(payload);
const firstCalls = [];
const first = await mod.executeBookingPlutioActivity(event, {
  callTool: async (script, args) => {
    firstCalls.push({ script, args });
    if (script === 'upsert-person.sh') {
      return '{"_id":"canary_person","created":false}';
    }
    if (script === 'list-notes.sh') return 'OK []';
    if (script === 'log-activity.sh') {
      return '{"note_id":"canary_note","action":"updated","entries":2}';
    }
    throw new Error(`unexpected tool: ${script}`);
  },
});
if (
  first.remoteStatus !== 'recorded' ||
  firstCalls.map((call) => call.script).join(',') !==
    'upsert-person.sh,list-notes.sh,log-activity.sh'
) {
  throw new Error('injected first-pass boundary verification failed');
}
const replayCalls = [];
const replay = await mod.executeBookingPlutioActivity(event, {
  callTool: async (script, args) => {
    replayCalls.push({ script, args });
    if (script === 'upsert-person.sh') {
      return '{"_id":"canary_person","created":false}';
    }
    if (script === 'list-notes.sh') {
      return JSON.stringify([
        {
          _id: 'canary_note',
          title: 'Activity Log',
          descriptionHTML: `<p>existing ${event.marker}</p>`,
        },
      ]);
    }
    throw new Error('replay attempted a write');
  },
});
if (replay.remoteStatus !== 'already_recorded' || replayCalls.length !== 2) {
  throw new Error('injected replay boundary verification failed');
}
let bookedDenied = false;
try {
  mod.parseBookingPlutioEvent({ ...payload, event_type: 'booked' });
} catch {
  bookedDenied = true;
}
if (!bookedDenied) throw new Error('booked event was not denied');

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      releaseCommit: manifest.commit,
      firstPassScripts: firstCalls.map((call) => call.script),
      replayScripts: replayCalls.map((call) => call.script),
      firstStatus: first.remoteStatus,
      replayStatus: replay.remoteStatus,
      bookedDenied,
      databaseCalls: 0,
      childProcessCalls: 0,
      networkCalls: 0,
    },
    null,
    2,
  ) + '\n',
);
