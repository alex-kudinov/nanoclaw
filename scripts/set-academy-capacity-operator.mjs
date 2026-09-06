#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundleRoot = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
};
const envFile = value('--env-file');
const expectedRelease = value('--expected-release');
const mode = value('--mode');
const apply = args.includes('--apply');
if (args.includes('--apply') && args.includes('--dry-run'))
  throw new Error('cannot combine --apply and --dry-run');
if (!/^[0-9a-f]{40}$/.test(expectedRelease))
  throw new Error('--expected-release requires a full commit');
if (!['off', 'on'].includes(mode)) throw new Error('--mode must be off or on');
const release = JSON.parse(
  fs.readFileSync(path.join(bundleRoot, 'RELEASE.json'), 'utf8'),
);
if (release.commit !== expectedRelease)
  throw new Error('expected release does not match this immutable bundle');
const { setAcademyCapacityOperatorConfig } = await import(
  new URL('../dist/academy-capacity-operator-config.js', import.meta.url)
);
const result = setAcademyCapacityOperatorConfig({
  envFile,
  enabled: mode === 'on',
  apply,
  confirmHost: args.includes('--confirm-host')
    ? value('--confirm-host')
    : undefined,
});
process.stdout.write(
  `${JSON.stringify({ ...result, expectedRelease, host: os.hostname() }, null, 2)}\n`,
);
