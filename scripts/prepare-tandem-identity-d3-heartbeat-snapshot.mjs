#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { prepareHeartbeatAggregateSnapshot } from '../dist/identity-control-plane/d3-heartbeat-snapshot.js';

function fail(code) {
  throw new Error(`tandem_identity_d3_prepare:${code}`);
}

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) fail('usage');
    flags.set(argv[index], argv[index + 1]);
  }
  const required = [
    '--census-first',
    '--census-second',
    '--webhooks',
    '--webhook-observed-at',
    '--output',
  ];
  if (
    flags.size !== required.length ||
    required.some((flag) => !flags.has(flag))
  )
    fail('usage');
  return Object.fromEntries(
    required.map((flag) => [flag.slice(2), flags.get(flag)]),
  );
}

function readJson(file, code) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size < 10 || stat.size > 2 * 1024 * 1024)
    fail(code);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

const args = parseArgs(process.argv.slice(2));
const snapshot = prepareHeartbeatAggregateSnapshot({
  firstCensus: readJson(args['census-first'], 'census_first_file'),
  secondCensus: readJson(args['census-second'], 'census_second_file'),
  webhooks: readJson(args.webhooks, 'webhooks_file'),
  webhookObservedAt: args['webhook-observed-at'],
});
const output = path.resolve(args.output);
const temporary = `${output}.tmp-${process.pid}`;
fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {
  mode: 0o600,
  flag: 'wx',
});
fs.renameSync(temporary, output);
process.stdout.write(
  `${JSON.stringify({ ok: true, output, artifactSha256: snapshot.artifactSha256, userCount: snapshot.censusObservations[1].userCount, groupCount: snapshot.groups.length, webhookCount: snapshot.webhookInventory.registrationCount, containsNames: false, containsEmails: false, containsRawPayloads: false, containsCredentials: false })}\n`,
);
