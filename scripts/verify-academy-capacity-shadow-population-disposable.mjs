#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  manifestSha256,
  runAcademyCapacityShadowPopulation,
  sha256,
} from './populate-academy-capacity-shadow.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_BIN =
  process.env.NANOCLAW_DISPOSABLE_PG_BIN ??
  '/opt/homebrew/opt/postgresql@16/bin';
const PSQL = path.join(PG_BIN, 'psql');
const CREATEDB = path.join(PG_BIN, 'createdb');
const DROPDB = path.join(PG_BIN, 'dropdb');
const MIGRATION_142 = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql',
);
const MIGRATION_143 = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql',
);

const ACC_MODULE_COMPONENTS = [
  { component_key: 'acc.module-1', state: 'included' },
];
const ACC_FULL_COMPONENTS = [
  'acc.module-1',
  'acc.module-2',
  'acc.module-3',
  'acc.module-4',
  'acc.group-mentoring',
  'acc.individual-mentoring',
  'acc.group-supervision',
  'acc.performance-evaluation',
  'acc.exam-preparation',
  'shared.coaching-tools-plus',
].map((component_key) => ({ component_key, state: 'included' }));
const MCS_COMPONENTS = [
  ['mcs.foundations', 'included'],
  ['mcs.acc-bars-training', 'included'],
  ['mcs.pcc-markers-training', 'included'],
  ['mcs.live-practicum', 'included'],
  ['mcs.observed-practice', 'included'],
  ['mcs.peer-mentoring-arcs', 'included'],
  ['mcs.mentoring-on-mentoring', 'included'],
  ['mcs.capstone', 'included'],
  ['mcs.mcc-bars-bonus', 'conditional'],
  ['mcs.certificate', 'earned_on_completion'],
].map(([component_key, state]) => ({ component_key, state }));

function childEnvironment() {
  return Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}

function run(binary, args, input = undefined) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: childEnvironment(),
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
      .trim()
      .slice(-4000);
    throw new Error(`${path.basename(binary)} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function sql(database, statement) {
  return run(
    PSQL,
    ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-qAt', '-d', database],
    `${statement}\n`,
  );
}

function applyFile(database, file) {
  run(PSQL, [
    '-X',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
    '-d',
    database,
    '-f',
    file,
  ]);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function block(delivery_block_key, component_key, starts_at, ends_at, offers) {
  return {
    delivery_block_key,
    component_key,
    source_scope: 'calendar.disposable',
    source_object_id: `fixture:${delivery_block_key}`,
    starts_at,
    ends_at,
    timezone: 'America/New_York',
    session_set_sha256: sha256(`sessions:${delivery_block_key}`),
    schedule_evidence_sha256: sha256(`schedule:${delivery_block_key}`),
    pool_key: `academy-capacity-shadow-2026-09-06:pool:${delivery_block_key}`,
    capacity: 12,
    operational_state: 'open',
    configuration_evidence_sha256: sha256(`capacity:${delivery_block_key}`),
    offers: offers.map((offer_key) => ({
      offer_key,
      catalog_revision: 1,
      evidence_sha256: sha256(`offer:${delivery_block_key}:${offer_key}`),
    })),
  };
}

export function syntheticAcademyCapacityShadowManifest() {
  const participants = [];
  const add = (count, deliveryBlock, offer, bundle, components) => {
    for (let index = 0; index < count; index += 1) {
      const ordinal = participants.length + 1;
      const email = `student-${String(ordinal).padStart(3, '0')}@example.test`;
      participants.push({
        participant_key: sha256(email),
        email,
        display_name: `Fixture Student ${ordinal}`,
        allow_create_party: ordinal <= 3,
        delivery_block_key: deliveryBlock,
        offer_key: offer,
        bundle_key: bundle,
        assignment_component_key:
          offer === 'mcs-full' ? 'mcs.live-practicum' : 'acc.module-1',
        financial_classification: ordinal === 1 ? 'held' : 'settled',
        source_scope:
          offer === 'mcs-full' ? 'student_roster.mcs' : 'student_roster.acc',
        record_evidence_sha256: sha256(`record:${ordinal}`),
        components: structuredClone(components),
      });
    }
  };
  add(
    10,
    'acc.module-1:2026-09-07',
    'acc-module-1',
    'acc-module-1:v1',
    ACC_MODULE_COMPONENTS,
  );
  add(
    11,
    'acc.module-1:2026-09-07',
    'acc-full',
    'acc-full:v1',
    ACC_FULL_COMPONENTS,
  );
  add(
    5,
    'mcs-practicum:2026-09-24',
    'mcs-full',
    'mcs-standard-path:v1',
    MCS_COMPONENTS,
  );
  add(
    13,
    'mcs-practicum:2026-09-25',
    'mcs-full',
    'mcs-standard-path:v1',
    MCS_COMPONENTS,
  );
  add(
    1,
    'mcs-practicum:2027-01-07',
    'mcs-full',
    'mcs-standard-path:v1',
    MCS_COMPONENTS,
  );
  return {
    schema_version: '1.0',
    batch_key: 'academy-capacity-shadow-2026-09-06',
    observed_at: '2026-09-06T16:49:27Z',
    source_evidence_sha256: sha256('disposable-source-resolution'),
    delivery_blocks: [
      block(
        'acc.module-1:2026-09-07',
        'acc.module-1',
        '2026-09-07T15:00:00Z',
        '2026-09-28T17:00:00Z',
        ['acc-module-1', 'acc-full', 'acc-pcc-full'],
      ),
      block(
        'mcs-practicum:2026-09-24',
        'mcs.live-practicum',
        '2026-09-24T22:00:00Z',
        '2026-12-18T01:00:00Z',
        ['mcs-full'],
      ),
      block(
        'mcs-practicum:2026-09-25',
        'mcs.live-practicum',
        '2026-09-25T14:00:00Z',
        '2026-12-18T17:00:00Z',
        ['mcs-full'],
      ),
      block(
        'mcs-practicum:2027-01-07',
        'mcs.live-practicum',
        '2027-01-07T23:00:00Z',
        '2027-03-12T01:00:00Z',
        ['mcs-full'],
      ),
      block(
        'mcs-practicum:2027-01-08',
        'mcs.live-practicum',
        '2027-01-08T15:00:00Z',
        '2027-03-12T17:00:00Z',
        ['mcs-full'],
      ),
    ],
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
        evidence_sha256: sha256('mcs-owner-count'),
        review_at: '2026-09-13T16:49:27Z',
      },
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:acc-module-1-funding',
        subject_type: 'agreement',
        participant_key: participants[0].participant_key,
        reason_code: 'funding_source_unresolved',
        severity: 'medium',
        owner_role: 'finance_operator',
        evidence_sha256: sha256('funding-held'),
        review_at: '2026-09-13T16:49:27Z',
      },
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:acc-heartbeat-email-alias',
        subject_type: 'enrollment',
        participant_key: participants[10].participant_key,
        reason_code: 'cross_provider_email_alias_unresolved',
        severity: 'medium',
        owner_role: 'enrollment_operator',
        evidence_sha256: sha256('alias-held'),
        review_at: '2026-09-13T16:49:27Z',
      },
    ],
  };
}

function prerequisiteSql() {
  return `
    DO $$ BEGIN
      CREATE ROLE nanoclaw_admin NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA business_v2;
    CREATE TABLE business_v2.parties (
      id bigserial PRIMARY KEY,
      party_type text NOT NULL CHECK (party_type IN ('person','org')),
      display_name text NOT NULL,
      primary_email text,
      source_provider text,
      source_id text,
      merged_into bigint REFERENCES business_v2.parties(id),
      merged_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_updated_by text NOT NULL DEFAULT 'unknown',
      CHECK ((merged_into IS NULL)=(merged_at IS NULL))
    );
    CREATE TABLE business_v2.party_emails (
      party_id bigint NOT NULL REFERENCES business_v2.parties(id),
      email text NOT NULL,
      is_primary boolean NOT NULL DEFAULT false,
      verified_at timestamptz,
      PRIMARY KEY (party_id,email)
    );
    GRANT nanoclaw_admin TO CURRENT_USER;
    GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_admin;
    GRANT SELECT,INSERT ON business_v2.parties,business_v2.party_emails TO nanoclaw_admin;
    GRANT USAGE,SELECT ON SEQUENCE business_v2.parties_id_seq TO nanoclaw_admin;
    CREATE FUNCTION business_v2.fn_company_work_append_only()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'append-only fixture relation'; END $$;
  `;
}

export function runAcademyCapacityShadowPopulationDisposableProof() {
  for (const binary of [PSQL, CREATEDB, DROPDB])
    if (!fs.existsSync(binary))
      throw new Error(`PostgreSQL 16 binary missing: ${binary}`);
  const database = `nc_academy_capacity_shadow_${randomUUID().replaceAll('-', '_')}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-shadow-proof-'));
  const manifestPath = path.join(temp, 'manifest.json');
  let created = false;
  try {
    run(CREATEDB, ['-h', '/tmp', '-p', '5432', database]);
    created = true;
    sql(database, prerequisiteSql());
    const manifest = syntheticAcademyCapacityShadowManifest();
    const seed = manifest.participants
      .filter((entry) => !entry.allow_create_party)
      .map(
        (entry) => `
          WITH inserted AS (
            INSERT INTO business_v2.parties
              (party_type,display_name,primary_email,created_at,updated_at,last_updated_by)
            VALUES ('person',${sqlLiteral(entry.display_name)},${sqlLiteral(entry.email)},
              now(),now(),'disposable-fixture') RETURNING id
          )
          INSERT INTO business_v2.party_emails(party_id,email,is_primary,verified_at)
          SELECT id,${sqlLiteral(entry.email)},true,now() FROM inserted;`,
      )
      .join('\n');
    sql(database, seed);
    applyFile(database, MIGRATION_142);
    applyFile(database, MIGRATION_143);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, {
      mode: 0o600,
    });
    fs.chmodSync(manifestPath, 0o600);
    const digest = manifestSha256(manifest);
    const options = {
      manifest: manifestPath,
      database,
      psql: PSQL,
      apply: true,
      confirmHost: os.hostname(),
      expectedManifestSha256: digest,
    };
    const first = runAcademyCapacityShadowPopulation(options);
    const replay = runAcademyCapacityShadowPopulation(options);
    const replayInserted = Object.values(replay.inserted ?? {}).reduce(
      (sum, value) => sum + Number(value),
      0,
    );
    if (first?.inserted?.parties !== 3)
      throw new Error(
        'first apply did not create exactly three fixture Parties',
      );
    if (replayInserted !== 0)
      throw new Error(`idempotent replay inserted ${replayInserted} rows`);
    const grants = sql(
      database,
      `SELECT count(*) FROM information_schema.role_table_grants
       WHERE table_schema='business_v2'
         AND (table_name LIKE 'academy_%' OR table_name LIKE 'student_%')
         AND grantee <> 'nanoclaw_admin'`,
    );
    if (grants !== '0')
      throw new Error(`unexpected non-admin grants: ${grants}`);
    return {
      ok: true,
      manifest_sha256: digest,
      first_counts: first.counts,
      first_occupancy: first.occupancy,
      first_created_parties: first.inserted.parties,
      replay_inserted: replayInserted,
      non_admin_grants: Number(grants),
    };
  } finally {
    if (created)
      run(DROPDB, ['-h', '/tmp', '-p', '5432', '--if-exists', database]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function main() {
  process.stdout.write(
    `${JSON.stringify(runAcademyCapacityShadowPopulationDisposableProof())}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
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
