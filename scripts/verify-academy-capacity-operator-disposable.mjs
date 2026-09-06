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
} from './populate-academy-capacity-shadow.mjs';
import { syntheticAcademyCapacityShadowManifest } from './verify-academy-capacity-shadow-population-disposable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_BIN =
  process.env.NANOCLAW_DISPOSABLE_PG_BIN ??
  '/opt/homebrew/opt/postgresql@16/bin';
const PSQL = path.join(PG_BIN, 'psql');
const CREATEDB = path.join(PG_BIN, 'createdb');
const DROPDB = path.join(PG_BIN, 'dropdb');
const MIGRATIONS = [
  '142_student_enrollment_dark_foundation.sql',
  '143_academy_capacity_dark.sql',
  '144_academy_capacity_operator_pilot.sql',
  '145_academy_capacity_simple_sync.sql',
].map((file) =>
  path.join(ROOT, 'data/business/migrations/nanoclaw-v2', file),
);
const ROLLBACK = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/rollback_144_academy_capacity_operator_pilot.sql',
);
const WORKER = path.join(
  ROOT,
  'scripts/academy-capacity-operator-disposable-worker.ts',
);
const TSX = path.join(ROOT, 'node_modules/.bin/tsx');

function childEnvironment() {
  return Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}

function run(binary, args, input, expectFailure = false) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: childEnvironment(),
    input,
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (expectFailure) {
    if (result.status === 0) throw new Error('expected command failure');
    return output;
  }
  if (result.status !== 0)
    throw new Error(`${path.basename(binary)} failed: ${output.slice(-6000)}`);
  return String(result.stdout ?? '').trim();
}

function sql(database, statement) {
  return run(
    PSQL,
    ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-qAt', '-h', '/tmp', '-p', '5432', '-d', database],
    `${statement}\n`,
  );
}

function applyFile(database, file, expectFailure = false) {
  return run(
    PSQL,
    [
      '-X',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-h',
      '/tmp',
      '-p',
      '5432',
      '-d',
      database,
      '-f',
      file,
    ],
    undefined,
    expectFailure,
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

export function runAcademyCapacityOperatorDisposableProof() {
  for (const file of [PSQL, CREATEDB, DROPDB, TSX, WORKER, ...MIGRATIONS])
    if (!fs.existsSync(file)) throw new Error(`required input missing: ${file}`);
  const database = `nc_academy_capacity_shadow_${randomUUID().replaceAll('-', '_')}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'capacity-operator-proof-'));
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
    for (const migration of MIGRATIONS) applyFile(database, migration);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, {
      mode: 0o600,
    });
    const population = runAcademyCapacityShadowPopulation({
      manifest: manifestPath,
      database,
      psql: PSQL,
      apply: true,
      confirmHost: os.hostname(),
      expectedManifestSha256: manifestSha256(manifest),
    });
    const worker = JSON.parse(
      run(TSX, [WORKER, '--database', database]).split('\n').at(-1),
    );
    const rollbackFailure = applyFile(database, ROLLBACK, true);
    if (!rollbackFailure.includes('refusing to drop populated Academy Capacity operator cases'))
      throw new Error('populated rollback did not fail for the exact reason');
    const grants = Number(
      sql(
        database,
        `SELECT count(*) FROM information_schema.role_table_grants
          WHERE table_schema='business_v2'
            AND table_name LIKE 'academy_capacity_operator_%'
            AND grantee <> 'nanoclaw_admin'`,
      ),
    );
    const owners = sql(
      database,
      `SELECT count(*) FILTER (WHERE pg_get_userbyid(c.relowner)='nanoclaw_admin'),count(*)
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='business_v2'
          AND c.relname LIKE 'academy_capacity_operator_%'`,
    );
    return {
      ok: true,
      population: population.counts,
      worker,
      non_admin_grants: grants,
      owner_count: owners,
      rollback_refused: true,
    };
  } finally {
    if (created)
      run(DROPDB, ['-h', '/tmp', '-p', '5432', '--if-exists', database]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runAcademyCapacityOperatorDisposableProof())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
