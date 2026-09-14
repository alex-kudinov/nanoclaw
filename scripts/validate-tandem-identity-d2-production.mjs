#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXPECTED_HOST = 'mini-claw.local';
const EXPECTED_DATABASE = 'nanoclaw_business';
const EXPECTED_PREFIX_COUNT = 379;
const EXPECTED_PREFIX_MAX_ID = 379;
const EXPECTED_PREFIX_SHA256 =
  '251fe76eed9db7710fbe7d96d11359f0c5231cd9f6cbd0c42ac4d1207642f955';
const PG_BIN = '/opt/homebrew/opt/postgresql@16/bin';
const SOCKET = '/tmp';
const PORT = '5432';
const STAGES = new Set(['preflight', 'post-migration', 'post-enable']);

function fail(code) {
  throw new Error(`tandem_identity_d2_validation:${code}`);
}

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== '--stage' ||
    !STAGES.has(argv[1]) ||
    argv[2] !== '--database' ||
    argv[3] !== EXPECTED_DATABASE
  ) {
    fail('usage');
  }
  return { stage: argv[1], database: argv[3] };
}

function childEnv() {
  return Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}

function runQuery(database, sql) {
  if (database !== EXPECTED_DATABASE) fail('database_mismatch');
  const binary = path.join(PG_BIN, 'psql');
  if (!fs.existsSync(binary)) fail('postgresql_16_unavailable');
  const result = spawnSync(
    binary,
    [
      '-X',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '--host',
      SOCKET,
      '--port',
      PORT,
      '--dbname',
      database,
      '-Atq',
      '-c',
      `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
       ${sql}
       COMMIT;`,
    ],
    { encoding: 'utf8', env: childEnv() },
  );
  if (result.status !== 0) fail('query_failed');
  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'));
  if (lines.length !== 1) fail('query_receipt_invalid');
  try {
    return JSON.parse(lines[0]);
  } catch {
    return fail('query_receipt_invalid');
  }
}

function integer(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function commonSourceReceipt(database) {
  const receipt = runQuery(
    database,
    `SELECT json_build_object(
       'serverLocal',inet_server_addr() IS NULL,
       'prefixCount',count(*) FILTER (WHERE id <= ${EXPECTED_PREFIX_MAX_ID}),
       'prefixMaxId',max(id) FILTER (WHERE id <= ${EXPECTED_PREFIX_MAX_ID}),
       'prefixSha256',encode(sha256(convert_to(
         string_agg(concat_ws(':',id::text,payload_sha256,relay_authenticity,
           provider_authenticity,mapping_status,processing_status),E'\\n'
           ORDER BY id) FILTER (WHERE id <= ${EXPECTED_PREFIX_MAX_ID}),
         'UTF8')),'hex'),
       'sourceRows',count(*),
       'sourceMaxId',max(id),
       'sourceRowsWithoutUser',count(*) FILTER (WHERE heartbeat_user_id IS NULL),
       'distinctSourceUsers',count(DISTINCT heartbeat_user_id),
       'sourcePartyLinkedRows',count(*) FILTER (WHERE party_id IS NOT NULL),
       'sourceContractViolations',count(*) FILTER (WHERE
         heartbeat_user_id IS NULL OR relay_authenticity <> 'hmac_verified'
         OR provider_authenticity <> 'source_asserted_unreconciled'
         OR event_name NOT IN (
           'community_login_first','course_completed',
           'heartbeat_user_reconciliation_requested','learning_access_observed'
         ) OR payload_sha256 !~ '^[0-9a-f]{64}$'),
       'partyCount',(SELECT count(*) FROM business_v2.parties),
       'externalRefCount',(SELECT count(*) FROM business_v2.party_external_refs),
       'identifierClaimCount',(SELECT count(*) FROM business_v2.party_identifier_claims),
       'identityExceptionCount',(SELECT count(*) FROM business_v2.party_identity_exceptions),
       'contextObservationCount',(SELECT count(*) FROM business_v2.party_context_observations)
     ) FROM business_v2.student_lifecycle_events;`,
  );
  if (receipt.serverLocal !== true) fail('remote_postgresql_refused');
  if (
    receipt.prefixCount !== EXPECTED_PREFIX_COUNT ||
    receipt.prefixMaxId !== EXPECTED_PREFIX_MAX_ID ||
    receipt.prefixSha256 !== EXPECTED_PREFIX_SHA256
  ) {
    fail('frozen_source_prefix_drift');
  }
  if (integer(receipt.sourceRows, 'source_count_invalid') < EXPECTED_PREFIX_COUNT)
    fail('source_rows_regressed');
  if (integer(receipt.sourceRowsWithoutUser, 'without_user_invalid') !== 0)
    fail('source_subject_unsupported');
  if (integer(receipt.sourceContractViolations, 'source_contract_invalid') !== 0)
    fail('source_contract_violation');
  return receipt;
}

function targetReceipt(database) {
  return runQuery(
    database,
    `SELECT json_build_object(
       'd1TableCount',(SELECT count(*) FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='business_v2' AND c.relkind='r' AND (
           c.relname LIKE 'identity_%' OR c.relname='auth_accounts'
           OR c.relname LIKE 'provider_%')),
       'd1ViewCount',(SELECT count(*) FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='business_v2' AND c.relkind='v'
           AND c.relname='v_tandem_identity_shadow_health'),
       'nonAdminGrants',(SELECT count(*) FROM information_schema.role_table_grants
         WHERE table_schema='business_v2' AND grantee <> 'nanoclaw_admin' AND (
           table_name LIKE 'identity_%' OR table_name='auth_accounts'
           OR table_name LIKE 'provider_%'
           OR table_name='v_tandem_identity_shadow_health')),
       'sourceRows',(SELECT count(*) FROM business_v2.student_lifecycle_events),
       'distinctSourceUsers',(SELECT count(DISTINCT heartbeat_user_id)
         FROM business_v2.student_lifecycle_events
         WHERE heartbeat_user_id IS NOT NULL),
       'receipts',(SELECT count(*) FROM business_v2.identity_event_receipts),
       'promotedReceipts',(SELECT count(*) FROM business_v2.identity_event_receipts
         WHERE authenticity_status <> 'unverified_hint'
            OR normalization_status <> 'held'),
       'heldObservations',(SELECT count(*) FROM business_v2.party_context_observations
         WHERE adapter_key='tandem_identity_student_lifecycle_shadow'
           AND adapter_version='1.0.0' AND conflict_state='held'),
       'linkedD2Observations',(SELECT count(*) FROM business_v2.party_context_observations
         WHERE adapter_key='tandem_identity_student_lifecycle_shadow'
           AND (original_party_id IS NOT NULL OR current_party_id IS NOT NULL)),
       'candidates',(SELECT count(*) FROM business_v2.identity_candidates
         WHERE provider='heartbeat' AND environment='production'
           AND source_scope='community'),
       'materializableCandidates',(SELECT count(*) FROM business_v2.identity_candidates
         WHERE provider='heartbeat' AND environment='production'
           AND source_scope='community' AND party_materialization_allowed),
       'acceptedFacts',(SELECT count(*) FROM business_v2.identity_resolution_decisions
         WHERE provider='heartbeat' AND environment='production'
           AND source_scope='community' AND result LIKE 'resolved_%'),
       'desiredProjections',(SELECT count(*) FROM business_v2.provider_desired_projections),
       'commands',(SELECT count(*) FROM business_v2.provider_projection_commands),
       'attempts',(SELECT count(*) FROM business_v2.provider_projection_attempts),
       'readbacks',(SELECT count(*) FROM business_v2.provider_projection_readbacks),
       'reconciliationRuns',(SELECT count(*) FROM business_v2.provider_reconciliation_runs),
       'driftItems',(SELECT count(*) FROM business_v2.provider_drift_items)
     );`,
  );
}

function validateTargetShape(target) {
  if (target.d1TableCount !== 12 || target.d1ViewCount !== 1)
    fail('migration_shape_mismatch');
  if (target.nonAdminGrants !== 0) fail('non_admin_grant_detected');
}

function validateEmptyTarget(target) {
  for (const key of [
    'receipts',
    'heldObservations',
    'candidates',
    'acceptedFacts',
    'desiredProjections',
    'commands',
    'attempts',
    'readbacks',
    'reconciliationRuns',
    'driftItems',
  ]) {
    if (target[key] !== 0) fail(`target_not_empty_${key}`);
  }
}

function main() {
  const { stage, database } = parseArgs(process.argv.slice(2));
  if (os.hostname() !== EXPECTED_HOST) fail('host_mismatch');
  const source = commonSourceReceipt(database);
  if (stage === 'preflight') {
    const absent = runQuery(
      database,
      `SELECT json_build_object('d1ObjectCount',count(*))
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='business_v2' AND (
          c.relname LIKE 'identity_%' OR c.relname='auth_accounts'
          OR c.relname LIKE 'provider_%');`,
    );
    if (absent.d1ObjectCount !== 0) fail('preflight_target_not_absent');
    process.stdout.write(`${JSON.stringify({ ok: true, stage, source, target: absent })}\n`);
    return;
  }
  const target = targetReceipt(database);
  validateTargetShape(target);
  if (stage === 'post-migration') {
    validateEmptyTarget(target);
  } else {
    if (
      target.receipts !== target.sourceRows ||
      target.heldObservations !== target.sourceRows ||
      target.candidates !== target.distinctSourceUsers
    ) {
      fail('shadow_coverage_mismatch');
    }
    for (const key of [
      'promotedReceipts',
      'linkedD2Observations',
      'materializableCandidates',
      'acceptedFacts',
      'desiredProjections',
      'commands',
      'attempts',
      'readbacks',
      'reconciliationRuns',
      'driftItems',
    ]) {
      if (target[key] !== 0) fail(`forbidden_target_state_${key}`);
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, stage, source, target })}\n`);
}

main();
