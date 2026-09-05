import { describe, expect, it } from 'vitest';
import {
  EnrollmentCommandError,
  assignClass,
  assignParticipant,
  attachEnrollmentEvidence,
  captureOrder,
  correctOrderTerms,
  createEmptyEnrollmentFoundationState,
  createSeats,
  linkSourceReference,
  materializeEnrollment,
  openEnrollmentException,
  recordFinancialAgreement,
  recordFinancialObligation,
  recordProjectionReadback,
  requestProjection,
  resolveEnrollmentException,
  transferParticipant,
  transitionOrderState,
  transitionFinancialObligation,
  type EnrollmentFoundationState,
} from './student-enrollment-foundation.js';

const NOW = '2026-09-05T19:30:00Z';
const LATER = '2026-10-01T14:00:00Z';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function admitted(
  options: {
    orderKey?: string;
    seats?: number;
    channel?: 'website_stripe_checkout' | 'sponsored_cohort' | 'scholarship';
    finance?: 'settled' | 'active_terms' | 'not_applicable' | 'unverified';
  } = {},
) {
  return captureOrder(createEmptyEnrollmentFoundationState(), {
    orderKey: options.orderKey ?? 'order:test-1',
    sourceChannel: options.channel ?? 'website_stripe_checkout',
    offerKey: 'acc-full',
    bundleKey: 'acc-full:v1',
    bundleVersion: 1,
    payerPartyId: options.channel === 'scholarship' ? null : 100,
    seatCount: options.seats ?? 1,
    financialClassification: options.finance ?? 'settled',
    policyRevision: 1,
    evidenceSha256: SHA_A,
    effectiveAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'test-operator',
    sourceReference: {
      sourceScope: 'stripe:tandem',
      sourceObjectType: 'payment_intent',
      sourceObjectId: options.orderKey ?? 'pi_test_1',
      idempotencyKey: `source:${options.orderKey ?? 'pi_test_1'}`,
      evidenceSha256: SHA_A,
      observedAt: NOW,
      recordedAt: NOW,
      recordedBy: 'test-adapter',
    },
  });
}

function assigned(options: Parameters<typeof admitted>[0] = {}) {
  const captured = admitted(options);
  const orderKey = captured.order.orderKey;
  let state = createSeats(captured.state, {
    orderKey,
    expectedOrderVersion: 0,
    seatKeys: Array.from(
      { length: captured.order.seatCount },
      (_, i) => `seat:${orderKey}:${i + 1}`,
    ),
    evidenceSha256: SHA_A,
    actor: 'test-operator',
    occurredAt: NOW,
  });
  state = assignParticipant(state, {
    seatKey: `seat:${orderKey}:1`,
    expectedSeatVersion: 0,
    participantPartyId:
      options.channel === 'sponsored_cohort' ||
      options.channel === 'scholarship'
        ? 200
        : 100,
    participantEvidenceSha256: SHA_B,
    payerRelationship:
      options.channel === 'scholarship'
        ? 'not_applicable'
        : options.channel === 'sponsored_cohort'
          ? 'sponsor'
          : 'self_purchase_explicit',
    actor: 'test-operator',
    occurredAt: NOW,
  });
  return state;
}

function materialized(options: Parameters<typeof admitted>[0] = {}) {
  const state = assigned(options);
  const orderKey = options.orderKey ?? 'order:test-1';
  return materializeEnrollment(state, {
    orderKey,
    expectedOrderVersion: 1,
    seatKey: `seat:${orderKey}:1`,
    expectedSeatVersion: 1,
    enrollmentKey: `enrollment:${orderKey}:1`,
    catalogRevision: 1,
    enrollmentState: 'active',
    effectiveAt: null,
    materializationSha256: SHA_C,
    components: [
      {
        entitlementKey: `entitlement:${orderKey}:m1`,
        componentKey: 'acc.module-1',
        state: 'included',
      },
    ],
    actor: 'test-operator',
    occurredAt: NOW,
  });
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected command to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(EnrollmentCommandError);
    expect((error as EnrollmentCommandError).code).toBe(code);
  }
}

describe('student enrollment dark domain', () => {
  it('rejects runtime enum, revision, and SQL-boundary key violations', () => {
    const base = {
      orderKey: `o${'x'.repeat(200)}`,
      sourceChannel: 'invented_channel',
      offerKey: 'acc-full',
      bundleKey: 'acc-full:v1',
      bundleVersion: 1,
      payerPartyId: 100,
      seatCount: 1,
      financialClassification: 'settled',
      policyRevision: 0,
      evidenceSha256: SHA_A,
      effectiveAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      updatedBy: 'operator',
      sourceReference: {
        sourceScope: 'stripe:tandem',
        sourceObjectType: 'payment_intent',
        sourceObjectId: 'pi_runtime',
        idempotencyKey: 'source:pi_runtime',
        evidenceSha256: SHA_A,
        observedAt: NOW,
        recordedAt: NOW,
        recordedBy: 'adapter',
      },
    };
    expectCode(
      () => captureOrder(createEmptyEnrollmentFoundationState(), base as never),
      'invalid_source_channel',
    );
    expectCode(
      () =>
        captureOrder(createEmptyEnrollmentFoundationState(), {
          ...base,
          sourceChannel: 'website_stripe_checkout',
        } as never),
      'invalid_policy_revision',
    );
    expectCode(
      () =>
        captureOrder(createEmptyEnrollmentFoundationState(), {
          ...base,
          sourceChannel: 'website_stripe_checkout',
          policyRevision: 1,
        } as never),
      'invalid_key',
    );
  });

  it('deduplicates exact source replay without creating another order', () => {
    const first = admitted();
    const replay = captureOrder(first.state, {
      ...first.order,
      version: undefined,
      state: undefined,
      sourceReference: {
        ...Object.values(first.state.sourceReferences)[0],
        orderKey: undefined,
      },
    } as never);
    expect(replay.duplicate).toBe(true);
    expect(Object.keys(replay.state.orders)).toHaveLength(1);
  });

  it('rejects conflicting source reuse without mutating state', () => {
    const first = admitted();
    const before = structuredClone(first.state);
    expectCode(
      () =>
        captureOrder(first.state, {
          orderKey: 'order:conflict',
          sourceChannel: 'website_stripe_checkout',
          offerKey: 'pcc-full',
          bundleKey: 'pcc-full:v1',
          bundleVersion: 1,
          payerPartyId: 101,
          seatCount: 1,
          financialClassification: 'settled',
          policyRevision: 1,
          evidenceSha256: SHA_B,
          effectiveAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          updatedBy: 'test-operator',
          sourceReference: {
            ...Object.values(first.state.sourceReferences)[0],
            orderKey: undefined,
          } as never,
        }),
      'duplicate_source_conflict',
    );
    expect(first.state).toEqual(before);
  });

  it('links multiple aliases to one order with optimistic concurrency', () => {
    const first = admitted();
    const next = linkSourceReference(first.state, {
      orderKey: first.order.orderKey,
      expectedOrderVersion: 0,
      reference: {
        sourceScope: 'stripe:tandem',
        sourceObjectType: 'checkout_session',
        sourceObjectId: 'cs_test_1',
        idempotencyKey: 'source:cs_test_1',
        evidenceSha256: SHA_B,
        observedAt: NOW,
        recordedAt: NOW,
        recordedBy: 'test-adapter',
      },
    });
    expect(Object.keys(next.sourceReferences)).toHaveLength(2);
    expect(next.orders[first.order.orderKey].version).toBe(1);
    expectCode(
      () =>
        linkSourceReference(next, {
          orderKey: first.order.orderKey,
          expectedOrderVersion: 0,
          reference: {
            sourceScope: 'x',
            sourceObjectType: 'y',
            sourceObjectId: 'z',
            idempotencyKey: 'z',
            evidenceSha256: SHA_A,
            observedAt: NOW,
            recordedAt: NOW,
            recordedBy: 'actor',
          },
        }),
      'stale_version',
    );
  });

  it('attaches source-bound evidence idempotently and rejects conflicting reuse', () => {
    const first = admitted();
    const evidence = {
      evidenceKey: 'evidence:participant:1',
      subjectType: 'order' as const,
      subjectKey: first.order.orderKey,
      evidenceType: 'participant_roster',
      sourceReferenceKey: 'stripe:tandem:payment_intent:pi_test_1',
      evidenceSha256: SHA_B,
      observedAt: NOW,
      recordedAt: NOW,
      recordedBy: 'test-adapter',
    };
    const next = attachEnrollmentEvidence(first.state, evidence);
    expect(attachEnrollmentEvidence(next, evidence)).toBe(next);
    expectCode(
      () =>
        attachEnrollmentEvidence(next, {
          ...evidence,
          evidenceSha256: SHA_C,
        }),
      'evidence_key_conflict',
    );
    expectCode(
      () =>
        attachEnrollmentEvidence(next, {
          ...evidence,
          evidenceKey: 'evidence:invalid-type',
          evidenceType: 'owner.override',
        }),
      'invalid_lower_snake',
    );
    expectCode(
      () =>
        attachEnrollmentEvidence(next, {
          ...evidence,
          evidenceKey: 'evidence:invalid-subject',
          subjectType: 'invented' as never,
        }),
      'invalid_choice',
    );
  });

  it('resolves incomplete order terms by version instead of replacing the order', () => {
    const captured = captureOrder(createEmptyEnrollmentFoundationState(), {
      orderKey: 'order:incomplete',
      sourceChannel: 'plutio_invoice_or_contract',
      offerKey: null,
      bundleKey: null,
      bundleVersion: null,
      payerPartyId: 100,
      seatCount: 1,
      financialClassification: 'unverified',
      policyRevision: 1,
      evidenceSha256: SHA_A,
      effectiveAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      updatedBy: 'operator',
      sourceReference: {
        sourceScope: 'plutio',
        sourceObjectType: 'invoice',
        sourceObjectId: 'invoice_test_1',
        idempotencyKey: 'source:invoice_test_1',
        evidenceSha256: SHA_A,
        observedAt: NOW,
        recordedAt: NOW,
        recordedBy: 'adapter',
      },
    });
    expect(captured.order.state).toBe('needs_offer');
    const next = correctOrderTerms(captured.state, {
      orderKey: 'order:incomplete',
      expectedOrderVersion: 0,
      offerKey: 'pcc-full',
      bundleKey: 'pcc-full:v1',
      bundleVersion: 1,
      financialClassification: 'active_terms',
      evidenceSha256: SHA_B,
      actor: 'finance',
      occurredAt: NOW,
    });
    expect(next.orders['order:incomplete']).toMatchObject({
      offerKey: 'pcc-full',
      financialClassification: 'active_terms',
      version: 1,
    });
    expect(Object.keys(next.orders)).toHaveLength(1);
  });

  it('requires exact seat count and leaves a rejected command atomic', () => {
    const first = admitted({ seats: 2 });
    const before = structuredClone(first.state);
    expectCode(
      () =>
        createSeats(first.state, {
          orderKey: first.order.orderKey,
          expectedOrderVersion: 0,
          seatKeys: ['seat:only-one'],
          evidenceSha256: SHA_A,
          actor: 'actor',
          occurredAt: NOW,
        }),
      'seat_count_mismatch',
    );
    expect(first.state).toEqual(before);
  });

  it('materializes exact seats in a sponsor order independently', () => {
    const state = materialized({ channel: 'sponsored_cohort', seats: 2 });
    expect(state.orders['order:test-1'].state).toBe('partially_materialized');
    expect(state.seats['seat:order:test-1:2'].state).toBe('unassigned');
    expect(Object.values(state.enrollments)).toHaveLength(1);
  });

  it('holds materialization when participant identity is missing', () => {
    const captured = admitted();
    const state = createSeats(captured.state, {
      orderKey: captured.order.orderKey,
      expectedOrderVersion: 0,
      seatKeys: ['seat:order:test-1:1'],
      evidenceSha256: SHA_A,
      actor: 'actor',
      occurredAt: NOW,
    });
    expectCode(
      () =>
        materializeEnrollment(state, {
          orderKey: captured.order.orderKey,
          expectedOrderVersion: 1,
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 0,
          enrollmentKey: 'enrollment:x',
          catalogRevision: 1,
          enrollmentState: 'active',
          effectiveAt: null,
          materializationSha256: SHA_C,
          components: [
            {
              entitlementKey: 'entitlement:x',
              componentKey: 'acc.module-1',
              state: 'included',
            },
          ],
          actor: 'actor',
          occurredAt: NOW,
        }),
      'participant_missing',
    );
  });

  it('requires financial classification before materialization', () => {
    const state = assigned({ finance: 'unverified' });
    expectCode(
      () =>
        materializeEnrollment(state, {
          orderKey: 'order:test-1',
          expectedOrderVersion: 1,
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 1,
          enrollmentKey: 'enrollment:x',
          catalogRevision: 1,
          enrollmentState: 'active',
          effectiveAt: null,
          materializationSha256: SHA_C,
          components: [
            {
              entitlementKey: 'entitlement:x',
              componentKey: 'acc.module-1',
              state: 'included',
            },
          ],
          actor: 'actor',
          occurredAt: NOW,
        }),
      'financial_terms_unknown',
    );
  });

  it('enforces the explicit payer-to-participant relationship', () => {
    const state = assigned();
    state.seats['seat:order:test-1:1'].participantPartyId = 200;
    expectCode(
      () =>
        materializeEnrollment(state, {
          orderKey: 'order:test-1',
          expectedOrderVersion: 1,
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 1,
          enrollmentKey: 'enrollment:x',
          catalogRevision: 1,
          enrollmentState: 'active',
          effectiveAt: null,
          materializationSha256: SHA_C,
          components: [
            {
              entitlementKey: 'entitlement:x',
              componentKey: 'acc.module-1',
              state: 'included',
            },
          ],
          actor: 'actor',
          occurredAt: NOW,
        }),
      'payer_relationship_conflict',
    );
  });

  it('allows scholarship materialization without a payment obligation', () => {
    const state = materialized({
      channel: 'scholarship',
      finance: 'not_applicable',
    });
    expect(Object.keys(state.enrollments)).toHaveLength(1);
    expect(Object.keys(state.obligations)).toHaveLength(0);
  });

  it('requires a future effective time for pending enrollment', () => {
    const state = assigned();
    const base = {
      orderKey: 'order:test-1',
      expectedOrderVersion: 1,
      seatKey: 'seat:order:test-1:1',
      expectedSeatVersion: 1,
      enrollmentKey: 'enrollment:x',
      catalogRevision: 1,
      enrollmentState: 'pending' as const,
      materializationSha256: SHA_C,
      components: [
        {
          entitlementKey: 'entitlement:x',
          componentKey: 'acc.module-1',
          state: 'included' as const,
        },
      ],
      actor: 'actor',
      occurredAt: NOW,
    };
    expectCode(
      () => materializeEnrollment(state, { ...base, effectiveAt: null }),
      'pending_requires_effective_at',
    );
    expect(
      materializeEnrollment(state, { ...base, effectiveAt: LATER }).enrollments[
        'enrollment:x'
      ].state,
    ).toBe('pending');
  });

  it('rejects duplicate bundle components transactionally', () => {
    const state = assigned();
    const before = structuredClone(state);
    expectCode(
      () =>
        materializeEnrollment(state, {
          orderKey: 'order:test-1',
          expectedOrderVersion: 1,
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 1,
          enrollmentKey: 'enrollment:x',
          catalogRevision: 1,
          enrollmentState: 'active',
          effectiveAt: null,
          materializationSha256: SHA_C,
          components: [
            {
              entitlementKey: 'entitlement:x:1',
              componentKey: 'acc.module-1',
              state: 'included',
            },
            {
              entitlementKey: 'entitlement:x:2',
              componentKey: 'acc.module-1',
              state: 'included',
            },
          ],
          actor: 'actor',
          occurredAt: NOW,
        }),
      'invalid_entitlements',
    );
    expect(state).toEqual(before);
  });

  it('records agreements and obligations separately from entitlements', () => {
    let state = admitted({ finance: 'active_terms' }).state;
    state = recordFinancialAgreement(state, {
      agreementKey: 'agreement:1',
      orderKey: 'order:test-1',
      agreementType: 'installment',
      state: 'active',
      version: 0,
      evidenceSha256: SHA_A,
      expectedOrderVersion: 0,
      actor: 'finance',
      occurredAt: NOW,
    });
    state = recordFinancialObligation(state, {
      obligationKey: 'obligation:1',
      agreementKey: 'agreement:1',
      sequenceNumber: 1,
      amountMinor: 50000,
      currency: 'USD',
      dueAt: LATER,
      state: 'not_due',
      version: 0,
      evidenceSha256: SHA_B,
      expectedAgreementVersion: 0,
      actor: 'finance',
      occurredAt: NOW,
    });
    expect(state.obligations['obligation:1'].state).toBe('not_due');
    expect(Object.keys(state.entitlements)).toHaveLength(0);
    state = transitionFinancialObligation(state, {
      obligationKey: 'obligation:1',
      expectedVersion: 0,
      state: 'paid',
      evidenceSha256: SHA_C,
      actor: 'finance',
      occurredAt: LATER,
    });
    expect(state.obligations['obligation:1']).toMatchObject({
      state: 'paid',
      version: 1,
    });
    expectCode(
      () =>
        transitionFinancialObligation(state, {
          obligationKey: 'obligation:1',
          expectedVersion: 0,
          state: 'refunded',
          evidenceSha256: SHA_A,
          actor: 'finance',
          occurredAt: LATER,
        }),
      'stale_version',
    );
  });

  it('requires a matching entitlement before class assignment', () => {
    const state = materialized();
    expectCode(
      () =>
        assignClass(state, {
          assignmentKey: 'assignment:x',
          enrollmentKey: 'enrollment:order:test-1:1',
          entitlementKey: 'entitlement:missing',
          deliveryBlockKey: 'class:acc:m1:2026-10-01',
          state: 'active',
          version: 0,
          scheduleEvidenceSha256: SHA_A,
          expectedEnrollmentVersion: 0,
          actor: 'operator',
          occurredAt: NOW,
        }),
      'entitlement_conflict',
    );
    const next = assignClass(state, {
      assignmentKey: 'assignment:x',
      enrollmentKey: 'enrollment:order:test-1:1',
      entitlementKey: 'entitlement:order:test-1:m1',
      deliveryBlockKey: 'class:acc:m1:2026-10-01',
      state: 'active',
      version: 0,
      scheduleEvidenceSha256: SHA_A,
      expectedEnrollmentVersion: 0,
      actor: 'operator',
      occurredAt: NOW,
    });
    expect(next.assignments['assignment:x'].deliveryBlockKey).toBe(
      'class:acc:m1:2026-10-01',
    );
    expectCode(
      () =>
        assignClass(next, {
          assignmentKey: 'assignment:y',
          enrollmentKey: 'enrollment:order:test-1:1',
          entitlementKey: 'entitlement:order:test-1:m1',
          deliveryBlockKey: 'class:acc:m1:2026-10-01',
          state: 'active',
          version: 0,
          scheduleEvidenceSha256: SHA_A,
          expectedEnrollmentVersion: 1,
          actor: 'operator',
          occurredAt: NOW,
        }),
      'duplicate_assignment',
    );
  });

  it('deduplicates projection request and verifies only exact readback', () => {
    const state = materialized();
    const request = {
      projectionKey: 'projection:1',
      target: 'student_roster' as const,
      subjectType: 'enrollment',
      subjectKey: 'enrollment:order:test-1:1',
      subjectVersion: 0,
      payloadSha256: SHA_A,
      payload: { enrollment_key: 'enrollment:order:test-1:1' },
      expectedReadbackSha256: SHA_B,
      state: 'queued' as const,
      version: 0,
      actor: 'worker',
      occurredAt: NOW,
    };
    const queued = requestProjection(state, request);
    expect(requestProjection(queued, request)).toBe(queued);
    const held = recordProjectionReadback(queued, {
      projectionKey: 'projection:1',
      expectedProjectionVersion: 0,
      receiptKey: 'receipt:1',
      subjectVersion: 0,
      readbackSha256: SHA_C,
      actor: 'worker',
      occurredAt: NOW,
      recordedAt: NOW,
    });
    expect(held.projections['projection:1'].state).toBe('held');
    const verified = recordProjectionReadback(queued, {
      projectionKey: 'projection:1',
      expectedProjectionVersion: 0,
      receiptKey: 'receipt:2',
      subjectVersion: 0,
      readbackSha256: SHA_B,
      actor: 'worker',
      occurredAt: NOW,
      recordedAt: NOW,
    });
    expect(verified.projections['projection:1'].state).toBe('verified');
    expect(
      recordProjectionReadback(verified, {
        projectionKey: 'projection:1',
        expectedProjectionVersion: 0,
        receiptKey: 'receipt:2',
        subjectVersion: 0,
        readbackSha256: SHA_B,
        actor: 'worker',
        occurredAt: NOW,
        recordedAt: NOW,
      }),
    ).toBe(verified);
    expectCode(
      () =>
        recordProjectionReadback(verified, {
          projectionKey: 'projection:1',
          expectedProjectionVersion: 1,
          receiptKey: 'receipt:2',
          subjectVersion: 0,
          readbackSha256: SHA_C,
          actor: 'worker',
          occurredAt: NOW,
          recordedAt: NOW,
        }),
      'receipt_key_conflict',
    );
  });

  it('rejects oversized projection payloads before outbox mutation', () => {
    const state = materialized();
    expectCode(
      () =>
        requestProjection(state, {
          projectionKey: 'projection:oversized',
          target: 'student_roster',
          subjectType: 'enrollment',
          subjectKey: 'enrollment:order:test-1:1',
          subjectVersion: 0,
          payloadSha256: SHA_A,
          payload: { value: 'x'.repeat(9000) },
          expectedReadbackSha256: SHA_B,
          state: 'queued',
          version: 0,
          actor: 'worker',
          occurredAt: NOW,
        }),
      'invalid_json',
    );
  });

  it('holds ambiguous provider acceptance rather than blind retrying', () => {
    const queued = requestProjection(materialized(), {
      projectionKey: 'projection:1',
      target: 'heartbeat',
      subjectType: 'enrollment',
      subjectKey: 'enrollment:order:test-1:1',
      subjectVersion: 0,
      payloadSha256: SHA_A,
      payload: { enrollment_key: 'enrollment:order:test-1:1' },
      expectedReadbackSha256: SHA_B,
      state: 'queued',
      version: 0,
      actor: 'worker',
      occurredAt: NOW,
    });
    const held = recordProjectionReadback(queued, {
      projectionKey: 'projection:1',
      expectedProjectionVersion: 0,
      receiptKey: 'receipt:1',
      subjectVersion: 0,
      readbackSha256: SHA_B,
      ambiguousAcceptance: true,
      actor: 'worker',
      occurredAt: NOW,
      recordedAt: NOW,
    });
    expect(held.receipts['receipt:1']).toMatchObject({
      outcome: 'held',
      resultCode: 'ambiguous_acceptance',
    });
  });

  it('opens and resolves a durable owned exception by version', () => {
    let state = openEnrollmentException(admitted().state, {
      exceptionKey: 'exception:1',
      subjectType: 'order',
      subjectKey: 'order:test-1',
      reasonCode: 'participant_missing',
      severity: 'high',
      ownerRole: 'enrollment_operator',
      evidenceSha256: SHA_A,
      reviewAt: LATER,
      actor: 'system',
      occurredAt: NOW,
    });
    state = openEnrollmentException(state, {
      exceptionKey: 'exception:1',
      subjectType: 'order',
      subjectKey: 'order:test-1',
      reasonCode: 'participant_missing',
      severity: 'high',
      ownerRole: 'enrollment_operator',
      evidenceSha256: SHA_A,
      reviewAt: LATER,
      actor: 'system',
      occurredAt: LATER,
    });
    expect(state.exceptions['exception:1']).toMatchObject({
      version: 1,
      occurrenceCount: 2,
      firstSeenAt: NOW,
      lastSeenAt: LATER,
    });
    expectCode(
      () =>
        openEnrollmentException(state, {
          exceptionKey: 'exception:1',
          subjectType: 'order',
          subjectKey: 'order:test-1',
          reasonCode: 'participant_missing',
          severity: 'medium',
          ownerRole: 'enrollment_operator',
          evidenceSha256: SHA_A,
          reviewAt: LATER,
          actor: 'system',
          occurredAt: LATER,
        }),
      'exception_key_conflict',
    );
    expectCode(
      () =>
        resolveEnrollmentException(state, {
          exceptionKey: 'exception:1',
          expectedVersion: 0,
          resolution: 'resolved',
          resolutionSha256: SHA_B,
          actor: 'operator',
          occurredAt: LATER,
        }),
      'stale_version',
    );
    state = resolveEnrollmentException(state, {
      exceptionKey: 'exception:1',
      expectedVersion: 1,
      resolution: 'resolved',
      resolutionSha256: SHA_B,
      actor: 'operator',
      occurredAt: LATER,
    });
    expect(state.exceptions['exception:1']).toMatchObject({
      state: 'resolved',
      resolvedAt: LATER,
      version: 2,
    });
  });

  it('blocks materialization for any open exception regardless of severity', () => {
    let state = assigned();
    state = openEnrollmentException(state, {
      exceptionKey: 'exception:medium',
      subjectType: 'order',
      subjectKey: 'order:test-1',
      reasonCode: 'participant_ambiguous',
      severity: 'medium',
      ownerRole: 'enrollment_operator',
      evidenceSha256: SHA_A,
      reviewAt: LATER,
      actor: 'system',
      occurredAt: NOW,
    });
    expectCode(
      () =>
        materializeEnrollment(state, {
          orderKey: 'order:test-1',
          expectedOrderVersion: 1,
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 1,
          enrollmentKey: 'enrollment:x',
          catalogRevision: 1,
          enrollmentState: 'active',
          effectiveAt: null,
          materializationSha256: SHA_C,
          components: [
            {
              entitlementKey: 'entitlement:x',
              componentKey: 'acc.module-1',
              state: 'included',
            },
          ],
          actor: 'operator',
          occurredAt: NOW,
        }),
      'blocking_exception',
    );
  });

  it('makes ready, held, and cancelled order states explicit transitions', () => {
    const state = assigned();
    const ready = transitionOrderState(state, {
      orderKey: 'order:test-1',
      expectedOrderVersion: 1,
      state: 'ready_to_materialize',
      reasonCode: 'all_order_gates_ready',
      evidenceSha256: SHA_A,
      actor: 'operator',
      occurredAt: NOW,
    });
    expect(ready.orders['order:test-1']).toMatchObject({
      state: 'ready_to_materialize',
      version: 2,
    });
    const held = transitionOrderState(ready, {
      orderKey: 'order:test-1',
      expectedOrderVersion: 2,
      state: 'held',
      reasonCode: 'owner_hold',
      evidenceSha256: SHA_B,
      actor: 'owner',
      occurredAt: LATER,
    });
    expect(held.orders['order:test-1'].state).toBe('held');
    const cancelled = transitionOrderState(held, {
      orderKey: 'order:test-1',
      expectedOrderVersion: 3,
      state: 'cancelled',
      reasonCode: 'owner_cancelled',
      evidenceSha256: SHA_C,
      actor: 'owner',
      occurredAt: LATER,
    });
    expectCode(
      () =>
        transitionOrderState(cancelled, {
          orderKey: 'order:test-1',
          expectedOrderVersion: 4,
          state: 'held',
          reasonCode: 'resurrect',
          evidenceSha256: SHA_A,
          actor: 'operator',
          occurredAt: LATER,
        }),
      'order_terminal',
    );
  });

  it('does not use transfer as a first-assignment or cancelled-seat bypass', () => {
    const captured = admitted();
    const unassigned = createSeats(captured.state, {
      orderKey: 'order:test-1',
      expectedOrderVersion: 0,
      seatKeys: ['seat:order:test-1:1'],
      evidenceSha256: SHA_A,
      actor: 'operator',
      occurredAt: NOW,
    });
    expectCode(
      () =>
        transferParticipant(unassigned, {
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 0,
          newParticipantPartyId: 300,
          participantEvidenceSha256: SHA_B,
          payerRelationship: 'separate_payer',
          actor: 'operator',
          occurredAt: NOW,
        }),
      'seat_not_transferable',
    );
  });

  it('requires owner evidence for post-materialization transfer and preserves history', () => {
    const material = materialized();
    const queued = requestProjection(material, {
      projectionKey: 'projection:transfer',
      target: 'student_roster',
      subjectType: 'enrollment',
      subjectKey: 'enrollment:order:test-1:1',
      subjectVersion: 0,
      payloadSha256: SHA_A,
      payload: { enrollment_key: 'enrollment:order:test-1:1' },
      expectedReadbackSha256: SHA_B,
      state: 'queued',
      version: 0,
      actor: 'worker',
      occurredAt: NOW,
    });
    const state = recordProjectionReadback(queued, {
      projectionKey: 'projection:transfer',
      expectedProjectionVersion: 0,
      receiptKey: 'receipt:transfer',
      subjectVersion: 0,
      readbackSha256: SHA_B,
      actor: 'worker',
      occurredAt: NOW,
      recordedAt: NOW,
    });
    expectCode(
      () =>
        transferParticipant(state, {
          seatKey: 'seat:order:test-1:1',
          expectedSeatVersion: 2,
          currentEnrollmentKey: 'enrollment:order:test-1:1',
          expectedEnrollmentVersion: 0,
          newParticipantPartyId: 300,
          participantEvidenceSha256: SHA_B,
          payerRelationship: 'separate_payer',
          actor: 'operator',
          occurredAt: LATER,
        }),
      'owner_decision_required',
    );
    const next = transferParticipant(state, {
      seatKey: 'seat:order:test-1:1',
      expectedSeatVersion: 2,
      currentEnrollmentKey: 'enrollment:order:test-1:1',
      expectedEnrollmentVersion: 0,
      newParticipantPartyId: 300,
      participantEvidenceSha256: SHA_B,
      payerRelationship: 'separate_payer',
      ownerDecisionSha256: SHA_C,
      actor: 'owner',
      occurredAt: LATER,
    });
    expect(next.enrollments['enrollment:order:test-1:1'].state).toBe(
      'withdrawn',
    );
    expect(next.seats['seat:order:test-1:1']).toMatchObject({
      participantPartyId: 300,
      state: 'assigned',
    });
    expect(next.history.at(-1)?.reasonCode).toBe('post_activation_transfer');
    expect(next.projections['projection:transfer'].state).toBe('superseded');
    expect(next.projections['projection:transfer'].version).toBe(2);
    expect(
      next.history.some(
        (entry) => entry.reasonCode === 'superseded_by_transfer',
      ),
    ).toBe(true);
  });
});
