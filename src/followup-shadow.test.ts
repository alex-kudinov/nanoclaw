import { describe, expect, it } from 'vitest';

import {
  buildFollowupShadowReport,
  followupShadowProjectionInputs,
  makeFollowupShadowObservation,
} from './followup-shadow.js';
import {
  followupDecisionFingerprint,
  type ReceivableCase,
  type SalesConversationCase,
} from './followup-policy.js';

function sales(
  overrides: Partial<SalesConversationCase> = {},
): SalesConversationCase {
  return {
    lane: 'sales_conversation',
    sourceKey: 'pipeline-entry:42',
    observedAt: '2026-08-21T16:00:00.000Z',
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
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
    ...overrides,
  };
}

function receivable(overrides: Partial<ReceivableCase> = {}): ReceivableCase {
  return {
    lane: 'receivable',
    sourceKey: 'plutio-invoice:inv-1',
    observedAt: '2026-08-21T16:00:00.000Z',
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    partyId: '20',
    invoiceStatus: 'overdue',
    dueAt: '2026-08-10T16:00:00.000Z',
    outstandingAmount: 500,
    currency: 'USD',
    paymentReconciled: false,
    collectionApproved: false,
    specialHandling: false,
    recipientResolved: true,
    ownerResolved: false,
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    ...overrides,
  };
}

describe('follow-up shadow report', () => {
  it('shows new or changed work once and aggregates unchanged health', () => {
    const unchangedCase = sales({
      pipelineEntryId: '41',
      sourceKey: 'pipeline-entry:41',
    });
    const unchanged = makeFollowupShadowObservation(
      'business-v2',
      unchangedCase,
    );
    const report = buildFollowupShadowReport({
      observedAt: '2026-08-21T16:00:00.000Z',
      observations: [
        unchanged,
        makeFollowupShadowObservation('business-v2', sales()),
        makeFollowupShadowObservation('plutio', receivable()),
      ],
      existing: [
        {
          lane: unchangedCase.lane,
          sourceSystem: unchanged.sourceSystem,
          sourceKey: unchangedCase.sourceKey,
          sourceFingerprint: unchanged.sourceFingerprint,
          decisionFingerprint: followupDecisionFingerprint(unchangedCase),
          disposition: 'ready',
          reasonCode: 'sales_followup_1_due',
          version: 0,
        },
      ],
    });
    expect(report.totals).toMatchObject({
      observed: 3,
      new: 2,
      unchanged: 1,
      ready: 2,
      blocked: 1,
    });
    expect(report.receivableOutstandingByCurrency).toEqual({ USD: 500 });
    expect(report.newlyReadyOrChanged).toHaveLength(1);
    expect(report.newlyReadyOrChanged[0]).toMatchObject({
      sourceKey: 'pipeline-entry:42',
      change: 'new',
    });
    expect(report.changedExceptions).toEqual([
      expect.objectContaining({
        sourceKey: 'plutio-invoice:inv-1',
        reason: 'payment_reconciliation_required',
      }),
    ]);
    expect(report.unchangedHealth).toEqual({
      'sales_conversation:ready:sales_followup_1_due': 1,
    });
  });

  it('fingerprints source evidence without the daily observation clock', () => {
    const first = makeFollowupShadowObservation('business-v2', sales());
    const next = makeFollowupShadowObservation(
      'business-v2',
      sales({ observedAt: '2026-08-22T16:00:00.000Z' }),
    );
    expect(next.sourceFingerprint).toBe(first.sourceFingerprint);
  });

  it('creates content-free, scan-bound projection identities', () => {
    const inputs = followupShadowProjectionInputs(
      [makeFollowupShadowObservation('business-v2', sales())],
      '2026-08-21T16:00:00.000Z',
    );
    expect(inputs[0]).toMatchObject({
      sourceSystem: 'business-v2',
      occurredAt: '2026-08-21T16:00:00.000Z',
      actor: 'company-followup-shadow:host',
    });
    expect(inputs[0].sourceEventKey).toMatch(
      /^shadow:[0-9a-f]{24}:[0-9a-f]{24}$/,
    );
    expect(inputs[0].idempotencyKey).toBe(
      `followup:${inputs[0].sourceEventKey}`,
    );
    expect(JSON.stringify(inputs[0])).not.toMatch(/@|subject|body|recipient/i);
  });
});
