import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from '../business-db.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { sha256Json } from './canonical.js';

export const D2_ADAPTER_KEY = 'tandem_identity_student_lifecycle_shadow';
export const D2_ADAPTER_VERSION = '1.0.0';
export const D2_PROVIDER = 'heartbeat';
export const D2_ENVIRONMENT = 'production';
export const D2_SCOPE = 'community';
export const D2_FACT_TYPE = 'identity.student_lifecycle_event@1';
export const D2_DEFAULT_BATCH_LIMIT = 500;
export const D2_DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

const EVENT_NAMES = [
  'community_login_first',
  'course_completed',
  'heartbeat_user_reconciliation_requested',
  'learning_access_observed',
] as const;

const manifest = Object.freeze({
  kind: 'provider_adapter_manifest',
  schemaVersion: 1,
  adapterKey: D2_ADAPTER_KEY,
  adapterVersion: D2_ADAPTER_VERSION,
  manifestVersion: 1,
  provider: D2_PROVIDER,
  environment: D2_ENVIRONMENT,
  scope: D2_SCOPE,
  status: 'accepted',
  entityTypes: ['user'],
  eventTypes: EVENT_NAMES,
  authenticity: {
    method: 'hmac_relay_provider_unreconciled',
    providerVerified: false,
  },
  collectionMode: 'existing_host_ledger_shadow',
  rawPayload: false,
  partyWrites: false,
  externalReferenceWrites: false,
  accessWrites: false,
  providerWrites: false,
  customerProjectionWrites: false,
  writesEnabled: false,
});

export interface TandemIdentityD2Config {
  enabled: boolean;
  valid: boolean;
  reason: string;
  batchLimit: number;
  intervalMs: number;
}

export interface TandemIdentityD2Health {
  enabled: boolean;
  valid: boolean;
  mode: 'student_lifecycle_ledger_shadow';
  status: 'disabled' | 'never_run' | 'catching_up' | 'blocked' | 'error';
  reason: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  sourceRows: number;
  sourceRowsWithoutUser: number;
  sourcePartyLinkedRows: number;
  distinctSourceUsers: number;
  mirroredReceipts: number;
  heldObservations: number;
  openCandidates: number;
  unmirroredRows: number;
  acceptedFacts: 0;
  providerAttempts: 0;
  partyWrites: 0;
  externalReferenceWrites: 0;
  accessWrites: 0;
  providerWrites: 0;
  errorCode: string | null;
}

export interface TandemIdentityD2RunResult {
  outcome: 'busy' | 'batch_applied' | 'caught_up';
  scanned: number;
  receiptsInserted: number;
  receiptsDuplicate: number;
  observationsInserted: number;
  candidatesInserted: number;
  health: TandemIdentityD2Health;
}

const baseHealth = (): TandemIdentityD2Health => ({
  enabled: false,
  valid: true,
  mode: 'student_lifecycle_ledger_shadow',
  status: 'disabled',
  reason: 'disabled',
  lastRunAt: null,
  lastSuccessAt: null,
  sourceRows: 0,
  sourceRowsWithoutUser: 0,
  sourcePartyLinkedRows: 0,
  distinctSourceUsers: 0,
  mirroredReceipts: 0,
  heldObservations: 0,
  openCandidates: 0,
  unmirroredRows: 0,
  acceptedFacts: 0,
  providerAttempts: 0,
  partyWrites: 0,
  externalReferenceWrites: 0,
  accessWrites: 0,
  providerWrites: 0,
  errorCode: null,
});

let currentHealth = baseHealth();

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (raw == null || raw === '') return fallback;
  if (!/^[0-9]+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

export function resolveTandemIdentityD2Config(
  env: NodeJS.ProcessEnv = process.env,
): TandemIdentityD2Config {
  const file =
    env === process.env
      ? readEnvFile([
          'TANDEM_IDENTITY_D2_SHADOW_ENABLED',
          'TANDEM_IDENTITY_D2_BATCH_LIMIT',
          'TANDEM_IDENTITY_D2_INTERVAL_MS',
        ])
      : {};
  const enabledRaw =
    env.TANDEM_IDENTITY_D2_SHADOW_ENABLED ||
    file.TANDEM_IDENTITY_D2_SHADOW_ENABLED ||
    'false';
  const enabled = enabledRaw === '1' || enabledRaw === 'true';
  const validBoolean = ['0', '1', 'false', 'true'].includes(enabledRaw);
  const batchLimit = parseBoundedInteger(
    env.TANDEM_IDENTITY_D2_BATCH_LIMIT || file.TANDEM_IDENTITY_D2_BATCH_LIMIT,
    D2_DEFAULT_BATCH_LIMIT,
    1,
    500,
  );
  const intervalMs = parseBoundedInteger(
    env.TANDEM_IDENTITY_D2_INTERVAL_MS || file.TANDEM_IDENTITY_D2_INTERVAL_MS,
    D2_DEFAULT_INTERVAL_MS,
    60_000,
    24 * 60 * 60 * 1000,
  );
  const valid = validBoolean && batchLimit != null && intervalMs != null;
  return {
    enabled: valid && enabled,
    valid,
    reason: valid
      ? enabled
        ? 'enabled'
        : 'disabled'
      : 'invalid_configuration',
    batchLimit: batchLimit ?? D2_DEFAULT_BATCH_LIMIT,
    intervalMs: intervalMs ?? D2_DEFAULT_INTERVAL_MS,
  };
}

export function getTandemIdentityD2Health(): TandemIdentityD2Health {
  return structuredClone(currentHealth);
}

export function resetTandemIdentityD2HealthForTests(): void {
  currentHealth = baseHealth();
}

export function initializeTandemIdentityD2Health(
  config: TandemIdentityD2Config,
): void {
  currentHealth = {
    ...baseHealth(),
    enabled: config.enabled,
    valid: config.valid,
    status: config.enabled ? 'never_run' : 'disabled',
    reason: config.reason,
    errorCode: config.valid ? null : 'invalid_configuration',
  };
}

interface SourceRow extends QueryResultRow {
  id: string;
  event_uuid: string;
  source_event_key: string;
  event_name: string;
  observed_at: Date;
  heartbeat_user_id: string;
  heartbeat_group_id: string | null;
  heartbeat_course_id: string | null;
  heartbeat_cohort_id: string | null;
  party_id: string | null;
  catalog_entry_id: string | null;
  payload_sha256: string;
  relay_authenticity: string;
  provider_authenticity: string;
  mapping_status: string;
  processing_status: string;
}

interface CountRow extends QueryResultRow {
  source_rows: string;
  source_rows_without_user: string;
  source_party_linked_rows: string;
  distinct_source_users: string;
  mirrored_receipts: string;
  held_observations: string;
  open_candidates: string;
  accepted_facts: string;
  provider_attempts: string;
  party_count: string;
  external_ref_count: string;
}

interface ReceiptRow extends QueryResultRow {
  stored_receipt_id: string;
  inserted: boolean;
}

function exactInteger(value: string, code: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(code);
  return parsed;
}

function validateSourceRow(row: SourceRow): void {
  if (
    row.relay_authenticity !== 'hmac_verified' ||
    row.provider_authenticity !== 'source_asserted_unreconciled' ||
    !EVENT_NAMES.includes(row.event_name as (typeof EVENT_NAMES)[number]) ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(row.heartbeat_user_id) ||
    !/^[0-9a-f]{64}$/.test(row.payload_sha256)
  ) {
    throw new Error('tandem_identity_d2_source_contract_mismatch');
  }
}

function candidateFingerprint(userId: string): string {
  return sha256Json({
    provider: D2_PROVIDER,
    environment: D2_ENVIRONMENT,
    scope: D2_SCOPE,
    entityType: 'user',
    externalId: userId,
  });
}

function deduplicationKey(sourceEventKey: string): string {
  return `student-lifecycle:${sha256Json(sourceEventKey)}`;
}

function sourceFactKey(sourceEventKey: string): string {
  return `identity-shadow:${sha256Json(sourceEventKey)}`;
}

async function registerAdapter(
  client: PoolClient,
  observedAt: string,
): Promise<number> {
  const manifestSha256 = sha256Json(manifest);
  const conformanceSha256 = sha256Json({
    suite: 'tandem_identity_d2_student_lifecycle_shadow_v1',
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
       'closed',0,NULL,$9::timestamptz,$10,$11::timestamptz,NULL,$12::text[],$13::text[])
     ON CONFLICT (adapter_key,adapter_version,source_scope) DO UPDATE
       SET manifest_sha256=EXCLUDED.manifest_sha256,
           manifest=EXCLUDED.manifest,
           config_declaration=EXCLUDED.config_declaration,
           enabled=true,conformance_status='passed',
           conformance_receipt_sha256=EXCLUDED.conformance_receipt_sha256,
           circuit_status='closed',failure_count=0,last_error_code=NULL,
           last_health_at=EXCLUDED.last_health_at,
           environment=EXCLUDED.environment,
           accepted_at=COALESCE(
             party_context_adapter_registrations.accepted_at,
             EXCLUDED.accepted_at
           ),
           retired_at=NULL,
           identity_entity_types=EXCLUDED.identity_entity_types,
           identity_event_types=EXCLUDED.identity_event_types,
           updated_at=now()
     RETURNING id::text`,
    [
      D2_ADAPTER_KEY,
      D2_ADAPTER_VERSION,
      D2_PROVIDER,
      D2_SCOPE,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify({
        mode: 'student_lifecycle_ledger_shadow',
        raw_payload: false,
        provider_network: false,
        party_writes: false,
        external_reference_writes: false,
        access_writes: false,
        provider_writes: false,
      }),
      conformanceSha256,
      observedAt,
      D2_ENVIRONMENT,
      observedAt,
      ['user'],
      [...EVENT_NAMES],
    ],
  );
  return exactInteger(
    result.rows[0].id,
    'tandem_identity_d2_adapter_id_invalid',
  );
}

async function readCounts(client: PoolClient): Promise<CountRow> {
  const result = await client.query<CountRow>(
    `SELECT
       (SELECT count(*) FROM business_v2.student_lifecycle_events)::text AS source_rows,
       (SELECT count(*) FROM business_v2.student_lifecycle_events
         WHERE heartbeat_user_id IS NULL)::text AS source_rows_without_user,
       (SELECT count(*) FROM business_v2.student_lifecycle_events
         WHERE party_id IS NOT NULL)::text AS source_party_linked_rows,
       (SELECT count(DISTINCT heartbeat_user_id)
          FROM business_v2.student_lifecycle_events
         WHERE heartbeat_user_id IS NOT NULL)::text AS distinct_source_users,
       (SELECT count(*) FROM business_v2.identity_event_receipts r
          JOIN business_v2.party_context_adapter_registrations a
            ON a.id=r.adapter_registration_id
         WHERE a.adapter_key=$1 AND r.provider=$2 AND r.environment=$3
           AND r.source_scope=$4)::text AS mirrored_receipts,
       (SELECT count(*) FROM business_v2.party_context_observations
         WHERE adapter_key=$1 AND adapter_version=$5
           AND conflict_state='held')::text AS held_observations,
       (SELECT count(*) FROM business_v2.identity_candidates
         WHERE provider=$2 AND environment=$3 AND source_scope=$4
           AND candidate_version=1 AND status='open')::text AS open_candidates,
       (SELECT count(*) FROM business_v2.identity_resolution_decisions
         WHERE provider=$2 AND environment=$3 AND source_scope=$4
           AND result LIKE 'resolved_%')::text AS accepted_facts,
       (SELECT count(*) FROM business_v2.provider_projection_attempts)::text
         AS provider_attempts,
       (SELECT count(*) FROM business_v2.parties)::text AS party_count,
       (SELECT count(*) FROM business_v2.party_external_refs)::text
         AS external_ref_count`,
    [D2_ADAPTER_KEY, D2_PROVIDER, D2_ENVIRONMENT, D2_SCOPE, D2_ADAPTER_VERSION],
  );
  return result.rows[0];
}

function healthFromCounts(
  counts: CountRow,
  observedAt: string,
): TandemIdentityD2Health {
  const sourceRows = exactInteger(
    counts.source_rows,
    'd2_source_count_invalid',
  );
  const mirroredReceipts = exactInteger(
    counts.mirrored_receipts,
    'd2_receipt_count_invalid',
  );
  const unmirroredRows = Math.max(0, sourceRows - mirroredReceipts);
  const sourceRowsWithoutUser = exactInteger(
    counts.source_rows_without_user,
    'd2_without_user_count_invalid',
  );
  const mirrorableUnmirrored = Math.max(
    0,
    unmirroredRows - sourceRowsWithoutUser,
  );
  const catchingUp = mirrorableUnmirrored > 0;
  const reason =
    sourceRowsWithoutUser > 0
      ? 'unsupported_source_subject'
      : catchingUp
        ? 'catch_up_pending'
        : 'provider_authenticity_unreconciled';
  return {
    enabled: true,
    valid: true,
    mode: 'student_lifecycle_ledger_shadow',
    status: catchingUp ? 'catching_up' : 'blocked',
    reason,
    lastRunAt: observedAt,
    lastSuccessAt: observedAt,
    sourceRows,
    sourceRowsWithoutUser,
    sourcePartyLinkedRows: exactInteger(
      counts.source_party_linked_rows,
      'd2_party_link_count_invalid',
    ),
    distinctSourceUsers: exactInteger(
      counts.distinct_source_users,
      'd2_user_count_invalid',
    ),
    mirroredReceipts,
    heldObservations: exactInteger(
      counts.held_observations,
      'd2_observation_count_invalid',
    ),
    openCandidates: exactInteger(
      counts.open_candidates,
      'd2_candidate_count_invalid',
    ),
    unmirroredRows,
    acceptedFacts: 0,
    providerAttempts: 0,
    partyWrites: 0,
    externalReferenceWrites: 0,
    accessWrites: 0,
    providerWrites: 0,
    errorCode: null,
  };
}

async function mirrorRow(
  client: PoolClient,
  adapterRegistrationId: number,
  row: SourceRow,
  receivedAt: string,
): Promise<{
  receiptInserted: boolean;
  observationInserted: boolean;
  candidateInserted: boolean;
}> {
  validateSourceRow(row);
  const receipt = await client.query<ReceiptRow>(
    `SELECT stored_receipt_id::text,inserted
       FROM business_v2.fn_tandem_identity_store_event_receipt(
         $1,$2,$3,$4,'user',$5,$6,$7,$8,$9,NULL,'unverified_hint',
         'hmac_relay_provider_unreconciled','held',1,'student-lifecycle-v1',
         $10::timestamptz,$11::timestamptz,$12,1
       )`,
    [
      adapterRegistrationId,
      D2_PROVIDER,
      D2_ENVIRONMENT,
      D2_SCOPE,
      row.heartbeat_user_id,
      row.event_name,
      row.source_event_key,
      deduplicationKey(row.source_event_key),
      row.payload_sha256,
      row.observed_at.toISOString(),
      receivedAt,
      sha256Json('student-lifecycle-hmac-relay'),
    ],
  );
  const receiptId = exactInteger(
    receipt.rows[0].stored_receipt_id,
    'tandem_identity_d2_receipt_id_invalid',
  );

  const relatedRefs = [
    ['group', row.heartbeat_group_id],
    ['course', row.heartbeat_course_id],
    ['cohort', row.heartbeat_cohort_id],
  ].filter((entry): entry is [string, string] => entry[1] != null);
  for (const [index, [entityType, externalId]] of relatedRefs.entries()) {
    await client.query(
      `INSERT INTO business_v2.identity_event_related_refs
         (receipt_id,ref_index,provider,environment,source_scope,entity_type,external_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING`,
      [
        receiptId,
        index,
        D2_PROVIDER,
        D2_ENVIRONMENT,
        D2_SCOPE,
        entityType,
        externalId,
      ],
    );
  }

  const fingerprint = candidateFingerprint(row.heartbeat_user_id);
  const candidate = await client.query(
    `INSERT INTO business_v2.identity_candidates
       (subject_sha256,provider,environment,source_scope,entity_type,
        external_id_sha256,candidate_version,status,creation_basis,
        party_materialization_allowed,evidence_sha256,first_seen_at,
        last_observed_at,retention_policy_version)
     SELECT $1,$2,$3,$4,'user',$1,1,'open','none',false,$5,
            $6::timestamptz,$6::timestamptz,1
      WHERE NOT EXISTS (
        SELECT 1 FROM business_v2.identity_candidates
         WHERE provider=$2 AND environment=$3 AND source_scope=$4
           AND entity_type='user' AND external_id_sha256=$1
      )
     RETURNING id`,
    [
      fingerprint,
      D2_PROVIDER,
      D2_ENVIRONMENT,
      D2_SCOPE,
      row.payload_sha256,
      row.observed_at.toISOString(),
    ],
  );

  const value = {
    sourceAction: row.event_name,
    providerAuthenticity: row.provider_authenticity,
    mappingStatus: row.mapping_status,
    processingStatus: row.processing_status,
    currentPartyLinkPresent: row.party_id != null,
    catalogLinkPresent: row.catalog_entry_id != null,
  };
  const observation = await client.query(
    `INSERT INTO business_v2.party_context_observations
       (schema_version,adapter_key,adapter_version,source_system,source_scope,
        source_fact_key,fact_type,fact_schema_version,original_party_id,
        current_party_id,related_party_ids,value,value_sha256,source_record_type,
        source_record_id,source_event_id,effective_at,observed_at,verified_at,
        fresh_until,confidence,conflict_state,privacy_class)
     VALUES (1,$1,$2,$3,$4,$5,$6,1,NULL,NULL,'{}'::bigint[],$7::jsonb,$8,
       'student_lifecycle_event',$9,$10,$11::timestamptz,$11::timestamptz,
       NULL,NULL,'unknown','held','restricted_identifier')
     ON CONFLICT (source_system,source_scope,source_fact_key) DO NOTHING
     RETURNING id`,
    [
      D2_ADAPTER_KEY,
      D2_ADAPTER_VERSION,
      D2_PROVIDER,
      D2_SCOPE,
      sourceFactKey(row.source_event_key),
      D2_FACT_TYPE,
      JSON.stringify(value),
      sha256Json(value),
      row.event_uuid,
      row.source_event_key,
      row.observed_at.toISOString(),
    ],
  );
  return {
    receiptInserted: receipt.rows[0].inserted,
    observationInserted: observation.rowCount === 1,
    candidateInserted: candidate.rowCount === 1,
  };
}

export async function runTandemIdentityD2ShadowWithClient(input: {
  client: PoolClient;
  batchLimit: number;
  observedAt: string;
}): Promise<TandemIdentityD2RunResult> {
  const lock = await input.client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(
       hashtext('tandem_identity_d2_student_lifecycle_shadow')
     ) AS acquired`,
  );
  if (!lock.rows[0].acquired) {
    return {
      outcome: 'busy',
      scanned: 0,
      receiptsInserted: 0,
      receiptsDuplicate: 0,
      observationsInserted: 0,
      candidatesInserted: 0,
      health: getTandemIdentityD2Health(),
    };
  }

  const before = await readCounts(input.client);
  const beforePartyCount = before.party_count;
  const beforeExternalRefCount = before.external_ref_count;
  const adapterRegistrationId = await registerAdapter(
    input.client,
    input.observedAt,
  );
  const source = await input.client.query<SourceRow>(
    `SELECT e.id::text,e.event_uuid::text,e.source_event_key,e.event_name,
            e.observed_at,e.heartbeat_user_id::text,
            e.heartbeat_group_id::text,e.heartbeat_course_id::text,
            e.heartbeat_cohort_id::text,e.party_id::text,
            e.catalog_entry_id::text,e.payload_sha256,e.relay_authenticity,
            e.provider_authenticity,e.mapping_status,e.processing_status
       FROM business_v2.student_lifecycle_events e
      WHERE e.heartbeat_user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM business_v2.identity_event_receipts r
           WHERE r.provider=$1 AND r.environment=$2 AND r.source_scope=$3
             AND r.deduplication_key =
               'student-lifecycle:' || business_v2.fn_tandem_identity_sha256(
                 to_jsonb(e.source_event_key)::text
               )
        )
      ORDER BY e.id
      LIMIT $4
      FOR SHARE OF e`,
    [D2_PROVIDER, D2_ENVIRONMENT, D2_SCOPE, input.batchLimit],
  );

  let receiptsInserted = 0;
  let receiptsDuplicate = 0;
  let observationsInserted = 0;
  let candidatesInserted = 0;
  for (const row of source.rows) {
    const result = await mirrorRow(
      input.client,
      adapterRegistrationId,
      row,
      input.observedAt,
    );
    receiptsInserted += Number(result.receiptInserted);
    receiptsDuplicate += Number(!result.receiptInserted);
    observationsInserted += Number(result.observationInserted);
    candidatesInserted += Number(result.candidateInserted);
  }

  const after = await readCounts(input.client);
  if (
    after.party_count !== beforePartyCount ||
    after.external_ref_count !== beforeExternalRefCount ||
    exactInteger(after.accepted_facts, 'd2_accepted_fact_count_invalid') !==
      0 ||
    exactInteger(after.provider_attempts, 'd2_attempt_count_invalid') !== 0
  ) {
    throw new Error('tandem_identity_d2_forbidden_side_effect');
  }
  const health = healthFromCounts(after, input.observedAt);
  return {
    outcome:
      health.unmirroredRows === 0
        ? 'caught_up'
        : source.rows.length > 0
          ? 'batch_applied'
          : 'caught_up',
    scanned: source.rows.length,
    receiptsInserted,
    receiptsDuplicate,
    observationsInserted,
    candidatesInserted,
    health,
  };
}

export async function runTandemIdentityD2Shadow(
  config = resolveTandemIdentityD2Config(),
): Promise<TandemIdentityD2RunResult | null> {
  if (!config.enabled || !config.valid) {
    currentHealth = {
      ...baseHealth(),
      enabled: config.enabled,
      valid: config.valid,
      status: 'disabled',
      reason: config.reason,
      errorCode: config.valid ? null : 'invalid_configuration',
    };
    return null;
  }
  const observedAt = new Date().toISOString();
  try {
    const result = await withAgentContext(
      'tandem_identity_d2_shadow',
      async (client) =>
        runTandemIdentityD2ShadowWithClient({
          client,
          batchLimit: config.batchLimit,
          observedAt,
        }),
    );
    if (result.outcome !== 'busy') currentHealth = result.health;
    logger.info(
      {
        outcome: result.outcome,
        scanned: result.scanned,
        receiptsInserted: result.receiptsInserted,
        observationsInserted: result.observationsInserted,
        candidatesInserted: result.candidatesInserted,
        state: result.health.status,
        reason: result.health.reason,
        unmirroredRows: result.health.unmirroredRows,
      },
      'tandem identity D2 shadow complete',
    );
    return result;
  } catch (error) {
    currentHealth = {
      ...currentHealth,
      enabled: true,
      valid: true,
      status: 'error',
      reason: 'run_failed',
      lastRunAt: observedAt,
      errorCode:
        error instanceof Error &&
        /^tandem_identity_d2_[a-z0-9_]+$/.test(error.message)
          ? error.message
          : 'tandem_identity_d2_unexpected_error',
    };
    throw error;
  }
}
