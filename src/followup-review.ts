/**
 * Pure, content-minimized operator review packet for Company OS follow-up.
 *
 * This module identifies only payment-reconciled overdue receivables that the
 * follow-up policy has already routed to internal Contador review. It performs
 * no source reads, persistence, Slack work, decisions, drafting, or customer
 * action.
 */

import { createHash } from 'node:crypto';

import {
  businessDate,
  evaluateFollowup,
  followupDecisionFingerprint,
  type ReceivableCase,
} from './followup-policy.js';
import {
  buildFollowupShadowReport,
  followupSourceFingerprint,
  type ExistingFollowupShadowCase,
  type FollowupShadowObservation,
  type FollowupShadowSourceError,
} from './followup-shadow.js';

export const FOLLOWUP_REVIEW_CONTRACT_VERSION =
  'company-followup-review-v2' as const;
export const DEFAULT_FOLLOWUP_REVIEW_LIMIT = 10;
export const MAX_FOLLOWUP_REVIEW_LIMIT = 25;

export const FOLLOWUP_REVIEW_CHOICES = Object.freeze([
  'collectible',
  'payment_plan',
  'dispute_hold',
  'credit_or_cancel_review',
  'snooze',
  'relationship_review',
] as const);

export type FollowupReviewChoice = (typeof FOLLOWUP_REVIEW_CHOICES)[number];

export interface FollowupReviewItem {
  sourceSystem: 'plutio';
  sourceKey: string;
  sourceFingerprint: string;
  decisionFingerprint: string;
  partyId: string | null;
  dueBusinessDate: string;
  reviewEligibleBusinessDate: string;
  outstandingAmount: number;
  currency: string;
  reason: 'collection_review_due';
  nextAction: 'internal_review';
  ownerGroup: 'contador';
  relationshipOwnerPrincipalKey: string;
  relationshipOwnerAssignmentId: string;
  relationshipOwnerDecisionRef: string;
}

export interface FollowupReviewPacket {
  contractVersion: typeof FOLLOWUP_REVIEW_CONTRACT_VERSION;
  observedAt: string;
  sourceSnapshotFingerprint: string;
  packetFingerprint: string;
  eligibleCount: number;
  selectedCount: number;
  limit: number;
  truncated: boolean;
  reviewChoices: readonly FollowupReviewChoice[];
  items: FollowupReviewItem[];
}

export interface BuildFollowupReviewPacketInput {
  observedAt: string;
  observations: FollowupShadowObservation[];
  existing?: ExistingFollowupShadowCase[];
  sourceErrors?: FollowupShadowSourceError[];
  limit?: number;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const PLUTIO_INVOICE_KEY_RE =
  /^plutio-invoice:[A-Za-z0-9][A-Za-z0-9._:/-]{0,480}$/;

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value !== 'object') {
    throw new TypeError('followup-review evidence must be JSON-compatible');
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function validateLimit(limit: number): void {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_FOLLOWUP_REVIEW_LIMIT
  ) {
    throw new Error(
      `followup-review: limit must be an integer from 1 to ${MAX_FOLLOWUP_REVIEW_LIMIT}`,
    );
  }
}

function toReviewItem(
  observation: FollowupShadowObservation,
): FollowupReviewItem | null {
  if (observation.case.lane !== 'receivable') return null;
  const decision = evaluateFollowup(observation.case);
  if (
    decision.disposition !== 'ready' ||
    decision.reason !== 'collection_review_due' ||
    decision.nextAction !== 'internal_review' ||
    decision.ownerGroup !== 'contador'
  ) {
    return null;
  }
  if (
    !decision.relationshipOwnerPrincipalKey ||
    !decision.relationshipOwnerAssignmentId ||
    !decision.relationshipOwnerDecisionRef
  ) {
    throw new Error(
      `followup-review: eligible receivable lacks relationship-owner provenance for ${observation.case.sourceKey}`,
    );
  }
  if (
    observation.sourceSystem !== 'plutio' ||
    !PLUTIO_INVOICE_KEY_RE.test(observation.case.sourceKey)
  ) {
    throw new Error(
      'followup-review: eligible receivable lacks an exact Plutio invoice identity',
    );
  }
  if (
    !SHA256_RE.test(observation.sourceFingerprint) ||
    observation.sourceFingerprint !==
      followupSourceFingerprint(observation.case)
  ) {
    throw new Error(
      `followup-review: source fingerprint mismatch for ${observation.case.sourceKey}`,
    );
  }
  const receivable = observation.case as ReceivableCase;
  const dueBusinessDate = businessDate(receivable.dueAt ?? '');
  if (
    !dueBusinessDate ||
    !decision.nextEligibleBusinessDate ||
    typeof receivable.outstandingAmount !== 'number' ||
    !Number.isFinite(receivable.outstandingAmount) ||
    receivable.outstandingAmount <= 0 ||
    !receivable.currency
  ) {
    throw new Error(
      `followup-review: eligible receivable is missing review evidence for ${receivable.sourceKey}`,
    );
  }
  return {
    sourceSystem: 'plutio',
    sourceKey: receivable.sourceKey,
    sourceFingerprint: observation.sourceFingerprint,
    decisionFingerprint: followupDecisionFingerprint(receivable, decision),
    partyId: receivable.partyId,
    dueBusinessDate,
    reviewEligibleBusinessDate: decision.nextEligibleBusinessDate,
    outstandingAmount: receivable.outstandingAmount,
    currency: receivable.currency,
    reason: 'collection_review_due',
    nextAction: 'internal_review',
    ownerGroup: 'contador',
    relationshipOwnerPrincipalKey: decision.relationshipOwnerPrincipalKey,
    relationshipOwnerAssignmentId: decision.relationshipOwnerAssignmentId,
    relationshipOwnerDecisionRef: decision.relationshipOwnerDecisionRef,
  };
}

export function buildFollowupReviewPacket(
  input: BuildFollowupReviewPacketInput,
): FollowupReviewPacket {
  const limit = input.limit ?? DEFAULT_FOLLOWUP_REVIEW_LIMIT;
  validateLimit(limit);
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    throw new Error('followup-review: observedAt must be ISO-8601');
  }
  const observedAt = new Date(input.observedAt).toISOString();
  if ((input.sourceErrors?.length ?? 0) > 0) {
    throw new Error('followup-review: required source reads failed');
  }
  const sourceIdentities = new Set<string>();
  for (const observation of input.observations) {
    if (
      !Number.isFinite(Date.parse(observation.case.observedAt)) ||
      new Date(observation.case.observedAt).toISOString() !== observedAt
    ) {
      throw new Error(
        `followup-review: observation clock mismatch for ${observation.case.sourceKey}`,
      );
    }
    if (
      !SHA256_RE.test(observation.sourceFingerprint) ||
      observation.sourceFingerprint !==
        followupSourceFingerprint(observation.case)
    ) {
      throw new Error(
        `followup-review: source fingerprint mismatch for ${observation.case.sourceKey}`,
      );
    }
    const sourceIdentity = `${observation.case.lane}\u0000${observation.sourceSystem}\u0000${observation.case.sourceKey}`;
    if (sourceIdentities.has(sourceIdentity)) {
      throw new Error(
        `followup-review: duplicate source identity ${observation.case.sourceKey}`,
      );
    }
    sourceIdentities.add(sourceIdentity);
  }
  const report = buildFollowupShadowReport({
    observedAt,
    observations: input.observations,
    existing: input.existing,
    sourceErrors: input.sourceErrors,
  });
  const items = input.observations
    .map(toReviewItem)
    .filter((item): item is FollowupReviewItem => item !== null)
    .sort((left, right) =>
      `${left.dueBusinessDate}:${left.sourceKey}`.localeCompare(
        `${right.dueBusinessDate}:${right.sourceKey}`,
      ),
    );
  const selected = items.slice(0, limit);
  const fingerprintEvidence = {
    contractVersion: FOLLOWUP_REVIEW_CONTRACT_VERSION,
    sourceSnapshotFingerprint: report.snapshotFingerprint,
    eligibleCount: items.length,
    limit,
    truncated: items.length > selected.length,
    reviewChoices: FOLLOWUP_REVIEW_CHOICES,
    items: selected,
  };
  return {
    contractVersion: FOLLOWUP_REVIEW_CONTRACT_VERSION,
    observedAt: report.observedAt,
    sourceSnapshotFingerprint: report.snapshotFingerprint,
    packetFingerprint: sha(fingerprintEvidence),
    eligibleCount: items.length,
    selectedCount: selected.length,
    limit,
    truncated: items.length > selected.length,
    reviewChoices: FOLLOWUP_REVIEW_CHOICES,
    items: selected,
  };
}
