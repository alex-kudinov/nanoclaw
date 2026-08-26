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
  bindExternalRefOrRecordConflict,
  reconcilePlutioReferencesWithClient,
} from './relationship-context-provider-reconciliation.js';
import {
  PostgresRelationshipContextRepository,
  identityExceptionFingerprint,
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
  externalReferenceTypes: ['appointment', 'customer'],
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
  exactCustomerReferences: number;
  exactAppointmentReferences: number;
  exactPlutioReferences: number;
  corroboratedCustomerReferences: number;
  legacyCustomerReferences: number;
  legacyAppointmentReferences: number;
  plutioReferenceConflicts: number;
  exactReferenceConflicts: number;
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
  exactCustomerReferences: 0,
  exactAppointmentReferences: 0,
  exactPlutioReferences: 0,
  corroboratedCustomerReferences: 0,
  legacyCustomerReferences: 0,
  legacyAppointmentReferences: 0,
  plutioReferenceConflicts: 0,
  exactReferenceConflicts: 0,
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
  exactIdentity = false,
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
    identity_state: exactIdentity ? 'exact_reference' : 'needs_identity',
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
    conflictState: exactIdentity ? 'none' : 'held',
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
    const facts: ObservationBatch['facts'] = [];
    for (const row of rows) {
      const exactParty = await input.repository.resolveExternalRef({
        provider: 'trafft',
        scope: TRAFFT_SHADOW_SCOPE,
        entityType: 'appointment',
        externalId: row.appointmentId,
      });
      facts.push(normalizeTrafftShadowRow(row, exactParty != null));
    }
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

interface ExactRefCandidate extends QueryResultRow {
  external_id: string;
  party_id: string;
  first_seen_at: Date;
  last_seen_at: Date;
  evidence_tier: string;
  existing_party_id: string | null;
}

interface ExactAppointmentCandidate extends ExactRefCandidate {
  binding_safe: boolean;
}

async function reconcileSafeTrafftReferences(input: {
  client: PoolClient;
  repository: RelationshipContextRepository;
  observedAt: string;
}): Promise<{
  exactCustomerReferences: number;
  exactAppointmentReferences: number;
  corroboratedCustomerReferences: number;
  exactReferenceConflicts: number;
}> {
  const customerResult = await input.client.query<ExactRefCandidate>(
    `WITH adapter_cutoff AS (
       SELECT min(created_at) AS cutoff_at
         FROM business_v2.party_context_adapter_registrations
        WHERE adapter_key=$1
     ), source_rows AS (
       SELECT coalesce(
                i.metadata->'raw_payload'->>'customerId',
                i.metadata->>'trafft_customer_id'
              ) AS customer_id,
              business_v2.canonical_party_id(i.party_id) AS party_id,
              i.created_at AS interaction_created_at,
              p.created_at AS party_created_at,
              p.source_provider
         FROM business_v2.interactions i
         JOIN business_v2.parties p
           ON p.id=business_v2.canonical_party_id(i.party_id)
        WHERE i.source_provider='trafft'
          AND i.party_id IS NOT NULL
     ), party_initial_customer_counts AS (
       SELECT party_id,count(DISTINCT customer_id) AS initial_customer_count
         FROM source_rows
        WHERE customer_id IS NOT NULL
          AND interaction_created_at >= party_created_at
          AND interaction_created_at <= party_created_at + interval '5 minutes'
        GROUP BY party_id
     ), corroborated_parties AS (
       SELECT party_id,
              bool_or(provider='plutio') AS has_plutio,
              bool_or(provider='encharge') AS has_encharge
         FROM business_v2.party_external_refs
        WHERE provider IN ('plutio','encharge')
          AND source_scope=$2 AND entity_type='person'
          AND status='active' AND verified_at IS NOT NULL
        GROUP BY party_id
     ), candidates AS (
       SELECT customer_id,
              min(party_id) AS party_id,
              count(DISTINCT party_id) AS party_count,
              min(interaction_created_at) AS first_seen_at,
              max(interaction_created_at) AS last_seen_at,
              min(party_created_at) AS party_created_at,
              bool_and(source_provider='trafft') AS source_created
         FROM source_rows
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
     )
     SELECT c.customer_id AS external_id,c.party_id::text,
            c.first_seen_at,c.last_seen_at,
            CASE
              WHEN c.source_created
               AND c.party_created_at >= a.cutoff_at
               AND c.first_seen_at >= c.party_created_at
               AND c.first_seen_at <= c.party_created_at + interval '5 minutes'
               AND pic.initial_customer_count=1
                THEN 'trafft_source_created_party_v1'
              WHEN cp.has_plutio THEN 'trafft_unique_party_plutio_ref_v1'
              WHEN cp.has_encharge THEN 'trafft_unique_party_encharge_ref_v1'
            END AS evidence_tier,
            business_v2.canonical_party_id(er.party_id)::text
              AS existing_party_id
       FROM candidates c
       LEFT JOIN party_initial_customer_counts pic ON pic.party_id=c.party_id
       LEFT JOIN corroborated_parties cp ON cp.party_id=c.party_id
       LEFT JOIN business_v2.party_external_refs er
         ON er.provider='trafft' AND er.source_scope=$2
        AND er.entity_type='customer' AND er.external_id=c.customer_id
        AND er.status='active'
       CROSS JOIN adapter_cutoff a
      WHERE a.cutoff_at IS NOT NULL
        AND c.party_count=1
        AND (
          (c.source_created
           AND c.party_created_at >= a.cutoff_at
           AND c.first_seen_at >= c.party_created_at
           AND c.first_seen_at <= c.party_created_at + interval '5 minutes'
           AND pic.initial_customer_count=1)
          OR cp.party_id IS NOT NULL
        )
      ORDER BY c.customer_id`,
    [TRAFFT_SHADOW_ADAPTER_KEY, TRAFFT_SHADOW_SCOPE],
  );
  let customerBindConflicts = 0;
  let corroboratedBindConflicts = 0;
  for (const candidate of customerResult.rows) {
    if (Number(candidate.existing_party_id) === Number(candidate.party_id)) {
      continue;
    }
    const bound = await bindExternalRefOrRecordConflict({
      repository: input.repository,
      partyId: Number(candidate.party_id),
      reference: {
        provider: 'trafft',
        scope: TRAFFT_SHADOW_SCOPE,
        entityType: 'customer',
        externalId: candidate.external_id,
      },
      adapterKey: TRAFFT_SHADOW_ADAPTER_KEY,
      adapterVersion: TRAFFT_SHADOW_ADAPTER_VERSION,
      observedAt: candidate.last_seen_at.toISOString(),
      verifiedAt:
        candidate.evidence_tier === 'trafft_source_created_party_v1'
          ? candidate.first_seen_at.toISOString()
          : input.observedAt,
      receiptSha256: sha256Json({
        rule: candidate.evidence_tier,
        decision:
          'decision:relationship-context-best-effort-identity-reconciliation-2026-08-26',
        customer_id: candidate.external_id,
        party_id: candidate.party_id,
        first_seen_at: candidate.first_seen_at.toISOString(),
      }),
      evidenceTier: candidate.evidence_tier,
    });
    if (!bound) {
      customerBindConflicts += 1;
      if (candidate.evidence_tier !== 'trafft_source_created_party_v1') {
        corroboratedBindConflicts += 1;
      }
    }
  }

  const appointmentResult = await input.client.query<ExactAppointmentCandidate>(
    `WITH source_rows AS (
       SELECT i.source_id AS appointment_id,
              coalesce(
                i.metadata->'raw_payload'->>'customerId',
                i.metadata->>'trafft_customer_id'
              ) AS customer_id,
              min(business_v2.canonical_party_id(i.party_id)) AS legacy_party_id,
              count(DISTINCT business_v2.canonical_party_id(i.party_id))
                AS legacy_party_count,
              min(i.created_at) AS first_seen_at,
              max(i.created_at) AS last_seen_at
         FROM business_v2.interactions i
        WHERE i.source_provider='trafft'
          AND i.source_id IS NOT NULL
        GROUP BY i.source_id,
                 coalesce(
                   i.metadata->'raw_payload'->>'customerId',
                   i.metadata->>'trafft_customer_id'
                 )
     )
     SELECT s.appointment_id AS external_id,r.party_id::text,
            s.first_seen_at,s.last_seen_at,
            (s.legacy_party_count=1 AND s.legacy_party_id=r.party_id)
              AS binding_safe,
            'trafft_exact_customer_appointment_v1' AS evidence_tier,
            business_v2.canonical_party_id(ar.party_id)::text
              AS existing_party_id
       FROM source_rows s
       JOIN business_v2.party_external_refs r
         ON r.provider='trafft'
        AND r.source_scope=$1
        AND r.entity_type='customer'
        AND r.external_id=s.customer_id
        AND r.status='active'
       LEFT JOIN business_v2.party_external_refs ar
         ON ar.provider='trafft' AND ar.source_scope=$1
        AND ar.entity_type='appointment' AND ar.external_id=s.appointment_id
        AND ar.status='active'
      ORDER BY s.appointment_id`,
    [TRAFFT_SHADOW_SCOPE],
  );
  let appointmentBindConflicts = 0;
  for (const candidate of appointmentResult.rows) {
    if (!candidate.binding_safe) continue;
    if (Number(candidate.existing_party_id) === Number(candidate.party_id)) {
      continue;
    }
    const bound = await bindExternalRefOrRecordConflict({
      repository: input.repository,
      partyId: Number(candidate.party_id),
      reference: {
        provider: 'trafft',
        scope: TRAFFT_SHADOW_SCOPE,
        entityType: 'appointment',
        externalId: candidate.external_id,
      },
      adapterKey: TRAFFT_SHADOW_ADAPTER_KEY,
      adapterVersion: TRAFFT_SHADOW_ADAPTER_VERSION,
      observedAt: candidate.last_seen_at.toISOString(),
      verifiedAt: candidate.first_seen_at.toISOString(),
      receiptSha256: sha256Json({
        rule: 'trafft_exact_customer_appointment_v1',
        appointment_id: candidate.external_id,
        party_id: candidate.party_id,
        first_seen_at: candidate.first_seen_at.toISOString(),
      }),
      evidenceTier: 'trafft_exact_customer_appointment_v1',
    });
    if (!bound) appointmentBindConflicts += 1;
  }
  const exactCounts = await input.client.query<{
    entity_type: string;
    count: string;
  }>(
    `SELECT entity_type,count(*)::text AS count
       FROM business_v2.party_external_refs
      WHERE provider='trafft' AND source_scope=$1 AND status='active'
        AND entity_type IN ('customer','appointment')
      GROUP BY entity_type`,
    [TRAFFT_SHADOW_SCOPE],
  );
  const countByType = new Map(
    exactCounts.rows.map((row) => [row.entity_type, Number(row.count)]),
  );
  return {
    exactCustomerReferences: countByType.get('customer') ?? 0,
    exactAppointmentReferences: countByType.get('appointment') ?? 0,
    corroboratedCustomerReferences:
      customerResult.rows.filter(
        (candidate) =>
          candidate.evidence_tier !== 'trafft_source_created_party_v1',
      ).length - corroboratedBindConflicts,
    exactReferenceConflicts:
      customerBindConflicts +
      appointmentBindConflicts +
      appointmentResult.rows.filter((candidate) => !candidate.binding_safe)
        .length,
  };
}

interface TrafftIdentityClassificationRow extends QueryResultRow {
  customer_ids: string[];
  appointment_id: string;
  party_ids: string[];
  exact_party_id: string | null;
}

async function classifyTrafftIdentityWithClient(input: {
  client: PoolClient;
  observedAt: string;
}): Promise<{
  legacyCustomerReferences: number;
  legacyAppointmentReferences: number;
}> {
  const result = await input.client.query<TrafftIdentityClassificationRow>(
    `WITH source_rows AS (
       SELECT i.source_id AS appointment_id,
              array_remove(array_agg(DISTINCT coalesce(
                i.metadata->'raw_payload'->>'customerId',
                i.metadata->>'trafft_customer_id'
              )),NULL) AS customer_ids,
              array_remove(array_agg(DISTINCT
                business_v2.canonical_party_id(i.party_id)),NULL) AS party_ids
         FROM business_v2.interactions i
        WHERE i.source_provider='trafft' AND i.source_id IS NOT NULL
        GROUP BY i.source_id
     )
     SELECT s.customer_ids,s.appointment_id,s.party_ids,
            r.party_id::text AS exact_party_id
       FROM source_rows s
       LEFT JOIN business_v2.party_external_refs r
         ON r.provider='trafft' AND r.source_scope=$1
        AND r.entity_type='appointment' AND r.external_id=s.appointment_id
        AND r.status='active'
      ORDER BY s.appointment_id`,
    [TRAFFT_SHADOW_SCOPE],
  );
  const legacyCustomers = new Set<string>();
  let legacyAppointments = 0;
  for (const row of result.rows) {
    const reference = {
      provider: 'trafft',
      scope: TRAFFT_SHADOW_SCOPE,
      entityType: 'appointment',
      externalId: row.appointment_id,
    };
    const fingerprint = identityExceptionFingerprint({
      sourceSystem: 'trafft',
      sourceScope: TRAFFT_SHADOW_SCOPE,
      sourceRef: reference,
      reasonCode: 'needs_identity',
      partyIds: [],
    });
    const partyIds = row.party_ids.map(Number).sort((a, b) => a - b);
    const exactPartyId =
      row.exact_party_id == null ? null : Number(row.exact_party_id);
    const resolved =
      exactPartyId != null &&
      row.customer_ids.length === 1 &&
      partyIds.length === 1 &&
      partyIds[0] === exactPartyId;
    const classificationReason = resolved
      ? 'exact_reference_bound'
      : row.customer_ids.length === 0
        ? 'missing_customer_id'
        : row.customer_ids.length > 1
          ? 'customer_id_conflict'
          : partyIds.length !== 1
            ? 'party_count_conflict'
            : exactPartyId != null
              ? 'exact_ref_source_conflict'
              : 'uncorroborated_unique_historical_party';
    if (!resolved) {
      for (const customerId of row.customer_ids) {
        legacyCustomers.add(customerId);
      }
      legacyAppointments += 1;
      await new PostgresRelationshipContextRepository(
        input.client,
      ).ensureIdentityException({
        fingerprint,
        partyIds: [],
        reasonCode: 'needs_identity',
        evidenceRefs: {
          source_ref_sha256: sha256Json(reference),
          candidate_count: 0,
        },
        observedAt: input.observedAt,
      });
    }
    const update = await input.client.query(
      `UPDATE business_v2.party_identity_exceptions
          SET current_party_id=CASE WHEN $2::boolean THEN $3::bigint ELSE NULL END,
              candidate_party_ids=$4::bigint[],
              reason_code=CASE WHEN $2::boolean
                           THEN 'exact_reference_bound' ELSE 'legacy_identity' END,
              status=CASE WHEN $2::boolean THEN 'resolved' ELSE 'no_action' END,
              evidence_refs=evidence_refs || $5::jsonb,
              resolution_code=CASE WHEN $2::boolean
                              THEN 'exact_reference_bound'
                              ELSE 'legacy_unresolved' END,
              resolution_receipt_sha256=$6,
              resolved_at=$7::timestamptz,updated_at=now()
        WHERE fingerprint=$1`,
      [
        fingerprint,
        resolved,
        exactPartyId,
        resolved ? [exactPartyId] : partyIds.slice(0, 20),
        JSON.stringify({
          classification: resolved ? 'exact' : 'legacy',
          evidence_tier: classificationReason,
          customer_id_count: row.customer_ids.length,
          party_count: partyIds.length,
          decision:
            'decision:relationship-context-best-effort-identity-reconciliation-2026-08-26',
        }),
        sha256Json({
          classification: resolved ? 'exact' : 'legacy',
          appointment_id: row.appointment_id,
          party_ids: partyIds,
          observed_at: input.observedAt,
        }),
        input.observedAt,
      ],
    );
    if (!resolved && update.rowCount !== 1) {
      throw new Error('relationship_context_legacy_classification_failed');
    }
  }
  return {
    legacyCustomerReferences: legacyCustomers.size,
    legacyAppointmentReferences: legacyAppointments,
  };
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
  exactCustomerReferences: number;
  exactAppointmentReferences: number;
  exactPlutioReferences: number;
  corroboratedCustomerReferences: number;
  legacyCustomerReferences: number;
  legacyAppointmentReferences: number;
  plutioReferenceConflicts: number;
  exactReferenceConflicts: number;
}> {
  const rows = await readRows(client, input.limit);
  const complete = trafftShadowCollectionComplete(rows.length, input.limit);
  await registerAdapter(client, input.observedAt);
  const plutioReferences = await reconcilePlutioReferencesWithClient({
    client,
    observedAt: input.observedAt,
  });
  const exactReferences = await reconcileSafeTrafftReferences({
    client,
    repository: new PostgresRelationshipContextRepository(client),
    observedAt: input.observedAt,
  });
  const ingested = await ingestTrafftShadowRows({
    repository: new PostgresRelationshipContextRepository(client),
    rows,
    complete,
  });
  const legacy = await classifyTrafftIdentityWithClient({
    client,
    observedAt: input.observedAt,
  });
  return {
    rows,
    complete,
    ...plutioReferences,
    ...exactReferences,
    ...legacy,
    ...ingested,
  };
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
      exactCustomerReferences: result.exactCustomerReferences,
      exactAppointmentReferences: result.exactAppointmentReferences,
      exactPlutioReferences: result.exactPlutioReferences,
      corroboratedCustomerReferences: result.corroboratedCustomerReferences,
      legacyCustomerReferences: result.legacyCustomerReferences,
      legacyAppointmentReferences: result.legacyAppointmentReferences,
      plutioReferenceConflicts: result.plutioReferenceConflicts,
      exactReferenceConflicts: result.exactReferenceConflicts,
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
