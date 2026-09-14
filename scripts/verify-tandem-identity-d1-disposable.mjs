#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DISPOSABLE_PREFIX = 'nc_tandem_identity_d1_';
const SAFE_NAME = /^nc_tandem_identity_d1_[a-z0-9_]{8,80}$/;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const MIGRATION = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql',
);
const ROLLBACK = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/rollback_167_tandem_identity_control_plane.sql',
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
  const detail = `${result.stderr || ''}\n${result.stdout || ''}`;
  if (options.expectFailure === true) {
    if (result.status === 0)
      throw new Error(`expected command failure: ${path.basename(binary)}`);
    if (!(options.expectedMessage instanceof RegExp))
      throw new Error('expected failures require an expectedMessage regex');
    if (!options.expectedMessage.test(detail))
      throw new Error(
        `command failed for an unexpected reason: ${detail.trim().slice(-3000)}`,
      );
    return result;
  }
  if (result.status !== 0)
    throw new Error(
      `${path.basename(binary)} failed with status ${result.status}: ${detail.trim().slice(-3000)}`,
    );
  return result;
}

function runAsync(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: ROOT,
      env: childEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (status) => {
      if (status !== 0) {
        reject(
          new Error(
            `${path.basename(binary)} async failed with status ${status}: ${`${stderr}\n${stdout}`.trim().slice(-3000)}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
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

export function generatedDisposableDatabaseName(suffix = '') {
  const marker = randomUUID().replaceAll('-', '').slice(0, 16);
  return assertDisposableDatabaseName(
    `${DISPOSABLE_PREFIX}${process.pid}_${marker}${suffix}`,
  );
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function maintenanceQuery(sql) {
  return run(postgresBin('psql'), [
    '-X',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '--host',
    LOCAL_SOCKET,
    '--port',
    LOCAL_PORT,
    '-d',
    'postgres',
    '-Atq',
    '-c',
    sql,
  ]).stdout.trim();
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

function scalar(database, sql) {
  return psql(database, ['-Atq', '-c', sql]).stdout.trim();
}

function expectScalar(database, sql, expected, label) {
  const actual = scalar(database, sql);
  if (actual !== expected)
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

export function databaseExists(database) {
  return maintenanceQuery(
    `SELECT count(*) FROM pg_database WHERE datname=${sqlLiteral(database)}`,
  ) !== '0';
}

function createDatabase(database) {
  if (databaseExists(database)) throw new Error('refusing existing database target');
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
        id bigserial PRIMARY KEY,
        merged_into bigint REFERENCES business_v2.parties(id)
      );
      CREATE TABLE business_v2.party_external_refs (
        id bigserial PRIMARY KEY,
        party_id bigint NOT NULL REFERENCES business_v2.parties(id),
        provider text NOT NULL,
        source_scope text NOT NULL,
        entity_type text NOT NULL,
        external_id text NOT NULL,
        UNIQUE (provider, source_scope, entity_type, external_id)
      );
      CREATE TABLE business_v2.party_context_adapter_registrations (
        id bigserial PRIMARY KEY,
        adapter_key text NOT NULL,
        adapter_version text NOT NULL,
        source_system text NOT NULL,
        source_scope text NOT NULL,
        conformance_status text NOT NULL DEFAULT 'pending',
        UNIQUE (adapter_key, adapter_version, source_scope),
        UNIQUE (source_system, source_scope)
      );
      ALTER TABLE business_v2.parties OWNER TO nanoclaw_admin;
      ALTER TABLE business_v2.party_external_refs OWNER TO nanoclaw_admin;
      ALTER TABLE business_v2.party_context_adapter_registrations OWNER TO nanoclaw_admin;
      ALTER SEQUENCE business_v2.parties_id_seq OWNER TO nanoclaw_admin;
      ALTER SEQUENCE business_v2.party_external_refs_id_seq OWNER TO nanoclaw_admin;
      ALTER SEQUENCE business_v2.party_context_adapter_registrations_id_seq OWNER TO nanoclaw_admin;
      REVOKE ALL ON SCHEMA business_v2 FROM PUBLIC;
      REVOKE ALL ON ALL TABLES IN SCHEMA business_v2 FROM PUBLIC;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA business_v2 FROM PUBLIC;
    `,
  ]);
}

function applyMigration(database, options = {}) {
  return psql(database, ['-f', MIGRATION], options);
}

function applyRollback(database, expectFailure = false) {
  return psql(database, ['-f', ROLLBACK], {
    expectFailure,
    expectedMessage: expectFailure
      ? /rollback 167 refused: tandem identity evidence exists/i
      : undefined,
  });
}

function expectFailure(database, sql, expectedMessage) {
  psql(database, ['-c', sql], { expectFailure: true, expectedMessage });
}

function verifyInstalledShape(database) {
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='r'
         AND (c.relname LIKE 'identity_%' OR c.relname='auth_accounts'
           OR c.relname LIKE 'provider_%')`,
    '12',
    'D1 table count',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='v'
         AND c.relname='v_tandem_identity_shadow_health'`,
    '1',
    'D1 view count',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM information_schema.columns
       WHERE table_schema='business_v2' AND table_name='party_external_refs'
         AND column_name='environment'`,
    '1',
    'scoped reference environment column',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles r ON r.oid=c.relowner
       WHERE n.nspname='business_v2'
         AND (c.relname LIKE 'identity_%' OR c.relname='auth_accounts'
           OR c.relname LIKE 'provider_%' OR c.relname='v_tandem_identity_shadow_health')
         AND r.rolname <> 'nanoclaw_admin'`,
    '0',
    'non-admin D1 owners',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM information_schema.role_table_grants
       WHERE table_schema='business_v2'
         AND (table_name LIKE 'identity_%' OR table_name='auth_accounts'
           OR table_name LIKE 'provider_%' OR table_name='v_tandem_identity_shadow_health')
         AND grantee <> 'nanoclaw_admin'`,
    '0',
    'non-admin D1 grants',
  );
  expectScalar(
    database,
    `SELECT receipt_count||'|'||candidate_count||'|'||decision_count||'|'||
            desired_projection_count||'|'||blocked_command_count||'|'||
            provider_attempt_count||'|'||fresh_complete_run_count||'|'||open_drift_count
       FROM business_v2.v_tandem_identity_shadow_health`,
    '0|0|0|0|0|0|0|0',
    'empty D1 health',
  );
}

function insertSyntheticChain(database) {
  psql(database, [
    '-c',
    `
      DO $$
      DECLARE
        manifest_id bigint;
        party_id bigint;
        receipt_id bigint;
        candidate_id bigint;
        projection_key text;
        projection_id bigint;
        command_id bigint;
        run_id bigint;
        snapshot_hash text;
        replay_receipt_id bigint;
        replay_inserted boolean;
      BEGIN
        INSERT INTO business_v2.party_context_adapter_registrations
          (adapter_key, adapter_version, source_system, source_scope,
           conformance_status, environment, accepted_at,
           identity_entity_types, identity_event_types)
        VALUES
          ('heartbeat.identity', '1.0.0', 'heartbeat', 'workspace:fixture',
           'passed', 'production', '2026-09-14T00:00:00Z',
           ARRAY['user','membership'], ARRAY['user.updated'])
        RETURNING id INTO manifest_id;

        INSERT INTO business_v2.parties DEFAULT VALUES RETURNING id INTO party_id;

        INSERT INTO business_v2.party_external_refs
          (party_id, provider, environment, source_scope, entity_type, external_id)
        VALUES
          (party_id, 'heartbeat', 'production', 'workspace:fixture', 'user', 'hb_fixture');

        SELECT stored_receipt_id, inserted
          INTO receipt_id, replay_inserted
          FROM business_v2.fn_tandem_identity_store_event_receipt(
            manifest_id, 'heartbeat', 'production', 'workspace:fixture',
            'user', 'hb_fixture', 'user.updated', 'evt_fixture',
            'event:fixture', repeat('a',64), NULL, 'authenticated',
            'webhook_hmac', 'normalized', 1, NULL,
            '2026-09-14T00:01:00Z', '2026-09-14T00:02:00Z',
            repeat('b',64), 1
          );
        IF NOT replay_inserted THEN
          RAISE EXCEPTION 'fixture first receipt was not inserted';
        END IF;
        SELECT stored_receipt_id, inserted
          INTO replay_receipt_id, replay_inserted
          FROM business_v2.fn_tandem_identity_store_event_receipt(
            manifest_id, 'heartbeat', 'production', 'workspace:fixture',
            'user', 'hb_fixture', 'user.updated', 'evt_fixture',
            'event:fixture', repeat('a',64), NULL, 'authenticated',
            'webhook_hmac', 'normalized', 1, NULL,
            '2026-09-14T00:01:00Z', '2026-09-14T00:02:00Z',
            repeat('b',64), 1
          );
        IF replay_inserted OR replay_receipt_id <> receipt_id THEN
          RAISE EXCEPTION 'fixture receipt replay was not an exact no-op';
        END IF;

        INSERT INTO business_v2.identity_event_related_refs
          (receipt_id, ref_index, provider, environment, source_scope,
           entity_type, external_id)
        VALUES
          (receipt_id, 0, 'heartbeat', 'legacy', 'workspace:fixture',
           'group', 'group_fixture');

        INSERT INTO business_v2.identity_candidates
          (subject_sha256, provider, environment, source_scope, entity_type,
           external_id_sha256, candidate_version, status, creation_basis,
           party_materialization_allowed, evidence_sha256, first_seen_at,
           last_observed_at, retention_policy_version)
        VALUES
          (repeat('c',64), 'heartbeat', 'production', 'workspace:fixture',
           'user', repeat('d',64), 1, 'open', 'none', false, repeat('e',64),
           '2026-09-14T00:01:00Z', '2026-09-14T00:02:00Z', 1)
        RETURNING id INTO candidate_id;

        INSERT INTO business_v2.identity_resolution_decisions
          (provider, environment, source_scope, entity_type,
           external_id_sha256, result, candidate_id, evidence_refs,
           evidence_sha256, reason_code, decided_at, retention_policy_version)
        VALUES
          ('heartbeat', 'production', 'workspace:fixture', 'user', repeat('d',64),
           'staged_candidate', candidate_id, '["receipt:fixture"]'::jsonb,
           business_v2.fn_tandem_identity_sha256('["receipt:fixture"]'::jsonb::text),
           'CANDIDATE_ONLY', '2026-09-14T00:03:00Z', 1);

        INSERT INTO business_v2.auth_accounts
          (issuer, environment, source_scope, subject, account_version,
           party_id, account_state, binding_basis, source_receipt_id,
           last_observed_at, last_verified_at, valid_from,
           retention_policy_version)
        VALUES
          ('https://securetoken.google.com/tandem-fixture', 'production',
           'project:tandem-fixture', 'uid_fixture', 1, party_id, 'accepted',
           'auth_subject', receipt_id, '2026-09-14T00:03:00Z',
           '2026-09-14T00:03:00Z', '2026-09-14T00:03:00Z', 1);

        projection_key := business_v2.fn_tandem_identity_sha256(
          concat_ws(E'\\x1f', 'heartbeat', 'production', 'workspace:fixture',
            'membership', 'membership_fixture', 'group_access')
        );
        INSERT INTO business_v2.provider_desired_projections
          (provider, environment, source_scope, entity_type, external_id,
           managed_object_key, projection_key, desired_version, managed_fields,
           projection_sha256, source_authority_versions, last_observed_at,
           retention_policy_version)
        VALUES
          ('heartbeat', 'production', 'workspace:fixture', 'membership',
           'membership_fixture', 'group_access', projection_key, 1,
           '{"membership":"present"}'::jsonb,
           business_v2.fn_tandem_identity_sha256('{"membership":"present"}'::jsonb::text),
           '{"entitlement":1}'::jsonb, '2026-09-14T00:04:00Z', 1)
        RETURNING id INTO projection_id;

        INSERT INTO business_v2.provider_projection_commands
          (provider, environment, source_scope, projection_key, desired_version,
           idempotency_key, status, writes_enabled, attempt_count,
           provider_operation_id, next_attempt_at, reason_code,
           last_observed_at, retention_policy_version)
        VALUES
          ('heartbeat', 'production', 'workspace:fixture', projection_key, 1,
           business_v2.fn_tandem_identity_sha256(
             concat_ws(E'\\x1f', 'heartbeat', 'production', 'workspace:fixture',
               projection_key, '1', 'stage-d-shadow-v1')
           ), 'simulated', false, 0, NULL, NULL, 'SHADOW_ONLY',
           '2026-09-14T00:04:00Z', 1)
        RETURNING id INTO command_id;

        INSERT INTO business_v2.provider_projection_readbacks
          (command_id, result, managed_fields_sha256, evidence_sha256, observed_at)
        VALUES
          (command_id, 'simulated_match', repeat('f',64), repeat('1',64),
           '2026-09-14T00:05:00Z');

        INSERT INTO business_v2.provider_reconciliation_runs
          (adapter_registration_id, provider, environment, source_scope,
           entity_set, run_mode, started_at, last_observed_at,
           retention_policy_version)
        VALUES
          (manifest_id, 'heartbeat', 'production', 'workspace:fixture',
           'memberships', 'full', '2026-09-14T00:00:00Z',
           '2026-09-14T00:05:00Z', 1)
        RETURNING id INTO run_id;

        INSERT INTO business_v2.provider_snapshot_items
          (run_id, provider, environment, source_scope, entity_type,
           external_id, fact_type, source_version, fact_sha256, item_state,
           observed_at)
        VALUES
          (run_id, 'heartbeat', 'production', 'workspace:fixture', 'membership',
           'membership_fixture', 'membership.present@1', '1', repeat('2',64),
           'normalized', '2026-09-14T00:05:00Z');

        snapshot_hash := business_v2.fn_tandem_identity_finalize_reconciliation_run(
          run_id, 'cursor:fixture', '2026-09-14T00:06:00Z',
          '2026-09-15T00:06:00Z'
        );
        IF snapshot_hash IS NULL THEN
          RAISE EXCEPTION 'fixture snapshot hash missing';
        END IF;

        INSERT INTO business_v2.provider_drift_items
          (provider, environment, source_scope, entity_type, external_id_sha256,
           drift_class, severity, absence_based, reconciliation_run_id,
           decision_at, repair_eligibility, owner_group, status,
           evidence_sha256, last_observed_at, retention_policy_version)
        VALUES
          ('heartbeat', 'production', 'workspace:fixture', 'membership',
           repeat('3',64), 'missing_managed_state', 'medium', true, run_id,
           '2026-09-14T00:07:00Z', 'simulated', 'chief', 'verified_absent',
           repeat('4',64), '2026-09-14T00:07:00Z', 1);
      END $$;
    `,
  ]);
}

function verifySyntheticState(database) {
  expectScalar(
    database,
    `SELECT receipt_count||'|'||candidate_count||'|'||decision_count||'|'||
            desired_projection_count||'|'||blocked_command_count||'|'||
            provider_attempt_count||'|'||fresh_complete_run_count||'|'||open_drift_count
       FROM business_v2.v_tandem_identity_shadow_health`,
    '1|1|1|1|0|0|1|0',
    'populated D1 health',
  );
  expectScalar(
    database,
    `SELECT status||'|'||complete||'|'||observed_count||'|'||normalized_count||'|'||held_count
       FROM business_v2.provider_reconciliation_runs`,
    'complete|true|1|1|0',
    'complete snapshot readback',
  );
}

function verifyConstraintRefusals(database) {
  const hash = "repeat('9',64)";
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_event_related_refs
       (receipt_id,ref_index,provider,environment,source_scope,entity_type,external_id)
     VALUES (1,1,'heartbeat','test','workspace:fixture','group','bad')`,
    /related reference environment class collision at index 1/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_candidates
       (subject_sha256,provider,environment,source_scope,entity_type,
        external_id_sha256,candidate_version,status,creation_basis,party_materialization_allowed,
        evidence_sha256,first_seen_at,last_observed_at,retention_policy_version)
     VALUES (${hash},'heartbeat','production','workspace:fixture','user',${hash},1,
       'open','none',true,${hash},now(),now(),1)`,
    /identity_candidates_materialization_chk/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_candidates
       (subject_sha256,provider,environment,source_scope,entity_type,
        external_id_sha256,candidate_version,status,creation_basis,party_materialization_allowed,
        evidence_sha256,first_seen_at,last_observed_at,retention_policy_version)
     VALUES (${hash},'heartbeat','production','workspace:other','user',${hash},1,
       'open','email_match',true,${hash},now(),now(),1)`,
    /identity_candidates_creation_basis_check/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_candidates
       (subject_sha256,provider,environment,source_scope,entity_type,
        external_id_sha256,candidate_version,status,creation_basis,
        party_materialization_allowed,evidence_sha256,first_seen_at,
        last_observed_at,retention_policy_version)
     VALUES (${hash},'heartbeat','production','workspace:version-gap','user',
       repeat('8',64),2,'open','none',false,${hash},now(),now(),1)`,
    /candidate must begin open at version 1/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_event_receipts
       (adapter_registration_id,provider,environment,source_scope,entity_type,
        external_id,event_type,deduplication_key,payload_sha256,authenticity_status,
        verification_method,normalization_status,schema_version,received_at,
        relay_identity_sha256,retention_policy_version)
     VALUES (1,'heartbeat','test','workspace:fixture','user','x','user.updated',
       'bad-manifest',${hash},'authenticated','webhook_hmac','normalized',1,now(),${hash},1)`,
    /manifest mismatch or not effective/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_event_receipts
       (adapter_registration_id,provider,environment,source_scope,entity_type,
        external_id,event_type,deduplication_key,payload_sha256,authenticity_status,
        verification_method,normalization_status,schema_version,received_at,
        relay_identity_sha256,retention_policy_version)
     VALUES (1,'heartbeat','production','workspace:fixture','user','x','user.updated',
       'event:fixture',${hash},'authenticated','webhook_hmac','normalized',1,
       '2026-09-14T00:03:00Z',${hash},1)`,
    /deduplication hash conflict/i,
  );
  expectFailure(
    database,
    `UPDATE business_v2.identity_event_receipts SET event_type='user.deleted' WHERE id=1`,
    /tandem identity evidence is append-only/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_resolution_decisions
       (provider,environment,source_scope,entity_type,external_id_sha256,result,
        candidate_id,evidence_refs,evidence_sha256,reason_code,decided_at,
        retention_policy_version)
     VALUES ('heartbeat','production','workspace:fixture','user',${hash},
       'staged_candidate',1,'["receipt:bad"]'::jsonb,${hash},'BAD_HASH',now(),1)`,
    /resolution evidence hash mismatch/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.auth_accounts
       (issuer,environment,source_scope,subject,account_version,account_state,
        binding_basis,source_receipt_id,last_observed_at,valid_from,
        retention_policy_version)
     VALUES ('https://securetoken.google.com/tandem-fixture','production',
       'project:tandem-fixture','uid_fixture',3,'observed','none',1,now(),now(),1)`,
    /auth account version is not monotonic/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_resolution_decisions
       (provider,environment,source_scope,entity_type,external_id_sha256,result,
        candidate_id,evidence_refs,evidence_sha256,reason_code,decided_at,
        retention_policy_version)
     VALUES ('heartbeat','production','workspace:fixture','user',${hash},
       'conflict',1,'["receipt:fixture"]'::jsonb,
       business_v2.fn_tandem_identity_sha256('["receipt:fixture"]'::jsonb::text),
       'DANGLING_CANDIDATE',now(),1)`,
    /identity_resolution_target_chk/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.identity_resolution_decisions
       (provider,environment,source_scope,entity_type,external_id_sha256,result,
        resolution_basis,party_id,evidence_refs,evidence_sha256,reason_code,
        decided_at,retention_policy_version)
     VALUES ('heartbeat','production','workspace:fixture','user',${hash},
       'resolved_exact_reference','accepted_auth_subject',1,
       '["receipt:fixture"]'::jsonb,
       business_v2.fn_tandem_identity_sha256('["receipt:fixture"]'::jsonb::text),
       'BAD_BASIS',now(),1)`,
    /identity_resolution_basis_chk/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_desired_projections
       (provider,environment,source_scope,entity_type,external_id,managed_object_key,
        projection_key,desired_version,managed_fields,projection_sha256,
        source_authority_versions,last_observed_at,retention_policy_version)
     VALUES ('heartbeat','production','workspace:fixture','membership','x','group_access',
       ${hash},1,'{}'::jsonb,business_v2.fn_tandem_identity_sha256('{}'::jsonb::text),
       '{}'::jsonb,now(),1)`,
    /projection key mismatch/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_projection_commands
       (provider,environment,source_scope,projection_key,desired_version,
        idempotency_key,status,writes_enabled,attempt_count,reason_code,
        last_observed_at,retention_policy_version)
     SELECT provider,environment,source_scope,projection_key,desired_version,
       idempotency_key,'simulated',true,0,'BAD_WRITE',now(),1
     FROM business_v2.provider_projection_commands WHERE id=1`,
    /provider_projection_commands_writes_enabled_check/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_projection_commands
       (provider,environment,source_scope,projection_key,desired_version,
        idempotency_key,status,reason_code,last_observed_at,retention_policy_version)
     SELECT provider,environment,source_scope,projection_key,desired_version,
       ${hash},'simulated','BAD_KEY',now(),1
     FROM business_v2.provider_projection_commands WHERE id=1`,
    /command idempotency key mismatch/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_projection_attempts
       (command_id,attempt_number,outcome) VALUES (1,1,'accepted')`,
    /shadow provider attempts are prohibited/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_snapshot_items
       (run_id,provider,environment,source_scope,entity_type,external_id,
        fact_type,source_version,fact_sha256,item_state,observed_at)
     VALUES (1,'heartbeat','production','workspace:fixture','membership',
       'late','membership.present@1','1',${hash},'normalized',now())`,
    /snapshot run is not open/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_drift_items
       (provider,environment,source_scope,entity_type,external_id_sha256,
        drift_class,severity,absence_based,reconciliation_run_id,decision_at,
        repair_eligibility,owner_group,status,evidence_sha256,last_observed_at,
        retention_policy_version)
     VALUES ('heartbeat','production','workspace:fixture','membership',${hash},
       'missing_managed_state','high',true,1,'2026-09-16T00:00:00Z',
       'blocked','chief','held',${hash},now(),1)`,
    /absence requires matching complete fresh snapshot/i,
  );
  expectFailure(
    database,
    `INSERT INTO business_v2.party_external_refs
       (party_id,provider,environment,source_scope,entity_type,external_id)
     SELECT id,'heartbeat','production','workspace:fixture','user','hb_fixture'
       FROM business_v2.parties LIMIT 1`,
    /duplicate key value violates unique constraint/i,
  );
  expectFailure(
    database,
    `BEGIN;
       INSERT INTO business_v2.identity_candidates
         (subject_sha256,provider,environment,source_scope,entity_type,
          external_id_sha256,candidate_version,status,creation_basis,party_materialization_allowed,
          evidence_sha256,first_seen_at,last_observed_at,retention_policy_version)
       VALUES (repeat('8',64),'heartbeat','production','workspace:tx','user',
         repeat('7',64),1,'open','none',false,repeat('6',64),now(),now(),1);
       INSERT INTO business_v2.provider_projection_attempts
         (command_id,attempt_number,outcome) VALUES (1,2,'accepted');
     COMMIT;`,
    /shadow provider attempts are prohibited/i,
  );
  expectScalar(
    database,
    `SELECT count(*) FROM business_v2.identity_candidates WHERE source_scope='workspace:tx'`,
    '0',
    'failed transaction rollback',
  );
}

function verifyMigrationFailureRollback(database) {
  installPrerequisites(database);
  psql(database, ['-c', 'CREATE VIEW business_v2.identity_event_receipts AS SELECT 1 AS id']);
  applyMigration(database, {
    expectFailure: true,
    expectedMessage:
      /cannot create index on relation "identity_event_receipts"[\s\S]*not supported for views/i,
  });
  expectScalar(
    database,
    `SELECT count(*) FROM information_schema.columns
       WHERE table_schema='business_v2' AND table_name='party_external_refs'
         AND column_name='environment'`,
    '0',
    'failed migration rolled back prior ALTER TABLE',
  );
}

async function verifySnapshotFinalizeRace(database) {
  const runId = scalar(
    database,
    `INSERT INTO business_v2.provider_reconciliation_runs
       (adapter_registration_id,provider,environment,source_scope,entity_set,
        run_mode,started_at,last_observed_at,retention_policy_version)
     VALUES (1,'heartbeat','production','workspace:fixture','race-proof','full',
       '2026-09-14T01:00:00Z','2026-09-14T01:00:00Z',1)
     RETURNING id`,
  );
  const terminalizer = runAsync(postgresBin('psql'), [
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
    '-c',
    `BEGIN;
     UPDATE business_v2.provider_reconciliation_runs
        SET status='failed',complete=false,final_page_complete=false,
            completed_at=now(),updated_at=now(),last_action_at=now()
      WHERE id=${runId}
      RETURNING pg_sleep(0.8);
     COMMIT;`,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 150));
  expectFailure(
    database,
    `INSERT INTO business_v2.provider_snapshot_items
       (run_id,provider,environment,source_scope,entity_type,external_id,
        fact_type,source_version,fact_sha256,item_state,observed_at)
     VALUES (${runId},'heartbeat','production','workspace:fixture','membership',
       'race','membership.present@1','1',repeat('5',64),'normalized',now())`,
    /snapshot run is not open/i,
  );
  await terminalizer;
  expectScalar(
    database,
    `SELECT count(*) FROM business_v2.provider_snapshot_items WHERE run_id=${runId}`,
    '0',
    'terminalization race left no late snapshot item',
  );
}

function backupAndRestore(sourceDatabase, restoreDatabase, dumpPath) {
  run(postgresBin('pg_dump'), [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--host',
    LOCAL_SOCKET,
    '--port',
    LOCAL_PORT,
    '--file',
    dumpPath,
    sourceDatabase,
  ]);
  createDatabase(restoreDatabase);
  run(postgresBin('pg_restore'), [
    '--exit-on-error',
    '--no-owner',
    '--no-privileges',
    '--host',
    LOCAL_SOCKET,
    '--port',
    LOCAL_PORT,
    '--dbname',
    restoreDatabase,
    dumpPath,
  ]);
  verifySyntheticState(restoreDatabase);
  expectFailure(
    restoreDatabase,
    `UPDATE business_v2.identity_event_receipts SET event_type='changed' WHERE id=1`,
    /tandem identity evidence is append-only/i,
  );
}

function truncateD1(database) {
  psql(database, [
    '-c',
    `TRUNCATE
       business_v2.provider_drift_items,
       business_v2.provider_snapshot_items,
       business_v2.provider_reconciliation_runs,
       business_v2.provider_projection_readbacks,
       business_v2.provider_projection_attempts,
       business_v2.provider_projection_commands,
       business_v2.provider_desired_projections,
       business_v2.identity_resolution_decisions,
       business_v2.auth_accounts,
       business_v2.identity_candidates,
       business_v2.identity_event_related_refs,
       business_v2.identity_event_receipts
     RESTART IDENTITY CASCADE;
     TRUNCATE business_v2.party_external_refs,
              business_v2.party_context_adapter_registrations,
              business_v2.parties RESTART IDENTITY CASCADE;`,
  ]);
}

function verifyUninstalled(database) {
  expectScalar(
    database,
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2'
         AND (c.relname LIKE 'identity_%' OR c.relname='auth_accounts'
           OR c.relname LIKE 'provider_%' OR c.relname='v_tandem_identity_shadow_health')`,
    '0',
    'D1 rollback residue count',
  );
  expectScalar(
    database,
    `SELECT count(*) FROM information_schema.columns
       WHERE table_schema='business_v2' AND table_name='party_external_refs'
         AND column_name='environment'`,
    '0',
    'reference environment rollback',
  );
}

export async function runTandemIdentityD1DisposableProof({ database }) {
  assertDisposableDatabaseName(database);
  if (!fs.existsSync(MIGRATION) || !fs.existsSync(ROLLBACK))
    throw new Error('migration 167 source or rollback is missing');
  if (maintenanceQuery("SELECT count(*) FROM pg_roles WHERE rolname='nanoclaw_admin'") !== '1')
    throw new Error('required existing nanoclaw_admin role is unavailable');
  if (maintenanceQuery("SELECT CASE WHEN inet_server_addr() IS NULL THEN 'local' ELSE 'remote' END") !== 'local')
    throw new Error('refusing non-local PostgreSQL server');

  const restoreDatabase = generatedDisposableDatabaseName('_restore');
  const failureDatabase = generatedDisposableDatabaseName('_failure');
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-identity-d1-'));
  const dumpPath = path.join(tempDirectory, 'identity-d1.backup');
  const created = new Set();
  try {
    created.add(failureDatabase);
    createDatabase(failureDatabase);
    verifyMigrationFailureRollback(failureDatabase);
    dropDatabase(failureDatabase);
    created.delete(failureDatabase);

    created.add(database);
    createDatabase(database);
    installPrerequisites(database);
    applyMigration(database);
    verifyInstalledShape(database);
    applyMigration(database);
    verifyInstalledShape(database);

    insertSyntheticChain(database);
    verifySyntheticState(database);
    verifyConstraintRefusals(database);

    created.add(restoreDatabase);
    backupAndRestore(database, restoreDatabase, dumpPath);
    await verifySnapshotFinalizeRace(database);

    applyRollback(database, true);
    expectScalar(
      database,
      'SELECT count(*) FROM business_v2.identity_event_receipts',
      '1',
      'populated rollback data preservation',
    );
    truncateD1(database);
    applyRollback(database);
    verifyUninstalled(database);
    applyMigration(database);
    verifyInstalledShape(database);
    applyRollback(database);
    verifyUninstalled(database);

    return {
      ok: true,
      serverVersion: maintenanceQuery('SHOW server_version'),
      tables: 12,
      views: 1,
      syntheticChains: 1,
      expectedConstraintRefusals: 18,
      migrationFailureRollbackPassed: true,
      directReapplyPassed: true,
      receiptReplayNoOp: true,
      backupRestorePassed: true,
      concurrentFinalizeInsertRefused: true,
      populatedRollbackRefused: true,
      emptyRollbackPassed: true,
      rollbackReapplyPassed: true,
      providerAttempts: 0,
      productionConnections: 0,
      databaseResidue: 0,
    };
  } finally {
    for (const target of created) {
      if (databaseExists(target)) dropDatabase(target);
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function parseDatabaseArgument(argv) {
  const index = argv.indexOf('--database');
  if (index === -1) return generatedDisposableDatabaseName();
  if (!argv[index + 1] || index + 2 !== argv.length)
    throw new Error('usage: verify-tandem-identity-d1-disposable [--database safe_name]');
  return assertDisposableDatabaseName(argv[index + 1]);
}

async function main() {
  const database = parseDatabaseArgument(process.argv.slice(2));
  const result = await runTandemIdentityD1DisposableProof({ database });
  if (databaseExists(database))
    throw new Error('disposable database residue detected after cleanup');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
