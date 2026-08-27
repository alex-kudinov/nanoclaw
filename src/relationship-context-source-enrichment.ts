import crypto from 'node:crypto';
import https from 'node:https';

import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  type AdapterHealthReceipt,
  type AdapterManifestV1,
  type FactCatalogEntry,
  type NormalizedFactInput,
  type PersonEnrichmentAdapterV1,
  RelationshipContextContractError,
  assertBoundedJson,
  sha256Json,
} from './relationship-context-contract.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import { bindExternalRefOrRecordConflict } from './relationship-context-provider-reconciliation.js';
import {
  PostgresRelationshipContextRepository,
  identityExceptionFingerprint,
  type RelationshipContextRepository,
} from './relationship-context-store.js';
import { ingestRelationshipContextBatch } from './relationship-context.js';

export const SOURCE_ENRICHMENT_INTERVAL_MS = 15 * 60 * 1000;
export const SOURCE_ENRICHMENT_MAX_SOURCE_ROWS = 5_000;
export const STRIPE_ADAPTER_KEY = 'stripe_account_snapshot';
export const STRIPE_ADAPTER_VERSION = '1.0.0';
export const CONTACT_FORM_ADAPTER_KEY = 'contact_form_host_ledger';
export const CONTACT_FORM_ADAPTER_VERSION = '1.0.0';
export const CHAOS_VERIFIED_ADAPTER_KEY = 'chaos_verified_host_ledger';
export const CHAOS_VERIFIED_ADAPTER_VERSION = '1.0.0';
export const CONTACT_FORM_SCOPE = 'tandem-web';
export const CHAOS_VERIFIED_SCOPE = 'tandem-web';
export const STRIPE_CUSTOMER_FACT = 'commercial.stripe.customer@1';
export const STRIPE_PAYMENT_INTENT_FACT =
  'commercial.stripe.payment_intent_status@1';
export const STRIPE_SUBSCRIPTION_FACT =
  'commercial.stripe.subscription_status@1';
export const CONTACT_FORM_SUBMISSION_FACT =
  'attribution.contact_form.submission@1';
export const CHAOS_VERIFIED_VISITOR_FACT =
  'attribution.chaos.verified_visitor@1';

const ENRICHMENT_DECISION =
  'decision:relationship-context-stripe-contact-chaos-enrichment-2026-08-26';
const CONTACT_FORM_WATERMARK = 'relationship-context-contact-form';
const CHAOS_VERIFIED_WATERMARK = 'relationship-context-chaos-verified';
const STRIPE_MAX_PAGES_PER_TIME_PARTITION = 100;
const STRIPE_MAX_PARTITION_DEPTH = 32;
const STRIPE_SCOPES = ['heartbeat', 'tandem'] as const;
export type StripeSourceScope = (typeof STRIPE_SCOPES)[number];

const stripeManifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: STRIPE_ADAPTER_KEY,
  adapterVersion: STRIPE_ADAPTER_VERSION,
  sourceSystem: 'stripe',
  supportedScopes: [...STRIPE_SCOPES],
  externalReferenceTypes: ['customer', 'payment_intent', 'subscription'],
  factTypes: [
    STRIPE_CUSTOMER_FACT,
    STRIPE_PAYMENT_INTENT_FACT,
    STRIPE_SUBSCRIPTION_FACT,
  ],
  identityClaimTypes: [],
  collectionModes: ['snapshot', 'reconciliation'],
  projectionTargets: ['commercial'],
  privacyClasses: ['internal', 'restricted_identifier'],
  credentialHandle: 'stripe_read_accounts',
  healthPolicy: 'stripe_account_snapshot_fail_closed',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

const contactManifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: CONTACT_FORM_ADAPTER_KEY,
  adapterVersion: CONTACT_FORM_ADAPTER_VERSION,
  sourceSystem: 'contact_form',
  supportedScopes: [CONTACT_FORM_SCOPE],
  externalReferenceTypes: ['submission'],
  factTypes: [CONTACT_FORM_SUBMISSION_FACT],
  identityClaimTypes: [],
  collectionModes: ['reconciliation'],
  projectionTargets: ['attribution'],
  privacyClasses: ['internal', 'restricted_identifier'],
  credentialHandle: null,
  healthPolicy: 'immutable_host_inbox_exact_submission',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

const chaosManifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: CHAOS_VERIFIED_ADAPTER_KEY,
  adapterVersion: CHAOS_VERIFIED_ADAPTER_VERSION,
  sourceSystem: 'chaos',
  supportedScopes: [CHAOS_VERIFIED_SCOPE],
  externalReferenceTypes: ['visitor'],
  factTypes: [CHAOS_VERIFIED_VISITOR_FACT],
  identityClaimTypes: [],
  collectionModes: ['reconciliation'],
  projectionTargets: ['attribution'],
  privacyClasses: ['internal', 'restricted_identifier'],
  credentialHandle: null,
  healthPolicy: 'verified_host_ledger_agreement',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

const FACT_CATALOG: FactCatalogEntry[] = [
  {
    factType: STRIPE_CUSTOMER_FACT,
    schemaVersion: 1,
    projectionTarget: 'commercial',
    privacyClass: 'internal',
    maxAgeSeconds: 86_400,
    cardinality: 'many',
    authorityClass: 'native',
  },
  {
    factType: STRIPE_PAYMENT_INTENT_FACT,
    schemaVersion: 1,
    projectionTarget: 'commercial',
    privacyClass: 'internal',
    maxAgeSeconds: 900,
    cardinality: 'many',
    authorityClass: 'native',
  },
  {
    factType: STRIPE_SUBSCRIPTION_FACT,
    schemaVersion: 1,
    projectionTarget: 'commercial',
    privacyClass: 'internal',
    maxAgeSeconds: 900,
    cardinality: 'many',
    authorityClass: 'native',
  },
  {
    factType: CONTACT_FORM_SUBMISSION_FACT,
    schemaVersion: 1,
    projectionTarget: 'attribution',
    privacyClass: 'internal',
    maxAgeSeconds: null,
    cardinality: 'many',
    authorityClass: 'native',
  },
  {
    factType: CHAOS_VERIFIED_VISITOR_FACT,
    schemaVersion: 1,
    projectionTarget: 'attribution',
    privacyClass: 'internal',
    maxAgeSeconds: null,
    cardinality: 'many',
    authorityClass: 'native',
  },
];

class StaticSourceAdapter implements PersonEnrichmentAdapterV1 {
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
    return { ok: false, code: 'source_enrichment_config_not_empty' };
  }

  health(): AdapterHealthReceipt {
    return {
      adapterKey: this.manifest.adapterKey,
      sourceScope: this.manifest.supportedScopes[0],
      status: 'healthy',
      observedAt: new Date(0).toISOString(),
      errorCode: null,
    };
  }
}

function registryFor(manifest: AdapterManifestV1): RelationshipContextRegistry {
  const registry = new RelationshipContextRegistry();
  for (const factType of manifest.factTypes) {
    const entry = FACT_CATALOG.find(
      (candidate) => candidate.factType === factType,
    );
    if (!entry) {
      throw new RelationshipContextContractError(
        'source_enrichment_fact_catalog_missing',
      );
    }
    registry.registerFact(entry);
  }
  registry.registerAdapter(new StaticSourceAdapter(manifest));
  registry.markConformance(manifest.adapterKey, 'passed');
  return registry;
}

async function registerAdapter(
  client: PoolClient,
  manifest: AdapterManifestV1,
  scope: string,
  observedAt: string,
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
      scope,
      manifest.manifestVersion,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify(configDeclaration),
      conformanceSha256,
      observedAt,
    ],
  );
}

function emailFingerprint(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || !normalized.includes('@')) {
    return null;
  }
  return normalized;
}

function normalizeInstant(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function boundedCode(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9._-]{0,99}$/.test(normalized) ? normalized : 'unknown';
}

export function normalizeAttributionPage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2_048 || /[\u0000-\u001f\u007f<>]/.test(raw)) {
    return null;
  }
  if (/^external:[a-z0-9.-]+$/i.test(raw)) return raw.toLowerCase();
  if (raw.startsWith('/')) {
    const path = raw.split(/[?#]/, 1)[0];
    return path.length <= 200 ? path : null;
  }
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'tandemcoach.co' || hostname.endsWith('.tandemcoach.co')) {
      return parsed.pathname.length <= 200 ? parsed.pathname : null;
    }
    return /^[a-z0-9.-]{1,180}$/.test(hostname) ? `external:${hostname}` : null;
  } catch {
    return null;
  }
}

async function partyOwnersByEmail(
  client: PoolClient,
): Promise<Map<string, Set<number>>> {
  const result = await client.query<{ email: string; party_id: string }>(
    `SELECT lower(trim(pe.email::text)) AS email,
            business_v2.canonical_party_id(pe.party_id)::text AS party_id
       FROM business_v2.party_emails pe
       JOIN business_v2.parties p
         ON p.id=business_v2.canonical_party_id(pe.party_id)
      WHERE p.merged_into IS NULL`,
  );
  const owners = new Map<string, Set<number>>();
  for (const row of result.rows) {
    const parties = owners.get(row.email) ?? new Set<number>();
    parties.add(Number(row.party_id));
    owners.set(row.email, parties);
  }
  return owners;
}

interface SourceWatermark {
  lastSeenId: string | null;
  lastSeenAt: string | null;
}

async function readSourceWatermark(
  client: PoolClient,
  source: string,
): Promise<SourceWatermark> {
  const result = await client.query<{
    last_seen_id: string | null;
    last_seen_at: string | null;
  }>(
    `INSERT INTO business_v2.sweeper_watermarks (source)
     VALUES ($1)
     ON CONFLICT (source) DO UPDATE SET source=EXCLUDED.source
     RETURNING last_seen_id,last_seen_at::text AS last_seen_at`,
    [source],
  );
  return {
    lastSeenId: result.rows[0].last_seen_id,
    lastSeenAt: result.rows[0].last_seen_at,
  };
}

async function advanceSourceWatermark(input: {
  client: PoolClient;
  source: string;
  lastSeenId: string | null;
  lastSeenAt: string | null;
  recovered: number;
  failed: number;
}): Promise<void> {
  await input.client.query(
    `UPDATE business_v2.sweeper_watermarks
        SET last_seen_id=$2,last_seen_at=$3::timestamptz,
            updated_at=now(),last_run_at=now(),
            last_run_status='success',last_run_error=NULL,
            last_run_recovered=$4,last_run_failed=$5
      WHERE source=$1`,
    [
      input.source,
      input.lastSeenId,
      input.lastSeenAt,
      input.recovered,
      input.failed,
    ],
  );
}

async function recordTerminalLegacy(input: {
  client: PoolClient;
  reference: {
    provider: string;
    scope: string;
    entityType: string;
    externalId: string;
  };
  partyIds: number[];
  evidenceTier: string;
  observedAt: string;
}): Promise<void> {
  const partyIds = [...new Set(input.partyIds)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .slice(0, 20);
  const fingerprint = identityExceptionFingerprint({
    sourceSystem: input.reference.provider,
    sourceScope: input.reference.scope,
    sourceRef: input.reference,
    reasonCode: 'needs_identity',
    partyIds: [],
  });
  const evidenceRefs = {
    source_ref_sha256: sha256Json(input.reference),
    source_system: input.reference.provider,
    source_scope: input.reference.scope,
    entity_type: input.reference.entityType,
    classification: 'legacy',
    evidence_tier: input.evidenceTier,
    candidate_count: partyIds.length,
    decision: ENRICHMENT_DECISION,
  };
  const resolutionReceipt = sha256Json({
    reference: input.reference,
    party_ids: partyIds,
    classification: 'legacy',
    evidence_tier: input.evidenceTier,
    decision: ENRICHMENT_DECISION,
  });
  await input.client.query(
    `INSERT INTO business_v2.party_identity_exceptions
       (fingerprint,current_party_id,candidate_party_ids,reason_code,status,
        owner_group,evidence_refs,occurrence_count,first_seen_at,last_seen_at,
        resolution_code,resolution_receipt_sha256,resolved_at)
     VALUES ($1,NULL,$2::bigint[],'legacy_identity','no_action','chief',
             $3::jsonb,1,$4::timestamptz,$4::timestamptz,
             'legacy_unresolved',$5,$4::timestamptz)
     ON CONFLICT (fingerprint) DO UPDATE
       SET current_party_id=NULL,candidate_party_ids=EXCLUDED.candidate_party_ids,
           reason_code='legacy_identity',status='no_action',
           evidence_refs=EXCLUDED.evidence_refs,
           last_seen_at=GREATEST(
             business_v2.party_identity_exceptions.last_seen_at,
             EXCLUDED.last_seen_at
           ),
           resolution_code='legacy_unresolved',
           resolution_receipt_sha256=EXCLUDED.resolution_receipt_sha256,
           resolved_at=EXCLUDED.resolved_at,updated_at=now()`,
    [
      fingerprint,
      partyIds,
      JSON.stringify(evidenceRefs),
      input.observedAt,
      resolutionReceipt,
    ],
  );
}

async function resolvePriorLegacy(input: {
  client: PoolClient;
  reference: {
    provider: string;
    scope: string;
    entityType: string;
    externalId: string;
  };
  partyId: number;
  observedAt: string;
  evidenceTier: string;
}): Promise<void> {
  const fingerprint = identityExceptionFingerprint({
    sourceSystem: input.reference.provider,
    sourceScope: input.reference.scope,
    sourceRef: input.reference,
    reasonCode: 'needs_identity',
    partyIds: [],
  });
  await input.client.query(
    `UPDATE business_v2.party_identity_exceptions
        SET current_party_id=$2,candidate_party_ids=ARRAY[$2]::bigint[],
            reason_code='exact_reference_bound',status='resolved',
            evidence_refs=evidence_refs || $3::jsonb,
            resolution_code='exact_reference_bound',
            resolution_receipt_sha256=$4,resolved_at=$5::timestamptz,
            updated_at=now()
      WHERE fingerprint=$1 AND status<>'resolved'`,
    [
      fingerprint,
      input.partyId,
      JSON.stringify({
        classification: 'exact',
        evidence_tier: input.evidenceTier,
        decision: ENRICHMENT_DECISION,
      }),
      sha256Json({
        reference: input.reference,
        party_id: input.partyId,
        evidence_tier: input.evidenceTier,
        decision: ENRICHMENT_DECISION,
      }),
      input.observedAt,
    ],
  );
}

async function reactivateSamePartyRef(input: {
  client: PoolClient;
  reference: {
    provider: string;
    scope: string;
    entityType: string;
    externalId: string;
  };
  partyId: number;
}): Promise<void> {
  await input.client.query(
    `UPDATE business_v2.party_external_refs
        SET status='active',updated_at=now()
      WHERE provider=$1 AND source_scope=$2 AND entity_type=$3
        AND external_id=$4 AND status='conflicted'
        AND business_v2.canonical_party_id(party_id)=
            business_v2.canonical_party_id($5)`,
    [
      input.reference.provider,
      input.reference.scope,
      input.reference.entityType,
      input.reference.externalId,
      input.partyId,
    ],
  );
}

async function ingestFacts(input: {
  repository: RelationshipContextRepository;
  manifest: AdapterManifestV1;
  scope: string;
  facts: NormalizedFactInput[];
  watermark: string;
}): Promise<{
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
}> {
  const totals = {
    observationsNew: 0,
    observationsDuplicate: 0,
    projectionsChanged: 0,
  };
  const registry = registryFor(input.manifest);
  for (let index = 0; index < input.facts.length; index += 200) {
    const facts = input.facts.slice(index, index + 200);
    const result = await ingestRelationshipContextBatch({
      repository: input.repository,
      registry,
      batch: {
        adapterKey: input.manifest.adapterKey,
        adapterVersion: input.manifest.adapterVersion,
        sourceSystem: input.manifest.sourceSystem,
        sourceScope: input.scope,
        complete: true,
        watermark: input.watermark,
        externalReferences: facts.map((fact) => {
          if ('partyId' in fact.subject) {
            throw new RelationshipContextContractError(
              'source_enrichment_party_subject_forbidden',
            );
          }
          return fact.subject;
        }),
        identityCandidates: [],
        facts,
        errors: [],
      },
    });
    totals.observationsNew += result.observationsNew;
    totals.observationsDuplicate += result.observationsDuplicate;
    totals.projectionsChanged += result.projectionsChanged;
  }
  return totals;
}

export interface StripeCustomerSource {
  id: string;
  email: string | null;
  createdAt: string | null;
  delinquent: boolean;
}

export interface StripePaymentIntentSource {
  id: string;
  customerId: string | null;
  status: string;
  createdAt: string | null;
  currency: string | null;
}

export interface StripeSubscriptionSource {
  id: string;
  customerId: string | null;
  status: string;
  createdAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface StripeAccountSnapshot {
  scope: StripeSourceScope;
  accountId: string;
  observedAt: string;
  customers: StripeCustomerSource[];
  paymentIntents: StripePaymentIntentSource[];
  subscriptions: StripeSubscriptionSource[];
  complete: boolean;
}

export function stripeCustomerEvidenceTier(input: {
  hasEmail: boolean;
  providerEmailCount: number;
  candidatePartyIds: number[];
}): string {
  if (!input.hasEmail) return 'stripe_customer_email_missing';
  if (input.providerEmailCount !== 1) {
    return 'stripe_account_email_not_unique';
  }
  if (input.candidatePartyIds.length === 0) return 'stripe_customer_unmatched';
  if (input.candidatePartyIds.length > 1) {
    return 'stripe_customer_party_ambiguous';
  }
  return 'stripe_unique_account_email_to_unique_party_v1';
}

export function contactFormEvidenceTier(input: {
  hasEmail: boolean;
  candidatePartyIds: number[];
}): string {
  if (!input.hasEmail) return 'contact_submission_email_missing';
  if (input.candidatePartyIds.length === 0) {
    return 'contact_submission_party_unmatched';
  }
  if (input.candidatePartyIds.length > 1) {
    return 'contact_submission_party_ambiguous';
  }
  return 'contact_exact_submission_unique_party_v1';
}

export function chaosVerifiedEvidenceTier(input: {
  interactionPartyIds: number[];
  inboxPartyIds: number[];
  verifiedInboxCount: number;
}): string {
  if (input.interactionPartyIds.length === 0) {
    return 'chaos_verified_interaction_missing';
  }
  if (input.interactionPartyIds.length > 1) {
    return 'chaos_interaction_party_conflict';
  }
  if (input.inboxPartyIds.length === 0) {
    return 'chaos_verified_inbox_party_missing';
  }
  if (
    input.inboxPartyIds.length > 1 ||
    input.interactionPartyIds[0] !== input.inboxPartyIds[0]
  ) {
    return 'chaos_verified_party_mismatch';
  }
  if (input.verifiedInboxCount < 1) {
    return 'chaos_verified_evidence_missing';
  }
  return 'chaos_verified_inbox_interaction_agreement_v1';
}

interface StripeListResponse {
  data?: Array<Record<string, unknown>>;
  has_more?: boolean;
  error?: { type?: string };
}

export interface StripeSnapshotDeps {
  getJson?: (key: string, path: string) => Promise<Record<string, unknown>>;
  keyForScope?: (scope: StripeSourceScope) => string;
  maxPagesPerPartition?: number;
}

function stripeKey(scope: StripeSourceScope): string {
  const env = readEnvFile(['STRIPE_RESTRICTED_KEY', 'STRIPE_SECRET_KEY_ALT']);
  const key =
    scope === 'heartbeat'
      ? env.STRIPE_RESTRICTED_KEY
      : env.STRIPE_SECRET_KEY_ALT;
  if (!key) throw new Error(`stripe_${scope}_credential_unavailable`);
  return key;
}

function stripeGetJson(
  key: string,
  path: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: 'api.stripe.com',
        path,
        headers: {
          Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => {
          let parsed: StripeListResponse;
          try {
            parsed = JSON.parse(body) as StripeListResponse;
          } catch {
            reject(new Error('stripe_response_invalid'));
            return;
          }
          if ((response.statusCode ?? 500) >= 400 || parsed.error) {
            reject(
              new Error(
                `stripe_http_${response.statusCode ?? 0}_${boundedCode(parsed.error?.type)}`,
              ),
            );
            return;
          }
          resolve(parsed as Record<string, unknown>);
        });
      },
    );
    request.on('error', () => reject(new Error('stripe_request_failed')));
    request.setTimeout(20_000, () =>
      request.destroy(new Error('stripe_request_timeout')),
    );
  });
}

async function listStripeObjects(input: {
  key: string;
  path: string;
  params?: Record<string, string>;
  getJson: NonNullable<StripeSnapshotDeps['getJson']>;
  createdGte: number;
  createdLt: number;
  partitionDepth?: number;
  maxPagesPerPartition?: number;
}): Promise<{ rows: Array<Record<string, unknown>>; complete: boolean }> {
  const rows: Array<Record<string, unknown>> = [];
  let startingAfter: string | null = null;
  let hasMore = true;
  let pages = 0;
  const maxPages =
    input.maxPagesPerPartition ?? STRIPE_MAX_PAGES_PER_TIME_PARTITION;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
    throw new Error('stripe_snapshot_page_limit_invalid');
  }
  while (hasMore && pages < maxPages) {
    const search = new URLSearchParams({
      ...(input.params ?? {}),
      limit: '100',
      'created[gte]': String(input.createdGte),
      'created[lt]': String(input.createdLt),
    });
    if (startingAfter) search.set('starting_after', startingAfter);
    const page = (await input.getJson(
      input.key,
      `${input.path}?${search.toString()}`,
    )) as StripeListResponse;
    if (!Array.isArray(page.data)) throw new Error('stripe_list_shape_invalid');
    rows.push(...page.data);
    hasMore = page.has_more === true;
    startingAfter =
      typeof page.data.at(-1)?.id === 'string'
        ? (page.data.at(-1)?.id as string)
        : null;
    if (hasMore && !startingAfter) {
      throw new Error('stripe_pagination_cursor_missing');
    }
    pages += 1;
  }
  if (!hasMore) return { rows, complete: true };
  const depth = input.partitionDepth ?? 0;
  const width = input.createdLt - input.createdGte;
  if (depth >= STRIPE_MAX_PARTITION_DEPTH || width <= 1) {
    throw new Error('stripe_snapshot_time_partition_overflow');
  }
  const midpoint = input.createdGte + Math.floor(width / 2);
  const earlier = await listStripeObjects({
    ...input,
    createdLt: midpoint,
    partitionDepth: depth + 1,
  });
  const later = await listStripeObjects({
    ...input,
    createdGte: midpoint,
    partitionDepth: depth + 1,
  });
  const deduplicated = new Map<string, Record<string, unknown>>();
  for (const row of [...earlier.rows, ...later.rows]) {
    if (typeof row.id !== 'string' || deduplicated.has(row.id)) {
      throw new Error('stripe_snapshot_partition_identity_conflict');
    }
    deduplicated.set(row.id, row);
  }
  return { rows: [...deduplicated.values()], complete: true };
}

function stripeObjectId(
  value: unknown,
  prefix: 'cus' | 'pi' | 'sub',
): string | null {
  return typeof value === 'string' &&
    new RegExp(`^${prefix}_[A-Za-z0-9_]{1,480}$`).test(value)
    ? value
    : null;
}

function stripeCustomerId(value: unknown): string | null {
  if (typeof value === 'string') return stripeObjectId(value, 'cus');
  if (value && typeof value === 'object') {
    return stripeObjectId((value as Record<string, unknown>).id, 'cus');
  }
  return null;
}

export async function fetchStripeAccountSnapshot(
  scope: StripeSourceScope,
  observedAt: string,
  deps: StripeSnapshotDeps = {},
): Promise<StripeAccountSnapshot> {
  if (!STRIPE_SCOPES.includes(scope)) {
    throw new RelationshipContextContractError('stripe_source_scope_invalid');
  }
  const normalizedObservedAt = normalizeInstant(observedAt);
  if (!normalizedObservedAt) {
    throw new RelationshipContextContractError(
      'stripe_snapshot_observed_at_invalid',
    );
  }
  const key = (deps.keyForScope ?? stripeKey)(scope);
  const getJson = deps.getJson ?? stripeGetJson;
  const createdLt = Math.floor(Date.parse(normalizedObservedAt) / 1000) + 1;
  const [account, customerPage, paymentPage, subscriptionPage] =
    await Promise.all([
      getJson(key, '/v1/account'),
      listStripeObjects({
        key,
        path: '/v1/customers',
        getJson,
        createdGte: 0,
        createdLt,
        maxPagesPerPartition: deps.maxPagesPerPartition,
      }),
      listStripeObjects({
        key,
        path: '/v1/payment_intents',
        getJson,
        createdGte: 0,
        createdLt,
        maxPagesPerPartition: deps.maxPagesPerPartition,
      }),
      listStripeObjects({
        key,
        path: '/v1/subscriptions',
        params: { status: 'all' },
        getJson,
        createdGte: 0,
        createdLt,
        maxPagesPerPartition: deps.maxPagesPerPartition,
      }),
    ]);
  const accountId =
    typeof account.id === 'string' &&
    /^acct_[A-Za-z0-9_]{1,480}$/.test(account.id)
      ? account.id
      : null;
  if (!accountId) throw new Error('stripe_account_identity_unavailable');
  const customers = customerPage.rows.flatMap((row) => {
    const id = stripeObjectId(row.id, 'cus');
    if (!id) return [];
    return [
      {
        id,
        email: normalizeEmail(row.email),
        createdAt: normalizeInstant(row.created),
        delinquent: row.delinquent === true,
      },
    ];
  });
  const paymentIntents = paymentPage.rows.flatMap((row) => {
    const id = stripeObjectId(row.id, 'pi');
    if (!id) return [];
    return [
      {
        id,
        customerId: stripeCustomerId(row.customer),
        status: boundedCode(row.status),
        createdAt: normalizeInstant(row.created),
        currency:
          typeof row.currency === 'string' && /^[a-z]{3}$/.test(row.currency)
            ? row.currency
            : null,
      },
    ];
  });
  const subscriptions = subscriptionPage.rows.flatMap((row) => {
    const id = stripeObjectId(row.id, 'sub');
    if (!id) return [];
    return [
      {
        id,
        customerId: stripeCustomerId(row.customer),
        status: boundedCode(row.status),
        createdAt: normalizeInstant(row.created),
        currentPeriodEnd: normalizeInstant(row.current_period_end),
        cancelAtPeriodEnd: row.cancel_at_period_end === true,
      },
    ];
  });
  return {
    scope,
    accountId,
    observedAt: normalizedObservedAt,
    customers,
    paymentIntents,
    subscriptions,
    complete:
      customerPage.complete &&
      paymentPage.complete &&
      subscriptionPage.complete,
  };
}

export async function ingestStripeAccountSnapshotWithClient(input: {
  client: PoolClient;
  snapshot: StripeAccountSnapshot;
}): Promise<StripeAccountResult> {
  const { client, snapshot } = input;
  if (!snapshot.complete) throw new Error('stripe_snapshot_incomplete');
  const ownersByEmail = await partyOwnersByEmail(client);
  const providerEmailCounts = new Map<string, number>();
  for (const customer of snapshot.customers) {
    if (customer.email) {
      providerEmailCounts.set(
        customer.email,
        (providerEmailCounts.get(customer.email) ?? 0) + 1,
      );
    }
  }
  await registerAdapter(
    client,
    stripeManifest,
    snapshot.scope,
    snapshot.observedAt,
    {
      mode: 'provider_read_only_snapshot',
      account_scope: snapshot.scope,
      account_id_sha256: sha256Json(snapshot.accountId),
      provider_write: false,
      raw_email_persisted: false,
      card_or_amount_data_persisted: false,
    },
  );
  const repository = new PostgresRelationshipContextRepository(client);
  const facts: NormalizedFactInput[] = [];
  const exactCustomerParties = new Map<string, number>();
  let legacyCustomers = 0;
  let identityConflicts = 0;
  for (const customer of snapshot.customers) {
    const reference = {
      provider: 'stripe',
      scope: snapshot.scope,
      entityType: 'customer',
      externalId: customer.id,
    } as const;
    const candidates = customer.email
      ? [...(ownersByEmail.get(customer.email) ?? [])].sort((a, b) => a - b)
      : [];
    const existingParty = await repository.resolveExternalRef(reference);
    const evidenceTier = existingParty
      ? 'stripe_existing_exact_customer_ref_v1'
      : stripeCustomerEvidenceTier({
          hasEmail: customer.email != null,
          providerEmailCount: customer.email
            ? (providerEmailCounts.get(customer.email) ?? 0)
            : 0,
          candidatePartyIds: candidates,
        });
    if (
      evidenceTier !== 'stripe_unique_account_email_to_unique_party_v1' &&
      !existingParty
    ) {
      legacyCustomers += 1;
      await recordTerminalLegacy({
        client,
        reference,
        partyIds: candidates,
        evidenceTier,
        observedAt: snapshot.observedAt,
      });
      continue;
    }
    const partyId = existingParty ?? candidates[0];
    await reactivateSamePartyRef({ client, reference, partyId });
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId,
      reference,
      adapterKey: STRIPE_ADAPTER_KEY,
      adapterVersion: STRIPE_ADAPTER_VERSION,
      observedAt: snapshot.observedAt,
      verifiedAt: snapshot.observedAt,
      receiptSha256: sha256Json({
        rule: evidenceTier,
        decision: ENRICHMENT_DECISION,
        scope: snapshot.scope,
        account_id_sha256: sha256Json(snapshot.accountId),
        party_id: partyId,
        customer_id: customer.id,
        email_fingerprint: customer.email
          ? emailFingerprint(customer.email)
          : null,
      }),
      evidenceTier,
    });
    if (!bound) {
      identityConflicts += 1;
      continue;
    }
    exactCustomerParties.set(customer.id, partyId);
    await resolvePriorLegacy({
      client,
      reference,
      partyId,
      observedAt: snapshot.observedAt,
      evidenceTier,
    });
    const value = {
      status: 'active',
      delinquent: customer.delinquent,
      identity_basis: 'exact_customer_ref',
    };
    facts.push({
      factType: STRIPE_CUSTOMER_FACT,
      sourceFactKey: `${customer.id}:${sha256Json(value).slice(0, 32)}`,
      subject: reference,
      value,
      sourceSystem: 'stripe',
      sourceScope: snapshot.scope,
      sourceRecordType: 'customer',
      sourceRecordId: customer.id,
      sourceEventId: null,
      effectiveAt: customer.createdAt,
      observedAt: snapshot.observedAt,
      verifiedAt: snapshot.observedAt,
      freshUntil: new Date(
        Date.parse(snapshot.observedAt) + 86_400_000,
      ).toISOString(),
      confidence: 'provider_asserted',
      conflictState: 'none',
      privacyClass: 'internal',
      factSchemaVersion: 1,
    });
  }

  let exactPaymentIntentReferences = 0;
  let exactSubscriptionReferences = 0;
  let heldNativeFacts = 0;
  for (const payment of snapshot.paymentIntents) {
    const partyId = payment.customerId
      ? exactCustomerParties.get(payment.customerId)
      : undefined;
    if (!partyId) {
      heldNativeFacts += 1;
      continue;
    }
    const reference = {
      provider: 'stripe',
      scope: snapshot.scope,
      entityType: 'payment_intent',
      externalId: payment.id,
    } as const;
    await reactivateSamePartyRef({ client, reference, partyId });
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId,
      reference,
      adapterKey: STRIPE_ADAPTER_KEY,
      adapterVersion: STRIPE_ADAPTER_VERSION,
      observedAt: snapshot.observedAt,
      verifiedAt: snapshot.observedAt,
      receiptSha256: sha256Json({
        rule: 'stripe_exact_customer_payment_intent_v1',
        decision: ENRICHMENT_DECISION,
        scope: snapshot.scope,
        party_id: partyId,
        payment_intent_id: payment.id,
        customer_id: payment.customerId,
      }),
      evidenceTier: 'stripe_exact_customer_payment_intent_v1',
    });
    if (!bound) {
      identityConflicts += 1;
      continue;
    }
    exactPaymentIntentReferences += 1;
    const value = {
      status: payment.status,
      currency: payment.currency,
      customer_link: 'exact_customer_ref',
    };
    facts.push({
      factType: STRIPE_PAYMENT_INTENT_FACT,
      sourceFactKey: `${payment.id}:${sha256Json(value).slice(0, 32)}`,
      subject: reference,
      value,
      sourceSystem: 'stripe',
      sourceScope: snapshot.scope,
      sourceRecordType: 'payment_intent',
      sourceRecordId: payment.id,
      sourceEventId: null,
      effectiveAt: null,
      observedAt: snapshot.observedAt,
      verifiedAt: snapshot.observedAt,
      freshUntil: new Date(
        Date.parse(snapshot.observedAt) + 900_000,
      ).toISOString(),
      confidence: 'source_verified',
      conflictState: 'none',
      privacyClass: 'internal',
      factSchemaVersion: 1,
    });
  }
  for (const subscription of snapshot.subscriptions) {
    const partyId = subscription.customerId
      ? exactCustomerParties.get(subscription.customerId)
      : undefined;
    if (!partyId) {
      heldNativeFacts += 1;
      continue;
    }
    const reference = {
      provider: 'stripe',
      scope: snapshot.scope,
      entityType: 'subscription',
      externalId: subscription.id,
    } as const;
    await reactivateSamePartyRef({ client, reference, partyId });
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId,
      reference,
      adapterKey: STRIPE_ADAPTER_KEY,
      adapterVersion: STRIPE_ADAPTER_VERSION,
      observedAt: snapshot.observedAt,
      verifiedAt: snapshot.observedAt,
      receiptSha256: sha256Json({
        rule: 'stripe_exact_customer_subscription_v1',
        decision: ENRICHMENT_DECISION,
        scope: snapshot.scope,
        party_id: partyId,
        subscription_id: subscription.id,
        customer_id: subscription.customerId,
      }),
      evidenceTier: 'stripe_exact_customer_subscription_v1',
    });
    if (!bound) {
      identityConflicts += 1;
      continue;
    }
    exactSubscriptionReferences += 1;
    const value = {
      status: subscription.status,
      cancel_at_period_end: subscription.cancelAtPeriodEnd,
      current_period_end: subscription.currentPeriodEnd,
      customer_link: 'exact_customer_ref',
    };
    facts.push({
      factType: STRIPE_SUBSCRIPTION_FACT,
      sourceFactKey: `${subscription.id}:${sha256Json(value).slice(0, 32)}`,
      subject: reference,
      value,
      sourceSystem: 'stripe',
      sourceScope: snapshot.scope,
      sourceRecordType: 'subscription',
      sourceRecordId: subscription.id,
      sourceEventId: null,
      effectiveAt: null,
      observedAt: snapshot.observedAt,
      verifiedAt: snapshot.observedAt,
      freshUntil: new Date(
        Date.parse(snapshot.observedAt) + 900_000,
      ).toISOString(),
      confidence: 'source_verified',
      conflictState: 'none',
      privacyClass: 'internal',
      factSchemaVersion: 1,
    });
  }
  const watermark = sha256Json({
    observed_at: snapshot.observedAt,
    facts: facts.map((fact) => [fact.factType, fact.sourceFactKey]).sort(),
  });
  const ingested = await ingestFacts({
    repository,
    manifest: stripeManifest,
    scope: snapshot.scope,
    facts,
    watermark,
  });
  return {
    scope: snapshot.scope,
    complete: snapshot.complete,
    customersScanned: snapshot.customers.length,
    paymentIntentsScanned: snapshot.paymentIntents.length,
    subscriptionsScanned: snapshot.subscriptions.length,
    exactCustomerReferences: exactCustomerParties.size,
    exactPaymentIntentReferences,
    exactSubscriptionReferences,
    legacyCustomers,
    heldNativeFacts,
    identityConflicts,
    ...ingested,
  };
}

interface ContactFormRow extends QueryResultRow {
  id: string;
  email: string | null;
  entry_page: string | null;
  submitted_at: string | null;
  received_at: Date;
}

export async function ingestContactFormLedgerWithClient(input: {
  client: PoolClient;
  observedAt: string;
  limit?: number;
}): Promise<ContactFormResult> {
  const limit = input.limit ?? SOURCE_ENRICHMENT_MAX_SOURCE_ROWS;
  const watermark = await readSourceWatermark(
    input.client,
    CONTACT_FORM_WATERMARK,
  );
  const lastSeenId =
    watermark.lastSeenId && /^\d+$/.test(watermark.lastSeenId)
      ? watermark.lastSeenId
      : '0';
  const result = await input.client.query<ContactFormRow>(
    `SELECT id::text,raw_body->>'email' AS email,
            raw_body->>'entry_page' AS entry_page,
            raw_body->>'submitted_at' AS submitted_at,received_at
       FROM business_v2.webhook_inbox
      WHERE source='contact-form' AND status='handled' AND id>$1::bigint
      ORDER BY id
      LIMIT $2`,
    [lastSeenId, limit + 1],
  );
  const complete = result.rows.length <= limit;
  const rows = result.rows.slice(0, limit);
  await registerAdapter(
    input.client,
    contactManifest,
    CONTACT_FORM_SCOPE,
    input.observedAt,
    {
      mode: 'immutable_host_inbox_read_only',
      source_relation: 'business_v2.webhook_inbox',
      source_filter: 'contact-form/handled',
      raw_submission_persisted: false,
      provider_write: false,
    },
  );
  const ownersByEmail = await partyOwnersByEmail(input.client);
  const repository = new PostgresRelationshipContextRepository(input.client);
  const facts: NormalizedFactInput[] = [];
  let exactSubmissionReferences = 0;
  let legacySubmissions = 0;
  let identityConflicts = 0;
  for (const row of rows) {
    const reference = {
      provider: 'contact_form',
      scope: CONTACT_FORM_SCOPE,
      entityType: 'submission',
      externalId: `webhook-inbox:${row.id}`,
    } as const;
    const email = normalizeEmail(row.email);
    const candidates = email
      ? [...(ownersByEmail.get(email) ?? [])].sort((a, b) => a - b)
      : [];
    const evidenceTier = contactFormEvidenceTier({
      hasEmail: email != null,
      candidatePartyIds: candidates,
    });
    if (evidenceTier !== 'contact_exact_submission_unique_party_v1') {
      legacySubmissions += 1;
      await recordTerminalLegacy({
        client: input.client,
        reference,
        partyIds: candidates,
        evidenceTier,
        observedAt: row.received_at.toISOString(),
      });
      continue;
    }
    const partyId = candidates[0];
    await reactivateSamePartyRef({
      client: input.client,
      reference,
      partyId,
    });
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId,
      reference,
      adapterKey: CONTACT_FORM_ADAPTER_KEY,
      adapterVersion: CONTACT_FORM_ADAPTER_VERSION,
      observedAt: row.received_at.toISOString(),
      verifiedAt: row.received_at.toISOString(),
      receiptSha256: sha256Json({
        rule: evidenceTier,
        decision: ENRICHMENT_DECISION,
        webhook_inbox_id: row.id,
        party_id: partyId,
        email_fingerprint: emailFingerprint(email!),
      }),
      evidenceTier,
    });
    if (!bound) {
      identityConflicts += 1;
      continue;
    }
    exactSubmissionReferences += 1;
    await resolvePriorLegacy({
      client: input.client,
      reference,
      partyId,
      observedAt: row.received_at.toISOString(),
      evidenceTier,
    });
    const value = {
      entry_page: normalizeAttributionPage(row.entry_page),
      identity_state: 'exact_submission',
      source_record: 'webhook_inbox',
    };
    facts.push({
      factType: CONTACT_FORM_SUBMISSION_FACT,
      sourceFactKey: `webhook-inbox:${row.id}`,
      subject: reference,
      value,
      sourceSystem: 'contact_form',
      sourceScope: CONTACT_FORM_SCOPE,
      sourceRecordType: 'submission',
      sourceRecordId: `webhook-inbox:${row.id}`,
      sourceEventId: null,
      effectiveAt: normalizeInstant(row.submitted_at),
      observedAt: row.received_at.toISOString(),
      verifiedAt: row.received_at.toISOString(),
      freshUntil: null,
      confidence: 'source_verified',
      conflictState: 'none',
      privacyClass: 'internal',
      factSchemaVersion: 1,
    });
  }
  const ingested = await ingestFacts({
    repository,
    manifest: contactManifest,
    scope: CONTACT_FORM_SCOPE,
    facts,
    watermark: sha256Json(facts.map((fact) => fact.sourceFactKey).sort()),
  });
  const totals = await input.client.query<{
    exact_count: string;
    legacy_count: string;
  }>(
    `SELECT
       (SELECT count(*)::text
          FROM business_v2.party_external_refs
         WHERE provider='contact_form' AND source_scope=$1
           AND entity_type='submission' AND status='active') AS exact_count,
       (SELECT count(*)::text
          FROM business_v2.party_identity_exceptions
         WHERE status='no_action' AND reason_code='legacy_identity'
           AND evidence_refs->>'source_system'='contact_form'
           AND evidence_refs->>'source_scope'=$1) AS legacy_count`,
    [CONTACT_FORM_SCOPE],
  );
  const lastRow = rows.at(-1);
  await advanceSourceWatermark({
    client: input.client,
    source: CONTACT_FORM_WATERMARK,
    lastSeenId: complete ? '0' : (lastRow?.id ?? watermark.lastSeenId),
    lastSeenAt: lastRow?.received_at.toISOString() ?? watermark.lastSeenAt,
    recovered: 0,
    failed: identityConflicts,
  });
  return {
    complete,
    scanned: rows.length,
    exactSubmissionReferences: Number(totals.rows[0].exact_count),
    legacySubmissions: Number(totals.rows[0].legacy_count),
    identityConflicts,
    ...ingested,
  };
}

interface ChaosLedgerRow extends QueryResultRow {
  visitor_id: string;
  interaction_party_ids: string[];
  inbox_party_ids: string[];
  verified_inbox_count: string;
  missing_inbox_party_count: string;
  form_event_type: string | null;
  form_page: string | null;
  occurred_at: Date | null;
  observed_at: string;
}

interface ChaosChangeCursor {
  version: 1;
  interactionId: string;
  inboxId: string;
  interactionCovered: boolean;
  inboxCovered: boolean;
}

interface ChaosChangedRow extends QueryResultRow {
  id: string;
  visitor_id: string;
}

function parseChaosChangeCursor(value: string | null): ChaosChangeCursor {
  if (!value) {
    return {
      version: 1,
      interactionId: '0',
      inboxId: '0',
      interactionCovered: false,
      inboxCovered: false,
    };
  }
  try {
    const parsed = JSON.parse(value) as Partial<ChaosChangeCursor>;
    if (
      parsed.version === 1 &&
      typeof parsed.interactionId === 'string' &&
      /^\d+$/.test(parsed.interactionId) &&
      typeof parsed.inboxId === 'string' &&
      /^\d+$/.test(parsed.inboxId) &&
      typeof parsed.interactionCovered === 'boolean' &&
      typeof parsed.inboxCovered === 'boolean'
    ) {
      return parsed as ChaosChangeCursor;
    }
  } catch {
    // Fail closed below; this cursor is host-owned state, not user input.
  }
  throw new Error('chaos_verified_watermark_invalid');
}

export async function ingestChaosVerifiedLedgerWithClient(input: {
  client: PoolClient;
  observedAt: string;
  limit?: number;
}): Promise<ChaosVerifiedResult> {
  const limit = input.limit ?? SOURCE_ENRICHMENT_MAX_SOURCE_ROWS;
  if (!Number.isSafeInteger(limit) || limit < 2 || limit > 10_000) {
    throw new Error('chaos_verified_limit_invalid');
  }
  const watermark = await readSourceWatermark(
    input.client,
    CHAOS_VERIFIED_WATERMARK,
  );
  const cursor = parseChaosChangeCursor(watermark.lastSeenId);
  const perSourceLimit = Math.floor(limit / 2);
  const [interactionChanges, inboxChanges] = await Promise.all([
    input.client.query<ChaosChangedRow>(
      `SELECT i.id::text,i.source_id AS visitor_id
         FROM business_v2.interactions i
        WHERE i.id>$1::bigint
          AND i.source_provider='chaos' AND i.source_id IS NOT NULL
        ORDER BY i.id
        LIMIT $2`,
      [cursor.interactionId, perSourceLimit + 1],
    ),
    input.client.query<ChaosChangedRow>(
      `SELECT w.id::text,w.raw_body->>'visitor_id' AS visitor_id
         FROM business_v2.webhook_inbox w
        WHERE w.id>$1::bigint
          AND w.source='chaos' AND w.raw_body->>'visitor_id' IS NOT NULL
        ORDER BY w.id
        LIMIT $2`,
      [cursor.inboxId, perSourceLimit + 1],
    ),
  ]);
  const interactionComplete = interactionChanges.rows.length <= perSourceLimit;
  const inboxComplete = inboxChanges.rows.length <= perSourceLimit;
  const selectedInteractionChanges = interactionChanges.rows.slice(
    0,
    perSourceLimit,
  );
  const selectedInboxChanges = inboxChanges.rows.slice(0, perSourceLimit);
  const changedVisitorIds = [
    ...new Set(
      [...selectedInteractionChanges, ...selectedInboxChanges].map(
        (row) => row.visitor_id,
      ),
    ),
  ].sort();
  const eventIds = changedVisitorIds.map(
    (visitorId) => `chaos:visitor:${visitorId}:verified`,
  );
  const result =
    changedVisitorIds.length === 0
      ? { rows: [] as ChaosLedgerRow[] }
      : await input.client.query<ChaosLedgerRow>(
          `WITH interaction_rows AS (
       SELECT i.source_id AS visitor_id,
              array_remove(array_agg(DISTINCT
                business_v2.canonical_party_id(i.party_id)::text),NULL)
                AS interaction_party_ids,
              min(i.metadata->>'form_event_type') AS form_event_type,
              min(i.metadata->>'form_page') AS form_page,
              min(i.occurred_at) AS occurred_at,
              max(i.updated_at) AS observed_at
         FROM business_v2.interactions i
        WHERE i.source_provider='chaos' AND i.source_id=ANY($1::text[])
        GROUP BY i.source_id
     ), inbox_rows AS (
       SELECT w.raw_body->>'visitor_id' AS visitor_id,
              array_remove(array_agg(DISTINCT
                business_v2.canonical_party_id(w.party_id)::text),NULL)
                AS inbox_party_ids,
              count(*) FILTER (
                WHERE w.status IN ('handled','duplicate')
                  AND w.raw_body->>'identity_status'='verified'
              )::text AS verified_inbox_count,
              count(*) FILTER (WHERE w.party_id IS NULL)::text
                AS missing_inbox_party_count,
              max(w.received_at) AS observed_at
         FROM business_v2.webhook_inbox w
        WHERE w.source='chaos' AND (
          w.event_id=ANY($2::text[]) OR
          (w.event_id IS NULL AND w.raw_body->>'visitor_id'=ANY($1::text[]))
        )
        GROUP BY w.raw_body->>'visitor_id'
     )
     SELECT coalesce(i.visitor_id,w.visitor_id) AS visitor_id,
            coalesce(i.interaction_party_ids,'{}'::text[])
              AS interaction_party_ids,
            coalesce(w.inbox_party_ids,'{}'::text[]) AS inbox_party_ids,
            coalesce(w.verified_inbox_count,'0') AS verified_inbox_count,
            coalesce(w.missing_inbox_party_count,'0')
              AS missing_inbox_party_count,
            i.form_event_type,i.form_page,i.occurred_at,
            greatest(coalesce(i.observed_at,'epoch'::timestamptz),
                     coalesce(w.observed_at,'epoch'::timestamptz))::text
              AS observed_at
       FROM interaction_rows i FULL OUTER JOIN inbox_rows w USING (visitor_id)
      ORDER BY coalesce(i.visitor_id,w.visitor_id)`,
          [changedVisitorIds, eventIds],
        );
  const interactionCovered = cursor.interactionCovered || interactionComplete;
  const inboxCovered = cursor.inboxCovered || inboxComplete;
  const complete = interactionCovered && inboxCovered;
  const rows = result.rows;
  await registerAdapter(
    input.client,
    chaosManifest,
    CHAOS_VERIFIED_SCOPE,
    input.observedAt,
    {
      mode: 'verified_host_ledger_read_only',
      source_relations: [
        'business_v2.webhook_inbox',
        'business_v2.interactions',
      ],
      verified_link_required: true,
      browsing_history_persisted: false,
      provider_write: false,
    },
  );
  const repository = new PostgresRelationshipContextRepository(input.client);
  const facts: NormalizedFactInput[] = [];
  let exactVisitorReferences = 0;
  let legacyVisitors = 0;
  let identityConflicts = 0;
  for (const row of rows) {
    const rowObservedAt = normalizeInstant(row.observed_at);
    if (!rowObservedAt) throw new Error('chaos_observed_at_invalid');
    if (!/^\d{1,40}$/.test(row.visitor_id)) {
      legacyVisitors += 1;
      await recordTerminalLegacy({
        client: input.client,
        reference: {
          provider: 'chaos',
          scope: CHAOS_VERIFIED_SCOPE,
          entityType: 'visitor',
          externalId: `malformed:${sha256Json(row.visitor_id)}`,
        },
        partyIds: [
          ...row.interaction_party_ids.map(Number),
          ...row.inbox_party_ids.map(Number),
        ],
        evidenceTier: 'chaos_visitor_id_malformed',
        observedAt: rowObservedAt,
      });
      continue;
    }
    const reference = {
      provider: 'chaos',
      scope: CHAOS_VERIFIED_SCOPE,
      entityType: 'visitor',
      externalId: row.visitor_id,
    } as const;
    const interactionParties = row.interaction_party_ids.map(Number);
    const inboxParties = row.inbox_party_ids.map(Number);
    const evidenceTier = chaosVerifiedEvidenceTier({
      interactionPartyIds: interactionParties,
      inboxPartyIds: inboxParties,
      verifiedInboxCount: Number(row.verified_inbox_count),
    });
    const safe =
      evidenceTier === 'chaos_verified_inbox_interaction_agreement_v1';
    if (!safe) {
      legacyVisitors += 1;
      const conflicted = await input.client.query(
        `UPDATE business_v2.party_external_refs
            SET status='conflicted',updated_at=now()
          WHERE provider='chaos' AND source_scope=$1
            AND entity_type='visitor' AND external_id=$2
            AND status='active'`,
        [CHAOS_VERIFIED_SCOPE, row.visitor_id],
      );
      identityConflicts += conflicted.rowCount ?? 0;
      await recordTerminalLegacy({
        client: input.client,
        reference,
        partyIds: [...interactionParties, ...inboxParties],
        evidenceTier,
        observedAt: rowObservedAt,
      });
      continue;
    }
    const partyId = interactionParties[0];
    await reactivateSamePartyRef({
      client: input.client,
      reference,
      partyId,
    });
    const bound = await bindExternalRefOrRecordConflict({
      repository,
      partyId,
      reference,
      adapterKey: CHAOS_VERIFIED_ADAPTER_KEY,
      adapterVersion: CHAOS_VERIFIED_ADAPTER_VERSION,
      observedAt: rowObservedAt,
      verifiedAt: rowObservedAt,
      receiptSha256: sha256Json({
        rule: evidenceTier,
        decision: ENRICHMENT_DECISION,
        visitor_id: row.visitor_id,
        party_id: partyId,
      }),
      evidenceTier,
    });
    if (!bound) {
      identityConflicts += 1;
      continue;
    }
    exactVisitorReferences += 1;
    await resolvePriorLegacy({
      client: input.client,
      reference,
      partyId,
      observedAt: rowObservedAt,
      evidenceTier,
    });
    const value = {
      form_event_type: boundedCode(row.form_event_type),
      form_page: normalizeAttributionPage(row.form_page),
      identity_state: 'verified_link',
    };
    facts.push({
      factType: CHAOS_VERIFIED_VISITOR_FACT,
      sourceFactKey: `${row.visitor_id}:${sha256Json(value).slice(0, 32)}`,
      subject: reference,
      value,
      sourceSystem: 'chaos',
      sourceScope: CHAOS_VERIFIED_SCOPE,
      sourceRecordType: 'visitor',
      sourceRecordId: row.visitor_id,
      sourceEventId: `chaos:visitor:${row.visitor_id}:verified`,
      effectiveAt: row.occurred_at?.toISOString() ?? null,
      observedAt: rowObservedAt,
      verifiedAt: rowObservedAt,
      freshUntil: null,
      confidence: 'source_verified',
      conflictState: 'none',
      privacyClass: 'internal',
      factSchemaVersion: 1,
    });
  }
  const ingested = await ingestFacts({
    repository,
    manifest: chaosManifest,
    scope: CHAOS_VERIFIED_SCOPE,
    facts,
    watermark: sha256Json(facts.map((fact) => fact.sourceFactKey).sort()),
  });
  const totals = await input.client.query<{
    exact_count: string;
    legacy_count: string;
    conflict_count: string;
  }>(
    `SELECT
       (SELECT count(*)::text
          FROM business_v2.party_external_refs
         WHERE provider='chaos' AND source_scope=$1
           AND entity_type='visitor' AND status='active') AS exact_count,
       (SELECT count(*)::text
          FROM business_v2.party_identity_exceptions
         WHERE status='no_action' AND reason_code='legacy_identity'
           AND evidence_refs->>'source_system'='chaos'
           AND evidence_refs->>'source_scope'=$1) AS legacy_count,
       (SELECT count(*)::text
          FROM business_v2.party_external_refs
         WHERE provider='chaos' AND source_scope=$1
           AND entity_type='visitor' AND status='conflicted') AS conflict_count`,
    [CHAOS_VERIFIED_SCOPE],
  );
  const nextCursor: ChaosChangeCursor = {
    version: 1,
    interactionId: interactionComplete
      ? '0'
      : (selectedInteractionChanges.at(-1)?.id ?? cursor.interactionId),
    inboxId: inboxComplete
      ? '0'
      : (selectedInboxChanges.at(-1)?.id ?? cursor.inboxId),
    interactionCovered,
    inboxCovered,
  };
  await advanceSourceWatermark({
    client: input.client,
    source: CHAOS_VERIFIED_WATERMARK,
    lastSeenId: JSON.stringify(nextCursor),
    lastSeenAt: input.observedAt,
    recovered: 0,
    failed: identityConflicts,
  });
  return {
    complete,
    scanned: rows.length,
    interactionChangesScanned: selectedInteractionChanges.length,
    inboxChangesScanned: selectedInboxChanges.length,
    interactionPageComplete: interactionComplete,
    inboxPageComplete: inboxComplete,
    exactVisitorReferences: Number(totals.rows[0].exact_count),
    legacyVisitors: Number(totals.rows[0].legacy_count),
    identityConflicts: Number(totals.rows[0].conflict_count),
    ...ingested,
  };
}

export interface StripeAccountResult {
  scope: StripeSourceScope;
  complete: boolean;
  customersScanned: number;
  paymentIntentsScanned: number;
  subscriptionsScanned: number;
  exactCustomerReferences: number;
  exactPaymentIntentReferences: number;
  exactSubscriptionReferences: number;
  legacyCustomers: number;
  heldNativeFacts: number;
  identityConflicts: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
}

export interface ContactFormResult {
  complete: boolean;
  scanned: number;
  exactSubmissionReferences: number;
  legacySubmissions: number;
  identityConflicts: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
}

export interface ChaosVerifiedResult {
  complete: boolean;
  scanned: number;
  interactionChangesScanned: number;
  inboxChangesScanned: number;
  interactionPageComplete: boolean;
  inboxPageComplete: boolean;
  exactVisitorReferences: number;
  legacyVisitors: number;
  identityConflicts: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
}

export interface SourceEnrichmentHealth {
  enabled: boolean;
  mode: 'read_only_shadow';
  consumerEnabled: false;
  status: 'disabled' | 'never_run' | 'healthy' | 'degraded';
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  stripe: Partial<Record<StripeSourceScope, StripeAccountResult>>;
  contactForm: ContactFormResult | null;
  chaos: ChaosVerifiedResult | null;
  errorCodes: string[];
}

function baseHealth(): SourceEnrichmentHealth {
  return {
    enabled: false,
    mode: 'read_only_shadow',
    consumerEnabled: false,
    status: 'disabled',
    lastRunAt: null,
    lastSuccessAt: null,
    stripe: {},
    contactForm: null,
    chaos: null,
    errorCodes: [],
  };
}

let currentHealth = baseHealth();

export function sourceEnrichmentEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELATIONSHIP_CONTEXT_SOURCE_ENRICHMENT_ENABLED === '1';
}

export function getSourceEnrichmentHealth(): SourceEnrichmentHealth {
  return structuredClone(currentHealth);
}

export function resetSourceEnrichmentHealthForTests(): void {
  currentHealth = baseHealth();
}

function errorCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z][a-z0-9_]{0,99}$/.test(message) ? message : fallback;
}

export function stripeAccountScopeGate(
  accountIds: Array<string | null>,
): 'verified' | 'unverified' | 'collision' {
  if (
    accountIds.length !== STRIPE_SCOPES.length ||
    accountIds.some((accountId) => accountId == null)
  ) {
    return 'unverified';
  }
  return new Set(accountIds as string[]).size === accountIds.length
    ? 'verified'
    : 'collision';
}

export async function runRelationshipContextSourceEnrichment(
  input: {
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    fetchStripe?: typeof fetchStripeAccountSnapshot;
  } = {},
): Promise<SourceEnrichmentHealth> {
  if (!sourceEnrichmentEnabled(input.env)) {
    currentHealth = baseHealth();
    return getSourceEnrichmentHealth();
  }
  const runAt = new Date(input.nowMs ?? Date.now()).toISOString();
  currentHealth = {
    ...currentHealth,
    enabled: true,
    status: currentHealth.lastSuccessAt ? 'healthy' : 'never_run',
    lastRunAt: runAt,
    errorCodes: [],
  };
  const errors: string[] = [];
  const stripe: SourceEnrichmentHealth['stripe'] = {};
  const fetchStripe = input.fetchStripe ?? fetchStripeAccountSnapshot;
  const snapshots = await Promise.all(
    STRIPE_SCOPES.map(async (scope) => {
      try {
        return {
          scope,
          snapshot: await fetchStripe(scope, runAt),
          error: null,
        };
      } catch (error) {
        return { scope, snapshot: null, error };
      }
    }),
  );
  const stripeGate = stripeAccountScopeGate(
    snapshots.map((entry) => entry.snapshot?.accountId ?? null),
  );
  if (stripeGate === 'unverified') {
    errors.push('stripe_account_distinctness_unverified');
  }
  if (stripeGate === 'collision') errors.push('stripe_account_scope_collision');
  for (const fetched of snapshots) {
    if (!fetched.snapshot) {
      errors.push(
        errorCode(fetched.error, `stripe_${fetched.scope}_snapshot_failed`),
      );
      continue;
    }
    if (stripeGate !== 'verified') continue;
    try {
      stripe[fetched.scope] = await withAgentContext(
        `relationship-context-stripe-${fetched.scope}`,
        (client) =>
          ingestStripeAccountSnapshotWithClient({
            client,
            snapshot: fetched.snapshot!,
          }),
      );
    } catch (error) {
      errors.push(errorCode(error, `stripe_${fetched.scope}_ingest_failed`));
    }
  }
  let contactForm: ContactFormResult | null = null;
  try {
    contactForm = await withAgentContext(
      'relationship-context-contact-form',
      (client) =>
        ingestContactFormLedgerWithClient({ client, observedAt: runAt }),
    );
  } catch (error) {
    errors.push(errorCode(error, 'contact_form_ingest_failed'));
  }
  let chaos: ChaosVerifiedResult | null = null;
  try {
    chaos = await withAgentContext(
      'relationship-context-chaos-verified',
      (client) =>
        ingestChaosVerifiedLedgerWithClient({ client, observedAt: runAt }),
    );
  } catch (error) {
    errors.push(errorCode(error, 'chaos_verified_ingest_failed'));
  }
  const complete =
    STRIPE_SCOPES.every((scope) => stripe[scope]?.complete === true) &&
    contactForm?.complete === true &&
    chaos?.complete === true;
  currentHealth = {
    enabled: true,
    mode: 'read_only_shadow',
    consumerEnabled: false,
    status: errors.length === 0 && complete ? 'healthy' : 'degraded',
    lastRunAt: runAt,
    lastSuccessAt:
      errors.length === 0 && complete ? runAt : currentHealth.lastSuccessAt,
    stripe,
    contactForm,
    chaos,
    errorCodes: [...new Set(errors)].sort(),
  };
  if (currentHealth.status === 'healthy') {
    logger.info(
      currentHealth,
      'relationship context source enrichment complete',
    );
  } else {
    logger.warn(
      currentHealth,
      'relationship context source enrichment degraded',
    );
  }
  return getSourceEnrichmentHealth();
}

export function sourceEnrichmentManifests(): AdapterManifestV1[] {
  return [stripeManifest, contactManifest, chaosManifest].map((manifest) =>
    structuredClone(manifest),
  );
}
