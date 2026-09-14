import type { EventEnvelope, ScopedReference } from './contracts.js';
import { sha256Json } from './canonical.js';
import { IdentityControlPlaneError } from './errors.js';
import {
  changeIdentifierClaim,
  materializeOrderRoles,
  permutationReplayHash,
  planPartySplit,
  recoverPositiveSnapshotFacts,
  reduceFactEvents,
  tombstoneReference,
} from './reducer.js';
import { proofActionFromDecision, resolveIdentity } from './resolver.js';
import {
  planUncertainDelivery,
  snapshotHash,
  validateAbsenceBasedDrift,
  validateEventAgainstManifest,
} from './semantic.js';

const ZERO_SHA = '0'.repeat(64);
const ONE_SHA = '1'.repeat(64);
const AT = '2026-09-13T18:00:00.000Z';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}

function reference(
  externalId: string,
  environment: ScopedReference['environment'] = 'production',
): ScopedReference {
  return {
    provider: 'heartbeat',
    environment,
    scope: 'main-community',
    entityType: 'user',
    externalId,
  };
}

function event(
  index: number,
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    kind: 'identity_event_envelope',
    schemaVersion: 1,
    receiptId: uuid(index),
    adapterKey: 'heartbeat-main',
    manifestVersion: 1,
    sourceRef: reference(`user-${index}`),
    eventType: 'USER_UPDATE',
    providerEventId: `event-${index}`,
    deduplicationKey: `heartbeat:main:event-${index}`,
    sourceEffectiveAt: AT,
    receivedAt: AT,
    authenticity: 'relay_verified_provider_unverified',
    payloadSha256: ZERO_SHA,
    ...overrides,
  };
}

function manifest() {
  return {
    kind: 'provider_adapter_manifest' as const,
    schemaVersion: 1,
    adapterKey: 'heartbeat-main',
    manifestVersion: 1,
    provider: 'heartbeat',
    environment: 'production' as const,
    scope: 'main-community',
    status: 'accepted' as const,
    entityTypes: ['user'],
    eventTypes: ['USER_UPDATE'],
    authenticity: { method: 'signed_relay', providerVerified: false },
    deduplication: { keyStrategy: 'provider_event_or_payload_hash' },
    ordering: { strategy: 'provider_version_then_effective_time' },
    readback: { supported: true, mode: 'single_and_full' as const },
    outboundOperations: [],
    managedFields: [],
    writesEnabled: false as const,
    reconciliation: {
      cadenceSeconds: 86_400,
      freshnessSeconds: 129_600,
      absenceRequiresCompleteSnapshot: true as const,
    },
  };
}

export const PROOF_CASES = [
  [
    'C01',
    false,
    false,
    false,
    'stage_heartbeat_identity_candidate_no_party_write',
  ],
  ['C02', false, true, false, 'hold_heartbeat_party_link'],
  [
    'C03',
    false,
    false,
    false,
    'stage_heartbeat_identity_candidate_no_party_write',
  ],
  ['C04', false, true, false, 'hold_heartbeat_party_link'],
  ['C05', false, true, false, 'hold_heartbeat_party_link'],
  [
    'C06',
    false,
    false,
    false,
    'stage_heartbeat_identity_candidate_no_party_write',
  ],
  [
    'C07',
    false,
    false,
    false,
    'stage_heartbeat_identity_candidate_no_party_write',
  ],
  ['C08', false, true, false, 'hold_heartbeat_party_link'],
  [
    'C09',
    false,
    false,
    false,
    'stage_heartbeat_identity_candidate_no_party_write',
  ],
  [
    'C10',
    false,
    false,
    false,
    'stage_heartbeat_identity_candidate_no_party_write',
  ],
  ['C11', true, true, false, 'exact_reference_noop'],
  [
    'C12',
    true,
    true,
    true,
    'exact_reference_noop_with_encharge_candidate_held',
  ],
] as const;

export function runProofCases(): Array<{
  caseId: string;
  expected: string;
  actual: string;
  passed: boolean;
}> {
  return PROOF_CASES.map(
    ([caseId, confirmed, candidate, enchargeCandidate, expected], index) => {
      const proofEvent = event(300 + index);
      const partyId = 1_000 + index;
      const decision = resolveIdentity(
        {
          event: proofEvent,
          decisionId: uuid(400 + index),
          resolverVersion: 'd0-v1',
          createdAt: AT,
          candidatePartyIds: candidate && !confirmed ? [partyId] : [],
          stageIfUnresolved: true,
        },
        {
          externalReferences: confirmed
            ? [
                {
                  reference: proofEvent.sourceRef,
                  partyId,
                  status: 'active',
                },
              ]
            : [],
          acceptedSubjects: [],
          mergeLineage: {},
        },
      );
      const actual = proofActionFromDecision(decision, enchargeCandidate);
      return { caseId, expected, actual, passed: expected === actual };
    },
  );
}

export const FAILURE_FIXTURE_IDS = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R13',
  'R14',
  'R15',
  'R16',
  'R17',
  'R18',
  'R19',
  'R20',
  'R21',
  'R22',
  'R23',
  'R24',
  'R25',
  'R26',
  'R27',
] as const;
export type FailureFixtureId = (typeof FAILURE_FIXTURE_IDS)[number];

function expectError(code: string, operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof IdentityControlPlaneError && error.code === code) {
      return code;
    }
    throw error;
  }
  throw new IdentityControlPlaneError('EXPECTED_REJECTION_MISSING', { code });
}

export function runFailureFixture(id: FailureFixtureId): string {
  if (id === 'R01') {
    const first = event(1);
    const duplicate = event(2, {
      deduplicationKey: first.deduplicationKey,
      sourceRef: first.sourceRef,
    });
    const result = reduceFactEvents([
      {
        envelope: first,
        factKey: 'membership',
        factVersion: 1,
        valueSha256: ZERO_SHA,
      },
      {
        envelope: duplicate,
        factKey: 'membership',
        factVersion: 1,
        valueSha256: ZERO_SHA,
      },
    ]);
    return result.appliedCount === 1 && result.receipts.length === 2
      ? 'one_domain_effect_two_transport_receipts'
      : 'failed';
  }
  if (id === 'R02') {
    const result = reduceFactEvents(
      [
        {
          envelope: event(2),
          factKey: 'profile',
          factVersion: 1,
          valueSha256: ZERO_SHA,
        },
      ],
      { profile: { factVersion: 2, valueSha256: ONE_SHA } },
    );
    return result.receipts[0]?.outcome === 'ignored_stale' &&
      result.facts.profile?.factVersion === 2
      ? 'ignored_stale_no_version_regression'
      : 'failed';
  }
  if (id === 'R03') {
    return recoverPositiveSnapshotFacts(['a', 'b'], ['a']).join(',') === 'b'
      ? 'complete_snapshot_applies_missing_fact'
      : 'failed';
  }
  if (id === 'R04') {
    return planUncertainDelivery({
      readbackSupported: true,
      readbackResult: 'not_accepted',
      providerIdempotencySafe: false,
    }) === 'retry_after_non_acceptance'
      ? 'retry_only_after_non_acceptance_proof'
      : 'failed';
  }
  if (id === 'R05') {
    return planUncertainDelivery({
      readbackSupported: true,
      readbackResult: 'accepted',
      providerIdempotencySafe: true,
    }) === 'verified_no_retry'
      ? 'uncertain_then_readback_verified_no_duplicate'
      : 'failed';
  }
  if (id === 'R06') {
    const changed = changeIdentifierClaim({
      current: { fingerprint: ZERO_SHA, validFrom: AT, validUntil: null },
      nextFingerprint: ONE_SHA,
      changedAt: '2026-09-14T18:00:00.000Z',
    });
    return changed.retired.validUntil && changed.current.validUntil === null
      ? 'claim_intervals_change_party_unchanged'
      : 'failed';
  }
  if (id === 'R07') {
    const decision = resolveIdentity(
      {
        event: event(7),
        decisionId: uuid(107),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        candidatePartyIds: [1, 2],
        stageIfUnresolved: true,
      },
      { externalReferences: [], acceptedSubjects: [], mergeLineage: {} },
    );
    return decision.status === 'ambiguous' && decision.partyId === null
      ? 'ambiguous_exception_no_party_or_access_write'
      : 'failed';
  }
  if (id === 'R08') {
    const roles = materializeOrderRoles({
      payerPartyId: 10,
      learnerPartyId: 20,
    });
    return roles.payerRelationship === 'other' &&
      roles.payerPartyId !== roles.learnerPartyId
      ? 'separate_party_roles_order_and_seat'
      : 'failed';
  }
  if (id === 'R09') {
    const subject = event(9);
    const decision = resolveIdentity(
      {
        event: subject,
        decisionId: uuid(109),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        stageIfUnresolved: true,
      },
      {
        externalReferences: [
          { reference: subject.sourceRef, partyId: 1, status: 'active' },
          { reference: subject.sourceRef, partyId: 2, status: 'active' },
        ],
        acceptedSubjects: [],
        mergeLineage: {},
      },
    );
    return decision.status === 'conflict'
      ? 'quarantine_and_scope_circuit_block'
      : 'failed';
  }
  if (id === 'R10') {
    const subject = event(10);
    const decision = resolveIdentity(
      {
        event: subject,
        decisionId: uuid(110),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        stageIfUnresolved: true,
      },
      {
        externalReferences: [
          { reference: subject.sourceRef, partyId: 1, status: 'active' },
        ],
        acceptedSubjects: [],
        mergeLineage: { 1: 2 },
      },
    );
    return decision.status === 'resolved_merge_lineage' &&
      decision.partyId === 2
      ? 'exact_ref_resolves_through_lineage_to_survivor'
      : 'failed';
  }
  if (id === 'R11') {
    const split = planPartySplit(1);
    return split.identityDependentAccess === 'frozen' &&
      !split.automaticReferenceReassignment
      ? 'affected_access_frozen_until_reference_reassignment'
      : 'failed';
  }
  if (id === 'R12') {
    const tombstone = tombstoneReference({
      referenceKey: 'heartbeat:user:1',
      deletedAt: AT,
    });
    return tombstone.status === 'tombstoned' && !tombstone.reusable
      ? 'tombstone_no_external_id_reuse'
      : 'failed';
  }
  if (id === 'R13') {
    const crossEnvironment = event(13, {
      relatedRefs: [reference('user-13', 'test')],
    });
    const code = expectError('SCOPE_ENVIRONMENT_CLASS_COLLISION', () =>
      validateEventAgainstManifest(crossEnvironment, manifest()),
    );
    return code === 'SCOPE_ENVIRONMENT_CLASS_COLLISION'
      ? 'rejected_before_resolution_with_offending_related_ref_index'
      : 'failed';
  }
  const runId = uuid(200);
  const run = {
    kind: 'provider_reconciliation_run' as const,
    schemaVersion: 1,
    runId,
    adapterKey: 'heartbeat-main',
    manifestVersion: 1,
    provider: 'heartbeat',
    environment: 'production' as const,
    scope: 'main-community',
    mode: 'full' as const,
    status: 'complete' as const,
    complete: true,
    observedCount: 1,
    normalizedCount: 1,
    snapshotSha256: snapshotHash([]),
    startedAt: AT,
    completedAt: AT,
    freshUntil: '2026-09-14T18:00:00.000Z',
  };
  const drift = {
    kind: 'provider_drift_item' as const,
    schemaVersion: 1,
    driftId: uuid(201),
    targetRef: reference('user-absence'),
    classification: 'missing_managed_state' as const,
    severity: 'high' as const,
    status: 'held' as const,
    repairEligibility: 'operator_required' as const,
    absenceBased: true,
    reconciliationRunId: runId,
    firstSeenAt: AT,
    lastSeenAt: AT,
    owner: 'identity-ops',
  };
  if (id === 'R14') {
    const code = expectError('ABSENCE_REQUIRES_COMPLETE_FRESH_SNAPSHOT', () =>
      validateAbsenceBasedDrift(
        drift,
        { ...run, status: 'incomplete', complete: false },
        AT,
      ),
    );
    return code === 'ABSENCE_REQUIRES_COMPLETE_FRESH_SNAPSHOT'
      ? 'absence_based_drift_record_rejected'
      : 'failed';
  }
  if (id === 'R15') {
    const code = expectError('ABSENCE_SNAPSHOT_STALE', () =>
      validateAbsenceBasedDrift(drift, run, '2026-09-15T18:00:00.000Z'),
    );
    return code === 'ABSENCE_SNAPSHOT_STALE'
      ? 'absence_based_drift_record_rejected_after_fresh_until'
      : 'failed';
  }
  if (id === 'R16') {
    const events = [event(14), event(15), event(16)];
    const forward = permutationReplayHash(events);
    const reverse = permutationReplayHash([...events].reverse());
    return forward === reverse
      ? 'identical_canonical_aggregate_hash'
      : 'failed';
  }
  if (id === 'R17') {
    const subject = event(17, { authenticity: 'unverified_hint' });
    const decision = resolveIdentity(
      {
        event: subject,
        decisionId: uuid(117),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        stageIfUnresolved: true,
      },
      {
        externalReferences: [
          { reference: subject.sourceRef, partyId: 1, status: 'active' },
        ],
        acceptedSubjects: [],
        mergeLineage: {},
      },
    );
    return decision.status === 'staged_candidate' && decision.partyId === null
      ? 'unverified_hint_never_resolves_exact_reference'
      : 'failed';
  }
  if (id === 'R18') {
    const code = expectError('EVENT_AUTHENTICITY_REJECTED', () =>
      resolveIdentity(
        {
          event: event(18, { authenticity: 'rejected' }),
          decisionId: uuid(118),
          resolverVersion: 'd0-v1',
          createdAt: AT,
          stageIfUnresolved: true,
        },
        { externalReferences: [], acceptedSubjects: [], mergeLineage: {} },
      ),
    );
    return code === 'EVENT_AUTHENTICITY_REJECTED'
      ? 'rejected_authenticity_stops_before_resolution'
      : 'failed';
  }
  if (id === 'R19') {
    const first = event(19);
    const result = reduceFactEvents([
      {
        envelope: first,
        factKey: 'profile',
        factVersion: 1,
        valueSha256: ZERO_SHA,
      },
      {
        envelope: event(119, {
          sourceRef: first.sourceRef,
          deduplicationKey: first.deduplicationKey,
        }),
        factKey: 'profile',
        factVersion: 1,
        valueSha256: ONE_SHA,
      },
    ]);
    return result.receipts.some((receipt) => receipt.outcome === 'conflict')
      ? 'conflicting_transport_duplicate_held'
      : 'failed';
  }
  if (id === 'R20') {
    const result = reduceFactEvents(
      [
        {
          envelope: event(20),
          factKey: 'profile',
          factVersion: 2,
          valueSha256: ONE_SHA,
        },
      ],
      { profile: { factVersion: 2, valueSha256: ZERO_SHA } },
    );
    return result.receipts[0]?.outcome === 'conflict'
      ? 'same_version_different_hash_held'
      : 'failed';
  }
  if (id === 'R21') {
    const subject = event(21);
    const decision = resolveIdentity(
      {
        event: subject,
        decisionId: uuid(121),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        stageIfUnresolved: true,
      },
      {
        externalReferences: [
          { reference: subject.sourceRef, partyId: 1, status: 'tombstoned' },
        ],
        acceptedSubjects: [],
        mergeLineage: {},
      },
    );
    return decision.status === 'conflict' && decision.partyId === null
      ? 'tombstoned_reference_conflicts_no_reuse'
      : 'failed';
  }
  if (id === 'R22') {
    const subject = event(22);
    const decision = resolveIdentity(
      {
        event: subject,
        decisionId: uuid(122),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        stageIfUnresolved: true,
      },
      {
        externalReferences: [],
        acceptedSubjects: [
          { reference: subject.sourceRef, partyId: 1, kind: 'auth_subject' },
          { reference: subject.sourceRef, partyId: 2, kind: 'accepted_claim' },
        ],
        mergeLineage: {},
      },
    );
    return decision.status === 'conflict' && decision.partyId === null
      ? 'accepted_subject_collision_held'
      : 'failed';
  }
  if (id === 'R23') {
    const subject = event(23);
    const decision = resolveIdentity(
      {
        event: subject,
        decisionId: uuid(123),
        resolverVersion: 'd0-v1',
        createdAt: AT,
        stageIfUnresolved: true,
      },
      {
        externalReferences: [
          { reference: subject.sourceRef, partyId: 1, status: 'active' },
        ],
        acceptedSubjects: [],
        mergeLineage: { 1: 2, 2: 1 },
      },
    );
    return decision.status === 'conflict' && decision.partyId === null
      ? 'merge_lineage_cycle_held'
      : 'failed';
  }
  if (id === 'R24') {
    const code = expectError('SCOPE_MANIFEST_MISMATCH', () =>
      validateEventAgainstManifest(
        event(24, { sourceRef: { ...reference('user-24'), scope: 'other' } }),
        manifest(),
      ),
    );
    return code === 'SCOPE_MANIFEST_MISMATCH'
      ? 'manifest_scope_mismatch_rejected'
      : 'failed';
  }
  if (id === 'R25') {
    const code = expectError('ENTITY_TYPE_NOT_MANIFESTED', () =>
      validateEventAgainstManifest(
        event(25, {
          sourceRef: { ...reference('user-25'), entityType: 'group' },
        }),
        manifest(),
      ),
    );
    return code === 'ENTITY_TYPE_NOT_MANIFESTED'
      ? 'unmanifested_entity_type_rejected'
      : 'failed';
  }
  if (id === 'R26') {
    const code = expectError('EVENT_TYPE_NOT_MANIFESTED', () =>
      validateEventAgainstManifest(
        event(26, { eventType: 'GROUP_JOIN' }),
        manifest(),
      ),
    );
    return code === 'EVENT_TYPE_NOT_MANIFESTED'
      ? 'unmanifested_event_type_rejected'
      : 'failed';
  }
  const item = {
    reference: reference('user-27'),
    factType: 'membership',
    version: 1,
    valueSha256: ZERO_SHA,
  };
  const code = expectError('SNAPSHOT_DUPLICATE_ITEM', () =>
    snapshotHash([item, item]),
  );
  return code === 'SNAPSHOT_DUPLICATE_ITEM'
    ? 'duplicate_snapshot_fact_rejected'
    : 'failed';
}

export const FAILURE_EXPECTATIONS: Readonly<Record<FailureFixtureId, string>> =
  {
    R01: 'one_domain_effect_two_transport_receipts',
    R02: 'ignored_stale_no_version_regression',
    R03: 'complete_snapshot_applies_missing_fact',
    R04: 'retry_only_after_non_acceptance_proof',
    R05: 'uncertain_then_readback_verified_no_duplicate',
    R06: 'claim_intervals_change_party_unchanged',
    R07: 'ambiguous_exception_no_party_or_access_write',
    R08: 'separate_party_roles_order_and_seat',
    R09: 'quarantine_and_scope_circuit_block',
    R10: 'exact_ref_resolves_through_lineage_to_survivor',
    R11: 'affected_access_frozen_until_reference_reassignment',
    R12: 'tombstone_no_external_id_reuse',
    R13: 'rejected_before_resolution_with_offending_related_ref_index',
    R14: 'absence_based_drift_record_rejected',
    R15: 'absence_based_drift_record_rejected_after_fresh_until',
    R16: 'identical_canonical_aggregate_hash',
    R17: 'unverified_hint_never_resolves_exact_reference',
    R18: 'rejected_authenticity_stops_before_resolution',
    R19: 'conflicting_transport_duplicate_held',
    R20: 'same_version_different_hash_held',
    R21: 'tombstoned_reference_conflicts_no_reuse',
    R22: 'accepted_subject_collision_held',
    R23: 'merge_lineage_cycle_held',
    R24: 'manifest_scope_mismatch_rejected',
    R25: 'unmanifested_entity_type_rejected',
    R26: 'unmanifested_event_type_rejected',
    R27: 'duplicate_snapshot_fact_rejected',
  };

export function runFailureFixtures(): Array<{
  fixtureId: FailureFixtureId;
  expected: string;
  actual: string;
  passed: boolean;
}> {
  return FAILURE_FIXTURE_IDS.map((fixtureId) => {
    const expected = FAILURE_EXPECTATIONS[fixtureId];
    const actual = runFailureFixture(fixtureId);
    return { fixtureId, expected, actual, passed: expected === actual };
  });
}

export function replayPlanSha256(): string {
  return sha256Json({
    proofCases: PROOF_CASES,
    failureFixtures: FAILURE_EXPECTATIONS,
  });
}
