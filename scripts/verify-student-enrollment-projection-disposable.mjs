import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pg = '/opt/homebrew/opt/postgresql@16/bin';
const safe = /^nc_student_enrollment_store_[a-f0-9]{32}$/;
const connection = ['--host', '/tmp', '--port', '5432', '--username', os.userInfo().username, '--no-password'];
function run(binary, args, input) {
  const result = spawnSync(binary, args, { cwd: root,
    env: { PATH: process.env.PATH, LANG: 'C', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' },
    encoding: 'utf8', input, timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed: ${(result.stderr || result.stdout || String(result.error)).slice(-4000)}`);
  return result.stdout.trim();
}
function sql(database, statement) {
  if (database !== 'postgres' && !safe.test(database)) throw new Error('non-disposable proof target');
  return run(path.join(pg, 'psql'), ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-qAt', ...connection, '-d', database], statement);
}
export function runEnrollmentProjectionDisposableProof() {
  const database = 'nc_student_enrollment_store_' + randomUUID().replaceAll('-', '');
  if (!safe.test(database)) throw new Error('invalid generated name');
  if (sql('postgres', `SELECT count(*) FROM pg_database WHERE datname='${database}'`) !== '0') throw new Error('existing target refused');
  let created = false;
  try {
    run(path.join(pg, 'createdb'), [...connection, '--maintenance-db=postgres', '--template=template0', database]);
    created = true;
    sql(database, `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nanoclaw_admin') THEN RAISE EXCEPTION 'existing local nanoclaw_admin role required'; END IF; END $$;
      CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin;
      CREATE TABLE business_v2.parties(id bigint PRIMARY KEY);
      INSERT INTO business_v2.parties VALUES(1);
      CREATE FUNCTION business_v2.fn_company_work_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only synthetic relation'; END $$;`);
    for (const name of ['142_student_enrollment_dark_foundation.sql','146_student_enrollment_store_contract.sql','148_student_enrollment_projection_foundation.sql'])
      sql(database, fs.readFileSync(path.join(root, 'data/business/migrations/nanoclaw-v2', name), 'utf8'));
    const worker = JSON.parse(run(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'scripts/student-enrollment-projection-disposable-worker.ts'), database]));
    let populatedRollbackRefused = false;
    try { sql(database, fs.readFileSync(path.join(root, 'data/business/migrations/nanoclaw-v2/rollback_148_student_enrollment_projection_foundation.sql'), 'utf8')); }
    catch (error) { populatedRollbackRefused = /refusing projection-foundation rollback while delivery evidence exists/.test(String(error)); }
    if (!populatedRollbackRefused) throw new Error('populated rollback did not refuse');
    run(path.join(pg, 'dropdb'), [...connection, database]); created = false;
    if (sql('postgres', `SELECT count(*) FROM pg_database WHERE datname='${database}'`) !== '0') throw new Error('disposable database residue');
    return { ok: true, dropped: true, populatedRollbackRefused, worker };
  } finally {
    if (created) run(path.join(pg, 'dropdb'), [...connection, '--if-exists', database]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(runEnrollmentProjectionDisposableProof()));
