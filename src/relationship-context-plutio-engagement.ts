import type { PoolClient } from 'pg';

import { withAgentContext } from './business-db.js';
import { logger } from './logger.js';
import { callPlutioTool, stripToJson } from './plutio-cli.js';
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
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import { PostgresRelationshipContextRepository } from './relationship-context-store.js';
import { ingestRelationshipContextBatch } from './relationship-context.js';

export const PLUTIO_ENGAGEMENT_INTERVAL_MS = 15 * 60 * 1000;
export const PLUTIO_ENGAGEMENT_ADAPTER_KEY = 'plutio_engagement_snapshot';
export const PLUTIO_ENGAGEMENT_ADAPTER_VERSION = '1.0.0';
export const PLUTIO_ENGAGEMENT_SCOPE = 'primary-engagement';
export const PLUTIO_PERSON_SCOPE = 'primary';
export const PLUTIO_COACHING_PROJECT_FACT =
  'relationship.plutio.coaching_project@1';

const PLUTIO_ENGAGEMENT_DECISION =
  'decision:relationship-context-plutio-engagement-enrichment-2026-08-26';
const PLUTIO_PAGE_LIMIT = 100;
const PLUTIO_PAGE_CAP = 50;
const PLUTIO_PROJECT_FRESHNESS_MS = 26 * 60 * 60 * 1000;
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,160}$/;

const COACHING_FIELD_CODES = new Map<string, string>([
  ['Number of Sessions', 'session_count'],
  ['Coach', 'coach'],
  ['Session Duration', 'session_duration'],
  ['Number of Sessions (Group)', 'group_session_count'],
  ['Mentor Coach', 'mentor_coach'],
  ['Individual Mentor Hours', 'individual_mentor_hours'],
  ['Group Mentor Hours', 'group_mentor_hours'],
  ['ICF Credential', 'icf_credential'],
]);

export type PlutioProjectStatus =
  | 'in_progress'
  | 'completed'
  | 'new'
  | 'canceled'
  | 'unknown';

export type PlutioEngagementState =
  | 'current'
  | 'historical'
  | 'planned'
  | 'canceled'
  | 'unknown';

interface PlutioProjectClient {
  id: string;
  entityType: 'person' | 'company' | 'unknown';
}

export interface PlutioEngagementProject {
  id: string;
  status: PlutioProjectStatus;
  engagementState: PlutioEngagementState;
  clients: PlutioProjectClient[];
  coachingFieldCodes: string[];
  signedContractCorroborated: boolean;
  effectiveAt: string | null;
  updatedAt: string;
}

export interface PlutioEngagementSnapshot {
  observedAt: string;
  complete: true;
  projectsScanned: number;
  contractsScanned: number;
  customFieldsScanned: number;
  signedContracts: number;
  signedContractsWithoutProject: number;
  projects: PlutioEngagementProject[];
}

const manifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: PLUTIO_ENGAGEMENT_ADAPTER_KEY,
  adapterVersion: PLUTIO_ENGAGEMENT_ADAPTER_VERSION,
  sourceSystem: 'plutio',
  supportedScopes: [PLUTIO_ENGAGEMENT_SCOPE],
  externalReferenceTypes: ['person'],
  factTypes: [PLUTIO_COACHING_PROJECT_FACT],
  identityClaimTypes: [],
  collectionModes: ['snapshot', 'reconciliation'],
  projectionTargets: ['relationship'],
  privacyClasses: ['internal'],
  credentialHandle: 'plutio_read_only',
  healthPolicy: 'plutio_exact_client_coaching_project_snapshot',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

const factCatalog: FactCatalogEntry = {
  factType: PLUTIO_COACHING_PROJECT_FACT,
  schemaVersion: 1,
  projectionTarget: 'relationship',
  privacyClass: 'internal',
  maxAgeSeconds: 26 * 60 * 60,
  cardinality: 'many',
  authorityClass: 'native',
};

class PlutioEngagementAdapter implements PersonEnrichmentAdapterV1 {
  describe(): AdapterManifestV1 {
    return structuredClone(manifest);
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
    return { ok: false, code: 'plutio_engagement_config_not_empty' };
  }

  health(): AdapterHealthReceipt {
    return {
      adapterKey: PLUTIO_ENGAGEMENT_ADAPTER_KEY,
      sourceScope: PLUTIO_ENGAGEMENT_SCOPE,
      status: 'healthy',
      observedAt: new Date(0).toISOString(),
      errorCode: null,
    };
  }
}

function registry(): RelationshipContextRegistry {
  const result = new RelationshipContextRegistry();
  result.registerFact(factCatalog);
  result.registerAdapter(new PlutioEngagementAdapter());
  result.markConformance(PLUTIO_ENGAGEMENT_ADAPTER_KEY, 'passed');
  return result;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedProviderId(value: unknown): string | null {
  return typeof value === 'string' && PROVIDER_ID.test(value) ? value : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function statusLabel(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const nested = record(value);
  if (!nested) return null;
  const candidate = nested.name ?? nested.title ?? nested.status;
  return typeof candidate === 'string' ? candidate : null;
}

export function normalizePlutioProjectStatus(value: unknown): {
  status: PlutioProjectStatus;
  engagementState: PlutioEngagementState;
} {
  const normalized = statusLabel(value)?.trim().toLowerCase();
  if (normalized === 'in progress') {
    return { status: 'in_progress', engagementState: 'current' };
  }
  if (normalized === 'completed') {
    return { status: 'completed', engagementState: 'historical' };
  }
  if (normalized === 'new') {
    return { status: 'new', engagementState: 'planned' };
  }
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return { status: 'canceled', engagementState: 'canceled' };
  }
  return { status: 'unknown', engagementState: 'unknown' };
}

function meaningfulCustomFieldValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'number' || typeof value === 'boolean';
}

function parseJsonArray(raw: string, code: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(raw));
  } catch {
    throw new Error(code);
  }
  if (!Array.isArray(parsed)) throw new Error(code);
  const rows = parsed.map(record);
  if (rows.some((row) => row == null)) throw new Error(code);
  return rows as Record<string, unknown>[];
}

async function fetchAll(input: {
  script: 'list-projects.sh' | 'list-contracts.sh';
  callTool: typeof callPlutioTool;
  code: string;
}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  for (let page = 0; page < PLUTIO_PAGE_CAP; page += 1) {
    const raw = await input.callTool(input.script, [
      '--limit',
      String(PLUTIO_PAGE_LIMIT),
      '--skip',
      String(page * PLUTIO_PAGE_LIMIT),
    ]);
    const current = parseJsonArray(raw, input.code);
    for (const row of current) {
      const id = boundedProviderId(row._id);
      if (!id) throw new Error(`${input.code}_id_invalid`);
      if (ids.has(id)) throw new Error(`${input.code}_duplicate_id`);
      ids.add(id);
      rows.push(row);
    }
    if (current.length < PLUTIO_PAGE_LIMIT) return rows;
  }
  throw new Error(`${input.code}_page_cap`);
}

async function fetchCustomFields(
  callTool: typeof callPlutioTool,
): Promise<Record<string, unknown>[]> {
  const raw = await callTool('list-custom-fields.sh', [
    '--entity-type',
    'project',
    '--limit',
    String(PLUTIO_PAGE_LIMIT),
  ]);
  const rows = parseJsonArray(raw, 'plutio_engagement_custom_fields_invalid');
  if (rows.length >= PLUTIO_PAGE_LIMIT) {
    throw new Error('plutio_engagement_custom_fields_incomplete');
  }
  return rows;
}

function coachingFieldMap(
  definitions: Record<string, unknown>[],
): Map<string, string> {
  const result = new Map<string, string>();
  const codes = new Set<string>();
  for (const definition of definitions) {
    if (definition.entityType !== 'project') continue;
    const id = boundedProviderId(definition._id);
    const title =
      typeof definition.title === 'string' ? definition.title.trim() : '';
    const code = COACHING_FIELD_CODES.get(title);
    if (!id || !code) continue;
    if (result.has(id) || codes.has(code)) {
      throw new Error('plutio_engagement_custom_field_conflict');
    }
    result.set(id, code);
    codes.add(code);
  }
  if (result.size !== COACHING_FIELD_CODES.size) {
    throw new Error('plutio_engagement_custom_field_catalog_incomplete');
  }
  return result;
}

function projectClients(value: unknown): PlutioProjectClient[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 100) {
    throw new Error('plutio_engagement_project_clients_too_large');
  }
  const clients = new Map<string, PlutioProjectClient>();
  for (const entry of value) {
    const nested = record(entry);
    const id = boundedProviderId(nested?._id);
    if (!nested || !id) {
      throw new Error('plutio_engagement_project_client_invalid');
    }
    const entityType =
      nested.entityType === 'person'
        ? 'person'
        : nested.entityType === 'company'
          ? 'company'
          : 'unknown';
    const key = `${entityType}:${id}`;
    clients.set(key, { id, entityType });
  }
  return [...clients.values()].sort((a, b) =>
    `${a.entityType}:${a.id}`.localeCompare(`${b.entityType}:${b.id}`),
  );
}

function coachingCodes(value: unknown, fields: Map<string, string>): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 100) {
    throw new Error('plutio_engagement_project_custom_fields_too_large');
  }
  const codes = new Set<string>();
  for (const entry of value) {
    const nested = record(entry);
    const id = boundedProviderId(nested?._id);
    if (!nested || !id || !meaningfulCustomFieldValue(nested.value)) continue;
    const code = fields.get(id);
    if (code) codes.add(code);
  }
  return [...codes].sort();
}

async function fetchPlutioEngagementSnapshotOnce(input: {
  observedAt: string;
  callTool?: typeof callPlutioTool;
}): Promise<PlutioEngagementSnapshot> {
  const callTool = input.callTool ?? callPlutioTool;
  const [projectRows, contractRows, customFieldRows] = await Promise.all([
    fetchAll({
      script: 'list-projects.sh',
      callTool,
      code: 'plutio_engagement_projects_invalid',
    }),
    fetchAll({
      script: 'list-contracts.sh',
      callTool,
      code: 'plutio_engagement_contracts_invalid',
    }),
    fetchCustomFields(callTool),
  ]);
  const fields = coachingFieldMap(customFieldRows);
  const projectIds = new Set(
    projectRows.map((row) => boundedProviderId(row._id)!).filter(Boolean),
  );
  const signedProjectIds = new Set<string>();
  let signedContracts = 0;
  let signedContractsWithoutProject = 0;
  for (const contract of contractRows) {
    if (statusLabel(contract.status)?.trim().toLowerCase() !== 'signed') {
      continue;
    }
    signedContracts += 1;
    const projectId = boundedProviderId(contract.projectId);
    if (!projectId || !projectIds.has(projectId)) {
      signedContractsWithoutProject += 1;
      continue;
    }
    signedProjectIds.add(projectId);
  }
  const projects: PlutioEngagementProject[] = [];
  for (const row of projectRows) {
    const id = boundedProviderId(row._id);
    if (!id) throw new Error('plutio_engagement_project_id_invalid');
    const updatedAt = timestamp(row.updatedAt);
    if (!updatedAt)
      throw new Error('plutio_engagement_project_updated_at_invalid');
    const normalized = normalizePlutioProjectStatus(row.status);
    projects.push({
      id,
      ...normalized,
      clients: projectClients(row.clients),
      coachingFieldCodes: coachingCodes(row.customFields, fields),
      signedContractCorroborated: signedProjectIds.has(id),
      effectiveAt: timestamp(row.startDate) ?? timestamp(row.createdAt),
      updatedAt,
    });
  }
  return {
    observedAt: input.observedAt,
    complete: true,
    projectsScanned: projectRows.length,
    contractsScanned: contractRows.length,
    customFieldsScanned: customFieldRows.length,
    signedContracts,
    signedContractsWithoutProject,
    projects: projects.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export async function fetchPlutioEngagementSnapshot(input: {
  observedAt: string;
  callTool?: typeof callPlutioTool;
}): Promise<PlutioEngagementSnapshot> {
  const first = await fetchPlutioEngagementSnapshotOnce(input);
  const second = await fetchPlutioEngagementSnapshotOnce(input);
  if (sha256Json(first) !== sha256Json(second)) {
    throw new Error('plutio_engagement_snapshot_drift');
  }
  return second;
}

async function registerAdapter(
  client: PoolClient,
  observedAt: string,
): Promise<void> {
  assertBoundedJson(manifest);
  const manifestSha256 = sha256Json(manifest);
  await client.query(
    `INSERT INTO business_v2.party_context_adapter_registrations
       (adapter_key,adapter_version,source_system,source_scope,
        manifest_version,manifest_sha256,manifest,config_declaration,
        enabled,conformance_status,conformance_receipt_sha256,
        circuit_status,failure_count,last_error_code,last_health_at)
     VALUES ($1,$2,$3,$4,1,$5,$6::jsonb,$7::jsonb,true,'passed',$8,
             'closed',0,NULL,$9::timestamptz)
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
      PLUTIO_ENGAGEMENT_SCOPE,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify({
        mode: 'read_only_snapshot',
        credential_handle: manifest.credentialHandle,
        decision: PLUTIO_ENGAGEMENT_DECISION,
      }),
      sha256Json({
        suite: manifest.conformanceSuite,
        manifest_sha256: manifestSha256,
        result: 'passed',
      }),
      observedAt,
    ],
  );
}

export interface PlutioEngagementResult {
  complete: boolean;
  projectsScanned: number;
  contractsScanned: number;
  customFieldsScanned: number;
  signedContracts: number;
  signedContractsWithoutProject: number;
  coachingProjects: number;
  currentProjects: number;
  historicalProjects: number;
  plannedProjects: number;
  canceledProjects: number;
  unknownStatusProjects: number;
  exactPersonLinks: number;
  distinctExactParties: number;
  unsupportedCompanyLinks: number;
  unsupportedOtherLinks: number;
  missingExactPersonReferences: number;
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
}

export async function ingestPlutioEngagementSnapshotWithClient(input: {
  client: PoolClient;
  snapshot: PlutioEngagementSnapshot;
}): Promise<PlutioEngagementResult> {
  await registerAdapter(input.client, input.snapshot.observedAt);
  const repository = new PostgresRelationshipContextRepository(input.client);
  const facts: NormalizedFactInput[] = [];
  const exactPartyIds = new Set<number>();
  const result: PlutioEngagementResult = {
    complete: input.snapshot.complete,
    projectsScanned: input.snapshot.projectsScanned,
    contractsScanned: input.snapshot.contractsScanned,
    customFieldsScanned: input.snapshot.customFieldsScanned,
    signedContracts: input.snapshot.signedContracts,
    signedContractsWithoutProject: input.snapshot.signedContractsWithoutProject,
    coachingProjects: 0,
    currentProjects: 0,
    historicalProjects: 0,
    plannedProjects: 0,
    canceledProjects: 0,
    unknownStatusProjects: 0,
    exactPersonLinks: 0,
    distinctExactParties: 0,
    unsupportedCompanyLinks: 0,
    unsupportedOtherLinks: 0,
    missingExactPersonReferences: 0,
    observationsNew: 0,
    observationsDuplicate: 0,
    projectionsChanged: 0,
  };
  for (const project of input.snapshot.projects) {
    if (project.coachingFieldCodes.length === 0) continue;
    result.coachingProjects += 1;
    if (project.engagementState === 'current') result.currentProjects += 1;
    else if (project.engagementState === 'historical') {
      result.historicalProjects += 1;
    } else if (project.engagementState === 'planned') {
      result.plannedProjects += 1;
    } else if (project.engagementState === 'canceled') {
      result.canceledProjects += 1;
    } else result.unknownStatusProjects += 1;
    for (const client of project.clients) {
      if (client.entityType === 'company') {
        result.unsupportedCompanyLinks += 1;
        continue;
      }
      if (client.entityType !== 'person') {
        result.unsupportedOtherLinks += 1;
        continue;
      }
      const reference = {
        provider: 'plutio',
        scope: PLUTIO_PERSON_SCOPE,
        entityType: 'person',
        externalId: client.id,
      } as const;
      const partyId = await repository.resolveExternalRef(reference);
      if (!partyId) {
        result.missingExactPersonReferences += 1;
        continue;
      }
      exactPartyIds.add(partyId);
      result.exactPersonLinks += 1;
      const value = {
        project_status: project.status,
        engagement_state: project.engagementState,
        coaching_field_codes: project.coachingFieldCodes,
        signed_contract_corroborated: project.signedContractCorroborated,
        client_link: 'exact_plutio_person_ref',
      };
      facts.push({
        factType: PLUTIO_COACHING_PROJECT_FACT,
        sourceFactKey: `${project.id}:${client.id}:${sha256Json(value).slice(0, 32)}`,
        subject: { partyId },
        value,
        sourceSystem: 'plutio',
        sourceScope: PLUTIO_ENGAGEMENT_SCOPE,
        sourceRecordType: 'project',
        sourceRecordId: project.id,
        sourceEventId: null,
        effectiveAt: project.effectiveAt,
        observedAt: input.snapshot.observedAt,
        verifiedAt: input.snapshot.observedAt,
        freshUntil: new Date(
          Date.parse(input.snapshot.observedAt) + PLUTIO_PROJECT_FRESHNESS_MS,
        ).toISOString(),
        confidence: 'source_verified',
        conflictState: 'none',
        privacyClass: 'internal',
        factSchemaVersion: 1,
      });
    }
  }
  result.distinctExactParties = exactPartyIds.size;
  if (facts.length > 200) {
    throw new Error('plutio_engagement_fact_batch_too_large');
  }
  const watermark = sha256Json({
    projects: input.snapshot.projects.map((project) => [
      project.id,
      project.updatedAt,
      project.status,
      project.signedContractCorroborated,
    ]),
  });
  const ingested = await ingestRelationshipContextBatch({
    repository,
    registry: registry(),
    batch: {
      adapterKey: manifest.adapterKey,
      adapterVersion: manifest.adapterVersion,
      sourceSystem: manifest.sourceSystem,
      sourceScope: PLUTIO_ENGAGEMENT_SCOPE,
      complete: input.snapshot.complete,
      watermark,
      externalReferences: [],
      identityCandidates: [],
      facts,
      errors: [],
    },
  });
  result.observationsNew = ingested.observationsNew;
  result.observationsDuplicate = ingested.observationsDuplicate;
  result.projectionsChanged = ingested.projectionsChanged;
  return result;
}

export interface PlutioEngagementHealth {
  enabled: boolean;
  mode: 'read_only_snapshot';
  consumerEnabled: false;
  status: 'disabled' | 'never_run' | 'healthy' | 'degraded';
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  result: PlutioEngagementResult | null;
  errorCodes: string[];
}

function baseHealth(): PlutioEngagementHealth {
  return {
    enabled: false,
    mode: 'read_only_snapshot',
    consumerEnabled: false,
    status: 'disabled',
    lastRunAt: null,
    lastSuccessAt: null,
    result: null,
    errorCodes: [],
  };
}

let currentHealth = baseHealth();

export function plutioEngagementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED === '1';
}

export function getPlutioEngagementHealth(): PlutioEngagementHealth {
  return structuredClone(currentHealth);
}

export function resetPlutioEngagementHealthForTests(): void {
  currentHealth = baseHealth();
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z][a-z0-9_]{0,99}$/.test(message)
    ? message
    : 'plutio_engagement_snapshot_failed';
}

export async function runPlutioEngagementEnrichment(
  input: {
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    callTool?: typeof callPlutioTool;
  } = {},
): Promise<PlutioEngagementHealth> {
  if (!plutioEngagementEnabled(input.env)) {
    currentHealth = baseHealth();
    return getPlutioEngagementHealth();
  }
  const runAt = new Date(input.nowMs ?? Date.now()).toISOString();
  currentHealth = {
    ...currentHealth,
    enabled: true,
    status: currentHealth.lastSuccessAt ? 'healthy' : 'never_run',
    lastRunAt: runAt,
    errorCodes: [],
  };
  try {
    const snapshot = await fetchPlutioEngagementSnapshot({
      observedAt: runAt,
      callTool: input.callTool,
    });
    const result = await withAgentContext(
      'relationship-context-plutio-engagement',
      (client) =>
        ingestPlutioEngagementSnapshotWithClient({ client, snapshot }),
    );
    currentHealth = {
      enabled: true,
      mode: 'read_only_snapshot',
      consumerEnabled: false,
      status: 'healthy',
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      result,
      errorCodes: [],
    };
    logger.info(
      currentHealth,
      'relationship context Plutio engagement complete',
    );
  } catch (error) {
    currentHealth = {
      ...currentHealth,
      enabled: true,
      status: 'degraded',
      lastRunAt: runAt,
      errorCodes: [errorCode(error)],
    };
    logger.warn(
      { ...currentHealth, errorCode: errorCode(error) },
      'relationship context Plutio engagement degraded',
    );
  }
  return getPlutioEngagementHealth();
}

export function plutioEngagementManifest(): AdapterManifestV1 {
  return structuredClone(manifest);
}
