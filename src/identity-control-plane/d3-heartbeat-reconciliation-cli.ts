#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { importHeartbeatAggregateSnapshot } from './d3-heartbeat-reconciliation.js';

function fail(code: string): never {
  throw new Error(`tandem_identity_d3_cli:${code}`);
}

async function main(): Promise<void> {
  if (process.argv.length !== 4 || process.argv[2] !== '--snapshot')
    fail('usage');
  if (os.hostname() !== 'mini-claw.local') fail('host_mismatch');
  const snapshotPath = path.resolve(process.argv[3]);
  const stat = fs.statSync(snapshotPath);
  if (!stat.isFile() || stat.size < 100 || stat.size > 128 * 1024)
    fail('snapshot_file_invalid');
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  } catch {
    fail('snapshot_json_invalid');
  }
  const result = await importHeartbeatAggregateSnapshot(snapshot);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'tandem_identity_d3_cli:unexpected_error'}\n`,
  );
  process.exitCode = 1;
});
