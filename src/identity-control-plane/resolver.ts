import {
  EventEnvelopeSchema,
  ResolutionDecisionSchema,
  ScopedReferenceSchema,
  parseOrThrow,
  type EventEnvelope,
  type ResolutionDecision,
  type ScopedReference,
} from './contracts.js';
import { scopedReferenceKey, sha256Json } from './canonical.js';
import { IdentityControlPlaneError, invariant } from './errors.js';

export interface PartyReferenceBinding {
  reference: ScopedReference;
  partyId: number;
  status: 'active' | 'tombstoned';
}

export interface AcceptedSubjectBinding {
  reference: ScopedReference;
  partyId: number;
  kind: 'auth_subject' | 'accepted_claim' | 'tandem_operation';
}

export interface ResolverState {
  externalReferences: readonly PartyReferenceBinding[];
  acceptedSubjects: readonly AcceptedSubjectBinding[];
  mergeLineage: Readonly<Record<number, number>>;
}

export interface ResolutionRequest {
  event: EventEnvelope;
  decisionId: string;
  resolverVersion: string;
  createdAt: string;
  candidatePartyIds?: readonly number[];
  stageIfUnresolved: boolean;
  stale?: boolean;
}

function sameReference(left: ScopedReference, right: ScopedReference): boolean {
  return (
    scopedReferenceKey(parseOrThrow(ScopedReferenceSchema, left)) ===
    scopedReferenceKey(parseOrThrow(ScopedReferenceSchema, right))
  );
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function mergeSurvivor(
  partyId: number,
  lineage: Readonly<Record<number, number>>,
): number | null {
  const visited = new Set<number>();
  let current = partyId;
  while (lineage[current] != null) {
    if (visited.has(current)) return null;
    visited.add(current);
    current = lineage[current]!;
  }
  return current;
}

const SUBJECT_KIND_PRIORITY: Readonly<
  Record<AcceptedSubjectBinding['kind'], number>
> = {
  auth_subject: 0,
  accepted_claim: 1,
  tandem_operation: 2,
};

function validateResolverState(state: ResolverState): void {
  for (const binding of [
    ...state.externalReferences,
    ...state.acceptedSubjects,
  ]) {
    parseOrThrow(ScopedReferenceSchema, binding.reference);
    invariant(
      Number.isSafeInteger(binding.partyId) && binding.partyId > 0,
      'RESOLVER_STATE_PARTY_INVALID',
    );
  }
  for (const [from, to] of Object.entries(state.mergeLineage)) {
    invariant(
      /^[1-9]\d*$/.test(from) && Number.isSafeInteger(to) && to > 0,
      'RESOLVER_MERGE_LINEAGE_INVALID',
    );
  }
}

export function resolveIdentity(
  request: ResolutionRequest,
  state: ResolverState,
): ResolutionDecision {
  validateResolverState(state);
  const resolvedEvent = parseOrThrow(EventEnvelopeSchema, request.event);
  const subjectRef = resolvedEvent.sourceRef;
  const candidates = unique(request.candidatePartyIds ?? []);
  let status: ResolutionDecision['status'];
  let partyId: number | null = null;
  let resolutionBasis: ResolutionDecision['resolutionBasis'] = null;

  if (resolvedEvent.authenticity === 'rejected') {
    throw new IdentityControlPlaneError('EVENT_AUTHENTICITY_REJECTED');
  }
  if (resolvedEvent.authenticity === 'unverified_hint') {
    status = candidates.length > 0 ? 'ambiguous' : 'staged_candidate';
  } else if (request.stale) {
    status = 'ignored_stale';
  } else {
    const matchingReferences = state.externalReferences.filter((binding) =>
      sameReference(binding.reference, subjectRef),
    );
    const exact = matchingReferences.filter(
      (binding) => binding.status === 'active',
    );
    const exactParties = unique(exact.map((binding) => binding.partyId));
    if (matchingReferences.some((binding) => binding.status === 'tombstoned')) {
      status = 'conflict';
    } else if (exactParties.length > 1) {
      status = 'conflict';
    } else if (exactParties.length === 1) {
      const exactParty = exactParties[0]!;
      const survivor = mergeSurvivor(exactParty, state.mergeLineage);
      if (survivor == null) {
        status = 'conflict';
      } else {
        partyId = survivor;
        status =
          survivor !== exactParty
            ? 'resolved_merge_lineage'
            : 'resolved_exact_reference';
        resolutionBasis =
          survivor !== exactParty
            ? 'accepted_merge_lineage'
            : 'exact_external_reference';
      }
    } else {
      const accepted = state.acceptedSubjects.filter((binding) =>
        sameReference(binding.reference, subjectRef),
      );
      const acceptedParties = unique(
        accepted.map((binding) => binding.partyId),
      );
      if (acceptedParties.length > 1) {
        status = 'conflict';
      } else if (acceptedParties.length === 1) {
        const binding = [...accepted].sort(
          (left, right) =>
            SUBJECT_KIND_PRIORITY[left.kind] -
            SUBJECT_KIND_PRIORITY[right.kind],
        )[0]!;
        partyId = acceptedParties[0]!;
        status =
          binding.kind === 'auth_subject'
            ? 'resolved_auth_subject'
            : 'resolved_claim_or_operation';
        resolutionBasis =
          binding.kind === 'auth_subject'
            ? 'accepted_auth_subject'
            : binding.kind === 'accepted_claim'
              ? 'accepted_claim'
              : 'tandem_operation_correlation';
      } else if (candidates.length > 0) {
        status = 'ambiguous';
      } else {
        status = request.stageIfUnresolved ? 'staged_candidate' : 'not_found';
      }
    }
  }

  return parseOrThrow(ResolutionDecisionSchema, {
    kind: 'identity_resolution_decision',
    schemaVersion: 1,
    decisionId: request.decisionId,
    resolverVersion: request.resolverVersion,
    receiptId: resolvedEvent.receiptId,
    subjectRef,
    status,
    partyId,
    candidatePartyIds: candidates,
    resolutionBasis,
    shadow: true,
    evidenceSha256: sha256Json({
      receiptId: resolvedEvent.receiptId,
      subjectRef,
      status,
      partyId,
      candidates,
      resolutionBasis,
    }),
    createdAt: request.createdAt,
  });
}

export type ProofAction =
  | 'stage_heartbeat_identity_candidate_no_party_write'
  | 'hold_heartbeat_party_link'
  | 'exact_reference_noop'
  | 'exact_reference_noop_with_encharge_candidate_held';

export function proofActionFromDecision(
  decision: ResolutionDecision,
  missingEnchargeReferenceCandidate = false,
): ProofAction {
  if (
    decision.status === 'resolved_exact_reference' ||
    decision.status === 'resolved_merge_lineage' ||
    decision.status === 'resolved_auth_subject' ||
    decision.status === 'resolved_claim_or_operation'
  ) {
    return missingEnchargeReferenceCandidate
      ? 'exact_reference_noop_with_encharge_candidate_held'
      : 'exact_reference_noop';
  }
  if (decision.status === 'ambiguous') return 'hold_heartbeat_party_link';
  if (decision.status === 'staged_candidate') {
    return 'stage_heartbeat_identity_candidate_no_party_write';
  }
  throw new IdentityControlPlaneError('PROOF_DECISION_STATUS_UNEXPECTED', {
    status: decision.status,
  });
}
