#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const DISPOSABLE_PREFIX = 'nc_student_enrollment_disposable_';
const SAFE_NAME = /^nc_student_enrollment_disposable_[a-z0-9_]{8,80}$/;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const MIGRATION = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql',
);
const ROLLBACK = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/rollback_142_student_enrollment_dark_foundation.sql',
);
const LOCAL_SOCKET = '/tmp';
const LOCAL_PORT = '5432';

function childEnvironment() {
  const allowed = [
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'NANOCLAW_DISPOSABLE_PG_BIN',
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}

function postgresBin(name) {
  const configured = process.env.NANOCLAW_DISPOSABLE_PG_BIN;
  const binary = configured
    ? path.join(configured, name)
    : `/opt/homebrew/opt/postgresql@16/bin/${name}`;
  if (!path.isAbsolute(binary) || !fs.existsSync(binary))
    throw new Error(`PostgreSQL 16 binary unavailable: ${name}`);
  return binary;
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: childEnvironment(),
  });
  const expectedFailure = options.expectFailure === true;
  if (expectedFailure) {
    if (result.status === 0)
      throw new Error(`expected command failure: ${path.basename(binary)}`);
    if (!(options.expectedMessage instanceof RegExp))
      throw new Error('expected failures require an expectedMessage regex');
    const detail = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (!options.expectedMessage.test(detail))
      throw new Error(
        `command failed for an unexpected reason: ${detail.trim().slice(-2000)}`,
      );
    return result;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(-2000);
    throw new Error(
      `${path.basename(binary)} failed with status ${result.status}: ${detail}`,
    );
  }
  return result;
}

function psql(database, args, options = {}) {
  assertDisposableDatabaseName(database);
  return run(
    postgresBin('psql'),
    [
      '-X',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '--host',
      LOCAL_SOCKET,
      '--port',
      LOCAL_PORT,
      '-d',
      database,
      ...args,
    ],
    options,
  );
}

function maintenanceQuery(sql) {
  return run(postgresBin('psql'), [
    '-X',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    'postgres',
    '--host',
    LOCAL_SOCKET,
    '--port',
    LOCAL_PORT,
    '-Atq',
    '-c',
    sql,
  ]).stdout.trim();
}

function scalar(database, sql) {
  return psql(database, ['-Atq', '-c', sql]).stdout.trim();
}

function expectScalar(database, sql, expected, label) {
  const actual = scalar(database, sql);
  if (actual !== expected)
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function assertDisposableDatabaseName(database) {
  if (!SAFE_NAME.test(database))
    throw new Error(
      `refusing non-disposable database name; expected ${DISPOSABLE_PREFIX}<generated>`,
    );
  if (/nanoclaw_business|production|prod/i.test(database))
    throw new Error('refusing production-like database name');
  return database;
}

export function generatedDisposableDatabaseName() {
  return assertDisposableDatabaseName(
    `${DISPOSABLE_PREFIX}${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
  );
}

function parseDatabaseArgument(argv) {
  const index = argv.indexOf('--database');
  if (index === -1) return generatedDisposableDatabaseName();
  if (!argv[index + 1] || index + 2 !== argv.length)
    throw new Error('usage: verify-student-enrollment-disposable [--database safe_name]');
  return assertDisposableDatabaseName(argv[index + 1]);
}

function databaseExists(database) {
  const count = maintenanceQuery(
    `SELECT count(*) FROM pg_database WHERE datname=${sqlLiteral(database)}`,
  );
  return count !== '0';
}

function createDatabase(database) {
  if (databaseExists(database))
    throw new Error('refusing existing database target');
  run(postgresBin('createdb'), [
    '--maintenance-db=postgres',
    '--template=template0',
    '--host',
    LOCAL_SOCKET,
    '--port',
    LOCAL_PORT,
    database,
  ]);
}

function dropDatabase(database) {
  assertDisposableDatabaseName(database);
  maintenanceQuery(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${sqlLiteral(database)} AND pid <> pg_backend_pid()`,
  );
  run(postgresBin('dropdb'), [
    '--maintenance-db=postgres',
    '--if-exists',
    '--host',
    LOCAL_SOCKET,
    '--port',
    LOCAL_PORT,
    database,
  ]);
}

function installPrerequisites(database) {
  psql(database, [
    '-c',
    `
      CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin;
      CREATE TABLE business_v2.parties (
        id bigserial PRIMARY KEY
      );
      ALTER TABLE business_v2.parties OWNER TO nanoclaw_admin;
      ALTER SEQUENCE business_v2.parties_id_seq OWNER TO nanoclaw_admin;
      REVOKE ALL ON business_v2.parties FROM PUBLIC;
      REVOKE ALL ON SEQUENCE business_v2.parties_id_seq FROM PUBLIC;
      CREATE FUNCTION business_v2.fn_company_work_append_only()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'append-only fixture relation';
      END;
      $$;
      ALTER FUNCTION business_v2.fn_company_work_append_only() OWNER TO nanoclaw_admin;
      REVOKE ALL ON FUNCTION business_v2.fn_company_work_append_only() FROM PUBLIC;
    `,
  ]);
}

function applyMigration(database) {
  psql(database, ['-f', MIGRATION]);
}

function applyRollback(database, expectFailure = false) {
  return psql(database, ['-f', ROLLBACK], {
    expectFailure,
    expectedMessage: expectFailure
      ? /rollback refused: student enrollment evidence exists/i
      : undefined,
  });
}

function verifyInstalledShape(database) {
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='r'
         AND c.relname LIKE 'student_%'`,
    '13',
    'student table count',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='v'
         AND c.relname='v_student_enrollment_dark_health'`,
    '1',
    'health view count',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles r ON r.oid=c.relowner
       WHERE n.nspname='business_v2'
         AND (c.relname LIKE 'student_%' OR c.relname='v_student_enrollment_dark_health')
         AND r.rolname <> 'nanoclaw_admin'`,
    '0',
    'non-admin object owners',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM information_schema.role_table_grants
       WHERE table_schema='business_v2'
         AND (table_name LIKE 'student_%' OR table_name='v_student_enrollment_dark_health')
         AND grantee <> 'nanoclaw_admin'`,
    '0',
    'non-admin table grants',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='S'
         AND c.relname LIKE 'student_%_id_seq'`,
    '13',
    'student sequence count',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles r ON r.oid=c.relowner
       WHERE n.nspname='business_v2' AND c.relkind='S'
         AND c.relname LIKE 'student_%_id_seq'
         AND r.rolname <> 'nanoclaw_admin'`,
    '0',
    'non-admin sequence owners',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM information_schema.role_usage_grants
       WHERE object_schema='business_v2' AND object_type='SEQUENCE'
         AND object_name LIKE 'student_%_id_seq'
         AND grantee <> 'nanoclaw_admin'`,
    '0',
    'non-admin sequence grants',
  );
  expectScalar(
    database,
    `SELECT order_count||'|'||seat_count||'|'||enrollment_count||'|'||pending_projection_count||'|'||open_exception_count
       FROM business_v2.v_student_enrollment_dark_health`,
    '0|0|0|0|0',
    'empty health counts',
  );
}

function insertSyntheticChain(database) {
  psql(database, [
    '-c',
    `
      DO $$
      DECLARE
        party_id bigint;
        order_id bigint;
        source_ref_id bigint;
        seat_id bigint;
        agreement_id bigint;
        enrollment_id bigint;
        entitlement_id bigint;
        projection_id bigint;
      BEGIN
        INSERT INTO business_v2.parties DEFAULT VALUES RETURNING id INTO party_id;
        INSERT INTO business_v2.student_enrollment_orders
          (order_key,source_channel,offer_key,bundle_key,bundle_version,
           payer_party_id,seat_count,financial_classification,state,version,
           policy_revision,evidence_sha256,created_at,updated_at,updated_by)
        VALUES
          ('order:fixture','website_stripe_checkout','acc-full','acc-full:v1',1,
           party_id,1,'settled','materialized',1,1,repeat('a',64),
           '2026-09-05T20:00:00Z','2026-09-05T20:00:00Z','fixture')
        RETURNING id INTO order_id;
        INSERT INTO business_v2.student_enrollment_order_source_refs
          (order_id,source_scope,source_object_type,source_object_id,
           idempotency_key,evidence_sha256,observed_at,recorded_at,recorded_by)
        VALUES
          (order_id,'stripe:tandem','payment_intent','pi_fixture','fixture:source',
           repeat('a',64),'2026-09-05T20:00:00Z','2026-09-05T20:00:00Z','fixture')
        RETURNING id INTO source_ref_id;
        INSERT INTO business_v2.student_enrollment_evidence
          (evidence_key,subject_type,subject_key,evidence_type,
           source_reference_id,evidence_sha256,observed_at,recorded_at,recorded_by)
        VALUES
          ('evidence:fixture','order','order:fixture','source_receipt',source_ref_id,
           repeat('b',64),'2026-09-05T20:00:00Z','2026-09-05T20:00:00Z','fixture');
        INSERT INTO business_v2.student_enrollment_seats
          (seat_key,order_id,seat_number,participant_party_id,
           participant_evidence_sha256,payer_relationship,state,version,
           created_at,updated_at,updated_by)
        VALUES
          ('seat:fixture:1',order_id,1,party_id,repeat('b',64),
           'self_purchase_explicit','materialized',1,
           '2026-09-05T20:00:00Z','2026-09-05T20:00:00Z','fixture')
        RETURNING id INTO seat_id;
        INSERT INTO business_v2.student_financial_agreements
          (agreement_key,order_id,agreement_type,state,source_reference_id,
           version,evidence_sha256,created_at,updated_at,updated_by)
        VALUES
          ('agreement:fixture',order_id,'paid_in_full','complete',source_ref_id,
           0,repeat('c',64),'2026-09-05T20:00:00Z',
           '2026-09-05T20:00:00Z','fixture')
        RETURNING id INTO agreement_id;
        INSERT INTO business_v2.student_financial_obligations
          (obligation_key,agreement_id,sequence_number,amount_minor,currency,
           state,version,evidence_sha256,created_at,updated_at,updated_by)
        VALUES
          ('obligation:fixture:1',agreement_id,1,399900,'USD','paid',0,
           repeat('c',64),'2026-09-05T20:00:00Z',
           '2026-09-05T20:00:00Z','fixture');
        INSERT INTO business_v2.student_enrollments_v2
          (enrollment_key,order_id,seat_id,participant_party_id,offer_key,
           bundle_key,bundle_version,catalog_revision,state,version,
           materialization_sha256,created_at,updated_at,updated_by)
        VALUES
          ('enrollment:fixture:1',order_id,seat_id,party_id,'acc-full',
           'acc-full:v1',1,1,'active',0,repeat('d',64),
           '2026-09-05T20:00:00Z','2026-09-05T20:00:00Z','fixture')
        RETURNING id INTO enrollment_id;
        INSERT INTO business_v2.student_component_entitlements
          (entitlement_key,enrollment_id,component_key,grant_episode,state,
           version,evidence_sha256,created_at,updated_at,updated_by)
        VALUES
          ('entitlement:fixture:m1',enrollment_id,'acc.module-1',1,'included',0,
           repeat('d',64),'2026-09-05T20:00:00Z',
           '2026-09-05T20:00:00Z','fixture')
        RETURNING id INTO entitlement_id;
        INSERT INTO business_v2.student_class_assignments
          (assignment_key,enrollment_id,entitlement_id,delivery_block_key,state,
           version,schedule_evidence_sha256,starts_at,ends_at,
           created_at,updated_at,updated_by)
        VALUES
          ('assignment:fixture:m1',enrollment_id,entitlement_id,
           'class:fixture:m1','active',0,repeat('e',64),
           '2026-09-07T15:00:00Z','2026-09-28T17:00:00Z',
           '2026-09-05T20:00:00Z','2026-09-05T20:00:00Z','fixture');
        INSERT INTO business_v2.student_projection_outbox
          (projection_key,target,subject_type,subject_key,subject_version,state,
           attempt_count,payload_sha256,expected_readback_sha256,payload_json,
           created_at,updated_at)
        VALUES
          ('projection:fixture:roster','student_roster','enrollment',
           'enrollment:fixture:1',0,'queued',0,repeat('f',64),repeat('1',64),
           '{"fixture":true}'::jsonb,'2026-09-05T20:00:00Z',
           '2026-09-05T20:00:00Z')
        RETURNING id INTO projection_id;
        INSERT INTO business_v2.student_projection_receipts
          (receipt_key,outbox_id,subject_version,stage,outcome,result_code,
           evidence_sha256,actor,occurred_at,recorded_at)
        VALUES
          ('receipt:fixture:requested',projection_id,0,'requested','held',
           'awaiting_readback',repeat('1',64),'fixture',
           '2026-09-05T20:00:00Z','2026-09-05T20:00:00Z');
        INSERT INTO business_v2.student_enrollment_exceptions_v2
          (exception_key,subject_type,subject_key,reason_code,state,severity,
           owner_role,version,occurrence_count,evidence_sha256,first_seen_at,
           last_seen_at,review_at,updated_by)
        VALUES
          ('exception:fixture','projection','projection:fixture:roster',
           'readback_pending','open','medium','projection_worker',0,1,
           repeat('2',64),'2026-09-05T20:00:00Z',
           '2026-09-05T20:00:00Z','2026-09-06T20:00:00Z','fixture');
        INSERT INTO business_v2.student_enrollment_history
          (subject_type,subject_key,previous_version,new_version,command_key,
           reason_code,evidence_sha256,actor,occurred_at,recorded_at)
        VALUES
          ('assignment','assignment:fixture:m1',NULL,0,'assign_class',
           'schedule_evidenced',repeat('e',64),'fixture',
           '2026-09-05T20:00:00Z','2026-09-05T20:00:00Z');
      END $$;
    `,
  ]);
}

function verifySyntheticConstraints(database) {
  expectScalar(
    database,
    `SELECT order_count||'|'||seat_count||'|'||enrollment_count||'|'||pending_projection_count||'|'||open_exception_count
       FROM business_v2.v_student_enrollment_dark_health`,
    '1|1|1|1|1',
    'populated health counts',
  );
  psql(
    database,
    [
      '-c',
      `INSERT INTO business_v2.student_enrollment_seats
         (seat_key,order_id,seat_number,payer_relationship,state,version,
          created_at,updated_at,updated_by)
       SELECT 'seat:invalid',id,2,'unknown','assigned',0,now(),now(),'fixture'
         FROM business_v2.student_enrollment_orders WHERE order_key='order:fixture'`,
    ],
    {
      expectFailure: true,
      expectedMessage:
        /new row for relation "student_enrollment_seats" violates check constraint/i,
    },
  );
  psql(
    database,
    [
      '-c',
      `INSERT INTO business_v2.student_enrollment_order_source_refs
         (order_id,source_scope,source_object_type,source_object_id,
          idempotency_key,evidence_sha256,observed_at,recorded_at,recorded_by)
       SELECT id,'stripe:tandem','payment_intent','pi_fixture','fixture:duplicate',
              repeat('a',64),now(),now(),'fixture'
         FROM business_v2.student_enrollment_orders WHERE order_key='order:fixture'`,
    ],
    {
      expectFailure: true,
      expectedMessage:
        /Key \(source_scope, source_object_type, source_object_id\)=/i,
    },
  );
  psql(
    database,
    [
      '-c',
      `UPDATE business_v2.student_enrollment_order_source_refs
          SET recorded_by='changed'
        WHERE source_object_id='pi_fixture'`,
    ],
    {
      expectFailure: true,
      expectedMessage: /append-only fixture relation/i,
    },
  );
}

function truncateSyntheticRows(database) {
  psql(database, [
    '-c',
    `TRUNCATE
       business_v2.student_enrollment_history,
       business_v2.student_enrollment_exceptions_v2,
       business_v2.student_projection_receipts,
       business_v2.student_projection_outbox,
       business_v2.student_class_assignments,
       business_v2.student_component_entitlements,
       business_v2.student_enrollments_v2,
       business_v2.student_financial_obligations,
       business_v2.student_financial_agreements,
       business_v2.student_enrollment_seats,
       business_v2.student_enrollment_evidence,
       business_v2.student_enrollment_order_source_refs,
       business_v2.student_enrollment_orders,
       business_v2.parties
     RESTART IDENTITY CASCADE`,
  ]);
}

function verifyUninstalled(database) {
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2'
         AND (c.relname LIKE 'student_%' OR c.relname='v_student_enrollment_dark_health')`,
    '0',
    'migration residue count',
  );
}

export function runStudentEnrollmentDisposableProof({ database }) {
  assertDisposableDatabaseName(database);
  if (!fs.existsSync(MIGRATION) || !fs.existsSync(ROLLBACK))
    throw new Error('migration 142 source or rollback is missing');
  const adminRole = maintenanceQuery(
    "SELECT count(*) FROM pg_roles WHERE rolname='nanoclaw_admin'",
  );
  if (adminRole !== '1')
    throw new Error('required existing nanoclaw_admin role is unavailable');
  const localTarget = maintenanceQuery(
    "SELECT CASE WHEN inet_server_addr() IS NULL THEN 'local' ELSE 'remote' END",
  );
  if (localTarget !== 'local')
    throw new Error('refusing non-local PostgreSQL server');

  let created = false;
  try {
    createDatabase(database);
    created = true;
    installPrerequisites(database);
    applyMigration(database);
    verifyInstalledShape(database);
    insertSyntheticChain(database);
    verifySyntheticConstraints(database);
    applyRollback(database, true);
    expectScalar(
      database,
      "SELECT count(*) FROM business_v2.student_enrollment_orders",
      '1',
      'populated rollback data preservation',
    );
    truncateSyntheticRows(database);
    applyRollback(database);
    verifyUninstalled(database);
    applyMigration(database);
    verifyInstalledShape(database);
    applyRollback(database);
    verifyUninstalled(database);
    return {
      ok: true,
      serverVersion: maintenanceQuery("SHOW server_version"),
      tables: 13,
      views: 1,
      syntheticChains: 1,
      expectedConstraintRefusals: 3,
      populatedRollbackRefused: true,
      emptyRollbackPassed: true,
      reapplyPassed: true,
      databaseRemoved: true,
    };
  } finally {
    if (created) dropDatabase(database);
  }
}

function main() {
  const database = parseDatabaseArgument(process.argv.slice(2));
  const result = runStudentEnrollmentDisposableProof({ database });
  if (databaseExists(database))
    throw new Error('disposable database residue detected after cleanup');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
