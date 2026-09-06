#!/usr/bin/env node

import crypto from 'node:crypto';
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
const envFile = path.resolve(value('--env-file'));
const expectedRelease = value('--expected-release');
const mode = value('--mode');
const apply = args.includes('--apply');
if (apply && args.includes('--dry-run'))
  throw new Error('cannot combine --apply and --dry-run');
if (!/^[0-9a-f]{40}$/.test(expectedRelease))
  throw new Error('--expected-release requires a full commit');
if (!['off', 'on'].includes(mode)) throw new Error('--mode must be off or on');
const release = JSON.parse(
  fs.readFileSync(path.join(bundleRoot, 'RELEASE.json'), 'utf8'),
);
if (release.commit !== expectedRelease)
  throw new Error('expected release does not match this immutable bundle');
if (apply && value('--confirm-host') !== os.hostname())
  throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
if (!fs.lstatSync(envFile).isFile()) throw new Error('env file is not a file');

let siteUrl = null;
let siteKey = null;
let cloudflareZoneId = null;
let cloudflareToken = null;
if (mode === 'on') {
  const sourceEnvFile = path.resolve(value('--source-env-file'));
  const stat = fs.statSync(sourceEnvFile);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0)
    throw new Error('--source-env-file must be a mode-0600 file');
  const source = Object.fromEntries(
    fs
      .readFileSync(sourceEnvFile, 'utf8')
      .split('\n')
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')]),
  );
  siteUrl = String(source.WP_SITE_URL ?? '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(siteUrl))
    throw new Error('source WP_SITE_URL must be https');
  siteKey = String(source.TANDEM_API_KEY ?? '');
  if (siteKey.length < 16) throw new Error('site key is too short');
  cloudflareZoneId = String(source.CF_ZONE_ID ?? '');
  cloudflareToken = String(
    source.CF_MGMT_TOKEN ?? source.CF_API_TOKEN ?? '',
  );
  if (!cloudflareZoneId || !cloudflareToken)
    throw new Error('Cloudflare zone and token are required');
}

const original = fs.readFileSync(envFile, 'utf8');
const updates = {
  ACADEMY_CAPACITY_PUBLICATION_ENABLED: mode === 'on' ? '1' : '0',
  ...(siteUrl ? { ACADEMY_CAPACITY_SITE_URL: siteUrl } : {}),
  ...(siteKey ? { TANDEM_API_KEY: siteKey } : {}),
  ...(cloudflareZoneId ? { CF_ZONE_ID: cloudflareZoneId } : {}),
  ...(cloudflareToken ? { CF_MGMT_TOKEN: cloudflareToken } : {}),
};
const lines = original.split('\n');
for (const [key, update] of Object.entries(updates)) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  const rendered = `${key}=${update}`;
  if (index >= 0) lines[index] = rendered;
  else lines.push(rendered);
}
const next = lines.join('\n').replace(/\n+$/, '\n');
const changed = next !== original;
let backupPath = null;
if (apply && changed) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  backupPath = `${envFile}.rollback-academy-capacity-publication-${stamp}`;
  fs.copyFileSync(envFile, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, 0o600);
  const temporary = `${envFile}.capacity-publication-${process.pid}.tmp`;
  fs.writeFileSync(temporary, next, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, envFile);
  fs.chmodSync(envFile, 0o600);
}
process.stdout.write(
  `${JSON.stringify(
    {
      mode: apply ? 'applied' : 'dry-run',
      enabled: mode === 'on',
      changed,
      siteUrl,
      siteKeySha256: siteKey
        ? crypto.createHash('sha256').update(siteKey).digest('hex')
        : null,
      cloudflareTokenSha256: cloudflareToken
        ? crypto.createHash('sha256').update(cloudflareToken).digest('hex')
        : null,
      cloudflareZoneConfigured: Boolean(cloudflareZoneId),
      backupPath,
      release: expectedRelease,
      host: os.hostname(),
    },
    null,
    2,
  )}\n`,
);
