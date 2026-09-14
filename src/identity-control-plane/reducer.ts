import {
  EventEnvelopeSchema,
  parseOrThrow,
  type EventEnvelope,
} from './contracts.js';
import {
  canonicalReceiptSortKey,
  canonicalReplayHash,
  sha256Json,
} from './canonical.js';
import { invariant } from './errors.js';

export interface DomainFactEvent {
  envelope: EventEnvelope;
  factKey: string;
  factVersion: number;
  valueSha256: string;
}

export interface CurrentFact {
  factVersion: number;
  valueSha256: string;
}

export interface FactReductionReceipt {
  receiptId: string;
  outcome:
    | 'applied'
    | 'duplicate_transport'
    | 'unchanged'
    | 'ignored_stale'
    | 'conflict';
}

export interface FactReductionResult {
  facts: Readonly<Record<string, CurrentFact>>;
  receipts: readonly FactReductionReceipt[];
  appliedCount: number;
  replaySha256: string;
}

export function reduceFactEvents(
  inputs: readonly DomainFactEvent[],
  initialFacts: Readonly<Record<string, CurrentFact>> = {},
): FactReductionResult {
  const facts: Record<string, CurrentFact> = structuredClone(initialFacts);
  for (const [factKey, fact] of Object.entries(facts)) {
    validateFact(factKey, fact.factVersion, fact.valueSha256);
  }
  const seenDeduplicationKeys = new Map<string, CurrentFact>();
  const receipts: FactReductionReceipt[] = [];
  let appliedCount = 0;

  const ordered = [...inputs].sort((left, right) => {
    const leftKey = canonicalReceiptSortKey(left.envelope);
    const rightKey = canonicalReceiptSortKey(right.envelope);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  for (const input of ordered) {
    const envelope = parseOrThrow(EventEnvelopeSchema, input.envelope);
    validateFact(input.factKey, input.factVersion, input.valueSha256);
    const domainDeduplicationKey = `${envelope.deduplicationKey}\u0000${input.factKey}`;
    const duplicate = seenDeduplicationKeys.get(domainDeduplicationKey);
    if (duplicate) {
      receipts.push({
        receiptId: envelope.receiptId,
        outcome:
          duplicate.factVersion === input.factVersion &&
          duplicate.valueSha256 === input.valueSha256
            ? 'duplicate_transport'
            : 'conflict',
      });
      continue;
    }
    seenDeduplicationKeys.set(domainDeduplicationKey, {
      factVersion: input.factVersion,
      valueSha256: input.valueSha256,
    });
    const current = facts[input.factKey];
    if (current && input.factVersion < current.factVersion) {
      receipts.push({
        receiptId: envelope.receiptId,
        outcome: 'ignored_stale',
      });
      continue;
    }
    if (current && input.factVersion === current.factVersion) {
      receipts.push({
        receiptId: envelope.receiptId,
        outcome:
          input.valueSha256 === current.valueSha256 ? 'unchanged' : 'conflict',
      });
      continue;
    }
    facts[input.factKey] = {
      factVersion: input.factVersion,
      valueSha256: input.valueSha256,
    };
    appliedCount += 1;
    receipts.push({ receiptId: envelope.receiptId, outcome: 'applied' });
  }

  return {
    facts,
    receipts,
    appliedCount,
    replaySha256: sha256Json({ facts, receipts }),
  };
}

function validateFact(
  factKey: string,
  factVersion: number,
  valueSha256: string,
): void {
  invariant(
    typeof factKey === 'string' &&
      factKey.length > 0 &&
      factKey.length <= 512 &&
      factKey.trim() === factKey &&
      !/[\u0000-\u001f\u007f]/.test(factKey),
    'FACT_KEY_INVALID',
  );
  invariant(
    Number.isSafeInteger(factVersion) && factVersion > 0,
    'FACT_VERSION_INVALID',
  );
  invariant(/^[a-f0-9]{64}$/.test(valueSha256), 'FACT_HASH_INVALID');
}

export function recoverPositiveSnapshotFacts(
  observedFactKeys: readonly string[],
  existingFactKeys: readonly string[],
): string[] {
  const existing = new Set(existingFactKeys);
  return [...new Set(observedFactKeys)]
    .filter((key) => !existing.has(key))
    .sort();
}

export interface IdentifierClaimInterval {
  fingerprint: string;
  validFrom: string;
  validUntil: string | null;
}

export function changeIdentifierClaim(input: {
  current: IdentifierClaimInterval;
  nextFingerprint: string;
  changedAt: string;
}): { retired: IdentifierClaimInterval; current: IdentifierClaimInterval } {
  invariant(
    input.current.validUntil === null,
    'IDENTIFIER_CLAIM_ALREADY_RETIRED',
  );
  invariant(
    input.current.fingerprint !== input.nextFingerprint,
    'IDENTIFIER_CLAIM_UNCHANGED',
  );
  invariant(
    Date.parse(input.changedAt) >= Date.parse(input.current.validFrom),
    'IDENTIFIER_CLAIM_TIME_INVALID',
  );
  return {
    retired: { ...input.current, validUntil: input.changedAt },
    current: {
      fingerprint: input.nextFingerprint,
      validFrom: input.changedAt,
      validUntil: null,
    },
  };
}

export function materializeOrderRoles(input: {
  payerPartyId: number;
  learnerPartyId: number;
}): {
  payerPartyId: number;
  learnerPartyId: number;
  payerRelationship: 'self' | 'other';
} {
  invariant(
    input.payerPartyId > 0 && input.learnerPartyId > 0,
    'ORDER_ROLE_INVALID',
  );
  return {
    ...input,
    payerRelationship:
      input.payerPartyId === input.learnerPartyId ? 'self' : 'other',
  };
}

export function planPartySplit(partyId: number): {
  partyId: number;
  identityDependentAccess: 'frozen';
  automaticReferenceReassignment: false;
} {
  invariant(Number.isSafeInteger(partyId) && partyId > 0, 'PARTY_ID_INVALID');
  return {
    partyId,
    identityDependentAccess: 'frozen',
    automaticReferenceReassignment: false,
  };
}

export function tombstoneReference(input: {
  referenceKey: string;
  deletedAt: string;
}): {
  referenceKey: string;
  status: 'tombstoned';
  reusable: false;
  deletedAt: string;
} {
  invariant(Boolean(input.referenceKey), 'REFERENCE_KEY_INVALID');
  invariant(
    Number.isFinite(Date.parse(input.deletedAt)),
    'REFERENCE_DELETION_TIME_INVALID',
  );
  return { ...input, status: 'tombstoned', reusable: false };
}

export function permutationReplayHash(
  events: readonly EventEnvelope[],
): string {
  return canonicalReplayHash(events);
}
