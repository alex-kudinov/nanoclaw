#!/usr/bin/env node

import {
  capabilityManifestFingerprint,
  capabilityManifestIsEnforced,
  loadCapabilityManifest,
  loadCapabilityManifestConfig,
} from '../dist/capability-manifest.js';
import { readContainerSecrets } from '../dist/container-runner.js';
import { readEnvFile } from '../dist/env.js';
import { fileURLToPath } from 'node:url';

const TRAFFT_NAMES = [
  'TRAFFT_API_URL',
  'TRAFFT_CLIENT_ID',
  'TRAFFT_CLIENT_SECRET',
];
const REQUIRED_PROJECTED_NAMES = [
  'BUSINESS_DB_URL',
  'PGOPTIONS',
  'PLUTIO_API_CLIENTID',
  'PLUTIO_API_CLIENTSECRET',
  'PLUTIO_SUBDOMAIN',
];

const releaseRoot = fileURLToPath(new URL('../', import.meta.url));
const config = loadCapabilityManifestConfig();
if (!config.valid || !capabilityManifestIsEnforced(config, 'booking')) {
  throw new Error('Booking capability manifest is not selectively enforced');
}

const manifest = loadCapabilityManifest('booking', releaseRoot);
if (
  manifest.credentials.families.includes('trafft') ||
  !manifest.credentials.families.includes('business_db') ||
  !manifest.credentials.families.includes('plutio')
) {
  throw new Error(
    'Booking credential-family declaration is not the expected boundary',
  );
}

const configuredTrafft = readEnvFile(TRAFFT_NAMES);
const sourceTrafftCredentialCount = TRAFFT_NAMES.filter((name) =>
  Boolean(configuredTrafft[name]),
).length;
if (sourceTrafftCredentialCount !== TRAFFT_NAMES.length) {
  throw new Error('Operational Trafft source credentials are incomplete');
}

const projected = await readContainerSecrets(
  'booking',
  undefined,
  manifest.credentials.families,
);
const projectedNames = Object.keys(projected).sort();
const projectedTrafftNames = TRAFFT_NAMES.filter((name) => name in projected);
const missingRequiredNames = REQUIRED_PROJECTED_NAMES.filter(
  (name) => !(name in projected),
);

const evidence = {
  ok: projectedTrafftNames.length === 0 && missingRequiredNames.length === 0,
  group: 'booking',
  globalEnforcement: config.enforcementEnabled,
  enforcedGroups: config.enforcedGroups,
  credentialFamilies: manifest.credentials.families,
  manifestFingerprint: capabilityManifestFingerprint(manifest),
  sourceTrafftCredentialCount,
  projectedTrafftCredentialCount: projectedTrafftNames.length,
  projectedTrafftNames,
  requiredProjectedCredentialCount: REQUIRED_PROJECTED_NAMES.length,
  missingRequiredNames,
  projectedNameCount: projectedNames.length,
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (!evidence.ok) process.exitCode = 1;
