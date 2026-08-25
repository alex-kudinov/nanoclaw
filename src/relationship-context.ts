import crypto from 'node:crypto';

import {
  RelationshipContextContractError,
  type ExternalReferenceInput,
  type FactCatalogEntry,
  type ObservationBatch,
  type RelationshipContextSection,
  sha256Json,
  validateObservationBatch,
} from './relationship-context-contract.js';
import type { RelationshipContextGrant } from './relationship-context-policy.js';
import type { RelationshipContextRegistry } from './relationship-context-registry.js';
import {
  identityExceptionFingerprint,
  type RelationshipContextRepository,
  type StoredProjection,
} from './relationship-context-store.js';

export type RelationshipContextResolution =
  | 'resolved'
  | 'ambiguous'
  | 'not_found'
  | 'needs_identity'
  | 'denied'
  | 'unavailable';

export interface RelationshipContextSectionResult {
  status:
    | 'current'
    | 'stale'
    | 'partial'
    | 'conflicting'
    | 'unknown'
    | 'denied'
    | 'unavailable';
  projections: Array<{
    key: string;
    version: number;
    value: Record<string, unknown>;
    effectiveAt: string | null;
    observedAt: string;
    freshUntil: string | null;
    missingCodes: string[];
    conflictCodes: string[];
  }>;
}

export interface RelationshipContextPack {
  schemaVersion: 1;
  requestId: string;
  asOf: string;
  resolution: RelationshipContextResolution;
  partyId: number | null;
  workItemId: string;
  sections: Partial<
    Record<RelationshipContextSection, RelationshipContextSectionResult>
  >;
  missingCodes: string[];
  receiptId: number;
}

async function resolveFactParty(input: {
  repository: RelationshipContextRepository;
  batch: ObservationBatch;
  reference: ExternalReferenceInput;
  observedAt: string;
}): Promise<{
  resolution: Exclude<RelationshipContextResolution, 'denied' | 'unavailable'>;
  partyId: number | null;
}> {
  const exact = await input.repository.resolveExternalRef(input.reference);
  if (exact != null) {
    const canonical = await input.repository.canonicalParty(exact);
    return canonical
      ? { resolution: 'resolved', partyId: canonical }
      : { resolution: 'not_found', partyId: null };
  }
  const matchingCandidates = input.batch.identityCandidates.filter(
    (candidate) =>
      candidate.verified &&
      candidate.sourceRef?.provider === input.reference.provider &&
      candidate.sourceRef.scope === input.reference.scope &&
      candidate.sourceRef.entityType === input.reference.entityType &&
      candidate.sourceRef.externalId === input.reference.externalId,
  );
  const partyIds = new Set<number>();
  for (const candidate of matchingCandidates) {
    for (const partyId of await input.repository.resolveIdentifierClaim(
      candidate.kind,
      candidate.fingerprint,
    )) {
      const canonical = await input.repository.canonicalParty(partyId);
      if (canonical) partyIds.add(canonical);
    }
  }
  const sorted = [...partyIds].sort((a, b) => a - b);
  if (sorted.length === 1) {
    const partyId = sorted[0];
    await input.repository.bindExternalRef({
      partyId,
      reference: input.reference,
      adapterKey: input.batch.adapterKey,
      adapterVersion: input.batch.adapterVersion,
      observedAt: input.observedAt,
      receiptSha256: sha256Json({
        reference: input.reference,
        candidates: matchingCandidates.map((candidate) => ({
          kind: candidate.kind,
          fingerprint: candidate.fingerprint,
        })),
      }),
    });
    return { resolution: 'resolved', partyId };
  }
  const reasonCode =
    sorted.length > 1 ? 'identity_ambiguous' : 'needs_identity';
  const fingerprint = identityExceptionFingerprint({
    sourceSystem: input.batch.sourceSystem,
    sourceScope: input.batch.sourceScope,
    sourceRef: input.reference,
    reasonCode,
    partyIds: sorted,
  });
  await input.repository.ensureIdentityException({
    fingerprint,
    partyIds: sorted,
    reasonCode,
    evidenceRefs: {
      source_ref_sha256: sha256Json(input.reference),
      candidate_count: matchingCandidates.length,
    },
    observedAt: input.observedAt,
  });
  return {
    resolution: sorted.length > 1 ? 'ambiguous' : 'needs_identity',
    partyId: null,
  };
}

function sectionStatus(
  fact: ObservationBatch['facts'][number],
  nowMs: number,
): StoredProjection['status'] {
  if (fact.conflictState === 'conflicting' || fact.conflictState === 'held') {
    return 'conflicting';
  }
  if (fact.freshUntil && Date.parse(fact.freshUntil) < nowMs) return 'stale';
  return 'current';
}

function projectionInput(input: {
  partyId: number;
  fact: ObservationBatch['facts'][number];
  catalog: FactCatalogEntry;
  watermark: string | null;
  nowMs: number;
}): Omit<StoredProjection, 'id' | 'version'> {
  const value = {
    fact_type: input.fact.factType,
    source_system: input.fact.sourceSystem,
    source_scope: input.fact.sourceScope,
    source_record_type: input.fact.sourceRecordType,
    source_record_id: input.fact.sourceRecordId,
    value: input.fact.value,
    confidence: input.fact.confidence,
  };
  const status = sectionStatus(input.fact, input.nowMs);
  return {
    partyId: input.partyId,
    section: input.catalog.projectionTarget,
    projectionKey: `${input.fact.factType.split('@')[0]}:${sha256Json({
      record_type: input.fact.sourceRecordType,
      record_id: input.fact.sourceRecordId,
    }).slice(0, 24)}`,
    value,
    valueSha256: sha256Json(value),
    sourceWatermarks: input.watermark
      ? {
          [`${input.fact.sourceSystem}:${input.fact.sourceScope}`]:
            input.watermark,
        }
      : {},
    status,
    missingCodes: [],
    conflictCodes: status === 'conflicting' ? ['source_fact_conflicting'] : [],
    effectiveAt: input.fact.effectiveAt ?? null,
    observedAt: input.fact.observedAt,
    freshUntil: input.fact.freshUntil ?? null,
  };
}

export async function ingestRelationshipContextBatch(input: {
  repository: RelationshipContextRepository;
  registry: RelationshipContextRegistry;
  batch: ObservationBatch;
  nowMs?: number;
}): Promise<{
  observationsNew: number;
  observationsDuplicate: number;
  projectionsChanged: number;
  heldFacts: number;
}> {
  const manifest = input.registry.manifest(input.batch.adapterKey);
  const catalog = input.registry.factCatalog();
  const batch = validateObservationBatch(manifest, catalog, input.batch);
  const nowMs = input.nowMs ?? Date.now();
  let observationsNew = 0;
  let observationsDuplicate = 0;
  let projectionsChanged = 0;
  let heldFacts = 0;

  for (const fact of batch.facts) {
    let partyId: number | null;
    if ('partyId' in fact.subject) {
      partyId = await input.repository.canonicalParty(fact.subject.partyId);
      if (!partyId) {
        throw new RelationshipContextContractError(
          'relationship_context_subject_party_unknown',
        );
      }
    } else {
      const resolved = await resolveFactParty({
        repository: input.repository,
        batch,
        reference: fact.subject,
        observedAt: fact.observedAt,
      });
      partyId = resolved.partyId;
      if (!partyId) heldFacts += 1;
    }
    const recorded = await input.repository.recordObservation({
      fact,
      partyId,
      adapterKey: batch.adapterKey,
      adapterVersion: batch.adapterVersion,
    });
    if (recorded.duplicate) observationsDuplicate += 1;
    else observationsNew += 1;
    if (!partyId) continue;
    const entry = catalog.get(fact.factType);
    if (!entry) {
      throw new RelationshipContextContractError(
        'relationship_context_fact_undeclared',
      );
    }
    const before = await input.repository.listProjections(partyId, [
      entry.projectionTarget,
    ]);
    const next = await input.repository.upsertProjection(
      projectionInput({
        partyId,
        fact,
        catalog: entry,
        watermark: batch.watermark,
        nowMs,
      }),
    );
    const prior = before.find(
      (projection) => projection.projectionKey === next.projectionKey,
    );
    if (!prior || prior.version !== next.version) projectionsChanged += 1;
  }
  return {
    observationsNew,
    observationsDuplicate,
    projectionsChanged,
    heldFacts,
  };
}

function aggregateSection(
  projections: StoredProjection[],
  maxAgeSeconds: number | undefined,
  asOfMs: number,
): RelationshipContextSectionResult {
  if (projections.length === 0) {
    return { status: 'unknown', projections: [] };
  }
  const normalized = projections.map((projection) => {
    const tooOld =
      maxAgeSeconds !== undefined &&
      asOfMs - Date.parse(projection.observedAt) > maxAgeSeconds * 1000;
    return {
      ...projection,
      status: tooOld ? ('stale' as const) : projection.status,
    };
  });
  const statusOrder: StoredProjection['status'][] = [
    'conflicting',
    'unavailable',
    'partial',
    'stale',
    'unknown',
    'current',
  ];
  const status = statusOrder.find((candidate) =>
    normalized.some((projection) => projection.status === candidate),
  )!;
  return {
    status,
    projections: normalized.map((projection) => ({
      key: projection.projectionKey,
      version: projection.version,
      value: projection.value,
      effectiveAt: projection.effectiveAt,
      observedAt: projection.observedAt,
      freshUntil: projection.freshUntil,
      missingCodes: projection.missingCodes,
      conflictCodes: projection.conflictCodes,
    })),
  };
}

export async function getRelationshipContext(input: {
  repository: RelationshipContextRepository;
  grant: RelationshipContextGrant;
  nowMs?: number;
}): Promise<RelationshipContextPack> {
  const startedMs = input.nowMs ?? Date.now();
  const requestId = crypto.randomUUID();
  const asOf = new Date(startedMs).toISOString();
  let partyId: number | null = null;
  let resolution: RelationshipContextResolution = 'not_found';
  if (input.grant.subject.kind === 'party') {
    partyId = await input.repository.canonicalParty(
      input.grant.subject.partyId,
    );
  } else {
    partyId = await input.repository.resolveExternalRef(
      input.grant.subject.reference,
    );
    if (partyId) partyId = await input.repository.canonicalParty(partyId);
  }
  if (partyId) {
    resolution = 'resolved';
  } else if (input.grant.subject.kind === 'external_ref') {
    resolution =
      (await input.repository.findIdentityException(
        input.grant.subject.reference,
      )) ?? 'needs_identity';
  } else {
    resolution = 'not_found';
  }
  const sections: RelationshipContextPack['sections'] = {};
  const projectionVersions: Record<string, number> = {};
  const sourceWatermarks: Record<string, string> = {};
  let returnedSections: RelationshipContextSection[] = [];
  if (partyId) {
    const projections = await input.repository.listProjections(
      partyId,
      input.grant.sections,
    );
    for (const section of input.grant.sections) {
      const sectionProjections = projections.filter(
        (projection) => projection.section === section,
      );
      sections[section] = aggregateSection(
        sectionProjections,
        input.grant.maxAgeSeconds[section],
        startedMs,
      );
      if (sectionProjections.length > 0) returnedSections.push(section);
      for (const projection of sectionProjections) {
        projectionVersions[`${section}:${projection.projectionKey}`] =
          projection.version;
        Object.assign(sourceWatermarks, projection.sourceWatermarks);
      }
    }
  }
  returnedSections = [...new Set(returnedSections)].sort();
  const responseWithoutReceipt = {
    schemaVersion: 1 as const,
    requestId,
    asOf,
    resolution,
    partyId,
    workItemId: input.grant.workItemId,
    sections,
    missingCodes: partyId
      ? []
      : [
          resolution === 'ambiguous'
            ? 'identity_ambiguous'
            : resolution === 'needs_identity'
              ? 'needs_identity'
              : 'party_not_found',
        ],
  };
  const completedMs = Date.now();
  const receiptId = await input.repository.recordQueryReceipt({
    requestUuid: requestId,
    runId: input.grant.runId,
    sourceContainerSha256: sha256Json(input.grant.sourceContainer),
    workItemId: input.grant.workItemId,
    actorGroup: input.grant.group,
    purpose: input.grant.purpose,
    originalPartyId:
      input.grant.subject.kind === 'party'
        ? input.grant.subject.partyId
        : partyId,
    currentPartyId: partyId,
    unresolvedSubjectSha256: partyId ? null : sha256Json(input.grant.subject),
    requestedSections: input.grant.sections,
    returnedSections,
    projectionVersions,
    sourceWatermarks,
    policyDecision: 'allowed',
    resultStatus: resolution,
    errorCode: partyId
      ? null
      : resolution === 'ambiguous'
        ? 'identity_ambiguous'
        : resolution === 'needs_identity'
          ? 'needs_identity'
          : 'party_not_found',
    responseSha256: sha256Json(responseWithoutReceipt),
    startedAt: asOf,
    completedAt: new Date(completedMs).toISOString(),
    durationMs: Math.max(0, completedMs - startedMs),
  });
  return { ...responseWithoutReceipt, receiptId };
}
