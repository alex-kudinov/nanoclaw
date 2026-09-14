import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from '../business-db.js';
import { sha256Json } from './canonical.js';
import {
  type HeartbeatAggregateSnapshot,
  validateHeartbeatAggregateSnapshot,
} from './d3-heartbeat-snapshot.js';

export const D3_ADAPTER_KEY = 'tandem_identity_heartbeat_aggregate_snapshot';
export const D3_ADAPTER_VERSION = '1.0.0';
const PROVIDER = 'heartbeat';
const ENVIRONMENT = 'production';
const SCOPE = 'main';
const ENTITY_SET = 'aggregate_identity_access_state';
const REASON_CODE = 'INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE';

interface CountRow extends QueryResultRow {
  parties: string;
  refs: string;
  auth_accounts: string;
  decisions: string;
  attempts: string;
  d2_receipts: string;
  d2_observations: string;
  d2_candidates: string;
}

export interface D3ImportResult {
  outcome: 'imported' | 'duplicate';
  artifactSha256: string;
  reconciliationRunId: number;
  snapshotSha256: string;
  snapshotItemsInserted: number;
  desiredProjectionsInserted: number;
  blockedCommandsInserted: number;
  readbacksInserted: number;
  providerAttempts: 0;
  partyWrites: 0;
  externalReferenceWrites: 0;
  authAccountWrites: 0;
  resolutionDecisionWrites: 0;
  d2Drift: 0;
  individualIdentityGraphAvailable: false;
  status: 'blocked';
  reason: typeof REASON_CODE;
}

function fail(code: string): never {
  throw new Error(`tandem_identity_d3_import:${code}`);
}

function integer(value: string, code: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(code);
  return parsed;
}

async function counts(client: PoolClient): Promise<CountRow> {
  const result = await client.query<CountRow>(
    `SELECT
       (SELECT count(*) FROM business_v2.parties)::text AS parties,
       (SELECT count(*) FROM business_v2.party_external_refs)::text AS refs,
       (SELECT count(*) FROM business_v2.auth_accounts)::text AS auth_accounts,
       (SELECT count(*) FROM business_v2.identity_resolution_decisions)::text AS decisions,
       (SELECT count(*) FROM business_v2.provider_projection_attempts)::text AS attempts,
       (SELECT count(*) FROM business_v2.identity_event_receipts r
          JOIN business_v2.party_context_adapter_registrations a
            ON a.id=r.adapter_registration_id
         WHERE a.adapter_key='tandem_identity_student_lifecycle_shadow')::text AS d2_receipts,
       (SELECT count(*) FROM business_v2.party_context_observations
         WHERE adapter_key='tandem_identity_student_lifecycle_shadow')::text AS d2_observations,
       (SELECT count(*) FROM business_v2.identity_candidates
         WHERE provider='heartbeat' AND environment='production'
           AND source_scope='community')::text AS d2_candidates`,
  );
  return result.rows[0];
}

function assertPreserved(before: CountRow, after: CountRow): void {
  for (const field of Object.keys(before) as Array<keyof CountRow>) {
    if (before[field] !== after[field]) fail(`forbidden_drift_${field}`);
  }
}

async function registerAdapter(
  client: PoolClient,
  observedAt: string,
): Promise<number> {
  const manifest = {
    kind: 'provider_adapter_manifest',
    schemaVersion: 1,
    adapterKey: D3_ADAPTER_KEY,
    adapterVersion: D3_ADAPTER_VERSION,
    provider: PROVIDER,
    environment: ENVIRONMENT,
    scope: SCOPE,
    entityTypes: [
      'user_set',
      'group_membership',
      'webhook_registry',
      'reconciliation_control',
    ],
    collectionMode: 'privacy_minimized_toolbox_snapshot_import',
    individualIdentityGraphAvailable: false,
    providerNetwork: false,
    writesEnabled: false,
  };
  const manifestSha256 = sha256Json(manifest);
  const conformanceSha256 = sha256Json({
    suite: 'tandem_identity_d3_aggregate_import_v1',
    manifestSha256,
    result: 'passed',
  });
  const result = await client.query<{ id: string }>(
    `INSERT INTO business_v2.party_context_adapter_registrations
       (adapter_key,adapter_version,source_system,source_scope,
        manifest_version,manifest_sha256,manifest,config_declaration,
        enabled,conformance_status,conformance_receipt_sha256,circuit_status,
        failure_count,last_error_code,last_health_at,environment,accepted_at,
        retired_at,identity_entity_types,identity_event_types)
     VALUES ($1,$2,$3,$4,1,$5,$6::jsonb,$7::jsonb,true,'passed',$8,
       'closed',0,NULL,$9::timestamptz,$10,$9::timestamptz,NULL,$11::text[],'{}'::text[])
     ON CONFLICT (adapter_key,adapter_version,source_scope) DO UPDATE
       SET manifest_sha256=EXCLUDED.manifest_sha256,
           manifest=EXCLUDED.manifest,
           config_declaration=EXCLUDED.config_declaration,
           enabled=true,conformance_status='passed',
           conformance_receipt_sha256=EXCLUDED.conformance_receipt_sha256,
           circuit_status='closed',failure_count=0,last_error_code=NULL,
           last_health_at=EXCLUDED.last_health_at,
           environment=EXCLUDED.environment,
           accepted_at=COALESCE(party_context_adapter_registrations.accepted_at,EXCLUDED.accepted_at),
           retired_at=NULL,identity_entity_types=EXCLUDED.identity_entity_types,
           identity_event_types='{}'::text[],updated_at=now()
     RETURNING id::text`,
    [
      D3_ADAPTER_KEY,
      D3_ADAPTER_VERSION,
      PROVIDER,
      SCOPE,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify({
        mode: 'one_shot_minimized_artifact_import',
        rawPayload: false,
        providerCredential: false,
        providerNetwork: false,
        partyWrites: false,
        externalReferenceWrites: false,
        authAccountWrites: false,
        accessWrites: false,
        providerWrites: false,
      }),
      conformanceSha256,
      observedAt,
      ENVIRONMENT,
      manifest.entityTypes,
    ],
  );
  return integer(result.rows[0].id, 'adapter_id');
}

function snapshotItems(snapshot: HeartbeatAggregateSnapshot) {
  const latest = snapshot.censusObservations[1];
  const items = [
    {
      entityType: 'user_set',
      externalId: 'all-users',
      factType: 'identity.aggregate_user_set@1',
      sourceVersion: latest.snapshotSha256,
      fact: {
        userCount: latest.userCount,
        userIdsSha256: latest.userIdsSha256,
        missingEmailCount: latest.missingEmailCount,
        duplicateEmailValuesAcrossUserIds:
          latest.duplicateEmailValuesAcrossUserIds,
        zeroGroupUsers: latest.zeroGroupUsers,
      },
    },
    {
      entityType: 'group_membership',
      externalId: 'all-membership-edges',
      factType: 'identity.aggregate_membership_edges@1',
      sourceVersion: latest.snapshotSha256,
      fact: {
        membershipEdges: latest.membershipEdges,
        roleMembershipEdges: latest.roleMembershipEdges,
        accessMembershipEdges: latest.accessMembershipEdges,
        zeroAccessGroupUsers: latest.zeroAccessGroupUsers,
        roleCounts: latest.roleCounts,
      },
    },
    {
      entityType: 'webhook_registry',
      externalId: 'all-webhooks',
      factType: 'identity.aggregate_webhook_registry@1',
      sourceVersion: snapshot.webhookInventory.inventorySha256,
      fact: {
        registrationCount: snapshot.webhookInventory.registrationCount,
        inventorySha256: snapshot.webhookInventory.inventorySha256,
      },
    },
    ...snapshot.groups.map((group) => ({
      entityType: 'group_membership',
      externalId: group.groupId,
      factType: 'identity.aggregate_group_membership@1',
      sourceVersion: group.membershipSha256,
      fact: {
        memberCount: group.memberCount,
        membershipSha256: group.membershipSha256,
      },
    })),
  ];
  return items.map((item) => ({ ...item, factSha256: sha256Json(item.fact) }));
}

async function duplicateResult(
  client: PoolClient,
  snapshot: HeartbeatAggregateSnapshot,
  runId: number,
  snapshotSha256: string,
): Promise<D3ImportResult> {
  const expectedItems = snapshot.groups.length + 3;
  const receipt = await client.query<{
    items: string;
    projections: string;
    commands: string;
    readbacks: string;
    attempts: string;
  }>(
    `SELECT
       (SELECT count(*) FROM business_v2.provider_snapshot_items WHERE run_id=$1)::text AS items,
       (SELECT count(*) FROM business_v2.provider_desired_projections
         WHERE provider=$2 AND environment=$3 AND source_scope=$4
           AND source_authority_versions->>'artifactSha256'=$5)::text AS projections,
       (SELECT count(*) FROM business_v2.provider_projection_commands c
          JOIN business_v2.provider_desired_projections p
            USING (provider,environment,source_scope,projection_key,desired_version)
         WHERE c.provider=$2 AND c.environment=$3 AND c.source_scope=$4
           AND p.source_authority_versions->>'artifactSha256'=$5
           AND c.status='blocked' AND NOT c.writes_enabled AND c.attempt_count=0)::text AS commands,
       (SELECT count(*) FROM business_v2.provider_projection_readbacks r
          JOIN business_v2.provider_projection_commands c ON c.id=r.command_id
          JOIN business_v2.provider_desired_projections p
            USING (provider,environment,source_scope,projection_key,desired_version)
         WHERE c.provider=$2 AND c.environment=$3 AND c.source_scope=$4
           AND p.source_authority_versions->>'artifactSha256'=$5
           AND r.result='unavailable')::text AS readbacks,
       (SELECT count(*) FROM business_v2.provider_projection_attempts)::text AS attempts`,
    [runId, PROVIDER, ENVIRONMENT, SCOPE, snapshot.artifactSha256],
  );
  if (
    integer(receipt.rows[0].items, 'duplicate_items') !== expectedItems ||
    integer(receipt.rows[0].projections, 'duplicate_projections') !== 1 ||
    integer(receipt.rows[0].commands, 'duplicate_commands') !== 1 ||
    integer(receipt.rows[0].readbacks, 'duplicate_readbacks') !== 1 ||
    integer(receipt.rows[0].attempts, 'duplicate_attempts') !== 0
  ) {
    fail('duplicate_evidence_incomplete');
  }
  return {
    outcome: 'duplicate',
    artifactSha256: snapshot.artifactSha256,
    reconciliationRunId: runId,
    snapshotSha256,
    snapshotItemsInserted: 0,
    desiredProjectionsInserted: 0,
    blockedCommandsInserted: 0,
    readbacksInserted: 0,
    providerAttempts: 0,
    partyWrites: 0,
    externalReferenceWrites: 0,
    authAccountWrites: 0,
    resolutionDecisionWrites: 0,
    d2Drift: 0,
    individualIdentityGraphAvailable: false,
    status: 'blocked',
    reason: REASON_CODE,
  };
}

export async function importHeartbeatAggregateSnapshotWithClient(input: {
  client: PoolClient;
  snapshot: unknown;
  importedAt: string;
}): Promise<D3ImportResult> {
  const snapshot = validateHeartbeatAggregateSnapshot(
    input.snapshot,
    input.importedAt,
  );
  const lock = await input.client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtext('tandem_identity_d3_heartbeat_aggregate')) AS acquired`,
  );
  if (!lock.rows[0].acquired) fail('busy');
  const existing = await input.client.query<{
    id: string;
    snapshot_sha256: string;
  }>(
    `SELECT id::text,snapshot_sha256 FROM business_v2.provider_reconciliation_runs
      WHERE provider=$1 AND environment=$2 AND source_scope=$3 AND entity_set=$4
        AND status='complete' AND complete AND source_watermark=$5
      ORDER BY id LIMIT 1 FOR SHARE`,
    [PROVIDER, ENVIRONMENT, SCOPE, ENTITY_SET, snapshot.artifactSha256],
  );
  if (existing.rowCount === 1) {
    return duplicateResult(
      input.client,
      snapshot,
      integer(existing.rows[0].id, 'existing_run_id'),
      existing.rows[0].snapshot_sha256,
    );
  }

  const before = await counts(input.client);
  const adapterId = await registerAdapter(input.client, input.importedAt);
  const prior = await input.client.query<{ snapshot_sha256: string }>(
    `SELECT snapshot_sha256 FROM business_v2.provider_reconciliation_runs
      WHERE provider=$1 AND environment=$2 AND source_scope=$3 AND entity_set=$4
        AND status='complete' AND complete
      ORDER BY completed_at DESC,id DESC LIMIT 1`,
    [PROVIDER, ENVIRONMENT, SCOPE, ENTITY_SET],
  );
  const run = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.provider_reconciliation_runs
       (adapter_registration_id,provider,environment,source_scope,entity_set,
        run_mode,status,complete,final_page_complete,source_watermark,
        observed_count,normalized_count,duplicate_count,held_count,
        snapshot_sha256,previous_snapshot_sha256,started_at,completed_at,
        fresh_until,last_observed_at,retention_policy_version)
     VALUES ($1,$2,$3,$4,$5,'full','running',false,false,NULL,0,0,0,0,NULL,$6,
       $7::timestamptz,NULL,NULL,$7::timestamptz,1) RETURNING id::text`,
    [
      adapterId,
      PROVIDER,
      ENVIRONMENT,
      SCOPE,
      ENTITY_SET,
      prior.rows[0]?.snapshot_sha256 ?? null,
      input.importedAt,
    ],
  );
  const runId = integer(run.rows[0].id, 'run_id');
  const items = snapshotItems(snapshot);
  for (const item of items) {
    await input.client.query(
      `INSERT INTO business_v2.provider_snapshot_items
         (run_id,provider,environment,source_scope,entity_type,external_id,
          fact_type,source_version,fact_sha256,item_state,source_effective_at,observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'normalized',$10::timestamptz,$10::timestamptz)`,
      [
        runId,
        PROVIDER,
        ENVIRONMENT,
        SCOPE,
        item.entityType,
        item.externalId,
        item.factType,
        item.sourceVersion,
        item.factSha256,
        snapshot.censusObservations[1].observedAt,
      ],
    );
  }
  const finalized = await input.client.query<{ snapshot_sha256: string }>(
    `SELECT business_v2.fn_tandem_identity_finalize_reconciliation_run(
       $1,$2,$3::timestamptz,$4::timestamptz) AS snapshot_sha256`,
    [runId, snapshot.artifactSha256, input.importedAt, snapshot.freshUntil],
  );

  const managedFields = {
    aggregateSnapshotSha256: snapshot.artifactSha256,
    userCount: snapshot.censusObservations[1].userCount,
    membershipEdges: snapshot.censusObservations[1].membershipEdges,
    individualIdentityGraphAvailable: false,
    personResolutionAllowed: false,
    accessRepairAllowed: false,
    providerWritesAllowed: false,
    blockedReason: REASON_CODE,
  };
  const projection = await input.client.query<{
    id: string;
    projection_key: string;
    desired_version: number;
  }>(
    `WITH next AS (
       SELECT business_v2.fn_tandem_identity_sha256(
                concat_ws(E'\\x1f',$1::text,$2::text,$3::text,'reconciliation_control','main','aggregate_identity_access_gate')
              ) AS projection_key
     ), versioned AS (
       SELECT next.projection_key,
              COALESCE(max(p.desired_version),0)+1 AS desired_version
         FROM next LEFT JOIN business_v2.provider_desired_projections p
           ON p.provider=$1 AND p.environment=$2 AND p.source_scope=$3
          AND p.projection_key=next.projection_key
        GROUP BY next.projection_key
     )
     INSERT INTO business_v2.provider_desired_projections
       (provider,environment,source_scope,entity_type,external_id,
        managed_object_key,projection_key,desired_version,managed_fields,
        projection_sha256,source_authority_versions,source_effective_at,
        last_observed_at,retention_policy_version)
     SELECT $1,$2,$3,'reconciliation_control','main','aggregate_identity_access_gate',
            projection_key,desired_version,$4::jsonb,
            business_v2.fn_tandem_identity_sha256($4::jsonb::text),$5::jsonb,
            $6::timestamptz,$6::timestamptz,1
       FROM versioned
     RETURNING id::text,projection_key,desired_version`,
    [
      PROVIDER,
      ENVIRONMENT,
      SCOPE,
      JSON.stringify(managedFields),
      JSON.stringify({
        artifactSha256: snapshot.artifactSha256,
        censusSnapshotSha256: snapshot.censusObservations[1].snapshotSha256,
        webhookInventorySha256: snapshot.webhookInventory.inventorySha256,
      }),
      snapshot.censusObservations[1].observedAt,
    ],
  );
  const projectionRow = projection.rows[0];
  const command = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.provider_projection_commands
       (provider,environment,source_scope,projection_key,desired_version,
        idempotency_key,status,writes_enabled,attempt_count,
        provider_operation_id,next_attempt_at,reason_code,source_effective_at,
        last_observed_at,retention_policy_version)
     VALUES ($1,$2,$3,$4,$5::integer,
       business_v2.fn_tandem_identity_sha256(
         concat_ws(E'\\x1f',$1::text,$2::text,$3::text,$4::text,$5::integer::text,'stage-d-shadow-v1')
       ),'blocked',false,0,NULL,NULL,$6,$7::timestamptz,$7::timestamptz,1)
     RETURNING id::text`,
    [
      PROVIDER,
      ENVIRONMENT,
      SCOPE,
      projectionRow.projection_key,
      projectionRow.desired_version,
      REASON_CODE,
      snapshot.censusObservations[1].observedAt,
    ],
  );
  const commandId = integer(command.rows[0].id, 'command_id');
  await input.client.query(
    `INSERT INTO business_v2.provider_projection_readbacks
       (command_id,result,managed_fields_sha256,evidence_sha256,observed_at)
     VALUES ($1,'unavailable',NULL,$2,$3::timestamptz)`,
    [
      commandId,
      sha256Json({
        artifactSha256: snapshot.artifactSha256,
        reason: REASON_CODE,
        providerAttempted: false,
      }),
      input.importedAt,
    ],
  );

  const after = await counts(input.client);
  assertPreserved(before, after);
  return {
    outcome: 'imported',
    artifactSha256: snapshot.artifactSha256,
    reconciliationRunId: runId,
    snapshotSha256: finalized.rows[0].snapshot_sha256,
    snapshotItemsInserted: items.length,
    desiredProjectionsInserted: 1,
    blockedCommandsInserted: 1,
    readbacksInserted: 1,
    providerAttempts: 0,
    partyWrites: 0,
    externalReferenceWrites: 0,
    authAccountWrites: 0,
    resolutionDecisionWrites: 0,
    d2Drift: 0,
    individualIdentityGraphAvailable: false,
    status: 'blocked',
    reason: REASON_CODE,
  };
}

export async function importHeartbeatAggregateSnapshot(
  snapshot: unknown,
  importedAt = new Date().toISOString(),
): Promise<D3ImportResult> {
  return withAgentContext('tandem_identity_d3_aggregate_import', (client) =>
    importHeartbeatAggregateSnapshotWithClient({
      client,
      snapshot,
      importedAt,
    }),
  );
}
