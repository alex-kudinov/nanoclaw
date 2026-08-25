import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  type AdapterHealthReceipt,
  type AdapterManifestV1,
  type FactCatalogEntry,
  type ObservationBatch,
  type PersonEnrichmentAdapterV1,
  RelationshipContextContractError,
  sha256Json,
} from './relationship-context-contract.js';
import { logger } from './logger.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import {
  PostgresRelationshipContextRepository,
  type RelationshipContextRepository,
} from './relationship-context-store.js';
import { ingestRelationshipContextBatch } from './relationship-context.js';

export const TRAFFT_SHADOW_ADAPTER_KEY = 'trafft_host_ledger';
export const TRAFFT_SHADOW_ADAPTER_VERSION = '1.0.0';
export const TRAFFT_SHADOW_SCOPE = 'primary';
export const TRAFFT_SHADOW_FACT_TYPE = 'appointments.trafft.lifecycle@1';
export const TRAFFT_SHADOW_INTERVAL_MS = 15 * 60 * 1000;
export const TRAFFT_SHADOW_MAX_ROWS = 5_000;

const manifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: TRAFFT_SHADOW_ADAPTER_KEY,
  adapterVersion: TRAFFT_SHADOW_ADAPTER_VERSION,
  sourceSystem: 'trafft',
  supportedScopes: [TRAFFT_SHADOW_SCOPE],
  externalReferenceTypes: ['appointment'],
  factTypes: [TRAFFT_SHADOW_FACT_TYPE],
  identityClaimTypes: ['provider_user_id'],
  collectionModes: ['reconciliation'],
  projectionTargets: ['appointments'],
  privacyClasses: ['internal'],
  credentialHandle: null,
  healthPolicy: 'host_ledger_shadow',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

export const TRAFFT_SHADOW_FACT_CATALOG: FactCatalogEntry = {
  factType: TRAFFT_SHADOW_FACT_TYPE,
  schemaVersion: 1,
  projectionTarget: 'appointments',
  privacyClass: 'internal',
  maxAgeSeconds: 86_400,
  cardinality: 'many',
  authorityClass: 'candidate',
};

export interface TrafftShadowInteractionRow {
  id: string;
  appointmentId: string;
  eventType: string | null;
  status: string | null;
  service: string | null;
  occurredAt: string;
  updatedAt: string;
}

export interface TrafftShadowHealth {
  enabled: boolean;
  mode: 'host_ledger_read_only';
  identityMode: 'exact_reference_hold';
  consumerEnabled: false;
  status: 'disabled' | 'never_run' | 'healthy' | 'degraded';
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  complete: boolean;
  scanned: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
  heldIdentityFacts: number;
  errorCode: string | null;
}

const baseHealth = (): TrafftShadowHealth => ({
  enabled: false,
  mode: 'host_ledger_read_only',
  identityMode: 'exact_reference_hold',
  consumerEnabled: false,
  status: 'disabled',
  lastRunAt: null,
  lastSuccessAt: null,
  complete: false,
  scanned: 0,
  observationsNew: 0,
  observationsDuplicate: 0,
  projectionsChanged: 0,
  heldIdentityFacts: 0,
  errorCode: null,
});

let currentHealth = baseHealth();

export function trafftRelationshipContextShadowEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED === '1';
}

export function getTrafftRelationshipContextShadowHealth(): TrafftShadowHealth {
  return structuredClone(currentHealth);
}

export function resetTrafftRelationshipContextShadowHealthForTests(): void {
  currentHealth = baseHealth();
}

export function trafftShadowCollectionComplete(
  rowCount: number,
  limit: number,
): boolean {
  return rowCount < limit;
}

function boundedText(value: string | null, max = 500): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function normalizeInstant(value: string, code: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RelationshipContextContractError(code);
  }
  return new Date(parsed).toISOString();
}

export function normalizeTrafftShadowRow(
  row: TrafftShadowInteractionRow,
): ObservationBatch['facts'][number] {
  if (!row.id || !row.appointmentId) {
    throw new RelationshipContextContractError(
      'relationship_context_trafft_row_invalid',
    );
  }
  const occurredAt = normalizeInstant(
    row.occurredAt,
    'relationship_context_trafft_occurred_at_invalid',
  );
  const updatedAt = normalizeInstant(
    row.updatedAt,
    'relationship_context_trafft_updated_at_invalid',
  );
  const value = {
    appointment_id: row.appointmentId,
    event_type: boundedText(row.eventType, 100),
    status: boundedText(row.status, 100),
    service: boundedText(row.service, 300),
    starts_at: occurredAt,
    identity_state: 'needs_identity',
  };
  return {
    factType: TRAFFT_SHADOW_FACT_TYPE,
    sourceFactKey: `${row.id}:${sha256Json({ updatedAt, value }).slice(0, 32)}`,
    subject: {
      provider: 'trafft',
      scope: TRAFFT_SHADOW_SCOPE,
      entityType: 'appointment',
      externalId: row.appointmentId,
    },
    value,
    sourceSystem: 'trafft',
    sourceScope: TRAFFT_SHADOW_SCOPE,
    sourceRecordType: 'appointment',
    sourceRecordId: row.appointmentId,
    sourceEventId: `${row.appointmentId}:${value.event_type ?? 'unknown'}`,
    effectiveAt: occurredAt,
    observedAt: updatedAt,
    verifiedAt: null,
    freshUntil: new Date(Date.parse(updatedAt) + 86_400_000).toISOString(),
    confidence: 'provider_asserted',
    conflictState: 'held',
    privacyClass: 'internal',
    factSchemaVersion: 1,
  };
}

export class TrafftHostLedgerAdapter implements PersonEnrichmentAdapterV1 {
  describe(): AdapterManifestV1 {
    return structuredClone(manifest);
  }

  validateConfig(config: unknown): { ok: true } | { ok: false; code: string } {
    if (config == null) return { ok: true };
    if (
      typeof config === 'object' &&
      !Array.isArray(config) &&
      Object.keys(config as Record<string, unknown>).length === 0
    ) {
      return { ok: true };
    }
    return { ok: false, code: 'trafft_host_ledger_config_must_be_empty' };
  }

  health(): AdapterHealthReceipt {
    const health = getTrafftRelationshipContextShadowHealth();
    return {
      adapterKey: TRAFFT_SHADOW_ADAPTER_KEY,
      sourceScope: TRAFFT_SHADOW_SCOPE,
      status:
        health.status === 'degraded'
          ? 'degraded'
          : health.status === 'healthy'
            ? 'healthy'
            : 'open_circuit',
      observedAt: health.lastRunAt ?? new Date(0).toISOString(),
      errorCode: health.errorCode,
    };
  }
}

function registry(): RelationshipContextRegistry {
  const value = new RelationshipContextRegistry();
  value.registerFact(TRAFFT_SHADOW_FACT_CATALOG);
  value.registerAdapter(new TrafftHostLedgerAdapter());
  value.markConformance(TRAFFT_SHADOW_ADAPTER_KEY, 'passed');
  return value;
}

export async function ingestTrafftShadowRows(input: {
  repository: RelationshipContextRepository;
  rows: TrafftShadowInteractionRow[];
  complete?: boolean;
}): Promise<{
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
  heldIdentityFacts: number;
}> {
  const adapterRegistry = registry();
  const sorted = [...input.rows].sort((a, b) =>
    `${a.updatedAt}:${a.id}`.localeCompare(`${b.updatedAt}:${b.id}`),
  );
  const total = {
    observationsNew: 0,
    observationsDuplicate: 0,
    projectionsChanged: 0,
    heldIdentityFacts: 0,
  };
  for (let index = 0; index < sorted.length; index += 200) {
    const rows = sorted.slice(index, index + 200);
    const facts = rows.map(normalizeTrafftShadowRow);
    const result = await ingestRelationshipContextBatch({
      repository: input.repository,
      registry: adapterRegistry,
      batch: {
        adapterKey: TRAFFT_SHADOW_ADAPTER_KEY,
        adapterVersion: TRAFFT_SHADOW_ADAPTER_VERSION,
        sourceSystem: 'trafft',
        sourceScope: TRAFFT_SHADOW_SCOPE,
        complete: input.complete ?? true,
        watermark: rows.at(-1)?.updatedAt ?? null,
        externalReferences: facts.map(
          (fact) =>
            fact.subject as {
              provider: string;
              scope: string;
              entityType: string;
              externalId: string;
            },
        ),
        identityCandidates: [],
        facts,
        errors: [],
      },
    });
    total.observationsNew += result.observationsNew;
    total.observationsDuplicate += result.observationsDuplicate;
    total.projectionsChanged += result.projectionsChanged;
    total.heldIdentityFacts += result.heldFacts;
  }
  return total;
}

interface TrafftRow extends QueryResultRow {
  id: string;
  appointment_id: string;
  event_type: string | null;
  status: string | null;
  service: string | null;
  occurred_at: Date;
  updated_at: Date;
}

async function readRows(
  client: PoolClient,
  limit: number,
): Promise<TrafftShadowInteractionRow[]> {
  const result = await client.query<TrafftRow>(
    `SELECT i.id::text,
            i.source_id AS appointment_id,
            i.metadata->>'event_type' AS event_type,
            i.metadata->>'status' AS status,
            i.metadata->>'service' AS service,
            i.occurred_at,
            i.updated_at
       FROM business_v2.interactions i
      WHERE i.source_provider='trafft'
        AND i.source_id IS NOT NULL
      ORDER BY i.updated_at DESC, i.id DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    appointmentId: row.appointment_id,
    eventType: row.event_type,
    status: row.status,
    service: row.service,
    occurredAt: row.occurred_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

async function registerAdapter(client: PoolClient, now: string): Promise<void> {
  const adapterManifest = new TrafftHostLedgerAdapter().describe();
  const manifestSha256 = sha256Json(adapterManifest);
  const conformanceSha256 = sha256Json({
    suite: adapterManifest.conformanceSuite,
    manifest_sha256: manifestSha256,
    result: 'passed',
  });
  await client.query(
    `INSERT INTO business_v2.party_context_adapter_registrations
       (adapter_key,adapter_version,source_system,source_scope,
        manifest_version,manifest_sha256,manifest,config_declaration,
        enabled,conformance_status,conformance_receipt_sha256,
        circuit_status,failure_count,last_error_code,last_health_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,true,'passed',$9,
             'closed',0,NULL,$10::timestamptz)
     ON CONFLICT (adapter_key,adapter_version,source_scope) DO UPDATE
       SET manifest_sha256=EXCLUDED.manifest_sha256,
           manifest=EXCLUDED.manifest,
           config_declaration=EXCLUDED.config_declaration,
           enabled=true,
           conformance_status='passed',
           conformance_receipt_sha256=EXCLUDED.conformance_receipt_sha256,
           circuit_status='closed',failure_count=0,last_error_code=NULL,
           last_health_at=EXCLUDED.last_health_at,updated_at=now()`,
    [
      adapterManifest.adapterKey,
      adapterManifest.adapterVersion,
      adapterManifest.sourceSystem,
      TRAFFT_SHADOW_SCOPE,
      adapterManifest.manifestVersion,
      manifestSha256,
      JSON.stringify(adapterManifest),
      JSON.stringify({
        mode: 'host_ledger_read_only',
        raw_payload: false,
        provider_network: false,
        identity_mode: 'exact_reference_hold',
        consumer_enabled: false,
      }),
      conformanceSha256,
      now,
    ],
  );
}

export async function ingestTrafftRelationshipContextShadowWithClient(
  client: PoolClient,
  input: { limit: number; observedAt: string },
): Promise<{
  rows: TrafftShadowInteractionRow[];
  complete: boolean;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
  heldIdentityFacts: number;
}> {
  const rows = await readRows(client, input.limit);
  const complete = trafftShadowCollectionComplete(rows.length, input.limit);
  await registerAdapter(client, input.observedAt);
  const ingested = await ingestTrafftShadowRows({
    repository: new PostgresRelationshipContextRepository(client),
    rows,
    complete,
  });
  return { rows, complete, ...ingested };
}

export async function runTrafftRelationshipContextShadow(
  input: {
    env?: NodeJS.ProcessEnv;
    limit?: number;
    nowMs?: number;
  } = {},
): Promise<TrafftShadowHealth> {
  const enabled = trafftRelationshipContextShadowEnabled(input.env);
  if (!enabled) {
    currentHealth = { ...baseHealth(), enabled: false, status: 'disabled' };
    return getTrafftRelationshipContextShadowHealth();
  }
  const limit = input.limit ?? 1_000;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > TRAFFT_SHADOW_MAX_ROWS
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_trafft_limit_invalid',
    );
  }
  const runAt = new Date(input.nowMs ?? Date.now()).toISOString();
  currentHealth = {
    ...currentHealth,
    enabled: true,
    status: currentHealth.lastSuccessAt ? 'healthy' : 'never_run',
    lastRunAt: runAt,
    errorCode: null,
  };
  try {
    const result = await withAgentContext(
      'relationship-context-trafft-shadow',
      (client) =>
        ingestTrafftRelationshipContextShadowWithClient(client, {
          limit,
          observedAt: runAt,
        }),
    );
    currentHealth = {
      enabled: true,
      mode: 'host_ledger_read_only',
      identityMode: 'exact_reference_hold',
      consumerEnabled: false,
      status: 'healthy',
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      complete: result.complete,
      scanned: result.rows.length,
      observationsNew: result.observationsNew,
      observationsDuplicate: result.observationsDuplicate,
      projectionsChanged: result.projectionsChanged,
      heldIdentityFacts: result.heldIdentityFacts,
      errorCode: result.complete ? null : 'trafft_shadow_limit_reached',
    };
    if (!result.complete) currentHealth.status = 'degraded';
    logger.info(currentHealth, 'relationship context Trafft shadow complete');
    return getTrafftRelationshipContextShadowHealth();
  } catch (error) {
    const code =
      error instanceof RelationshipContextContractError
        ? error.code
        : 'relationship_context_trafft_shadow_failed';
    currentHealth = {
      ...currentHealth,
      enabled: true,
      status: 'degraded',
      lastRunAt: runAt,
      errorCode: code,
    };
    logger.error(
      { err: error, code },
      'relationship context Trafft shadow failed',
    );
    throw error;
  }
}
