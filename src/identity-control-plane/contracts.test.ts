import { describe, expect, it } from 'vitest';

import {
  AdapterManifestSchema,
  DesiredProjectionSchema,
  DriftItemSchema,
  EventEnvelopeSchema,
  IdentityCandidateSchema,
  ReconciliationRunSchema,
  ResolutionDecisionSchema,
  ShadowCommandSchema,
  SynchronizationScoreboardSchema,
} from './contracts.js';
import { commandIdempotencyKey, projectionKey } from './semantic.js';

const AT = '2026-09-13T18:00:00.000Z';
const SHA = '0'.repeat(64);
const ref = {
  provider: 'heartbeat',
  environment: 'production' as const,
  scope: 'main-community',
  entityType: 'user',
  externalId: 'user-1',
};
const projectionKeyValue = projectionKey(ref, 'membership:group-1');

const valid = {
  event: {
    kind: 'identity_event_envelope',
    schemaVersion: 1,
    receiptId: '00000000-0000-4000-8000-000000000001',
    adapterKey: 'heartbeat-main',
    manifestVersion: 1,
    sourceRef: ref,
    eventType: 'GROUP_JOIN',
    deduplicationKey: 'heartbeat:main:event-1',
    receivedAt: AT,
    authenticity: 'relay_verified_provider_unverified',
    payloadSha256: SHA,
  },
  resolution: {
    kind: 'identity_resolution_decision',
    schemaVersion: 1,
    decisionId: '00000000-0000-4000-8000-000000000002',
    resolverVersion: 'd0-v1',
    receiptId: '00000000-0000-4000-8000-000000000001',
    subjectRef: ref,
    status: 'staged_candidate',
    partyId: null,
    candidatePartyIds: [],
    resolutionBasis: null,
    shadow: true,
    evidenceSha256: SHA,
    createdAt: AT,
  },
  candidate: {
    kind: 'identity_candidate',
    schemaVersion: 1,
    candidateId: '00000000-0000-4000-8000-000000000003',
    subjectRef: ref,
    status: 'open',
    creationBasis: 'none',
    partyMaterializationAllowed: false,
    evidenceRefs: ['receipt:1'],
    createdAt: AT,
    updatedAt: AT,
  },
  manifest: {
    kind: 'provider_adapter_manifest',
    schemaVersion: 1,
    adapterKey: 'heartbeat-main',
    manifestVersion: 1,
    provider: 'heartbeat',
    environment: 'production',
    scope: 'main-community',
    status: 'accepted',
    entityTypes: ['user'],
    eventTypes: ['GROUP_JOIN'],
    authenticity: { method: 'signed_relay', providerVerified: false },
    deduplication: { keyStrategy: 'provider_event' },
    ordering: { strategy: 'provider_version_then_time' },
    readback: { supported: true, mode: 'single_and_full' },
    outboundOperations: [],
    managedFields: [],
    writesEnabled: false,
    reconciliation: {
      cadenceSeconds: 86_400,
      freshnessSeconds: 129_600,
      absenceRequiresCompleteSnapshot: true,
    },
  },
  projection: {
    kind: 'provider_desired_projection',
    schemaVersion: 1,
    projectionKey: projectionKeyValue,
    targetRef: ref,
    managedObjectKey: 'membership:group-1',
    desiredVersion: 1,
    desiredSha256: SHA,
    authorityVersions: { entitlement: 1 },
    state: 'held',
    createdAt: AT,
    updatedAt: AT,
  },
  command: {
    kind: 'provider_projection_command',
    schemaVersion: 1,
    commandId: '00000000-0000-4000-8000-000000000004',
    projectionKey: projectionKeyValue,
    desiredVersion: 1,
    idempotencyKey: commandIdempotencyKey(projectionKeyValue, 1),
    status: 'simulated',
    writesEnabled: false,
    attemptCount: 0,
    providerOperationId: null,
    nextAttemptAt: null,
    createdAt: AT,
    updatedAt: AT,
  },
  run: {
    kind: 'provider_reconciliation_run',
    schemaVersion: 1,
    runId: '00000000-0000-4000-8000-000000000005',
    adapterKey: 'heartbeat-main',
    manifestVersion: 1,
    provider: 'heartbeat',
    environment: 'production',
    scope: 'main-community',
    mode: 'full',
    status: 'complete',
    complete: true,
    observedCount: 0,
    normalizedCount: 0,
    snapshotSha256: SHA,
    startedAt: AT,
    completedAt: AT,
    freshUntil: '2026-09-14T18:00:00.000Z',
  },
  drift: {
    kind: 'provider_drift_item',
    schemaVersion: 1,
    driftId: '00000000-0000-4000-8000-000000000006',
    targetRef: ref,
    classification: 'unknown_reference',
    severity: 'medium',
    status: 'held',
    repairEligibility: 'operator_required',
    absenceBased: false,
    firstSeenAt: AT,
    lastSeenAt: AT,
    owner: 'identity-ops',
  },
  scoreboard: {
    kind: 'synchronization_scoreboard',
    schemaVersion: 1,
    generatedAt: AT,
    globalState: 'degraded',
    blockingReasons: [],
    scopes: [
      {
        provider: 'heartbeat',
        environment: 'production',
        scope: 'main-community',
        state: 'degraded',
        lastCompleteSnapshotAt: null,
        freshUntil: null,
        openDrift: 1,
        oldestOpenDriftSeconds: 10,
        uncertainCommands: 0,
        blockedCommands: 0,
      },
    ],
  },
};

describe('identity control-plane D0 contracts', () => {
  it('accepts all nine legal object shapes', () => {
    expect(EventEnvelopeSchema.parse(valid.event)).toBeTruthy();
    expect(ResolutionDecisionSchema.parse(valid.resolution)).toBeTruthy();
    expect(IdentityCandidateSchema.parse(valid.candidate)).toBeTruthy();
    expect(AdapterManifestSchema.parse(valid.manifest)).toBeTruthy();
    expect(DesiredProjectionSchema.parse(valid.projection)).toBeTruthy();
    expect(ShadowCommandSchema.parse(valid.command)).toBeTruthy();
    expect(ReconciliationRunSchema.parse(valid.run)).toBeTruthy();
    expect(DriftItemSchema.parse(valid.drift)).toBeTruthy();
    expect(
      SynchronizationScoreboardSchema.parse(valid.scoreboard),
    ).toBeTruthy();
  });

  it('rejects every forbidden shadow write representation', () => {
    for (const mutation of [
      { status: 'queued' },
      { status: 'dispatched' },
      { writesEnabled: true },
      { attemptCount: 1 },
      { providerOperationId: 'provider-op' },
    ]) {
      expect(() =>
        ShadowCommandSchema.parse({ ...valid.command, ...mutation }),
      ).toThrow();
    }
  });

  it('closes Party creation bases while allowing approved-but-held candidates', () => {
    expect(() =>
      IdentityCandidateSchema.parse({
        ...valid.candidate,
        partyMaterializationAllowed: true,
      }),
    ).toThrow(/PARTY_CREATION_BASIS_INVALID/);
    expect(() =>
      IdentityCandidateSchema.parse({
        ...valid.candidate,
        creationBasis: 'email_match',
        partyMaterializationAllowed: true,
      }),
    ).toThrow();
    expect(
      IdentityCandidateSchema.parse({
        ...valid.candidate,
        creationBasis: 'verified_tandem_registration',
        partyMaterializationAllowed: false,
      }).partyMaterializationAllowed,
    ).toBe(false);
    expect(
      IdentityCandidateSchema.parse({
        ...valid.candidate,
        status: 'accepted',
        creationBasis: 'verified_tandem_registration',
        partyMaterializationAllowed: true,
      }).partyMaterializationAllowed,
    ).toBe(true);
    expect(() =>
      IdentityCandidateSchema.parse({
        ...valid.candidate,
        creationBasis: 'verified_tandem_registration',
        partyMaterializationAllowed: true,
      }),
    ).toThrow(/PARTY_CREATION_CANDIDATE_NOT_ACCEPTED/);
  });

  it('couples exact resolution status to its legal evidence basis', () => {
    expect(() =>
      ResolutionDecisionSchema.parse({
        ...valid.resolution,
        status: 'resolved_exact_reference',
        partyId: 10,
        resolutionBasis: 'accepted_claim',
      }),
    ).toThrow(/RESOLUTION_BASIS_MISMATCH/);
    expect(
      ResolutionDecisionSchema.parse({
        ...valid.resolution,
        status: 'resolved_exact_reference',
        partyId: 10,
        resolutionBasis: 'exact_external_reference',
      }).partyId,
    ).toBe(10);
  });
});
