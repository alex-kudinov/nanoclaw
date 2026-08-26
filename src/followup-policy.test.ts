import { describe, expect, it } from 'vitest';

import {
  addBusinessDays,
  businessDate,
  evaluateFollowup,
  followupDecisionFingerprint,
  type ProposalSignatureCase,
  type ReceivableCase,
  type SalesConversationCase,
} from './followup-policy.js';

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

function sales(
  overrides: Partial<SalesConversationCase> = {},
): SalesConversationCase {
  return {
    lane: 'sales_conversation',
    sourceKey: 'pipeline:42:thread:abc',
    observedAt: '2026-08-19T16:00:00.000Z',
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    relationshipOwner: relationshipOwner('1'),
    partyId: '10',
    pipelineEntryId: '42',
    pipelineStage: 'qualifying',
    threadId: 'thread-abc',
    threadBindingVerified: true,
    lastOutboundAt: '2026-08-14T16:00:00.000Z',
    lastInboundAt: '2026-08-13T16:00:00.000Z',
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    hasOpenProposal: false,
    operatorDecision: 'none',
    ...overrides,
  };
}

function proposal(
  overrides: Partial<ProposalSignatureCase> = {},
): ProposalSignatureCase {
  return {
    lane: 'proposal_signature',
    sourceKey: 'plutio-proposal:abc',
    observedAt: '2026-08-11T16:00:00.000Z',
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    relationshipOwner: relationshipOwner('2'),
    partyId: '20',
    proposalStatus: 'pending',
    pendingAt: '2026-08-03T16:00:00.000Z',
    approvedAt: null,
    autoInvoiceId: null,
    projectId: null,
    recipientResolved: true,
    publicLinkVerified: true,
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    lastPresentationAt: null,
    ...overrides,
  };
}

function receivable(overrides: Partial<ReceivableCase> = {}): ReceivableCase {
  return {
    lane: 'receivable',
    sourceKey: 'plutio-invoice:def',
    observedAt: '2026-08-20T16:00:00.000Z',
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    relationshipOwner: relationshipOwner('3'),
    partyId: '30',
    invoiceStatus: 'overdue',
    dueAt: '2026-08-14T16:00:00.000Z',
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

describe('business-date cadence', () => {
  it('uses the Chicago business date and skips weekends', () => {
    expect(businessDate('2026-08-15T02:00:00.000Z')).toBe('2026-08-14');
    expect(addBusinessDays('2026-08-14T16:00:00.000Z', 3)).toBe('2026-08-19');
  });
});

describe('Sales conversation policy', () => {
  it('fails closed when source evidence is incomplete or identity is ambiguous', () => {
    expect(
      evaluateFollowup(sales({ sourceEvidenceComplete: false })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'source_evidence_unavailable',
    });
    expect(
      evaluateFollowup(sales({ sourceIdentityConflict: true })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'source_identity_conflict',
    });
  });

  it('requires explicit owner evidence for actionable work but not terminal facts', () => {
    expect(evaluateFollowup(sales({ relationshipOwner: null }))).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_unresolved',
    });
    expect(
      evaluateFollowup(
        sales({ relationshipOwner: null, pipelineStage: 'won' }),
      ),
    ).toMatchObject({
      disposition: 'completed',
      reason: 'pipeline_won',
    });
    expect(
      evaluateFollowup(
        sales({
          relationshipOwner: null,
          pipelineStage: 'paused',
        }),
      ),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_unresolved',
    });
  });

  it('makes the first follow-up ready after three business days', () => {
    expect(evaluateFollowup(sales())).toMatchObject({
      disposition: 'ready',
      reason: 'sales_followup_1_due',
      nextAction: 'customer_draft',
      sequence: 1,
      nextEligibleBusinessDate: '2026-08-19',
      ownerGroup: 'sales',
    });
  });

  it('waits until cadence is due', () => {
    expect(
      evaluateFollowup(sales({ observedAt: '2026-08-18T16:00:00.000Z' })),
    ).toMatchObject({
      disposition: 'waiting',
      reason: 'cadence_not_due',
      nextEligibleBusinessDate: '2026-08-19',
    });
  });

  it('blocks unknown source stages and malformed newer-inbound evidence', () => {
    expect(evaluateFollowup(sales({ pipelineStage: 'mystery' }))).toMatchObject(
      {
        disposition: 'blocked',
        reason: 'unknown_pipeline_stage',
      },
    );
    expect(
      evaluateFollowup(sales({ lastInboundAt: 'not-a-date' })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'invalid_inbound_timestamp',
    });
  });

  it('routes a newer inbound out of follow-up instead of drafting', () => {
    expect(
      evaluateFollowup(sales({ lastInboundAt: '2026-08-18T16:00:00.000Z' })),
    ).toMatchObject({
      disposition: 'completed',
      reason: 'newer_inbound_requires_response',
      nextAction: 'none',
    });
  });

  it('blocks a detached send when the exact thread is missing', () => {
    expect(evaluateFollowup(sales({ threadId: null }))).toMatchObject({
      disposition: 'blocked',
      reason: 'missing_exact_thread',
    });
  });

  it('blocks a party-global thread that is not bound to the exact entry', () => {
    expect(
      evaluateFollowup(sales({ threadBindingVerified: false })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'thread_identity_unverified',
    });
  });

  it('does not re-present a case with a pending action', () => {
    expect(evaluateFollowup(sales({ pendingAction: true }))).toMatchObject({
      disposition: 'waiting',
      reason: 'action_or_approval_pending',
    });
  });

  it('makes an explicit operator rejection terminal instead of drafting it again', () => {
    expect(
      evaluateFollowup(
        sales({ operatorDecision: 'declined', pendingAction: false }),
      ),
    ).toMatchObject({
      disposition: 'cancelled',
      reason: 'operator_declined_followup',
      nextAction: 'none',
      sequence: null,
      nextEligibleBusinessDate: null,
    });
  });

  it('blocks an unknown operator decision instead of treating it as consent or silence', () => {
    expect(
      evaluateFollowup(
        sales({
          operatorDecision:
            'retry' as SalesConversationCase['operatorDecision'],
        }),
      ),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'unknown_operator_decision',
    });
  });

  it('ends Sales follow-up when an open proposal supersedes it', () => {
    expect(evaluateFollowup(sales({ hasOpenProposal: true }))).toMatchObject({
      disposition: 'completed',
      reason: 'superseded_by_open_proposal',
    });
  });

  it('allows only two customer attempts, then schedules internal close review', () => {
    expect(
      evaluateFollowup(
        sales({
          observedAt: '2026-08-17T16:00:00.000Z',
          confirmedAttempts: 1,
          lastConfirmedAttemptAt: '2026-08-10T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      disposition: 'ready',
      reason: 'sales_followup_2_due',
      nextAction: 'customer_draft',
      sequence: 2,
    });
    expect(
      evaluateFollowup(
        sales({
          observedAt: '2026-08-24T16:00:00.000Z',
          confirmedAttempts: 2,
          lastConfirmedAttemptAt: '2026-08-10T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      disposition: 'ready',
      reason: 'sales_close_review_due',
      nextAction: 'close_review',
      sequence: null,
    });
  });
});

describe('proposal-signature policy', () => {
  it('treats conversion markers as terminal even when Plutio says pending', () => {
    expect(
      evaluateFollowup(proposal({ autoInvoiceId: 'invoice-1' })),
    ).toMatchObject({
      disposition: 'completed',
      reason: 'proposal_converted',
    });
  });

  it('does not make ownership a prerequisite for authoritative terminal state', () => {
    expect(
      evaluateFollowup(
        proposal({
          relationshipOwner: null,
          approvedAt: '2026-08-11T12:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      disposition: 'completed',
      reason: 'proposal_converted',
    });
    expect(
      evaluateFollowup(
        receivable({ relationshipOwner: null, invoiceStatus: 'paid' }),
      ),
    ).toMatchObject({
      disposition: 'completed',
      reason: 'invoice_paid',
    });
  });

  it('lets authoritative conversion win over stale suppression state', () => {
    expect(
      evaluateFollowup(
        proposal({ approvedAt: '2026-08-11T12:00:00.000Z', suppressed: true }),
      ),
    ).toMatchObject({ disposition: 'completed', reason: 'proposal_converted' });
  });

  it('requires a relationship owner and verified public link', () => {
    expect(
      evaluateFollowup(proposal({ relationshipOwner: null })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_unresolved',
      relationshipOwnerPrincipalKey: null,
    });
    expect(
      evaluateFollowup(
        proposal({
          relationshipOwner: null,
          proposalStatus: 'draft',
        }),
      ),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_unresolved',
    });
    expect(
      evaluateFollowup(
        proposal({
          relationshipOwner: {
            ...relationshipOwner('2'),
            actionAuthority: 'send' as 'none',
          },
        }),
      ),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_invalid',
    });
    expect(
      evaluateFollowup(proposal({ publicLinkVerified: false })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'proposal_link_unverified',
    });
  });

  it('makes touch one due after five business days', () => {
    expect(evaluateFollowup(proposal())).toMatchObject({
      disposition: 'ready',
      reason: 'proposal_touch_1_due',
      nextAction: 'customer_draft',
      sequence: 1,
      nextEligibleBusinessDate: '2026-08-10',
    });
  });

  it('re-presents an expired draft only after a cooldown, without advancing', () => {
    const input = proposal({
      observedAt: '2026-08-12T16:00:00.000Z',
      lastPresentationAt: '2026-08-10T16:00:00.000Z',
    });
    expect(evaluateFollowup(input)).toMatchObject({
      disposition: 'waiting',
      sequence: 1,
      nextEligibleBusinessDate: '2026-08-13',
    });
    expect(
      evaluateFollowup({ ...input, observedAt: '2026-08-13T16:00:00.000Z' }),
    ).toMatchObject({
      disposition: 'ready',
      reason: 'proposal_touch_1_due',
      sequence: 1,
    });
  });

  it('uses three customer touches and then an internal close review', () => {
    expect(
      evaluateFollowup(
        proposal({
          observedAt: '2026-08-19T16:00:00.000Z',
          confirmedAttempts: 3,
          lastConfirmedAttemptAt: '2026-08-10T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      disposition: 'ready',
      reason: 'proposal_close_review_due',
      nextAction: 'close_review',
      sequence: null,
    });
  });

  it('routes an untouched stale proposal to review, not customer email', () => {
    expect(
      evaluateFollowup(
        proposal({
          pendingAt: '2026-01-02T16:00:00.000Z',
          observedAt: '2026-08-11T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      disposition: 'ready',
      reason: 'stale_proposal_review_due',
      nextAction: 'internal_review',
    });
  });
});

describe('receivables policy', () => {
  it('requires owner evidence before every non-terminal waiting state', () => {
    expect(
      evaluateFollowup(
        receivable({
          relationshipOwner: null,
          invoiceStatus: 'draft',
        }),
      ),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_unresolved',
    });
    expect(
      evaluateFollowup(
        receivable({
          relationshipOwner: null,
          pendingAction: true,
        }),
      ),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'relationship_owner_unresolved',
    });
  });

  it('does not chase future-due invoices', () => {
    expect(
      evaluateFollowup(
        receivable({
          invoiceStatus: 'pending',
          dueAt: '2026-08-26T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      disposition: 'waiting',
      reason: 'invoice_not_collection_due',
    });
  });

  it('requires current payment reconciliation before collection review', () => {
    expect(
      evaluateFollowup(receivable({ paymentReconciled: false })),
    ).toMatchObject({
      disposition: 'blocked',
      reason: 'payment_reconciliation_required',
    });
  });

  it('starts with Contador internal review, never an automatic reminder', () => {
    expect(evaluateFollowup(receivable())).toMatchObject({
      disposition: 'ready',
      reason: 'collection_review_due',
      nextAction: 'internal_review',
      ownerGroup: 'contador',
    });
  });

  it('allows the first reminder only after collection approval', () => {
    expect(
      evaluateFollowup(receivable({ collectionApproved: true })),
    ).toMatchObject({
      disposition: 'ready',
      reason: 'receivable_reminder_1_due',
      nextAction: 'customer_draft',
      sequence: 1,
    });
  });

  it('allows two reminders and then escalates internally', () => {
    expect(
      evaluateFollowup(
        receivable({
          dueAt: '2026-07-31T16:00:00.000Z',
          collectionApproved: true,
          confirmedAttempts: 1,
          lastConfirmedAttemptAt: '2026-08-10T16:00:00.000Z',
          observedAt: '2026-08-17T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      reason: 'receivable_reminder_2_due',
      nextAction: 'customer_draft',
      sequence: 2,
    });
    expect(
      evaluateFollowup(
        receivable({
          dueAt: '2026-07-31T16:00:00.000Z',
          collectionApproved: true,
          confirmedAttempts: 2,
          lastConfirmedAttemptAt: '2026-08-10T16:00:00.000Z',
          observedAt: '2026-08-24T16:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      reason: 'receivable_escalation_due',
      nextAction: 'escalate',
      sequence: null,
    });
  });

  it('closes paid invoices before considering a pending action', () => {
    expect(
      evaluateFollowup(
        receivable({ invoiceStatus: 'paid', pendingAction: true }),
      ),
    ).toMatchObject({
      disposition: 'completed',
      reason: 'invoice_paid',
    });
  });

  it('lets authoritative payment win over stale safety flags', () => {
    expect(
      evaluateFollowup(
        receivable({
          invoiceStatus: 'paid',
          suppressed: true,
          uncertainDelivery: true,
        }),
      ),
    ).toMatchObject({ disposition: 'completed', reason: 'invoice_paid' });
  });
});

describe('content-free decision fingerprint', () => {
  it('is stable for the same exact case and changes with eligibility evidence', () => {
    const input = sales();
    const first = followupDecisionFingerprint(input);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(followupDecisionFingerprint(input)).toBe(first);
    const reordered = Object.fromEntries(
      Object.entries(input).reverse(),
    ) as unknown as SalesConversationCase;
    expect(followupDecisionFingerprint(reordered)).toBe(first);
    expect(
      followupDecisionFingerprint({
        ...input,
        observedAt: '2026-08-20T16:00:00.000Z',
      }),
    ).toBe(first);
    expect(
      followupDecisionFingerprint({
        ...input,
        lastInboundAt: '2026-08-18T16:00:00.000Z',
      }),
    ).not.toBe(first);
  });
});
