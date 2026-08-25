import crypto from 'node:crypto';

export const RELATIONSHIP_CONTEXT_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_CONTEXT_JSON_MAX_BYTES = 8 * 1024;
export const RELATIONSHIP_CONTEXT_BATCH_MAX_BYTES = 256 * 1024;
export const RELATIONSHIP_CONTEXT_MAX_BATCH = 200;

export const RELATIONSHIP_CONTEXT_SECTIONS = [
  'identity',
  'relationship',
  'appointments',
  'commercial',
  'communications',
  'learning',
  'attribution',
  'consent',
  'open_work',
  'data_quality',
] as const;

export type RelationshipContextSection =
  (typeof RELATIONSHIP_CONTEXT_SECTIONS)[number];

export type PrivacyClass = 'internal' | 'restricted_identifier';
export type FactConfidence =
  | 'source_verified'
  | 'provider_asserted'
  | 'candidate'
  | 'unknown';
export type ConflictState = 'none' | 'candidate' | 'conflicting' | 'held';

export interface ExternalReferenceInput {
  provider: string;
  scope: string;
  entityType: string;
  externalId: string;
}

export interface IdentityCandidateInput {
  kind: 'provider_user_id' | 'verified_email_candidate' | 'email_candidate';
  fingerprint: string;
  verified: boolean;
  effectiveAt?: string | null;
  sourceRef?: ExternalReferenceInput | null;
}

export interface NormalizedFactInput {
  factType: string;
  sourceFactKey: string;
  subject: ExternalReferenceInput | { partyId: number };
  relatedPartyIds?: number[];
  value: Record<string, unknown>;
  sourceSystem: string;
  sourceScope: string;
  sourceRecordType: string;
  sourceRecordId: string;
  sourceEventId?: string | null;
  effectiveAt?: string | null;
  observedAt: string;
  verifiedAt?: string | null;
  freshUntil?: string | null;
  confidence: FactConfidence;
  conflictState: ConflictState;
  privacyClass: PrivacyClass;
  factSchemaVersion: number;
}

export interface ObservationBatch {
  adapterKey: string;
  adapterVersion: string;
  sourceSystem: string;
  sourceScope: string;
  complete: boolean;
  watermark: string | null;
  externalReferences: ExternalReferenceInput[];
  identityCandidates: IdentityCandidateInput[];
  facts: NormalizedFactInput[];
  errors: Array<{ code: string; evidenceSha256: string }>;
}

export interface AdapterManifestV1 {
  manifestVersion: 1;
  adapterKey: string;
  adapterVersion: string;
  sourceSystem: string;
  supportedScopes: string[];
  externalReferenceTypes: string[];
  factTypes: string[];
  identityClaimTypes: IdentityCandidateInput['kind'][];
  collectionModes: Array<'webhook' | 'snapshot' | 'reconciliation'>;
  projectionTargets: RelationshipContextSection[];
  privacyClasses: PrivacyClass[];
  credentialHandle: string | null;
  healthPolicy: string;
  conformanceSuite: 'person_enrichment_adapter_v1';
}

export interface FactCatalogEntry {
  factType: string;
  schemaVersion: number;
  projectionTarget: RelationshipContextSection;
  privacyClass: PrivacyClass;
  maxAgeSeconds: number | null;
  cardinality: 'one' | 'many';
  authorityClass: 'native' | 'derived' | 'candidate';
}

export interface BoundedWebhookInput {
  scope: string;
  observedAt: string;
  payload: Record<string, unknown>;
  correlationId: string;
}

export interface BoundedCollectionRequest {
  scope: string;
  observedAt: string;
  cursor: string | null;
  limit: number;
  correlationId: string;
}

export interface BoundedReconciliationRequest extends BoundedCollectionRequest {
  expectedKeys: string[];
}

export interface AdapterHealthReceipt {
  adapterKey: string;
  sourceScope: string;
  status: 'healthy' | 'degraded' | 'open_circuit';
  observedAt: string;
  errorCode: string | null;
}

export interface PersonEnrichmentAdapterV1 {
  describe(): AdapterManifestV1;
  validateConfig(config: unknown): { ok: true } | { ok: false; code: string };
  normalizeWebhook?(input: BoundedWebhookInput): ObservationBatch;
  collectSnapshot?(input: BoundedCollectionRequest): ObservationBatch;
  reconcile?(input: BoundedReconciliationRequest): ObservationBatch;
  health(): AdapterHealthReceipt;
}

export class RelationshipContextContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RelationshipContextContractError';
  }
}

const KEY_RE = /^[a-z][a-z0-9._-]{0,127}$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FACT_RE = /^[a-z][a-z0-9_.-]{0,127}@([1-9]\d*)$/;
const HASH_RE = /^[0-9a-f]{64}$/;

function requiredKey(value: unknown, code: string): string {
  if (typeof value !== 'string' || !KEY_RE.test(value)) {
    throw new RelationshipContextContractError(code);
  }
  return value;
}

function requiredBoundedString(
  value: unknown,
  max: number,
  code: string,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new RelationshipContextContractError(code);
  }
  return value.trim();
}

export function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  const serialized = JSON.stringify(normalize(value));
  return serialized === undefined ? '"__undefined__"' : serialized;
}

export function sha256Json(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function assertBoundedJson(
  value: unknown,
  code = 'relationship_context_json_too_large',
): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Buffer.byteLength(stableJson(value), 'utf8') >
      RELATIONSHIP_CONTEXT_JSON_MAX_BYTES
  ) {
    throw new RelationshipContextContractError(code);
  }
}

function uniqueBoundedStrings(
  value: unknown,
  maxItems: number,
  code: string,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new RelationshipContextContractError(code);
  }
  const normalized = value.map((entry) =>
    requiredBoundedString(entry, 160, code),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new RelationshipContextContractError(code);
  }
  return normalized;
}

export function validateManifest(input: AdapterManifestV1): AdapterManifestV1 {
  assertBoundedJson(input, 'relationship_context_manifest_too_large');
  if (input.manifestVersion !== RELATIONSHIP_CONTEXT_SCHEMA_VERSION) {
    throw new RelationshipContextContractError(
      'relationship_context_manifest_version_unsupported',
    );
  }
  const adapterKey = requiredKey(
    input.adapterKey,
    'relationship_context_adapter_key_invalid',
  );
  if (!VERSION_RE.test(input.adapterVersion)) {
    throw new RelationshipContextContractError(
      'relationship_context_adapter_version_invalid',
    );
  }
  const sourceSystem = requiredKey(
    input.sourceSystem,
    'relationship_context_source_system_invalid',
  );
  const supportedScopes = uniqueBoundedStrings(
    input.supportedScopes,
    20,
    'relationship_context_scopes_invalid',
  );
  const externalReferenceTypes = uniqueBoundedStrings(
    input.externalReferenceTypes,
    20,
    'relationship_context_reference_types_invalid',
  );
  const factTypes = uniqueBoundedStrings(
    input.factTypes,
    100,
    'relationship_context_fact_types_invalid',
  );
  if (factTypes.some((fact) => !FACT_RE.test(fact))) {
    throw new RelationshipContextContractError(
      'relationship_context_fact_type_invalid',
    );
  }
  const identityClaimTypes = uniqueBoundedStrings(
    input.identityClaimTypes,
    3,
    'relationship_context_identity_claim_types_invalid',
  ) as IdentityCandidateInput['kind'][];
  if (
    identityClaimTypes.some(
      (kind) =>
        ![
          'provider_user_id',
          'verified_email_candidate',
          'email_candidate',
        ].includes(kind),
    )
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_identity_claim_types_invalid',
    );
  }
  if (
    !Array.isArray(input.collectionModes) ||
    input.collectionModes.length === 0 ||
    input.collectionModes.length > 3 ||
    new Set(input.collectionModes).size !== input.collectionModes.length ||
    input.collectionModes.some(
      (mode) => !['webhook', 'snapshot', 'reconciliation'].includes(mode),
    )
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_collection_modes_invalid',
    );
  }
  if (
    !Array.isArray(input.projectionTargets) ||
    new Set(input.projectionTargets).size !== input.projectionTargets.length ||
    input.projectionTargets.some(
      (target) => !RELATIONSHIP_CONTEXT_SECTIONS.includes(target),
    )
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_projection_targets_invalid',
    );
  }
  if (
    !Array.isArray(input.privacyClasses) ||
    input.privacyClasses.length === 0 ||
    new Set(input.privacyClasses).size !== input.privacyClasses.length ||
    input.privacyClasses.some(
      (privacyClass) =>
        !['internal', 'restricted_identifier'].includes(privacyClass),
    )
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_privacy_classes_invalid',
    );
  }
  if (
    input.conformanceSuite !== 'person_enrichment_adapter_v1' ||
    !input.healthPolicy ||
    input.healthPolicy.length > 128 ||
    (input.credentialHandle !== null && !KEY_RE.test(input.credentialHandle))
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_manifest_contract_invalid',
    );
  }
  return {
    ...input,
    adapterKey,
    sourceSystem,
    supportedScopes,
    externalReferenceTypes,
    factTypes,
    identityClaimTypes,
  };
}

export function validateFactCatalogEntry(
  input: FactCatalogEntry,
): FactCatalogEntry {
  if (
    !FACT_RE.test(input.factType) ||
    !Number.isSafeInteger(input.schemaVersion) ||
    input.schemaVersion < 1 ||
    !RELATIONSHIP_CONTEXT_SECTIONS.includes(input.projectionTarget) ||
    !['internal', 'restricted_identifier'].includes(input.privacyClass) ||
    (input.maxAgeSeconds !== null &&
      (!Number.isSafeInteger(input.maxAgeSeconds) ||
        input.maxAgeSeconds < 1 ||
        input.maxAgeSeconds > 31_536_000))
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_fact_catalog_invalid',
    );
  }
  return { ...input };
}

export function validateExternalReference(
  input: ExternalReferenceInput,
): ExternalReferenceInput {
  return {
    provider: requiredKey(
      input.provider,
      'relationship_context_ref_provider_invalid',
    ),
    scope: requiredBoundedString(
      input.scope,
      160,
      'relationship_context_ref_scope_invalid',
    ),
    entityType: requiredKey(
      input.entityType,
      'relationship_context_ref_entity_invalid',
    ),
    externalId: requiredBoundedString(
      input.externalId,
      500,
      'relationship_context_ref_id_invalid',
    ),
  };
}

function isoOrNull(
  value: string | null | undefined,
  code: string,
): string | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new RelationshipContextContractError(code);
  return new Date(ms).toISOString();
}

export function validateObservationBatch(
  manifest: AdapterManifestV1,
  catalog: ReadonlyMap<string, FactCatalogEntry>,
  input: ObservationBatch,
): ObservationBatch {
  if (
    !input ||
    typeof input !== 'object' ||
    Buffer.byteLength(stableJson(input), 'utf8') >
      RELATIONSHIP_CONTEXT_BATCH_MAX_BYTES
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_batch_too_large',
    );
  }
  if (
    input.adapterKey !== manifest.adapterKey ||
    input.adapterVersion !== manifest.adapterVersion ||
    input.sourceSystem !== manifest.sourceSystem ||
    !manifest.supportedScopes.includes(input.sourceScope) ||
    input.externalReferences.length > RELATIONSHIP_CONTEXT_MAX_BATCH ||
    input.identityCandidates.length > RELATIONSHIP_CONTEXT_MAX_BATCH ||
    input.facts.length > RELATIONSHIP_CONTEXT_MAX_BATCH ||
    input.errors.length > 50
  ) {
    throw new RelationshipContextContractError(
      'relationship_context_batch_contract_invalid',
    );
  }
  const externalReferences = input.externalReferences.map((reference) => {
    const normalized = validateExternalReference(reference);
    if (
      normalized.provider !== manifest.sourceSystem ||
      normalized.scope !== input.sourceScope ||
      !manifest.externalReferenceTypes.includes(normalized.entityType)
    ) {
      throw new RelationshipContextContractError(
        'relationship_context_batch_reference_undeclared',
      );
    }
    return normalized;
  });
  const identityCandidates = input.identityCandidates.map((candidate) => {
    if (
      !manifest.identityClaimTypes.includes(candidate.kind) ||
      !HASH_RE.test(candidate.fingerprint) ||
      typeof candidate.verified !== 'boolean'
    ) {
      throw new RelationshipContextContractError(
        'relationship_context_identity_candidate_invalid',
      );
    }
    const sourceRef = candidate.sourceRef
      ? validateExternalReference(candidate.sourceRef)
      : null;
    if (
      sourceRef &&
      (sourceRef.provider !== manifest.sourceSystem ||
        sourceRef.scope !== input.sourceScope ||
        !manifest.externalReferenceTypes.includes(sourceRef.entityType))
    ) {
      throw new RelationshipContextContractError(
        'relationship_context_identity_source_ref_undeclared',
      );
    }
    return {
      ...candidate,
      effectiveAt: isoOrNull(
        candidate.effectiveAt,
        'relationship_context_identity_effective_at_invalid',
      ),
      sourceRef,
    };
  });
  const facts = input.facts.map((fact) => {
    assertBoundedJson(fact.value, 'relationship_context_fact_value_too_large');
    const catalogEntry = catalog.get(fact.factType);
    if (
      !catalogEntry ||
      !manifest.factTypes.includes(fact.factType) ||
      catalogEntry.schemaVersion !== fact.factSchemaVersion ||
      catalogEntry.privacyClass !== fact.privacyClass ||
      !manifest.privacyClasses.includes(fact.privacyClass) ||
      fact.sourceSystem !== manifest.sourceSystem ||
      fact.sourceScope !== input.sourceScope
    ) {
      throw new RelationshipContextContractError(
        'relationship_context_fact_undeclared',
      );
    }
    requiredBoundedString(
      fact.sourceFactKey,
      500,
      'relationship_context_source_fact_key_invalid',
    );
    requiredBoundedString(
      fact.sourceRecordId,
      500,
      'relationship_context_source_record_id_invalid',
    );
    return {
      ...fact,
      observedAt: isoOrNull(
        fact.observedAt,
        'relationship_context_observed_at_invalid',
      )!,
      effectiveAt: isoOrNull(
        fact.effectiveAt,
        'relationship_context_effective_at_invalid',
      ),
      verifiedAt: isoOrNull(
        fact.verifiedAt,
        'relationship_context_verified_at_invalid',
      ),
      freshUntil: isoOrNull(
        fact.freshUntil,
        'relationship_context_fresh_until_invalid',
      ),
    };
  });
  for (const error of input.errors) {
    requiredKey(error.code, 'relationship_context_error_code_invalid');
    if (!HASH_RE.test(error.evidenceSha256)) {
      throw new RelationshipContextContractError(
        'relationship_context_error_hash_invalid',
      );
    }
  }
  return { ...input, externalReferences, identityCandidates, facts };
}
