import crypto from 'node:crypto';

import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  RelationshipContextContractError,
  type ExternalReferenceInput,
  type NormalizedFactInput,
  type RelationshipContextSection,
  assertBoundedJson,
  sha256Json,
} from './relationship-context-contract.js';

export interface StoredProjection {
  id: number;
  partyId: number;
  section: RelationshipContextSection;
  projectionKey: string;
  version: number;
  value: Record<string, unknown>;
  valueSha256: string;
  sourceWatermarks: Record<string, string>;
  status:
    | 'current'
    | 'stale'
    | 'partial'
    | 'conflicting'
    | 'unknown'
    | 'unavailable';
  missingCodes: string[];
  conflictCodes: string[];
  effectiveAt: string | null;
  observedAt: string;
  freshUntil: string | null;
}

export interface QueryReceiptInput {
  requestUuid: string;
  runId: string;
  sourceContainerSha256: string;
  workItemId: string;
  actorGroup: string;
  purpose: string;
  originalPartyId: number | null;
  currentPartyId: number | null;
  unresolvedSubjectSha256: string | null;
  requestedSections: RelationshipContextSection[];
  returnedSections: RelationshipContextSection[];
  projectionVersions: Record<string, number>;
  sourceWatermarks: Record<string, string>;
  policyDecision: 'allowed' | 'denied';
  resultStatus:
    | 'resolved'
    | 'ambiguous'
    | 'not_found'
    | 'needs_identity'
    | 'denied'
    | 'unavailable';
  errorCode: string | null;
  responseSha256: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface PlutioProjectionReceiptInput {
  planUuid: string;
  originalPartyId: number;
  currentPartyId: number;
  plutioRefEntityId: number | null;
  projectionVersion: number;
  projectionSha256: string;
  proposedFields: Record<string, unknown>;
  status: 'planned' | 'no_change' | 'conflict' | 'uncertain';
  conflictCodes: string[];
}

export interface RelationshipContextRepository {
  canonicalParty(partyId: number): Promise<number | null>;
  resolveExternalRef(reference: ExternalReferenceInput): Promise<number | null>;
  bindExternalRef(input: {
    partyId: number;
    reference: ExternalReferenceInput;
    adapterKey: string;
    adapterVersion: string;
    observedAt: string;
    verifiedAt?: string | null;
    receiptSha256: string;
  }): Promise<void>;
  resolveIdentifierClaim(kind: string, fingerprint: string): Promise<number[]>;
  addIdentifierClaim(input: {
    partyId: number;
    kind: string;
    fingerprint: string;
    verified: boolean;
    effectiveAt: string;
    evidenceSha256: string;
  }): Promise<void>;
  ensureIdentityException(input: {
    fingerprint: string;
    partyIds: number[];
    reasonCode: string;
    evidenceRefs: Record<string, unknown>;
    observedAt: string;
  }): Promise<void>;
  findIdentityException(
    reference: ExternalReferenceInput,
  ): Promise<'ambiguous' | 'needs_identity' | null>;
  recordObservation(input: {
    fact: NormalizedFactInput;
    partyId: number | null;
    adapterKey: string;
    adapterVersion: string;
  }): Promise<{ id: number; duplicate: boolean }>;
  upsertProjection(
    input: Omit<StoredProjection, 'id' | 'version'>,
  ): Promise<StoredProjection>;
  listProjections(
    partyId: number,
    sections: RelationshipContextSection[],
  ): Promise<StoredProjection[]>;
  recordQueryReceipt(input: QueryReceiptInput): Promise<number>;
  markQueryDelivery(input: {
    receiptId: number;
    status: 'delivered' | 'failed';
    errorCode: string | null;
    deliveredAt: string | null;
  }): Promise<void>;
  recordPlutioProjectionReceipt(
    input: PlutioProjectionReceiptInput,
  ): Promise<number>;
}

function refKey(reference: ExternalReferenceInput): string {
  return [
    reference.provider,
    reference.scope,
    reference.entityType,
    reference.externalId,
  ].join('\0');
}

function claimKey(kind: string, fingerprint: string): string {
  return `${kind}\0${fingerprint}`;
}

function projectionKey(
  partyId: number,
  section: RelationshipContextSection,
  key: string,
): string {
  return `${partyId}\0${section}\0${key}`;
}

export class InMemoryRelationshipContextRepository implements RelationshipContextRepository {
  readonly parties = new Map<number, number | null>();
  readonly refs = new Map<string, number>();
  readonly claims = new Map<string, Set<number>>();
  readonly exceptions = new Map<string, Record<string, unknown>>();
  readonly observations = new Map<
    string,
    { id: number; hash: string; partyId: number | null }
  >();
  readonly projections = new Map<string, StoredProjection>();
  readonly queryReceipts: QueryReceiptInput[] = [];
  readonly queryDeliveries = new Map<
    number,
    { status: 'pending' | 'delivered' | 'failed'; errorCode: string | null }
  >();
  readonly plutioReceipts: PlutioProjectionReceiptInput[] = [];
  private nextId = 1;

  canonicalParty(partyId: number): Promise<number | null> {
    if (!this.parties.has(partyId)) return Promise.resolve(null);
    let current = partyId;
    const seen = new Set<number>();
    while (true) {
      if (seen.has(current)) return Promise.resolve(null);
      seen.add(current);
      const next = this.parties.get(current);
      if (next == null) return Promise.resolve(current);
      current = next;
    }
  }

  resolveExternalRef(
    reference: ExternalReferenceInput,
  ): Promise<number | null> {
    return Promise.resolve(this.refs.get(refKey(reference)) ?? null);
  }

  async bindExternalRef(input: {
    partyId: number;
    reference: ExternalReferenceInput;
    adapterKey: string;
    adapterVersion: string;
    observedAt: string;
    verifiedAt?: string | null;
    receiptSha256: string;
  }): Promise<void> {
    const canonical = await this.canonicalParty(input.partyId);
    if (!canonical) throw new Error('relationship_context_party_unknown');
    const key = refKey(input.reference);
    const existing = this.refs.get(key);
    if (existing != null) {
      const existingCanonical = await this.canonicalParty(existing);
      if (existingCanonical !== canonical) {
        throw new Error('relationship_context_external_ref_conflict');
      }
    }
    this.refs.set(key, canonical);
  }

  resolveIdentifierClaim(kind: string, fingerprint: string): Promise<number[]> {
    return Promise.resolve(
      [...(this.claims.get(claimKey(kind, fingerprint)) ?? [])].sort(
        (a, b) => a - b,
      ),
    );
  }

  async addIdentifierClaim(input: {
    partyId: number;
    kind: string;
    fingerprint: string;
    verified: boolean;
    effectiveAt: string;
    evidenceSha256: string;
  }): Promise<void> {
    const canonical = await this.canonicalParty(input.partyId);
    if (!canonical) throw new Error('relationship_context_party_unknown');
    const key = claimKey(input.kind, input.fingerprint);
    const values = this.claims.get(key) ?? new Set<number>();
    values.add(canonical);
    this.claims.set(key, values);
  }

  ensureIdentityException(input: {
    fingerprint: string;
    partyIds: number[];
    reasonCode: string;
    evidenceRefs: Record<string, unknown>;
    observedAt: string;
  }): Promise<void> {
    this.exceptions.set(input.fingerprint, structuredClone(input));
    return Promise.resolve();
  }

  findIdentityException(
    reference: ExternalReferenceInput,
  ): Promise<'ambiguous' | 'needs_identity' | null> {
    const sourceRefSha256 = sha256Json(reference);
    const match = [...this.exceptions.values()].find((value) => {
      const evidence = value.evidenceRefs as
        | Record<string, unknown>
        | undefined;
      return evidence?.source_ref_sha256 === sourceRefSha256;
    });
    if (!match) return Promise.resolve(null);
    return Promise.resolve(
      match.reasonCode === 'identity_ambiguous'
        ? 'ambiguous'
        : 'needs_identity',
    );
  }

  recordObservation(input: {
    fact: NormalizedFactInput;
    partyId: number | null;
    adapterKey: string;
    adapterVersion: string;
  }): Promise<{ id: number; duplicate: boolean }> {
    const key = `${input.fact.sourceSystem}\0${input.fact.sourceScope}\0${input.fact.sourceFactKey}`;
    const hash = sha256Json(input.fact);
    const existing = this.observations.get(key);
    if (existing) {
      if (existing.hash !== hash) {
        throw new Error('relationship_context_observation_conflict');
      }
      if (
        input.partyId != null &&
        existing.partyId != null &&
        existing.partyId !== input.partyId
      ) {
        throw new Error('relationship_context_observation_party_conflict');
      }
      if (existing.partyId == null && input.partyId != null) {
        existing.partyId = input.partyId;
      }
      return Promise.resolve({ id: existing.id, duplicate: true });
    }
    const id = this.nextId++;
    this.observations.set(key, { id, hash, partyId: input.partyId });
    return Promise.resolve({ id, duplicate: false });
  }

  upsertProjection(
    input: Omit<StoredProjection, 'id' | 'version'>,
  ): Promise<StoredProjection> {
    assertBoundedJson(input.value);
    const key = projectionKey(
      input.partyId,
      input.section,
      input.projectionKey,
    );
    const existing = this.projections.get(key);
    if (existing && existing.valueSha256 === input.valueSha256) {
      return Promise.resolve(structuredClone(existing));
    }
    const next: StoredProjection = {
      ...structuredClone(input),
      id: existing?.id ?? this.nextId++,
      version: (existing?.version ?? 0) + 1,
    };
    this.projections.set(key, next);
    return Promise.resolve(structuredClone(next));
  }

  listProjections(
    partyId: number,
    sections: RelationshipContextSection[],
  ): Promise<StoredProjection[]> {
    return Promise.resolve(
      [...this.projections.values()]
        .filter(
          (projection) =>
            projection.partyId === partyId &&
            sections.includes(projection.section),
        )
        .sort((a, b) =>
          `${a.section}:${a.projectionKey}`.localeCompare(
            `${b.section}:${b.projectionKey}`,
          ),
        )
        .map((projection) => structuredClone(projection)),
    );
  }

  recordQueryReceipt(input: QueryReceiptInput): Promise<number> {
    this.queryReceipts.push(structuredClone(input));
    const id = this.nextId++;
    this.queryDeliveries.set(id, {
      status: 'pending',
      errorCode: null,
    });
    return Promise.resolve(id);
  }

  markQueryDelivery(input: {
    receiptId: number;
    status: 'delivered' | 'failed';
    errorCode: string | null;
    deliveredAt: string | null;
  }): Promise<void> {
    const current = this.queryDeliveries.get(input.receiptId);
    if (!current || current.status !== 'pending') {
      return Promise.reject(
        new Error('relationship_context_query_delivery_conflict'),
      );
    }
    this.queryDeliveries.set(input.receiptId, {
      status: input.status,
      errorCode: input.errorCode,
    });
    return Promise.resolve();
  }

  recordPlutioProjectionReceipt(
    input: PlutioProjectionReceiptInput,
  ): Promise<number> {
    this.plutioReceipts.push(structuredClone(input));
    return Promise.resolve(this.nextId++);
  }
}

interface ProjectionRow extends QueryResultRow {
  id: string;
  party_id: string;
  section: RelationshipContextSection;
  projection_key: string;
  version: number;
  value: Record<string, unknown>;
  value_sha256: string;
  source_watermarks: Record<string, string>;
  status: StoredProjection['status'];
  missing_codes: string[];
  conflict_codes: string[];
  effective_at: Date | null;
  observed_at: Date;
  fresh_until: Date | null;
}

function projectionFromRow(row: ProjectionRow): StoredProjection {
  return {
    id: Number(row.id),
    partyId: Number(row.party_id),
    section: row.section,
    projectionKey: row.projection_key,
    version: row.version,
    value: row.value,
    valueSha256: row.value_sha256,
    sourceWatermarks: row.source_watermarks,
    status: row.status,
    missingCodes: row.missing_codes,
    conflictCodes: row.conflict_codes,
    effectiveAt: row.effective_at?.toISOString() ?? null,
    observedAt: row.observed_at.toISOString(),
    freshUntil: row.fresh_until?.toISOString() ?? null,
  };
}

export class PostgresRelationshipContextRepository implements RelationshipContextRepository {
  constructor(private readonly client: PoolClient) {}

  async canonicalParty(partyId: number): Promise<number | null> {
    const result = await this.client.query<{ id: string | null }>(
      `SELECT business_v2.canonical_party_id($1)::text AS id`,
      [partyId],
    );
    return result.rows[0]?.id == null ? null : Number(result.rows[0].id);
  }

  async resolveExternalRef(
    reference: ExternalReferenceInput,
  ): Promise<number | null> {
    const result = await this.client.query<{ party_id: string }>(
      `SELECT party_id::text
         FROM business_v2.party_external_refs
        WHERE provider=$1 AND source_scope=$2 AND entity_type=$3
          AND external_id=$4 AND status='active'`,
      [
        reference.provider,
        reference.scope,
        reference.entityType,
        reference.externalId,
      ],
    );
    return result.rows[0] ? Number(result.rows[0].party_id) : null;
  }

  async bindExternalRef(input: {
    partyId: number;
    reference: ExternalReferenceInput;
    adapterKey: string;
    adapterVersion: string;
    observedAt: string;
    verifiedAt?: string | null;
    receiptSha256: string;
  }): Promise<void> {
    await this.client.query(
      `INSERT INTO business_v2.party_external_refs
         (party_id, provider, source_scope, entity_type, external_id,
          adapter_key, adapter_version, schema_version, status, verified_at,
          first_seen_at, last_seen_at, source_receipt_sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,'active',$8::timestamptz,
               $9::timestamptz,$9::timestamptz,$10)
       ON CONFLICT (provider,source_scope,entity_type,external_id) DO UPDATE
         SET party_id=business_v2.canonical_party_id(EXCLUDED.party_id),
             last_seen_at=GREATEST(
               business_v2.party_external_refs.last_seen_at,
               EXCLUDED.last_seen_at
             ),
             verified_at=COALESCE(
               business_v2.party_external_refs.verified_at,
               EXCLUDED.verified_at
             ),
             updated_at=now()
         WHERE business_v2.canonical_party_id(
                 business_v2.party_external_refs.party_id
               )=business_v2.canonical_party_id(EXCLUDED.party_id)`,
      [
        input.partyId,
        input.reference.provider,
        input.reference.scope,
        input.reference.entityType,
        input.reference.externalId,
        input.adapterKey,
        input.adapterVersion,
        input.verifiedAt ?? null,
        input.observedAt,
        input.receiptSha256,
      ],
    );
    const resolved = await this.resolveExternalRef(input.reference);
    const resolvedCanonical =
      resolved == null ? null : await this.canonicalParty(resolved);
    const inputCanonical = await this.canonicalParty(input.partyId);
    if (resolvedCanonical == null || resolvedCanonical !== inputCanonical) {
      throw new Error('relationship_context_external_ref_conflict');
    }
  }

  async resolveIdentifierClaim(
    kind: string,
    fingerprint: string,
  ): Promise<number[]> {
    const result = await this.client.query<{ party_id: string }>(
      `SELECT DISTINCT business_v2.canonical_party_id(party_id)::text AS party_id
         FROM business_v2.party_identifier_claims
        WHERE identifier_kind=$1 AND identifier_fingerprint=$2
          AND status='active' AND confidence IN ('source_verified','provider_asserted')
          AND (valid_until IS NULL OR valid_until > now())
        ORDER BY party_id`,
      [kind, fingerprint],
    );
    return result.rows.map((row) => Number(row.party_id));
  }

  async addIdentifierClaim(input: {
    partyId: number;
    kind: string;
    fingerprint: string;
    verified: boolean;
    effectiveAt: string;
    evidenceSha256: string;
  }): Promise<void> {
    await this.client.query(
      `INSERT INTO business_v2.party_identifier_claims
         (party_id,identifier_kind,identifier_fingerprint,verification_method,
          confidence,status,valid_from,evidence_sha256)
       VALUES ($1,$2,$3,$4,$5,'active',$6::timestamptz,$7)
       ON CONFLICT (party_id,identifier_kind,identifier_fingerprint)
         WHERE status='active'
       DO UPDATE SET updated_at=now(), evidence_sha256=EXCLUDED.evidence_sha256`,
      [
        input.partyId,
        input.kind,
        input.fingerprint,
        input.verified ? 'provider_verified' : 'provider_candidate',
        input.verified ? 'source_verified' : 'candidate',
        input.effectiveAt,
        input.evidenceSha256,
      ],
    );
  }

  async ensureIdentityException(input: {
    fingerprint: string;
    partyIds: number[];
    reasonCode: string;
    evidenceRefs: Record<string, unknown>;
    observedAt: string;
  }): Promise<void> {
    assertBoundedJson(input.evidenceRefs);
    await this.client.query(
      `INSERT INTO business_v2.party_identity_exceptions
         (fingerprint,candidate_party_ids,reason_code,status,owner_group,
          evidence_refs,first_seen_at,last_seen_at)
       VALUES ($1,$2::bigint[],$3,'open','chief',$4::jsonb,
               $5::timestamptz,$5::timestamptz)
       ON CONFLICT (fingerprint) DO UPDATE
         SET candidate_party_ids=EXCLUDED.candidate_party_ids,
             reason_code=EXCLUDED.reason_code,
             evidence_refs=EXCLUDED.evidence_refs,
             occurrence_count=business_v2.party_identity_exceptions.occurrence_count+1,
             last_seen_at=GREATEST(
               business_v2.party_identity_exceptions.last_seen_at,
               EXCLUDED.last_seen_at
             ),
             status='open', resolution_code=NULL,
             resolution_receipt_sha256=NULL, resolved_at=NULL, updated_at=now()`,
      [
        input.fingerprint,
        input.partyIds,
        input.reasonCode,
        JSON.stringify(input.evidenceRefs),
        input.observedAt,
      ],
    );
  }

  async findIdentityException(
    reference: ExternalReferenceInput,
  ): Promise<'ambiguous' | 'needs_identity' | null> {
    const result = await this.client.query<{ reason_code: string }>(
      `SELECT reason_code
         FROM business_v2.party_identity_exceptions
        WHERE status='open'
          AND evidence_refs->>'source_ref_sha256'=$1
        ORDER BY last_seen_at DESC,id DESC
        LIMIT 1`,
      [sha256Json(reference)],
    );
    if (!result.rows[0]) return null;
    return result.rows[0].reason_code === 'identity_ambiguous'
      ? 'ambiguous'
      : 'needs_identity';
  }

  async recordObservation(input: {
    fact: NormalizedFactInput;
    partyId: number | null;
    adapterKey: string;
    adapterVersion: string;
  }): Promise<{ id: number; duplicate: boolean }> {
    const valueSha256 = sha256Json(input.fact.value);
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO business_v2.party_context_observations
         (schema_version,adapter_key,adapter_version,source_system,source_scope,
          source_fact_key,fact_type,fact_schema_version,original_party_id,
          current_party_id,related_party_ids,value,value_sha256,
          source_record_type,source_record_id,source_event_id,effective_at,
          observed_at,verified_at,fresh_until,confidence,conflict_state,
          privacy_class)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$8,$9::bigint[],$10::jsonb,$11,
               $12,$13,$14,$15::timestamptz,$16::timestamptz,$17::timestamptz,
               $18::timestamptz,$19,$20,$21)
       ON CONFLICT (source_system,source_scope,source_fact_key) DO NOTHING
       RETURNING id::text`,
      [
        input.adapterKey,
        input.adapterVersion,
        input.fact.sourceSystem,
        input.fact.sourceScope,
        input.fact.sourceFactKey,
        input.fact.factType,
        input.fact.factSchemaVersion,
        input.partyId,
        input.fact.relatedPartyIds ?? [],
        JSON.stringify(input.fact.value),
        valueSha256,
        input.fact.sourceRecordType,
        input.fact.sourceRecordId,
        input.fact.sourceEventId ?? null,
        input.fact.effectiveAt ?? null,
        input.fact.observedAt,
        input.fact.verifiedAt ?? null,
        input.fact.freshUntil ?? null,
        input.fact.confidence,
        input.fact.conflictState,
        input.fact.privacyClass,
      ],
    );
    if (result.rows[0]) {
      return { id: Number(result.rows[0].id), duplicate: false };
    }
    const existing = await this.client.query<{
      id: string;
      value_sha256: string;
      fact_type: string;
      current_party_id: string | null;
    }>(
      `SELECT id::text,value_sha256,fact_type,current_party_id::text
         FROM business_v2.party_context_observations
        WHERE source_system=$1 AND source_scope=$2 AND source_fact_key=$3`,
      [
        input.fact.sourceSystem,
        input.fact.sourceScope,
        input.fact.sourceFactKey,
      ],
    );
    if (
      !existing.rows[0] ||
      existing.rows[0].value_sha256 !== valueSha256 ||
      existing.rows[0].fact_type !== input.fact.factType
    ) {
      throw new Error('relationship_context_observation_conflict');
    }
    const currentPartyId =
      existing.rows[0].current_party_id == null
        ? null
        : Number(existing.rows[0].current_party_id);
    if (
      input.partyId != null &&
      currentPartyId != null &&
      currentPartyId !== input.partyId
    ) {
      throw new Error('relationship_context_observation_party_conflict');
    }
    if (input.partyId != null && currentPartyId == null) {
      const linked = await this.client.query(
        `UPDATE business_v2.party_context_observations
            SET current_party_id=$2,updated_at=now()
          WHERE id=$1 AND current_party_id IS NULL`,
        [Number(existing.rows[0].id), input.partyId],
      );
      if (linked.rowCount !== 1) {
        throw new Error('relationship_context_observation_party_conflict');
      }
    }
    return { id: Number(existing.rows[0].id), duplicate: true };
  }

  async upsertProjection(
    input: Omit<StoredProjection, 'id' | 'version'>,
  ): Promise<StoredProjection> {
    const result = await this.client.query<ProjectionRow>(
      `INSERT INTO business_v2.party_context_projections
         (party_id,section,projection_key,version,value,value_sha256,
          source_watermarks,status,missing_codes,conflict_codes,effective_at,
          observed_at,fresh_until)
       VALUES ($1,$2,$3,1,$4::jsonb,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,
               $10::timestamptz,$11::timestamptz,$12::timestamptz)
       ON CONFLICT (party_id,section,projection_key) DO UPDATE
         SET version=business_v2.party_context_projections.version+1,
             value=EXCLUDED.value, value_sha256=EXCLUDED.value_sha256,
             source_watermarks=EXCLUDED.source_watermarks,
             status=EXCLUDED.status, missing_codes=EXCLUDED.missing_codes,
             conflict_codes=EXCLUDED.conflict_codes,
             effective_at=EXCLUDED.effective_at,
             observed_at=EXCLUDED.observed_at,
             fresh_until=EXCLUDED.fresh_until, updated_at=now()
         WHERE business_v2.party_context_projections.value_sha256
               <> EXCLUDED.value_sha256
            OR business_v2.party_context_projections.status <> EXCLUDED.status
            OR business_v2.party_context_projections.source_watermarks
               <> EXCLUDED.source_watermarks
       RETURNING *`,
      [
        input.partyId,
        input.section,
        input.projectionKey,
        JSON.stringify(input.value),
        input.valueSha256,
        JSON.stringify(input.sourceWatermarks),
        input.status,
        JSON.stringify(input.missingCodes),
        JSON.stringify(input.conflictCodes),
        input.effectiveAt,
        input.observedAt,
        input.freshUntil,
      ],
    );
    if (result.rows[0]) return projectionFromRow(result.rows[0]);
    const existing = await this.client.query<ProjectionRow>(
      `SELECT * FROM business_v2.party_context_projections
        WHERE party_id=$1 AND section=$2 AND projection_key=$3`,
      [input.partyId, input.section, input.projectionKey],
    );
    return projectionFromRow(existing.rows[0]);
  }

  async listProjections(
    partyId: number,
    sections: RelationshipContextSection[],
  ): Promise<StoredProjection[]> {
    const result = await this.client.query<ProjectionRow>(
      `SELECT * FROM business_v2.party_context_projections
        WHERE party_id=$1 AND section=ANY($2::text[])
        ORDER BY section,projection_key`,
      [partyId, sections],
    );
    return result.rows.map(projectionFromRow);
  }

  async recordQueryReceipt(input: QueryReceiptInput): Promise<number> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO business_v2.party_context_query_receipts
         (request_uuid,run_id,source_container_sha256,work_item_id,actor_group,
          purpose,original_party_id,current_party_id,unresolved_subject_sha256,
          requested_sections,returned_sections,projection_versions,
          source_watermarks,policy_decision,result_status,error_code,
          response_sha256,started_at,completed_at,duration_ms)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,
               $12::jsonb,$13::jsonb,$14,$15,$16,$17,$18::timestamptz,
               $19::timestamptz,$20)
       RETURNING id::text`,
      [
        input.requestUuid,
        input.runId,
        input.sourceContainerSha256,
        input.workItemId,
        input.actorGroup,
        input.purpose,
        input.originalPartyId,
        input.currentPartyId,
        input.unresolvedSubjectSha256,
        JSON.stringify(input.requestedSections),
        JSON.stringify(input.returnedSections),
        JSON.stringify(input.projectionVersions),
        JSON.stringify(input.sourceWatermarks),
        input.policyDecision,
        input.resultStatus,
        input.errorCode,
        input.responseSha256,
        input.startedAt,
        input.completedAt,
        input.durationMs,
      ],
    );
    return Number(result.rows[0].id);
  }

  async markQueryDelivery(input: {
    receiptId: number;
    status: 'delivered' | 'failed';
    errorCode: string | null;
    deliveredAt: string | null;
  }): Promise<void> {
    const result = await this.client.query(
      `UPDATE business_v2.party_context_query_receipts
          SET delivery_status=$2,delivery_error_code=$3,
              delivered_at=$4::timestamptz
        WHERE id=$1 AND delivery_status='pending'`,
      [input.receiptId, input.status, input.errorCode, input.deliveredAt],
    );
    if (result.rowCount !== 1) {
      throw new Error('relationship_context_query_delivery_conflict');
    }
  }

  async recordPlutioProjectionReceipt(
    input: PlutioProjectionReceiptInput,
  ): Promise<number> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO business_v2.party_context_plutio_projection_receipts
         (plan_uuid,original_party_id,current_party_id,
          plutio_ref_entity_type,plutio_ref_entity_id,projection_version,
          projection_sha256,proposed_fields,proposed_field_count,mode,status,
          conflict_codes)
       VALUES ($1::uuid,$2,$3,'party',$4,$5,$6,$7::jsonb,$8,'dry_run',$9,
               $10::jsonb)
       RETURNING id::text`,
      [
        input.planUuid,
        input.originalPartyId,
        input.currentPartyId,
        input.plutioRefEntityId,
        input.projectionVersion,
        input.projectionSha256,
        JSON.stringify(input.proposedFields),
        Object.keys(input.proposedFields).length,
        input.status,
        JSON.stringify(input.conflictCodes),
      ],
    );
    return Number(result.rows[0].id);
  }
}

export async function withRelationshipContextRepository<T>(
  agent: string,
  fn: (repository: RelationshipContextRepository) => Promise<T>,
): Promise<T> {
  return withAgentContext(agent, (client) =>
    fn(new PostgresRelationshipContextRepository(client)),
  );
}

export function identityExceptionFingerprint(input: {
  sourceSystem: string;
  sourceScope: string;
  sourceRef: ExternalReferenceInput;
  reasonCode: string;
  partyIds: number[];
}): string {
  return crypto.createHash('sha256').update(sha256Json(input)).digest('hex');
}
