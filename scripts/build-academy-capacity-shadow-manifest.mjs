#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  manifestSha256,
  sha256,
  validateAcademyCapacityShadowManifest,
} from './populate-academy-capacity-shadow.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'facts/catalogs/student-entitlements-v1.json');
const SOURCE_RESOLUTION = path.join(
  ROOT,
  'docs/programs/company-os/evidence/NC-20260906-001-academy-capacity-source-resolution.json',
);
const SHA256 = /^[a-f0-9]{64}$/;

function parseArgs(argv) {
  const result = {
    accRoster: '',
    mcsRoster: '',
    output: '',
    allowCreatePartySha256: [],
    heldFundingSha256: '',
    aliasSha256: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--acc-roster') result.accRoster = argv[++index] ?? '';
    else if (arg === '--mcs-roster') result.mcsRoster = argv[++index] ?? '';
    else if (arg === '--output') result.output = argv[++index] ?? '';
    else if (arg === '--allow-create-party-sha256')
      result.allowCreatePartySha256.push(argv[++index] ?? '');
    else if (arg === '--held-funding-sha256')
      result.heldFundingSha256 = argv[++index] ?? '';
    else if (arg === '--alias-sha256') result.aliasSha256 = argv[++index] ?? '';
    else if (arg === '--help') result.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

function usage() {
  return `Usage: build-academy-capacity-shadow-manifest.mjs
  --acc-roster PRIVATE_TOOLBOX_JSON --mcs-roster PRIVATE_TOOLBOX_JSON
  --output PRIVATE_MANIFEST_JSON
  --allow-create-party-sha256 SHA256 (repeat exactly three times)
  --held-funding-sha256 SHA256 --alias-sha256 SHA256

All private files must be outside the repository and mode 0600. The output is
created without overwrite. Stdout contains aggregate counts and hashes only.`;
}

function assertPrivateInput(file) {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile())
    throw new Error('private roster input must be a regular file');
  if ((stat.mode & 0o077) !== 0)
    throw new Error(
      'private roster input must not grant group or world permissions',
    );
  return resolved;
}

function assertPrivateOutput(file) {
  const resolved = path.resolve(file);
  if (resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`))
    throw new Error('private manifest must be outside the repository');
  if (fs.existsSync(resolved))
    throw new Error('refusing to overwrite private manifest');
  return resolved;
}

function payloadRows(file) {
  const payload = JSON.parse(fs.readFileSync(assertPrivateInput(file), 'utf8'));
  const rows = payload?.data?.rows ?? payload?.rows ?? payload;
  if (!Array.isArray(rows))
    throw new Error('private roster payload has no rows');
  return rows;
}

function isoEnd(lastStart, hours = 2) {
  return new Date(Date.parse(lastStart) + hours * 60 * 60 * 1000).toISOString();
}

function scheduleBlock(
  delivery_block_key,
  component_key,
  sessions,
  offers,
  sourceEvidenceSha256,
) {
  const session_set_sha256 = sha256(`${JSON.stringify(sessions)}\n`);
  return {
    delivery_block_key,
    component_key,
    source_scope: 'tandemweb.google_calendar_projection',
    source_object_id: `public-calendar:${delivery_block_key}`,
    starts_at: sessions[0],
    ends_at: isoEnd(sessions.at(-1)),
    timezone: 'America/New_York',
    session_set_sha256,
    schedule_evidence_sha256: sha256(
      `${delivery_block_key}|${session_set_sha256}|https://tandemcoach.co/`,
    ),
    pool_key: `academy-capacity-shadow-2026-09-06:pool:${delivery_block_key}`,
    capacity: 12,
    operational_state: 'open',
    configuration_evidence_sha256: sha256(
      `${sourceEvidenceSha256}|capacity:12|${delivery_block_key}`,
    ),
    offers: offers.map((offer_key) => ({
      offer_key,
      catalog_revision: 1,
      evidence_sha256: sha256(
        `${sourceEvidenceSha256}|catalog:1|${delivery_block_key}|${offer_key}`,
      ),
    })),
  };
}

function dates(start, count, skip = []) {
  const values = [];
  let cursor = new Date(start);
  while (values.length < count) {
    const iso = cursor.toISOString();
    if (!skip.includes(iso.slice(0, 10))) values.push(iso);
    cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return values;
}

function schedules(sourceEvidenceSha256) {
  return [
    scheduleBlock(
      'acc.module-1:2026-09-07',
      'acc.module-1',
      dates('2026-09-07T15:00:00Z', 4),
      ['acc-module-1', 'acc-full', 'acc-pcc-full'],
      sourceEvidenceSha256,
    ),
    scheduleBlock(
      'mcs-practicum:2026-09-24',
      'mcs.live-practicum',
      [
        '2026-09-24T22:00:00Z',
        '2026-10-01T22:00:00Z',
        '2026-10-08T22:00:00Z',
        '2026-10-15T22:00:00Z',
        '2026-10-22T22:00:00Z',
        '2026-10-29T22:00:00Z',
        '2026-11-05T23:00:00Z',
        '2026-11-12T23:00:00Z',
        '2026-11-19T23:00:00Z',
        '2026-12-03T23:00:00Z',
        '2026-12-10T23:00:00Z',
        '2026-12-17T23:00:00Z',
      ],
      ['mcs-full'],
      sourceEvidenceSha256,
    ),
    scheduleBlock(
      'mcs-practicum:2026-09-25',
      'mcs.live-practicum',
      [
        '2026-09-25T14:00:00Z',
        '2026-10-02T14:00:00Z',
        '2026-10-09T14:00:00Z',
        '2026-10-16T14:00:00Z',
        '2026-10-23T14:00:00Z',
        '2026-10-30T14:00:00Z',
        '2026-11-06T15:00:00Z',
        '2026-11-13T15:00:00Z',
        '2026-11-20T15:00:00Z',
        '2026-12-04T15:00:00Z',
        '2026-12-11T15:00:00Z',
        '2026-12-18T15:00:00Z',
      ],
      ['mcs-full'],
      sourceEvidenceSha256,
    ),
    scheduleBlock(
      'mcs-practicum:2027-01-07',
      'mcs.live-practicum',
      dates('2027-01-07T23:00:00Z', 10),
      ['mcs-full'],
      sourceEvidenceSha256,
    ),
    scheduleBlock(
      'mcs-practicum:2027-01-08',
      'mcs.live-practicum',
      dates('2027-01-08T15:00:00Z', 10),
      ['mcs-full'],
      sourceEvidenceSha256,
    ),
  ];
}

function catalogBundles() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const selected = new Map();
  for (const key of [
    'acc-module-1:v1',
    'acc-full:v1',
    'mcs-standard-path:v1',
  ]) {
    const bundle = catalog.bundles.find((entry) => entry.bundle_key === key);
    if (!bundle) throw new Error(`required bundle missing: ${key}`);
    selected.set(
      key,
      bundle.components.map((entry) => ({
        component_key: entry.component_key,
        state: entry.inclusion,
      })),
    );
  }
  return selected;
}

export function buildAcademyCapacityShadowManifest({
  accRows,
  mcsRows,
  allowCreatePartySha256,
  heldFundingSha256,
  aliasSha256,
}) {
  const sourceResolutionBytes = fs.readFileSync(SOURCE_RESOLUTION);
  const sourceResolution = JSON.parse(sourceResolutionBytes.toString('utf8'));
  const sourceEvidenceSha256 = sha256(sourceResolutionBytes);
  const observedAt = sourceResolution.observed_at;
  const bundles = catalogBundles();
  const createSet = new Set(allowCreatePartySha256);
  const participants = [];
  const push = (row, deliveryBlock, offer, bundle, assignmentComponent) => {
    const email = String(row.Email ?? '')
      .trim()
      .toLowerCase();
    const participant_key = sha256(email);
    const routeDate = row['Full Program'] || row.M1 || row['MCS Practicum'];
    participants.push({
      participant_key,
      email,
      display_name: String(row.Name ?? '').trim(),
      allow_create_party: createSet.has(participant_key),
      delivery_block_key: deliveryBlock,
      offer_key: offer,
      bundle_key: bundle,
      assignment_component_key: assignmentComponent,
      financial_classification:
        participant_key === heldFundingSha256 ? 'held' : 'settled',
      source_scope: deliveryBlock.startsWith('acc.')
        ? 'student_roster.acc'
        : 'student_roster.mcs',
      record_evidence_sha256: sha256(
        `${email}|${String(row.Name ?? '').trim()}|${String(row.Cohort ?? '').trim()}|${routeDate}|${offer}|${deliveryBlock}`,
      ),
      components: structuredClone(bundles.get(bundle)),
    });
  };

  for (const row of accRows) {
    if (
      row.Cohort !== '2026-09' ||
      String(row.Refunded ?? '').trim() ||
      (!row['Full Program'] && !row.M1)
    )
      continue;
    push(
      row,
      'acc.module-1:2026-09-07',
      row['Full Program'] ? 'acc-full' : 'acc-module-1',
      row['Full Program'] ? 'acc-full:v1' : 'acc-module-1:v1',
      'acc.module-1',
    );
  }
  const mcsBlocks = {
    'September 2026 – Thursday': 'mcs-practicum:2026-09-24',
    'September 2026 – Friday': 'mcs-practicum:2026-09-25',
    'January 2027 – Thursday': 'mcs-practicum:2027-01-07',
  };
  for (const row of mcsRows) {
    const deliveryBlock = mcsBlocks[row.Cohort];
    if (
      !deliveryBlock ||
      String(row.Refunded ?? '').trim() ||
      !row['MCS Practicum']
    )
      continue;
    push(
      row,
      deliveryBlock,
      'mcs-full',
      'mcs-standard-path:v1',
      'mcs.live-practicum',
    );
  }
  participants.sort(
    (left, right) =>
      left.delivery_block_key.localeCompare(right.delivery_block_key) ||
      left.email.localeCompare(right.email),
  );
  const byKey = new Map(
    participants.map((entry) => [entry.participant_key, entry]),
  );
  if (!byKey.has(heldFundingSha256))
    throw new Error(
      'held funding participant is absent from the exact population',
    );
  if (byKey.get(heldFundingSha256).offer_key !== 'acc-module-1')
    throw new Error(
      'held funding participant must be an ACC Module 1 assignment',
    );
  if (
    !byKey.has(aliasSha256) ||
    byKey.get(aliasSha256).offer_key !== 'acc-full'
  )
    throw new Error('alias participant must be an ACC Full assignment');
  for (const key of createSet)
    if (!byKey.has(key))
      throw new Error('Party creation allowance is outside population');
  const reviewAt = new Date(
    Date.parse(observedAt) + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const manifest = {
    schema_version: '1.0',
    batch_key: 'academy-capacity-shadow-2026-09-06',
    observed_at: observedAt,
    source_evidence_sha256: sourceEvidenceSha256,
    delivery_blocks: schedules(sourceEvidenceSha256),
    participants,
    exceptions: [
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:mcs-friday-owner-count',
        subject_type: 'assignment',
        delivery_block_key: 'mcs-practicum:2026-09-25',
        reason_code: 'mcs_friday_owner_count_variance',
        severity: 'high',
        owner_role: 'owner_admin',
        evidence_sha256: sha256(
          `${sourceEvidenceSha256}|mcs-friday-owner-count-13-versus-12`,
        ),
        review_at: reviewAt,
      },
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:acc-module-1-funding',
        subject_type: 'agreement',
        participant_key: heldFundingSha256,
        reason_code: 'funding_source_unresolved',
        severity: 'medium',
        owner_role: 'finance_operator',
        evidence_sha256: sha256(
          `${sourceEvidenceSha256}|${heldFundingSha256}|funding-held`,
        ),
        review_at: reviewAt,
      },
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:acc-heartbeat-email-alias',
        subject_type: 'enrollment',
        participant_key: aliasSha256,
        reason_code: 'cross_provider_email_alias_unresolved',
        severity: 'medium',
        owner_role: 'enrollment_operator',
        evidence_sha256: sha256(
          `${sourceEvidenceSha256}|${aliasSha256}|provider-alias-held`,
        ),
        review_at: reviewAt,
      },
    ],
  };
  const findings = validateAcademyCapacityShadowManifest(manifest);
  if (findings.length)
    throw new Error(
      `generated private manifest is invalid: ${findings.join('; ')}`,
    );
  return manifest;
}

export function writePrivateAcademyCapacityShadowManifest(options) {
  for (const value of [
    ...options.allowCreatePartySha256,
    options.heldFundingSha256,
    options.aliasSha256,
  ])
    if (!SHA256.test(value))
      throw new Error('all participant references must be SHA-256');
  if (options.allowCreatePartySha256.length !== 3)
    throw new Error('exactly three Party creation SHA-256 values are required');
  const output = assertPrivateOutput(options.output);
  const manifest = buildAcademyCapacityShadowManifest({
    accRows: payloadRows(options.accRoster),
    mcsRows: payloadRows(options.mcsRoster),
    allowCreatePartySha256: options.allowCreatePartySha256,
    heldFundingSha256: options.heldFundingSha256,
    aliasSha256: options.aliasSha256,
  });
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(output, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(manifest)}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(output, 0o600);
  return {
    ok: true,
    output,
    manifest_sha256: manifestSha256(manifest),
    source_evidence_sha256: manifest.source_evidence_sha256,
    delivery_blocks: manifest.delivery_blocks.length,
    participants: manifest.participants.length,
    create_party_allowances: manifest.participants.filter(
      (entry) => entry.allow_create_party,
    ).length,
    held_financial_classifications: manifest.participants.filter(
      (entry) => entry.financial_classification === 'held',
    ).length,
    exceptions: manifest.exceptions.length,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  for (const key of ['accRoster', 'mcsRoster', 'output'])
    if (!options[key])
      throw new Error(
        `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`,
      );
  const result = writePrivateAcademyCapacityShadowManifest(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
