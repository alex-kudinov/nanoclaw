#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_BIN =
  process.env.NANOCLAW_DISPOSABLE_PG_BIN ??
  '/opt/homebrew/opt/postgresql@16/bin';
const PSQL = path.join(PG_BIN, 'psql');
const CREATEDB = path.join(PG_BIN, 'createdb');
const DROPDB = path.join(PG_BIN, 'dropdb');
const migration = (name) =>
  path.join(ROOT, 'data/business/migrations/nanoclaw-v2', name);
const PREREQUISITES = [
  '142_student_enrollment_dark_foundation.sql',
  '143_academy_capacity_dark.sql',
  '144_academy_capacity_operator_pilot.sql',
  '145_academy_capacity_simple_sync.sql',
].map(migration);
const TARGET = migration('169_acc_capacity_readiness.sql');
const ROLLBACK = migration('rollback_169_acc_capacity_readiness.sql');

function environment() {
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
    env: environment(),
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (expectFailure) {
    if (result.status === 0) throw new Error('expected command failure');
    return output;
  }
  if (result.status !== 0)
    throw new Error(`${path.basename(binary)} failed: ${output.slice(-5000)}`);
  return String(result.stdout ?? '').trim();
}

function sql(database, statement) {
  return run(
    PSQL,
    [
      '-X',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
      '-h',
      '/tmp',
      '-p',
      '5432',
      '-d',
      database,
    ],
    `${statement}\n`,
  );
}

function apply(database, file, expectFailure = false) {
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

function prerequisiteSql() {
  return `
    DO $$ BEGIN
      CREATE ROLE nanoclaw_admin NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA business_v2;
    CREATE TABLE business_v2.parties (
      id bigserial PRIMARY KEY, party_type text NOT NULL CHECK (party_type IN ('person','org')),
      display_name text NOT NULL, primary_email text, source_provider text, source_id text,
      merged_into bigint REFERENCES business_v2.parties(id), merged_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      last_updated_by text NOT NULL DEFAULT 'unknown', CHECK ((merged_into IS NULL)=(merged_at IS NULL))
    );
    CREATE TABLE business_v2.party_emails (
      party_id bigint NOT NULL REFERENCES business_v2.parties(id), email text NOT NULL,
      is_primary boolean NOT NULL DEFAULT false, verified_at timestamptz,
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

export function runAccCapacityReadinessDisposableProof() {
  for (const file of [PSQL, CREATEDB, DROPDB, TARGET, ROLLBACK, ...PREREQUISITES])
    if (!fs.existsSync(file)) throw new Error(`required input missing: ${file}`);
  const database = `nc_acc_capacity_169_${randomUUID().replaceAll('-', '_')}`;
  let created = false;
  try {
    run(CREATEDB, ['-h', '/tmp', '-p', '5432', database]);
    created = true;
    sql(database, prerequisiteSql());
    for (const file of PREREQUISITES) apply(database, file);
    apply(database, TARGET);
    apply(database, TARGET);
    const counts = sql(
      database,
      `SELECT
         (SELECT count(*) FROM business_v2.academy_delivery_blocks WHERE updated_by='migration:169_acc_capacity_readiness'),
         (SELECT count(*) FROM business_v2.academy_seat_pools WHERE updated_by='migration:169_acc_capacity_readiness'),
         (SELECT count(*) FROM business_v2.academy_seat_pool_offers WHERE updated_by='migration:169_acc_capacity_readiness')`,
    );
    apply(database, ROLLBACK);
    const rollbackCount = sql(
      database,
      `SELECT count(*) FROM business_v2.academy_delivery_blocks WHERE updated_by='migration:169_acc_capacity_readiness'`,
    );
    apply(database, TARGET);
    sql(
      database,
      `UPDATE business_v2.academy_seat_pools SET capacity=13 WHERE pool_key='calendar-publication:pool:acc.module-1:2026-10-07'`,
    );
    const conflict = apply(database, TARGET, true);
    sql(
      database,
      `UPDATE business_v2.academy_seat_pools SET capacity=12 WHERE pool_key='calendar-publication:pool:acc.module-1:2026-10-07'`,
    );
    apply(database, TARGET);
    return {
      ok: true,
      counts,
      rollbackCount,
      conflictRefused: conflict.includes('migration 169 seat-pool conflict'),
    };
  } finally {
    if (created)
      run(DROPDB, ['-h', '/tmp', '-p', '5432', '--if-exists', database]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runAccCapacityReadinessDisposableProof())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
