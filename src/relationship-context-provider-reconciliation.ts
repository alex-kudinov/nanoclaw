import crypto from 'node:crypto';
import fs from 'node:fs';
import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  type AdapterManifestV1,
  type AdapterHealthReceipt,
  type FactCatalogEntry,
  type ObservationBatch,
  type PersonEnrichmentAdapterV1,
  RelationshipContextContractError,
  assertBoundedJson,
  sha256Json,
} from './relationship-context-contract.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import {
  PostgresRelationshipContextRepository,
  identityExceptionFingerprint,
  type RelationshipContextRepository,
} from './relationship-context-store.js';
import { ingestRelationshipContextBatch } from './relationship-context.js';

export const PLUTIO_LEDGER_ADAPTER_KEY = 'plutio_reference_ledger';
export const PLUTIO_LEDGER_ADAPTER_VERSION = '1.0.0';
export const ENCHARGE_SNAPSHOT_ADAPTER_KEY = 'encharge_person_snapshot';
export const ENCHARGE_SNAPSHOT_ADAPTER_VERSION = '1.0.0';
export const PROVIDER_RECONCILIATION_SCOPE = 'primary';
export const ENCHARGE_CONSENT_FACT_TYPE = 'consent.encharge.status@1';
export const PROVIDER_RECONCILIATION_DECISION =
  'decision:relationship-context-best-effort-identity-reconciliation-2026-08-26';

const HASH_RE = /^[0-9a-f]{64}$/;

const plutioManifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: PLUTIO_LEDGER_ADAPTER_KEY,
  adapterVersion: PLUTIO_LEDGER_ADAPTER_VERSION,
  sourceSystem: 'plutio',
  supportedScopes: [PROVIDER_RECONCILIATION_SCOPE],
  externalReferenceTypes: ['person'],
  factTypes: [],
  identityClaimTypes: [],
  collectionModes: ['reconciliation'],
  projectionTargets: [],
  privacyClasses: ['restricted_identifier'],
  credentialHandle: null,
  healthPolicy: 'host_ledger_exact_refs_fail_closed',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

const enchargeManifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: ENCHARGE_SNAPSHOT_ADAPTER_KEY,
  adapterVersion: ENCHARGE_SNAPSHOT_ADAPTER_VERSION,
  sourceSystem: 'encharge',
  supportedScopes: [PROVIDER_RECONCILIATION_SCOPE],
  externalReferenceTypes: ['person'],
  factTypes: [ENCHARGE_CONSENT_FACT_TYPE],
  identityClaimTypes: ['verified_email_candidate'],
  collectionModes: ['snapshot', 'reconciliation'],
  projectionTargets: ['consent'],
  privacyClasses: ['internal', 'restricted_identifier'],
  credentialHandle: 'toolbox_encharge_read',
  healthPolicy: 'private_snapshot_fail_closed',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

export const ENCHARGE_CONSENT_FACT: FactCatalogEntry = {
  factType: ENCHARGE_CONSENT_FACT_TYPE,
  schemaVersion: 1,
  projectionTarget: 'consent',
  privacyClass: 'internal',
  maxAgeSeconds: 86_400,
  cardinality: 'one',
  authorityClass: 'native',
};

class StaticReconciliationAdapter implements PersonEnrichmentAdapterV1 {
  constructor(private readonly manifest: AdapterManifestV1) {}

  describe(): AdapterManifestV1 {
    return structuredClone(this.manifest);
  }

  validateConfig(config: unknown): { ok: true } | { ok: false; code: string } {
    if (
      config == null ||
      (typeof config === 'object' &&
        !Array.isArray(config) &&
        Object.keys(config as Record<string, unknown>).length === 0)
    ) {
      return { ok: true };
    }
    return { ok: false, code: 'provider_reconciliation_config_not_empty' };
  }

  health(): AdapterHealthReceipt {
    return {
      adapterKey: this.manifest.adapterKey,
      sourceScope: PROVIDER_RECONCILIATION_SCOPE,
      status: 'healthy',
      observedAt: new Date(0).toISOString(),
      errorCode: null,
    };
  }
}

async function registerAdapter(
  client: PoolClient,
  manifest: AdapterManifestV1,
  now: string,
  configDeclaration: Record<string, unknown>,
): Promise<void> {
  assertBoundedJson(configDeclaration);
  const manifestSha256 = sha256Json(manifest);
  const conformanceSha256 = sha256Json({
    suite: manifest.conformanceSuite,
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
           enabled=true,conformance_status='passed',
           conformance_receipt_sha256=EXCLUDED.conformance_receipt_sha256,
           circuit_status='closed',failure_count=0,last_error_code=NULL,
           last_health_at=EXCLUDED.last_health_at,updated_at=now()`,
    [
      manifest.adapterKey,
      manifest.adapterVersion,
      manifest.sourceSystem,
      PROVIDER_RECONCILIATION_SCOPE,
      manifest.manifestVersion,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify(configDeclaration),
      conformanceSha256,
      now,
    ],
  );
}

interface PlutioReferenceRow extends QueryResultRow {
  party_id: string;
  external_id: string;
  first_seen_at: Date;
  last_seen_at: Date;
}

export async function bindExternalRefOrRecordConflict(input: {
  repository: RelationshipContextRepository;
  partyId: number;
  reference: {
    provider: string;
    scope: string;
    entityType: string;
    externalId: string;
  };
  adapterKey: string;
  adapterVersion: string;
  observedAt: string;
  verifiedAt: string | null;
  receiptSha256: string;
  evidenceTier: string;
}): Promise<boolean> {
  try {
    await input.repository.bindExternalRef(input);
    return true;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'relationship_context_external_ref_conflict'
    ) {
      throw error;
    }
    const existingParty = await input.repository.resolveExternalRef(
      input.reference,
    );
    const partyIds = [...new Set([existingParty, input.partyId])]
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b);
    await input.repository.ensureIdentityException({
      fingerprint: identityExceptionFingerprint({
        sourceSystem: input.reference.provider,
        sourceScope: input.reference.scope,
        sourceRef: input.reference,
        reasonCode: 'external_ref_conflict',
        partyIds,
      }),
      partyIds,
      reasonCode: 'external_ref_conflict',
      evidenceRefs: {
        source_ref_sha256: sha256Json(input.reference),
        evidence_tier: input.evidenceTier,
        decision: PROVIDER_RECONCILIATION_DECISION,
      },
      observedAt: input.observedAt,
    });
    return false;
  }
}

export async function reconcilePlutioReferencesWithClient(input: {
  client: PoolClient;
  repository?: RelationshipContextRepository;
  observedAt: string;
}): Promise<{
  exactPlutioReferences: number;
  plutioReferenceConflicts: number;
}> {
  const repository =
    input.repository ?? new PostgresRelationshipContextRepository(input.client);
  await registerAdapter(input.client, plutioManifest, input.observedAt, {
    mode: 'host_ledger_read_only',
    source_relation: 'business_v2.plutio_refs',
    provider_network: false,
    provider_write: false,
  });
  const result = await input.client.query<PlutioReferenceRow>(
    `SELECT business_v2.canonical_party_id(r.entity_id)::text AS party_id,
            r.plutio_id AS external_id,
            min(r.created_at) AS first_seen_at,
            max(coalesce(r.last_pulled_at,r.last_pushed_at,r.created_at))
              AS last_seen_at
       FROM business_v2.plutio_refs r
       JOIN business_v2.parties p
         ON p.id=business_v2.canonical_party_id(r.entity_id)
       LEFT JOIN business_v2.party_external_refs e
         ON e.provider='plutio' AND e.source_scope=$1
        AND e.entity_type='person' AND e.external_id=r.plutio_id
        AND e.status='active'
      WHERE r.entity_type='party'
        AND r.plutio_entity_type IN ('party','person','contact')
        AND p.party_type='person'
        AND p.merged_into IS NULL
        AND (
          e.id IS NULL OR business_v2.canonical_party_id(e.party_id)
            <> business_v2.canonical_party_id(r.entity_id)
        )
      GROUP BY business_v2.canonical_party_id(r.entity_id),r.plutio_id
      ORDER BY r.plutio_id`,
    [PROVIDER_RECONCILIATION_SCOPE],
  );
  let conflicts = 0;
  for (const row of result.rows) {
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId: Number(row.party_id),
      reference: {
        provider: 'plutio',
        scope: PROVIDER_RECONCILIATION_SCOPE,
        entityType: 'person',
        externalId: row.external_id,
      },
      adapterKey: PLUTIO_LEDGER_ADAPTER_KEY,
      adapterVersion: PLUTIO_LEDGER_ADAPTER_VERSION,
      observedAt: row.last_seen_at.toISOString(),
      verifiedAt: input.observedAt,
      receiptSha256: sha256Json({
        rule: 'plutio_unique_reference_ledger_v1',
        decision: PROVIDER_RECONCILIATION_DECISION,
        party_id: row.party_id,
        plutio_id: row.external_id,
        first_seen_at: row.first_seen_at.toISOString(),
      }),
      evidenceTier: 'plutio_unique_reference_ledger_v1',
    });
    if (!bound) conflicts += 1;
  }
  const exactCount = await input.client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM business_v2.party_external_refs
      WHERE provider='plutio' AND source_scope=$1
        AND entity_type='person' AND status='active'
        AND verified_at IS NOT NULL`,
    [PROVIDER_RECONCILIATION_SCOPE],
  );
  return {
    exactPlutioReferences: Number(exactCount.rows[0].count),
    plutioReferenceConflicts: conflicts,
  };
}

export interface EnchargeSnapshotRecord {
  partyId: number;
  emailFingerprint: string;
  enchargePersonId: string;
  updatedAt: string;
  globalUnsubscribed: boolean | null;
  communicationCategories: Record<string, boolean | string | null>;
}

export interface EnchargeSnapshotFile {
  schemaVersion: 1;
  generatedAt: string;
  records: EnchargeSnapshotRecord[];
}

export interface PartyEmailCandidate {
  partyId: number;
  email: string;
}

export interface PreparedEnchargeSnapshot {
  snapshot: EnchargeSnapshotFile;
  matched: number;
  unmatchedProviderPeople: number;
  ambiguousPartyEmails: number;
  invalidProviderPeople: number;
}

function boundedCategoryMap(
  input: unknown,
): Record<string, boolean | string | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result: Record<string, boolean | string | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) continue;
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'string' && value.length <= 160)
    ) {
      result[key] = value;
    }
  }
  return result;
}

function isCategoryMap(input: Record<string, unknown>): boolean {
  return Object.entries(input).every(
    ([key, value]) =>
      /^[a-zA-Z0-9_-]{1,80}$/.test(key) &&
      (value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'string' && value.length <= 160)),
  );
}

export function prepareEnchargeSnapshot(input: {
  generatedAt: string;
  partyEmails: PartyEmailCandidate[];
  providerPeople: Array<Record<string, unknown>>;
}): PreparedEnchargeSnapshot {
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new RelationshipContextContractError(
      'encharge_snapshot_generated_at_invalid',
    );
  }
  const emailParties = new Map<string, Set<number>>();
  for (const candidate of input.partyEmails) {
    if (
      !Number.isSafeInteger(candidate.partyId) ||
      candidate.partyId < 1 ||
      typeof candidate.email !== 'string' ||
      !candidate.email.trim()
    ) {
      continue;
    }
    const email = candidate.email.trim().toLowerCase();
    const parties = emailParties.get(email) ?? new Set<number>();
    parties.add(candidate.partyId);
    emailParties.set(email, parties);
  }
  const providerEmailCounts = new Map<string, number>();
  const providerIdCounts = new Map<string, number>();
  for (const person of input.providerPeople) {
    if (typeof person.email === 'string') {
      const email = person.email.trim().toLowerCase();
      providerEmailCounts.set(email, (providerEmailCounts.get(email) ?? 0) + 1);
    }
    if (typeof person.id === 'string') {
      providerIdCounts.set(
        person.id,
        (providerIdCounts.get(person.id) ?? 0) + 1,
      );
    }
  }
  const records: EnchargeSnapshotRecord[] = [];
  let unmatchedProviderPeople = 0;
  let ambiguousPartyEmails = 0;
  let invalidProviderPeople = 0;
  for (const person of input.providerPeople) {
    const email =
      typeof person.email === 'string' ? person.email.trim().toLowerCase() : '';
    const id = typeof person.id === 'string' ? person.id.trim() : '';
    const parties = emailParties.get(email);
    if (
      !email ||
      !id ||
      id.length > 500 ||
      providerEmailCounts.get(email) !== 1 ||
      providerIdCounts.get(id) !== 1
    ) {
      invalidProviderPeople += 1;
      continue;
    }
    if (!parties) {
      unmatchedProviderPeople += 1;
      continue;
    }
    if (parties.size !== 1) {
      ambiguousPartyEmails += 1;
      continue;
    }
    const updatedAt =
      typeof person.updatedAt === 'string' &&
      Number.isFinite(Date.parse(person.updatedAt))
        ? new Date(person.updatedAt).toISOString()
        : new Date(input.generatedAt).toISOString();
    records.push({
      partyId: [...parties][0],
      emailFingerprint: normalizedEmailFingerprint(email),
      enchargePersonId: id,
      updatedAt,
      globalUnsubscribed:
        typeof person.unsubscribed === 'boolean' ? person.unsubscribed : null,
      communicationCategories: boundedCategoryMap(
        person.CommunicationCategories,
      ),
    });
  }
  records.sort((a, b) =>
    `${a.partyId}:${a.enchargePersonId}`.localeCompare(
      `${b.partyId}:${b.enchargePersonId}`,
    ),
  );
  return {
    snapshot: {
      schemaVersion: 1,
      generatedAt: new Date(input.generatedAt).toISOString(),
      records,
    },
    matched: records.length,
    unmatchedProviderPeople,
    ambiguousPartyEmails,
    invalidProviderPeople,
  };
}

export function parseEnchargeSnapshotFile(path: string): EnchargeSnapshotFile {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RelationshipContextContractError(
      'encharge_snapshot_shape_invalid',
    );
  }
  const snapshot = parsed as Partial<EnchargeSnapshotFile>;
  if (
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(snapshot.generatedAt)) ||
    !Array.isArray(snapshot.records) ||
    snapshot.records.length > 2_000
  ) {
    throw new RelationshipContextContractError(
      'encharge_snapshot_contract_invalid',
    );
  }
  for (const record of snapshot.records) {
    const keys = Object.keys(record).sort();
    if (
      !record ||
      !Number.isSafeInteger(record.partyId) ||
      record.partyId < 1 ||
      !HASH_RE.test(record.emailFingerprint) ||
      typeof record.enchargePersonId !== 'string' ||
      !record.enchargePersonId.trim() ||
      record.enchargePersonId.length > 500 ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      ![true, false, null].includes(record.globalUnsubscribed) ||
      !record.communicationCategories ||
      typeof record.communicationCategories !== 'object' ||
      Array.isArray(record.communicationCategories) ||
      !isCategoryMap(
        record.communicationCategories as Record<string, unknown>,
      ) ||
      keys.join(',') !==
        'communicationCategories,emailFingerprint,enchargePersonId,globalUnsubscribed,partyId,updatedAt'
    ) {
      throw new RelationshipContextContractError(
        'encharge_snapshot_record_invalid',
      );
    }
    assertBoundedJson(record.communicationCategories);
  }
  return snapshot as EnchargeSnapshotFile;
}

interface PartyEmailRow extends QueryResultRow {
  party_id: string;
  email: string;
}

function normalizedEmailFingerprint(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
}

function enchargeRegistry(): RelationshipContextRegistry {
  const registry = new RelationshipContextRegistry();
  registry.registerFact(ENCHARGE_CONSENT_FACT);
  registry.registerAdapter(new StaticReconciliationAdapter(enchargeManifest));
  registry.markConformance(ENCHARGE_SNAPSHOT_ADAPTER_KEY, 'passed');
  return registry;
}

export async function ingestEnchargeSnapshotWithClient(input: {
  client: PoolClient;
  snapshot: EnchargeSnapshotFile;
}): Promise<{
  records: number;
  exactEnchargeReferences: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
  refusedIdentity: number;
  referenceConflicts: number;
}> {
  const observedAt = new Date(input.snapshot.generatedAt).toISOString();
  await registerAdapter(input.client, enchargeManifest, observedAt, {
    mode: 'private_file_snapshot',
    provider_network: false,
    provider_write: false,
    raw_email_persisted: false,
  });
  const partyIds = [...new Set(input.snapshot.records.map((r) => r.partyId))];
  const emailRows = await input.client.query<PartyEmailRow>(
    `SELECT business_v2.canonical_party_id(pe.party_id)::text AS party_id,
            lower(trim(pe.email::text)) AS email
       FROM business_v2.party_emails pe
       JOIN business_v2.parties p
         ON p.id=business_v2.canonical_party_id(pe.party_id)
      WHERE business_v2.canonical_party_id(pe.party_id)=ANY($1::bigint[])
        AND p.merged_into IS NULL`,
    [partyIds],
  );
  const fingerprintParties = new Map<string, Set<number>>();
  const partyFingerprints = new Map<number, Set<string>>();
  for (const row of emailRows.rows) {
    const partyId = Number(row.party_id);
    const fingerprint = normalizedEmailFingerprint(row.email);
    const owners = fingerprintParties.get(fingerprint) ?? new Set<number>();
    owners.add(partyId);
    fingerprintParties.set(fingerprint, owners);
    const fingerprints = partyFingerprints.get(partyId) ?? new Set<string>();
    fingerprints.add(fingerprint);
    partyFingerprints.set(partyId, fingerprints);
  }

  const repository = new PostgresRelationshipContextRepository(input.client);
  const facts: ObservationBatch['facts'] = [];
  let exactEnchargeReferences = 0;
  let refusedIdentity = 0;
  let referenceConflicts = 0;
  for (const record of input.snapshot.records) {
    const canonicalParty = await repository.canonicalParty(record.partyId);
    const owners = fingerprintParties.get(record.emailFingerprint);
    if (
      !canonicalParty ||
      !partyFingerprints.get(canonicalParty)?.has(record.emailFingerprint) ||
      owners?.size !== 1 ||
      !owners.has(canonicalParty)
    ) {
      refusedIdentity += 1;
      continue;
    }
    const reference = {
      provider: 'encharge',
      scope: PROVIDER_RECONCILIATION_SCOPE,
      entityType: 'person',
      externalId: record.enchargePersonId,
    } as const;
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId: canonicalParty,
      reference,
      adapterKey: ENCHARGE_SNAPSHOT_ADAPTER_KEY,
      adapterVersion: ENCHARGE_SNAPSHOT_ADAPTER_VERSION,
      observedAt: record.updatedAt,
      verifiedAt: observedAt,
      receiptSha256: sha256Json({
        rule: 'encharge_unique_party_email_fingerprint_v1',
        decision: PROVIDER_RECONCILIATION_DECISION,
        party_id: canonicalParty,
        email_fingerprint: record.emailFingerprint,
        encharge_person_id: record.enchargePersonId,
      }),
      evidenceTier: 'encharge_unique_party_email_fingerprint_v1',
    });
    if (!bound) {
      referenceConflicts += 1;
      continue;
    }
    exactEnchargeReferences += 1;
    const value = {
      global_unsubscribed: record.globalUnsubscribed,
      communication_categories: record.communicationCategories,
      identity_basis: 'unique_party_email_fingerprint',
    };
    facts.push({
      factType: ENCHARGE_CONSENT_FACT_TYPE,
      sourceFactKey: `${record.enchargePersonId}:${sha256Json({
        updatedAt: record.updatedAt,
        value,
      }).slice(0, 32)}`,
      subject: reference,
      value,
      sourceSystem: 'encharge',
      sourceScope: PROVIDER_RECONCILIATION_SCOPE,
      sourceRecordType: 'person',
      sourceRecordId: record.enchargePersonId,
      sourceEventId: null,
      effectiveAt: record.updatedAt,
      observedAt: record.updatedAt,
      verifiedAt: observedAt,
      freshUntil: new Date(
        Date.parse(record.updatedAt) + 86_400_000,
      ).toISOString(),
      confidence: 'provider_asserted',
      conflictState: 'none',
      privacyClass: 'internal',
      factSchemaVersion: 1,
    });
  }
  const total = {
    observationsNew: 0,
    observationsDuplicate: 0,
    projectionsChanged: 0,
  };
  const registry = enchargeRegistry();
  for (let index = 0; index < facts.length; index += 200) {
    const chunk = facts.slice(index, index + 200);
    const result = await ingestRelationshipContextBatch({
      repository,
      registry,
      batch: {
        adapterKey: ENCHARGE_SNAPSHOT_ADAPTER_KEY,
        adapterVersion: ENCHARGE_SNAPSHOT_ADAPTER_VERSION,
        sourceSystem: 'encharge',
        sourceScope: PROVIDER_RECONCILIATION_SCOPE,
        complete: true,
        watermark: observedAt,
        externalReferences: chunk.map(
          (fact) =>
            fact.subject as (typeof chunk)[number]['subject'] & {
              provider: string;
              scope: string;
              entityType: string;
              externalId: string;
            },
        ),
        identityCandidates: [],
        facts: chunk,
        errors: [],
      },
    });
    total.observationsNew += result.observationsNew;
    total.observationsDuplicate += result.observationsDuplicate;
    total.projectionsChanged += result.projectionsChanged;
  }
  return {
    records: input.snapshot.records.length,
    exactEnchargeReferences,
    refusedIdentity,
    referenceConflicts,
    ...total,
  };
}

export async function ingestEnchargeSnapshotFile(path: string): Promise<{
  records: number;
  exactEnchargeReferences: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
  refusedIdentity: number;
  referenceConflicts: number;
}> {
  const snapshot = parseEnchargeSnapshotFile(path);
  return withAgentContext('relationship-context-encharge-snapshot', (client) =>
    ingestEnchargeSnapshotWithClient({ client, snapshot }),
  );
}

export function providerReconciliationManifests(): AdapterManifestV1[] {
  return [structuredClone(plutioManifest), structuredClone(enchargeManifest)];
}
