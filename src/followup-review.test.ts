import { describe, expect, it } from 'vitest';

import {
  buildFollowupReviewPacket,
  FOLLOWUP_REVIEW_CHOICES,
} from './followup-review.js';
import { makeFollowupShadowObservation } from './followup-shadow.js';
import type {
  ReceivableCase,
  SalesConversationCase,
} from './followup-policy.js';

const OBSERVED_AT = '2026-08-21T16:00:00.000Z';
function relationshipOwner(assignmentId: string) {
  return {
    principalKey: 'team:tandem',
    assignmentId,
    decisionRef:
      '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
    managingSystem: 'tandem_os' as const,
    actionAuthority: 'none' as const,
  };
}

function receivable(
  id: string,
  overrides: Partial<ReceivableCase> = {},
): ReceivableCase {
  return {
    lane: 'receivable',
    sourceKey: `plutio-invoice:${id}`,
    observedAt: OBSERVED_AT,
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    relationshipOwner: relationshipOwner('3'),
    partyId: '20',
    invoiceStatus: 'overdue',
    dueAt: '2026-08-10T16:00:00.000Z',
    outstandingAmount: 500,
    currency: 'USD',
    paymentReconciled: true,
    collectionApproved: false,
    specialHandling: false,
    recipientResolved: true,
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    ...overrides,
  };
}

function sales(): SalesConversationCase {
  return {
    lane: 'sales_conversation',
    sourceKey: 'pipeline-entry:42',
    observedAt: OBSERVED_AT,
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    relationshipOwner: relationshipOwner('1'),
    partyId: '10',
    pipelineEntryId: '42',
    pipelineStage: 'qualifying',
    threadId: 'thread-1',
    threadBindingVerified: true,
    lastOutboundAt: '2026-08-14T16:00:00.000Z',
    lastInboundAt: '2026-08-13T16:00:00.000Z',
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    hasOpenProposal: false,
    operatorDecision: 'none',
  };
}

describe('follow-up review packet', () => {
  it('selects only exact policy-ready Contador reviews and minimizes content', () => {
    const packet = buildFollowupReviewPacket({
      observedAt: OBSERVED_AT,
      observations: [
        makeFollowupShadowObservation('business-v2', sales()),
        makeFollowupShadowObservation(
          'plutio',
          receivable('waiting', { paymentReconciled: false }),
        ),
        makeFollowupShadowObservation('plutio', receivable('ready')),
      ],
    });
    expect(packet).toMatchObject({
      contractVersion: 'company-followup-review-v2',
      eligibleCount: 1,
      selectedCount: 1,
      truncated: false,
      reviewChoices: FOLLOWUP_REVIEW_CHOICES,
    });
    expect(packet.items[0]).toMatchObject({
      sourceSystem: 'plutio',
      sourceKey: 'plutio-invoice:ready',
      partyId: '20',
      dueBusinessDate: '2026-08-10',
      reviewEligibleBusinessDate: '2026-08-13',
      outstandingAmount: 500,
      currency: 'USD',
      reason: 'collection_review_due',
      nextAction: 'internal_review',
      relationshipOwnerPrincipalKey: 'team:tandem',
      relationshipOwnerAssignmentId: '3',
      ownerGroup: 'contador',
    });
    expect(packet.packetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(packet)).not.toMatch(
      /customer|recipient|subject|body|email|@/i,
    );
  });

  it('sorts, caps, and fingerprints the exact reviewed source snapshot', () => {
    const laterClock = '2026-08-22T16:00:00.000Z';
    const observations = [
      makeFollowupShadowObservation(
        'plutio',
        receivable('second', { dueAt: '2026-08-11T16:00:00.000Z' }),
      ),
      makeFollowupShadowObservation('plutio', receivable('first')),
    ];
    const first = buildFollowupReviewPacket({
      observedAt: OBSERVED_AT,
      observations,
      limit: 1,
    });
    const next = buildFollowupReviewPacket({
      observedAt: laterClock,
      observations: observations.map((observation) => ({
        ...observation,
        case: { ...observation.case, observedAt: laterClock },
      })),
      limit: 1,
    });
    expect(first).toMatchObject({
      eligibleCount: 2,
      selectedCount: 1,
      truncated: true,
    });
    expect(first.items[0].sourceKey).toBe('plutio-invoice:first');
    expect(next.packetFingerprint).toBe(first.packetFingerprint);
  });

  it('fails closed on source errors, drift, malformed identity, and duplicates', () => {
    const observation = makeFollowupShadowObservation(
      'plutio',
      receivable('ready'),
    );
    expect(() =>
      buildFollowupReviewPacket({
        observedAt: OBSERVED_AT,
        observations: [observation],
        sourceErrors: [{ source: 'plutio_invoices', code: 'read_failed' }],
      }),
    ).toThrow('required source reads failed');
    expect(() =>
      buildFollowupReviewPacket({
        observedAt: OBSERVED_AT,
        observations: [{ ...observation, sourceFingerprint: 'a'.repeat(64) }],
      }),
    ).toThrow('source fingerprint mismatch');
    expect(() =>
      buildFollowupReviewPacket({
        observedAt: '2026-08-22T16:00:00.000Z',
        observations: [observation],
      }),
    ).toThrow('observation clock mismatch');
    expect(() =>
      buildFollowupReviewPacket({
        observedAt: OBSERVED_AT,
        observations: [
          makeFollowupShadowObservation('other', receivable('wrong-source')),
        ],
      }),
    ).toThrow('exact Plutio invoice identity');
    expect(() =>
      buildFollowupReviewPacket({
        observedAt: OBSERVED_AT,
        observations: [observation, observation],
      }),
    ).toThrow('duplicate source identity');
  });
});
