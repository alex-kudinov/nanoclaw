import { describe, expect, it } from 'vitest';

import type { EventEnvelope, ScopedReference } from './contracts.js';
import { proofActionFromDecision, resolveIdentity } from './resolver.js';
import { validateEventAgainstManifest } from './semantic.js';

const AT = '2026-09-13T18:00:00.000Z';
const SHA = '0'.repeat(64);
const ref: ScopedReference = {
  provider: 'heartbeat',
  environment: 'production',
  scope: 'main-community',
  entityType: 'user',
  externalId: 'user-1',
};
const envelope: EventEnvelope = {
  kind: 'identity_event_envelope',
  schemaVersion: 1,
  receiptId: '00000000-0000-4000-8000-000000000001',
  adapterKey: 'heartbeat-main',
  manifestVersion: 1,
  sourceRef: ref,
  eventType: 'USER_UPDATE',
  deduplicationKey: 'event-1',
  receivedAt: AT,
  authenticity: 'relay_verified_provider_unverified',
  payloadSha256: SHA,
};
const request = {
  event: envelope,
  decisionId: '00000000-0000-4000-8000-000000000002',
  resolverVersion: 'd0-v1',
  createdAt: AT,
  stageIfUnresolved: true,
};
const empty = {
  externalReferences: [],
  acceptedSubjects: [],
  mergeLineage: {},
} as const;

describe('identity resolver precedence and holds', () => {
  it('never resolves a lone weak Party candidate', () => {
    const decision = resolveIdentity(
      { ...request, candidatePartyIds: [10] },
      empty,
    );
    expect(decision.status).toBe('ambiguous');
    expect(decision.partyId).toBeNull();
    expect(decision.resolutionBasis).toBeNull();
  });

  it('follows merge lineage transitively and detects a cycle', () => {
    const binding = { reference: ref, partyId: 1, status: 'active' as const };
    const resolved = resolveIdentity(request, {
      externalReferences: [binding],
      acceptedSubjects: [],
      mergeLineage: { 1: 2, 2: 3 },
    });
    expect(resolved.status).toBe('resolved_merge_lineage');
    expect(resolved.partyId).toBe(3);
    const cycle = resolveIdentity(request, {
      externalReferences: [binding],
      acceptedSubjects: [],
      mergeLineage: { 1: 2, 2: 1 },
    });
    expect(cycle.status).toBe('conflict');
    expect(cycle.partyId).toBeNull();
  });

  it('treats a tombstoned provider reference as a conflict, never reusable', () => {
    const decision = resolveIdentity(request, {
      externalReferences: [
        { reference: ref, partyId: 1, status: 'tombstoned' },
      ],
      acceptedSubjects: [],
      mergeLineage: {},
    });
    expect(decision.status).toBe('conflict');
    expect(decision.partyId).toBeNull();
  });

  it('uses deterministic accepted-subject precedence', () => {
    const decision = resolveIdentity(request, {
      externalReferences: [],
      acceptedSubjects: [
        { reference: ref, partyId: 5, kind: 'tandem_operation' },
        { reference: ref, partyId: 5, kind: 'auth_subject' },
      ],
      mergeLineage: {},
    });
    expect(decision.status).toBe('resolved_auth_subject');
    expect(decision.resolutionBasis).toBe('accepted_auth_subject');
  });

  it('rejects authenticity before resolution', () => {
    expect(() =>
      resolveIdentity(
        {
          ...request,
          event: { ...envelope, authenticity: 'rejected' },
        },
        empty,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'EVENT_AUTHENTICITY_REJECTED' }),
    );
  });

  it('never resolves an unverified hint even when an exact ref exists', () => {
    const decision = resolveIdentity(
      {
        ...request,
        event: { ...envelope, authenticity: 'unverified_hint' },
      },
      {
        externalReferences: [{ reference: ref, partyId: 1, status: 'active' }],
        acceptedSubjects: [],
        mergeLineage: {},
      },
    );
    expect(decision.status).toBe('staged_candidate');
    expect(decision.partyId).toBeNull();
  });

  it('rejects malformed resolver state instead of hiding it as conflict', () => {
    expect(() =>
      resolveIdentity(request, {
        externalReferences: [
          { reference: ref, partyId: -1, status: 'active' },
          { reference: ref, partyId: -2, status: 'active' },
        ],
        acceptedSubjects: [],
        mergeLineage: {},
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'RESOLVER_STATE_PARTY_INVALID' }),
    );
  });

  it('does not relabel conflict or stale decisions as a safe staged proof', () => {
    const conflict = resolveIdentity(request, {
      externalReferences: [
        { reference: ref, partyId: 1, status: 'active' },
        { reference: ref, partyId: 2, status: 'active' },
      ],
      acceptedSubjects: [],
      mergeLineage: {},
    });
    expect(() => proofActionFromDecision(conflict)).toThrowError(
      expect.objectContaining({ code: 'PROOF_DECISION_STATUS_UNEXPECTED' }),
    );
  });

  it('requires the event and entity types declared by the manifest', () => {
    const baseManifest = {
      kind: 'provider_adapter_manifest',
      schemaVersion: 1,
      adapterKey: 'heartbeat-main',
      manifestVersion: 1,
      provider: 'heartbeat',
      environment: 'production',
      scope: 'main-community',
      status: 'accepted',
      entityTypes: ['user'],
      eventTypes: ['USER_UPDATE'],
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
    };
    expect(validateEventAgainstManifest(envelope, baseManifest)).toBeTruthy();
    expect(() =>
      validateEventAgainstManifest(
        { ...envelope, eventType: 'GROUP_JOIN' },
        baseManifest,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'EVENT_TYPE_NOT_MANIFESTED' }),
    );
    expect(() =>
      validateEventAgainstManifest(
        { ...envelope, sourceRef: { ...ref, entityType: 'group' } },
        baseManifest,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'ENTITY_TYPE_NOT_MANIFESTED' }),
    );
  });
});
