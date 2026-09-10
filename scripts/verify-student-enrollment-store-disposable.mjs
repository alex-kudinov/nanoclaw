import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pg = '/opt/homebrew/opt/postgresql@16/bin';
const safe = /^nc_student_enrollment_store_[a-f0-9]{32}$/;
function run(binary, args, input) {
  const env = {
    PATH: process.env.PATH,
    LANG: 'C',
    PGPASSFILE: '/dev/null',
    PGSERVICEFILE: '/dev/null',
  };
  const r = spawnSync(binary, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    input,
    timeout: 60000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(
      `${path.basename(binary)} failed: ${(r.stderr || r.stdout || String(r.error)).slice(-3000)}`,
    );
  return r.stdout.trim();
}
const connection = [
  '--host',
  '/tmp',
  '--port',
  '5432',
  '--username',
  os.userInfo().username,
  '--no-password',
];
function sql(db, statement) {
  if (db !== 'postgres' && !safe.test(db))
    throw new Error('non-disposable proof target');
  return run(
    path.join(pg, 'psql'),
    [
      '-X',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
      ...connection,
      '-d',
      db,
    ],
    statement,
  );
}

/** Always generates its own fresh database. No supplied target or inherited PG routing. */
export function runEnrollmentStoreDisposableProof(mode = 'store') {
  if (!['store', 'admission'].includes(mode))
    throw new Error('unsupported disposable proof mode');
  const database =
    'nc_student_enrollment_store_' + randomUUID().replaceAll('-', '');
  if (!safe.test(database)) throw new Error('invalid generated name');
  if (
    sql(
      'postgres',
      `SELECT count(*) FROM pg_database WHERE datname='${database}'`,
    ) !== '0'
  )
    throw new Error('existing target refused');
  let created = false;
  try {
    run(path.join(pg, 'createdb'), [
      ...connection,
      '--maintenance-db=postgres',
      '--template=template0',
      database,
    ]);
    created = true;
    sql(
      database,
      `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nanoclaw_admin') THEN
      RAISE EXCEPTION 'existing local nanoclaw_admin role required'; END IF; END $$;
      CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin;
      CREATE TABLE business_v2.parties(id bigint PRIMARY KEY);
      GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_admin;
      GRANT SELECT ON business_v2.parties TO nanoclaw_admin;
      INSERT INTO business_v2.parties SELECT generate_series(1,100);
      CREATE FUNCTION business_v2.fn_company_work_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'append-only synthetic relation'; END $$;`,
    );
    for (const name of [
      '142_student_enrollment_dark_foundation.sql',
      '143_academy_capacity_dark.sql',
      '144_academy_capacity_operator_pilot.sql',
      '145_academy_capacity_simple_sync.sql',
      '146_student_enrollment_store_contract.sql',
    ])
      sql(
        database,
        fs.readFileSync(
          path.join(root, 'data/business/migrations/nanoclaw-v2', name),
          'utf8',
        ),
      );
    sql(
      database,
      fs.readFileSync(
        path.join(
          root,
          'data/business/migrations/nanoclaw-v2/rollback_146_student_enrollment_store_contract.sql',
        ),
        'utf8',
      ),
    );
    if (
      sql(
        database,
        "SELECT count(*) FROM information_schema.columns WHERE table_schema='business_v2' AND table_name='student_projection_outbox' AND column_name='version'",
      ) !== '0'
    )
      throw new Error('empty rollback left projection version');
    sql(
      database,
      fs.readFileSync(
        path.join(
          root,
          'data/business/migrations/nanoclaw-v2/146_student_enrollment_store_contract.sql',
        ),
        'utf8',
      ),
    );
    if (mode === 'admission') {
      for (const name of [
        '147_student_enrollment_writer_claims.sql',
        'rollback_147_student_enrollment_writer_claims.sql',
        '147_student_enrollment_writer_claims.sql',
        '153_website_checkout_provisional_finance.sql',
        'rollback_153_website_checkout_provisional_finance.sql',
        '153_website_checkout_provisional_finance.sql',
      ])
        sql(
          database,
          fs.readFileSync(
            path.join(root, 'data/business/migrations/nanoclaw-v2', name),
            'utf8',
          ),
        );
    }
    const worker = JSON.parse(
      run(path.join(root, 'node_modules/.bin/tsx'), [
        path.join(
          root,
          mode === 'store'
            ? 'scripts/student-enrollment-store-disposable-worker.ts'
            : 'scripts/student-enrollment-admission-disposable-worker.ts',
        ),
        database,
      ]),
    );
    run(path.join(pg, 'dropdb'), [...connection, database]);
    created = false;
    if (
      sql(
        'postgres',
        `SELECT count(*) FROM pg_database WHERE datname='${database}'`,
      ) !== '0'
    )
      throw new Error('disposable database residue');
    return { ok: true, worker, dropped: true, emptyRollbackReapply: true };
  } finally {
    if (created)
      run(path.join(pg, 'dropdb'), [...connection, '--if-exists', database]);
  }
}
