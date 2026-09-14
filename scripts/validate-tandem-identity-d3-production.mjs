#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXPECTED_HOST = 'mini-claw.local';
const EXPECTED_DATABASE = 'nanoclaw_business';
const EXPECTED_ARTIFACT =
  'f6e9e057ea609d3bba25d9aff7b2cd0a4bf22f305a8f510bdf9d00d7a1b69a35';
const EXPECTED_USERS = 1694;
const EXPECTED_GROUPS = 79;
const EXPECTED_MEMBERSHIP_EDGES = 4202;
const EXPECTED_WEBHOOKS = 22;
const EXPECTED_ITEMS = EXPECTED_GROUPS + 3;
const PG_BIN = '/opt/homebrew/opt/postgresql@16/bin';
const STAGES = new Set(['pre-import', 'post-import']);

function fail(code) {
  throw new Error(`tandem_identity_d3_validation:${code}`);
}

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== '--stage' ||
    !STAGES.has(argv[1]) ||
    argv[2] !== '--database' ||
    argv[3] !== EXPECTED_DATABASE
  )
    fail('usage');
  return { stage: argv[1], database: argv[3] };
}

function childEnv() {
  return Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}

function query(database, sql) {
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
      '/tmp',
      '--port',
      '5432',
      '--dbname',
      database,
      '-Atq',
      '-c',
      `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${sql} COMMIT;`,
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
    fail('query_receipt_invalid');
  }
}

function baseline(database) {
  return query(
    database,
    `SELECT json_build_object(
    'serverLocal',inet_server_addr() IS NULL,
    'partyCount',(SELECT count(*) FROM business_v2.parties),
    'externalRefCount',(SELECT count(*) FROM business_v2.party_external_refs),
    'identifierClaimCount',(SELECT count(*) FROM business_v2.party_identifier_claims),
    'authAccountCount',(SELECT count(*) FROM business_v2.auth_accounts),
    'resolutionDecisionCount',(SELECT count(*) FROM business_v2.identity_resolution_decisions),
    'providerAttemptCount',(SELECT count(*) FROM business_v2.provider_projection_attempts),
    'd2Receipts',(SELECT count(*) FROM business_v2.identity_event_receipts r
      JOIN business_v2.party_context_adapter_registrations a ON a.id=r.adapter_registration_id
      WHERE a.adapter_key='tandem_identity_student_lifecycle_shadow'),
    'd2HeldObservations',(SELECT count(*) FROM business_v2.party_context_observations
      WHERE adapter_key='tandem_identity_student_lifecycle_shadow' AND conflict_state='held'),
    'd2LinkedObservations',(SELECT count(*) FROM business_v2.party_context_observations
      WHERE adapter_key='tandem_identity_student_lifecycle_shadow'
        AND (original_party_id IS NOT NULL OR current_party_id IS NOT NULL)),
    'd2Candidates',(SELECT count(*) FROM business_v2.identity_candidates
      WHERE provider='heartbeat' AND environment='production' AND source_scope='community'),
    'd2MaterializableCandidates',(SELECT count(*) FROM business_v2.identity_candidates
      WHERE provider='heartbeat' AND environment='production' AND source_scope='community'
        AND party_materialization_allowed)
  );`,
  );
}

function d3Receipt(database) {
  return query(
    database,
    `SELECT json_build_object(
    'adapterCount',(SELECT count(*) FROM business_v2.party_context_adapter_registrations
      WHERE adapter_key='tandem_identity_heartbeat_aggregate_snapshot'
        AND adapter_version='1.0.0' AND source_system='heartbeat'
        AND environment='production' AND source_scope='main'
        AND conformance_status='passed' AND enabled
        AND config_declaration->>'providerCredential'='false'
        AND config_declaration->>'providerNetwork'='false'
        AND config_declaration->>'providerWrites'='false'),
    'runCount',(SELECT count(*) FROM business_v2.provider_reconciliation_runs
      WHERE provider='heartbeat' AND environment='production' AND source_scope='main'
        AND entity_set='aggregate_identity_access_state' AND run_mode='full'
        AND status='complete' AND complete AND final_page_complete
        AND source_watermark='${EXPECTED_ARTIFACT}'),
    'freshRunCount',(SELECT count(*) FROM business_v2.provider_reconciliation_runs
      WHERE provider='heartbeat' AND environment='production' AND source_scope='main'
        AND entity_set='aggregate_identity_access_state' AND status='complete'
        AND source_watermark='${EXPECTED_ARTIFACT}' AND fresh_until >= now()),
    'itemCount',(SELECT count(*) FROM business_v2.provider_snapshot_items i
      JOIN business_v2.provider_reconciliation_runs r ON r.id=i.run_id
      WHERE r.source_watermark='${EXPECTED_ARTIFACT}'),
    'heldItemCount',(SELECT count(*) FROM business_v2.provider_snapshot_items i
      JOIN business_v2.provider_reconciliation_runs r ON r.id=i.run_id
      WHERE r.source_watermark='${EXPECTED_ARTIFACT}' AND i.item_state='held'),
    'groupItemCount',(SELECT count(*) FROM business_v2.provider_snapshot_items i
      JOIN business_v2.provider_reconciliation_runs r ON r.id=i.run_id
      WHERE r.source_watermark='${EXPECTED_ARTIFACT}'
        AND i.fact_type='identity.aggregate_group_membership@1'),
    'projectionCount',(SELECT count(*) FROM business_v2.provider_desired_projections
      WHERE provider='heartbeat' AND environment='production' AND source_scope='main'
        AND source_authority_versions->>'artifactSha256'='${EXPECTED_ARTIFACT}'
        AND (managed_fields->>'userCount')::int=${EXPECTED_USERS}
        AND (managed_fields->>'membershipEdges')::int=${EXPECTED_MEMBERSHIP_EDGES}
        AND managed_fields->>'individualIdentityGraphAvailable'='false'
        AND managed_fields->>'personResolutionAllowed'='false'
        AND managed_fields->>'accessRepairAllowed'='false'
        AND managed_fields->>'providerWritesAllowed'='false'),
    'commandCount',(SELECT count(*) FROM business_v2.provider_projection_commands c
      JOIN business_v2.provider_desired_projections p
        USING (provider,environment,source_scope,projection_key,desired_version)
      WHERE p.source_authority_versions->>'artifactSha256'='${EXPECTED_ARTIFACT}'
        AND c.status='blocked' AND NOT c.writes_enabled AND c.attempt_count=0
        AND c.provider_operation_id IS NULL AND c.next_attempt_at IS NULL
        AND c.reason_code='INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE'),
    'readbackCount',(SELECT count(*) FROM business_v2.provider_projection_readbacks rb
      JOIN business_v2.provider_projection_commands c ON c.id=rb.command_id
      JOIN business_v2.provider_desired_projections p
        USING (provider,environment,source_scope,projection_key,desired_version)
      WHERE p.source_authority_versions->>'artifactSha256'='${EXPECTED_ARTIFACT}'
        AND rb.result='unavailable' AND rb.managed_fields_sha256 IS NULL),
    'attemptCount',(SELECT count(*) FROM business_v2.provider_projection_attempts),
    'userCount',${EXPECTED_USERS},'groupCount',${EXPECTED_GROUPS},
    'membershipEdges',${EXPECTED_MEMBERSHIP_EDGES},'webhookCount',${EXPECTED_WEBHOOKS}
  );`,
  );
}

const { stage, database } = parseArgs(process.argv.slice(2));
if (os.hostname() !== EXPECTED_HOST) fail('host_mismatch');
const before = baseline(database);
if (!before.serverLocal) fail('remote_postgresql_refused');
const d3 = d3Receipt(database);
if (stage === 'pre-import') {
  if (
    d3.adapterCount !== 0 ||
    d3.runCount !== 0 ||
    d3.itemCount !== 0 ||
    d3.projectionCount !== 0 ||
    d3.commandCount !== 0 ||
    d3.readbackCount !== 0
  )
    fail('target_not_empty');
} else if (
  d3.adapterCount !== 1 ||
  d3.runCount !== 1 ||
  d3.freshRunCount !== 1 ||
  d3.itemCount !== EXPECTED_ITEMS ||
  d3.heldItemCount !== 0 ||
  d3.groupItemCount !== EXPECTED_GROUPS ||
  d3.projectionCount !== 1 ||
  d3.commandCount !== 1 ||
  d3.readbackCount !== 1 ||
  d3.attemptCount !== 0
) {
  fail('post_import_shape_mismatch');
}
process.stdout.write(
  `${JSON.stringify({ ok: true, stage, expectedArtifactSha256: EXPECTED_ARTIFACT, baseline: before, d3 })}\n`,
);
