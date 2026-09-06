import { describe, expect, it } from 'vitest';
import {
  assignParticipant,
  captureOrder,
  createEmptyEnrollmentFoundationState,
  createSeats,
  materializeEnrollment,
  openEnrollmentException,
  type EnrollmentFoundationState,
} from './student-enrollment-foundation.js';
import {
  CapacityCommandError,
  changeSeatPoolCapacity,
  closeSeatPool,
  commitClassAssignment,
  configureSeatPool,
  createEmptyAcademyCapacityState,
  joinWaitlist,
  mapOfferToSeatPool,
  reconcileCommitment,
  reconcileSeatPool,
  registerDeliveryBlock,
  releaseReservation,
  reopenSeatPool,
  reserveCapacity,
  resolveWaitlistOffer,
  showInventory,
  stageWaitlistOffer,
  transferCommitment,
  transferClassAssignment,
  withdrawClassAssignment,
  type AcademyCapacityState,
} from './academy-capacity.js';

const NOW = '2026-09-05T20:00:00Z';
const LATER = '2026-09-05T20:20:00Z';
const NEXT = '2026-09-05T20:10:00Z';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected command to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(CapacityCommandError);
    expect((error as CapacityCommandError).code).toBe(code);
  }
}

function enrollment(
  options: { orderKey?: string; offerKey?: string; partyId?: number } = {},
): EnrollmentFoundationState {
  const orderKey = options.orderKey ?? 'order:test-1';
  const offerKey = options.offerKey ?? 'acc-full';
  const partyId = options.partyId ?? 100;
  let state = captureOrder(createEmptyEnrollmentFoundationState(), {
    orderKey,
    sourceChannel: 'website_stripe_checkout',
    offerKey,
    bundleKey: `${offerKey}:v1`,
    bundleVersion: 1,
    payerPartyId: partyId,
    seatCount: 1,
    financialClassification: 'settled',
    policyRevision: 1,
    evidenceSha256: SHA_A,
    effectiveAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'test-operator',
    sourceReference: {
      sourceScope: 'stripe:tandem',
      sourceObjectType: 'payment_intent',
      sourceObjectId: `pi_${orderKey.replaceAll(':', '_')}`,
      idempotencyKey: `source:${orderKey}`,
      evidenceSha256: SHA_A,
      observedAt: NOW,
      recordedAt: NOW,
      recordedBy: 'test-adapter',
    },
  }).state;
  state = createSeats(state, {
    orderKey,
    expectedOrderVersion: 0,
    seatKeys: [`seat:${orderKey}:1`],
    evidenceSha256: SHA_A,
    actor: 'test-operator',
    occurredAt: NOW,
  });
  state = assignParticipant(state, {
    seatKey: `seat:${orderKey}:1`,
    expectedSeatVersion: 0,
    participantPartyId: partyId,
    participantEvidenceSha256: SHA_B,
    payerRelationship: 'self_purchase_explicit',
    actor: 'test-operator',
    occurredAt: NOW,
  });
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

function capacityFixture(capacity = 1): AcademyCapacityState {
  let state = createEmptyAcademyCapacityState();
  for (const [key, start, end] of [
    ['class:acc:m1:2026-09-07', '2026-09-07T15:00:00Z', '2026-09-28T17:00:00Z'],
    ['class:acc:m1:2026-10-07', '2026-10-07T15:00:00Z', '2026-10-28T17:00:00Z'],
  ] as const) {
    state = registerDeliveryBlock(state, {
      deliveryBlockKey: key,
      componentKey: 'acc.module-1',
      sourceScope: 'google_calendar:academy',
      sourceObjectId: `calendar:${key}`,
      startsAt: start,
      endsAt: end,
      timezone: 'America/New_York',
      sessionSetSha256: SHA_A,
      scheduleEvidenceSha256: SHA_B,
      state: 'scheduled',
      version: 0,
      actor: 'schedule-adapter',
      occurredAt: NOW,
    });
  }
  state = configureSeatPool(state, {
    poolKey: 'pool:acc:m1:2026-09-07',
    deliveryBlockKey: 'class:acc:m1:2026-09-07',
    capacity,
    operationalState: 'open',
    closeReason: null,
    version: 0,
    evidenceSha256: SHA_B,
    actor: 'capacity-admin',
    occurredAt: NOW,
  });
  state = configureSeatPool(state, {
    poolKey: 'pool:acc:m1:2026-10-07',
    deliveryBlockKey: 'class:acc:m1:2026-10-07',
    capacity,
    operationalState: 'open',
    closeReason: null,
    version: 0,
    evidenceSha256: SHA_B,
    actor: 'capacity-admin',
    occurredAt: NOW,
  });
  for (const [poolKey, mappingKey] of [
    ['pool:acc:m1:2026-09-07', 'mapping:sep:acc-full'],
    ['pool:acc:m1:2026-10-07', 'mapping:oct:acc-full'],
  ] as const) {
    state = mapOfferToSeatPool(state, {
      mappingKey,
      poolKey,
      offerKey: 'acc-full',
      catalogRevision: 1,
      state: 'active',
      version: 0,
      evidenceSha256: SHA_C,
      expectedPoolVersion: 0,
      actor: 'capacity-admin',
      occurredAt: NOW,
    });
  }
  return state;
}

function reserve(
  state: AcademyCapacityState,
  enrollments: EnrollmentFoundationState,
  options: {
    key?: string;
    poolKey?: string;
    expectedPoolVersion?: number;
    channel?: 'checkout' | 'manual';
    reason?: string | null;
    orderKey?: string | null;
    seatKey?: string | null;
  } = {},
) {
  const poolKey = options.poolKey ?? 'pool:acc:m1:2026-09-07';
  const key = options.key ?? 'reservation:1';
  return reserveCapacity(state, enrollments, {
    reservationKey: key,
    poolKey,
    expectedPoolVersion:
      options.expectedPoolVersion ?? state.seatPools[poolKey].version,
    channel: options.channel ?? 'checkout',
    sourceScope: 'tandemweb',
    idempotencyKey: `idempotency:${key}`,
    offerKey: 'acc-full',
    catalogRevision: 1,
    orderKey: options.orderKey ?? null,
    seatKey: options.seatKey ?? null,
    expiresAt: LATER,
    reason: options.reason ?? null,
    sourceEvidenceSha256: SHA_D,
    actor: 'checkout-host',
    occurredAt: NOW,
  });
}

describe('Academy capacity domain', () => {
  it('records a durable sale commitment without a checkout hold or capacity refusal', () => {
    const enrollments = createEmptyEnrollmentFoundationState();
    let state = capacityFixture(1);
    state = reserveCapacity(state, enrollments, {
      reservationKey: 'commitment:pi-test:1',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      channel: 'commitment',
      sourceScope: 'website_stripe_sale',
      idempotencyKey: 'pi_test_1',
      offerKey: 'acc-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-28T17:00:00Z',
      reason: 'verified website sale',
      sourceEvidenceSha256: SHA_D,
      actor: 'stripe-capacity-host',
      occurredAt: NOW,
    });
    const replay = reserveCapacity(state, enrollments, {
      reservationKey: 'commitment:pi-test:1',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      channel: 'commitment',
      sourceScope: 'website_stripe_sale',
      idempotencyKey: 'pi_test_1',
      offerKey: 'acc-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-28T17:00:00Z',
      reason: 'verified website sale',
      sourceEvidenceSha256: SHA_D,
      actor: 'stripe-capacity-host',
      occurredAt: NOW,
    });
    expect(
      showInventory(state, enrollments, 'pool:acc:m1:2026-09-07', NOW),
    ).toMatchObject({
      capacity: 1,
      reserved: 0,
      committed: 1,
      available: 0,
      publicState: 'sold_out',
    });
    expect(replay).toEqual(state);
    expectCode(
      () =>
        reserveCapacity(state, enrollments, {
          reservationKey: 'commitment:pi-test:2',
          poolKey: 'pool:acc:m1:2026-09-07',
          expectedPoolVersion: 2,
          channel: 'commitment',
          sourceScope: 'website_stripe_sale',
          idempotencyKey: 'pi_test_2',
          offerKey: 'acc-full',
          catalogRevision: 1,
          orderKey: null,
          seatKey: null,
          expiresAt: '2026-09-28T16:59:59Z',
          reason: 'verified website sale',
          sourceEvidenceSha256: SHA_D,
          actor: 'stripe-capacity-host',
          occurredAt: NOW,
        }),
      'invalid_commitment_lifetime',
    );
  });

  it('changes capacity with version and commitment-floor guards', () => {
    const enrollments = createEmptyEnrollmentFoundationState();
    let state = capacityFixture(1);
    state = reserveCapacity(state, enrollments, {
      reservationKey: 'commitment:invoice:1',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      channel: 'commitment',
      sourceScope: 'invoice',
      idempotencyKey: 'invoice_1_seat_1',
      offerKey: 'acc-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-28T17:00:00Z',
      reason: 'seat promised on issued invoice',
      sourceEvidenceSha256: SHA_D,
      actor: 'capacity:host',
      occurredAt: NOW,
    });
    state = changeSeatPoolCapacity(state, enrollments, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 2,
      newCapacity: 2,
      reason: 'second facilitator confirmed',
      evidenceSha256: SHA_C,
      actor: 'capacity:host',
      occurredAt: NEXT,
    });
    expect(state.seatPools['pool:acc:m1:2026-09-07']).toMatchObject({
      capacity: 2,
      version: 3,
    });
    state = reserveCapacity(state, enrollments, {
      reservationKey: 'commitment:invoice:2',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 3,
      channel: 'commitment',
      sourceScope: 'invoice',
      idempotencyKey: 'invoice_2_seat_1',
      offerKey: 'acc-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-28T17:00:00Z',
      reason: 'second promised seat',
      sourceEvidenceSha256: SHA_A,
      actor: 'capacity:host',
      occurredAt: LATER,
    });
    expectCode(
      () =>
        changeSeatPoolCapacity(state, enrollments, {
          poolKey: 'pool:acc:m1:2026-09-07',
          expectedPoolVersion: 4,
          newCapacity: 1,
          reason: 'invalid reduction',
          evidenceSha256: SHA_B,
          actor: 'capacity:host',
          occurredAt: LATER,
        }),
      'capacity_below_commitments',
    );
  });

  it('moves commitments atomically and reconciles only against an exact assignment', () => {
    let enrollments = enrollment();
    let state = capacityFixture(2);
    state = reserve(state, enrollments, {
      key: 'reservation:assignment',
      orderKey: 'order:test-1',
      seatKey: 'seat:order:test-1:1',
    });
    const committed = commitClassAssignment(state, enrollments, {
      reservationKey: 'reservation:assignment',
      expectedReservationVersion: 0,
      expectedPoolVersion: 2,
      enrollmentKey: 'enrollment:order:test-1:1',
      expectedEnrollmentVersion: 0,
      entitlementKey: 'entitlement:order:test-1:m1',
      assignmentKey: 'assignment:test-1',
      assignmentState: 'active',
      evidenceSha256: SHA_A,
      actor: 'capacity:host',
      occurredAt: NEXT,
    });
    state = committed.capacity;
    enrollments = committed.enrollment;
    state = reserveCapacity(state, enrollments, {
      reservationKey: 'commitment:invoice:2',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 3,
      channel: 'commitment',
      sourceScope: 'invoice',
      idempotencyKey: 'invoice_2_seat_1',
      offerKey: 'acc-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-28T17:00:00Z',
      reason: 'existing assignment reconciliation',
      sourceEvidenceSha256: SHA_D,
      actor: 'capacity:host',
      occurredAt: NEXT,
    });
    state = reconcileCommitment(state, enrollments, {
      commitmentKey: 'commitment:invoice:2',
      expectedCommitmentVersion: 0,
      expectedPoolVersion: 4,
      assignmentKey: 'assignment:test-1',
      expectedAssignmentVersion: 0,
      evidenceSha256: SHA_B,
      actor: 'capacity:host',
      occurredAt: LATER,
    });
    expect(state.reservations['commitment:invoice:2'].state).toBe('consumed');

    let movable = capacityFixture(2);
    movable = reserveCapacity(movable, createEmptyEnrollmentFoundationState(), {
      reservationKey: 'commitment:manual:move',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      channel: 'commitment',
      sourceScope: 'manual_sale',
      idempotencyKey: 'manual_move_1',
      offerKey: 'acc-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-28T17:00:00Z',
      reason: 'owner promised seat',
      sourceEvidenceSha256: SHA_C,
      actor: 'capacity:host',
      occurredAt: NOW,
    });
    movable = transferCommitment(
      movable,
      createEmptyEnrollmentFoundationState(),
      {
        commitmentKey: 'commitment:manual:move',
        expectedCommitmentVersion: 0,
        expectedOriginPoolVersion: 2,
        destinationPoolKey: 'pool:acc:m1:2026-10-07',
        expectedDestinationPoolVersion: 1,
        evidenceSha256: SHA_A,
        actor: 'capacity:host',
        occurredAt: NEXT,
      },
    );
    expect(movable.reservations['commitment:manual:move']).toMatchObject({
      poolKey: 'pool:acc:m1:2026-10-07',
      expiresAt: '2026-10-28T17:00:00Z',
      version: 1,
    });
  });

  it('enforces one pool per delivery block while mapping many offers to it', () => {
    let state = capacityFixture(12);
    const pool = state.seatPools['pool:acc:m1:2026-09-07'];
    state = mapOfferToSeatPool(state, {
      mappingKey: 'mapping:sep:acc-pcc-full',
      poolKey: pool.poolKey,
      offerKey: 'acc-pcc-full',
      catalogRevision: 1,
      state: 'active',
      version: 0,
      evidenceSha256: SHA_C,
      expectedPoolVersion: pool.version,
      actor: 'capacity-admin',
      occurredAt: NOW,
    });
    expect(
      Object.values(state.offerMappings).filter(
        (value) => value.poolKey === pool.poolKey,
      ),
    ).toHaveLength(2);
    expectCode(
      () =>
        configureSeatPool(state, {
          poolKey: 'pool:duplicate',
          deliveryBlockKey: pool.deliveryBlockKey,
          capacity: 12,
          operationalState: 'open',
          closeReason: null,
          version: 0,
          evidenceSha256: SHA_A,
          actor: 'actor',
          occurredAt: NOW,
        }),
      'delivery_block_pool_conflict',
    );
  });

  it('reserves the last seat idempotently and rejects a conflicting replay', () => {
    const enrollments = enrollment();
    const initial = capacityFixture();
    const held = reserve(initial, enrollments);
    expect(
      showInventory(held, enrollments, 'pool:acc:m1:2026-09-07', NOW),
    ).toMatchObject({
      occupied: 0,
      reserved: 1,
      available: 0,
      publicState: 'sold_out',
    });
    expect(reserve(held, enrollments, { expectedPoolVersion: 1 })).toEqual(
      held,
    );
    expectCode(
      () =>
        reserveCapacity(held, enrollments, {
          reservationKey: 'reservation:other',
          poolKey: 'pool:acc:m1:2026-09-07',
          expectedPoolVersion: held.seatPools['pool:acc:m1:2026-09-07'].version,
          channel: 'checkout',
          sourceScope: 'tandemweb',
          idempotencyKey: 'idempotency:reservation:1',
          offerKey: 'acc-full',
          catalogRevision: 1,
          orderKey: null,
          seatKey: null,
          expiresAt: LATER,
          reason: null,
          sourceEvidenceSha256: SHA_D,
          actor: 'checkout-host',
          occurredAt: NOW,
        }),
      'idempotency_conflict',
    );
    expectCode(
      () => reserve(held, enrollments, { key: 'reservation:2' }),
      'capacity_unavailable',
    );
    expect(initial.reservations).toEqual({});
  });

  it('enforces channel TTL and manual reason without mutating input', () => {
    const enrollments = enrollment();
    const initial = capacityFixture();
    expectCode(
      () =>
        reserveCapacity(initial, enrollments, {
          reservationKey: 'reservation:long',
          poolKey: 'pool:acc:m1:2026-09-07',
          expectedPoolVersion: 1,
          channel: 'checkout',
          sourceScope: 'tandemweb',
          idempotencyKey: 'long',
          offerKey: 'acc-full',
          catalogRevision: 1,
          orderKey: null,
          seatKey: null,
          expiresAt: '2026-09-05T21:00:00Z',
          reason: null,
          sourceEvidenceSha256: SHA_A,
          actor: 'actor',
          occurredAt: NOW,
        }),
      'invalid_reservation_ttl',
    );
    expectCode(
      () => reserve(initial, enrollments, { channel: 'manual' }),
      'manual_reason_required',
    );
    expect(initial).toEqual(capacityFixture());
  });

  it('commits through the enrollment foundation and never double-counts the reservation', () => {
    const enrollments = enrollment();
    let capacity = capacityFixture();
    capacity = reserve(capacity, enrollments, {
      orderKey: 'order:test-1',
      seatKey: 'seat:order:test-1:1',
    });
    const result = commitClassAssignment(capacity, enrollments, {
      reservationKey: 'reservation:1',
      expectedReservationVersion: 0,
      expectedPoolVersion: 2,
      enrollmentKey: 'enrollment:order:test-1:1',
      expectedEnrollmentVersion: 0,
      entitlementKey: 'entitlement:order:test-1:m1',
      assignmentKey: 'assignment:sep:1',
      assignmentState: 'active',
      evidenceSha256: SHA_B,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    expect(result.capacity.reservations['reservation:1'].state).toBe(
      'consumed',
    );
    expect(result.enrollment.assignments['assignment:sep:1']).toMatchObject({
      deliveryBlockKey: 'class:acc:m1:2026-09-07',
      enrollmentKey: 'enrollment:order:test-1:1',
      state: 'active',
    });
    expect(
      showInventory(
        result.capacity,
        result.enrollment,
        'pool:acc:m1:2026-09-07',
        NEXT,
      ),
    ).toMatchObject({ occupied: 1, reserved: 0, available: 0 });
    expect(
      commitClassAssignment(result.capacity, result.enrollment, {
        reservationKey: 'reservation:1',
        expectedReservationVersion: 0,
        expectedPoolVersion: 2,
        enrollmentKey: 'enrollment:order:test-1:1',
        expectedEnrollmentVersion: 0,
        entitlementKey: 'entitlement:order:test-1:m1',
        assignmentKey: 'assignment:sep:1',
        assignmentState: 'active',
        evidenceSha256: SHA_B,
        actor: 'capacity-host',
        occurredAt: NEXT,
      }),
    ).toEqual(result);
  });

  it('rejects mismatched assignment facts atomically', () => {
    const enrollments = enrollment();
    const capacity = reserve(capacityFixture(), enrollments);
    const beforeCapacity = structuredClone(capacity);
    const beforeEnrollment = structuredClone(enrollments);
    expectCode(
      () =>
        commitClassAssignment(capacity, enrollments, {
          reservationKey: 'reservation:1',
          expectedReservationVersion: 0,
          expectedPoolVersion: 2,
          enrollmentKey: 'enrollment:order:test-1:1',
          expectedEnrollmentVersion: 0,
          entitlementKey: 'entitlement:order:test-1:m1',
          assignmentKey: 'assignment:bad',
          assignmentState: 'active',
          evidenceSha256: 'bad',
          actor: 'capacity-host',
          occurredAt: NEXT,
        }),
      'invalid_hash',
    );
    expect(capacity).toEqual(beforeCapacity);
    expect(enrollments).toEqual(beforeEnrollment);
  });

  it('refuses assignment while an enrollment exception is open', () => {
    let enrollments = enrollment();
    const capacity = reserve(capacityFixture(), enrollments);
    enrollments = openEnrollmentException(enrollments, {
      exceptionKey: 'exception:assignment-hold',
      subjectType: 'enrollment',
      subjectKey: 'enrollment:order:test-1:1',
      reasonCode: 'identity_conflict',
      severity: 'high',
      ownerRole: 'enrollment_operator',
      evidenceSha256: SHA_D,
      reviewAt: '2026-09-06T20:00:00Z',
      actor: 'enrollment-operator',
      occurredAt: NOW,
    });
    expectCode(
      () =>
        commitClassAssignment(capacity, enrollments, {
          reservationKey: 'reservation:1',
          expectedReservationVersion: 0,
          expectedPoolVersion: 2,
          enrollmentKey: 'enrollment:order:test-1:1',
          expectedEnrollmentVersion: 0,
          entitlementKey: 'entitlement:order:test-1:m1',
          assignmentKey: 'assignment:blocked',
          assignmentState: 'active',
          evidenceSha256: SHA_B,
          actor: 'capacity-host',
          occurredAt: NEXT,
        }),
      'enrollment_blocked',
    );
  });

  it('transfers one assignment atomically and releases origin capacity', () => {
    const enrollments = enrollment();
    let capacity = reserve(capacityFixture(), enrollments);
    let combined = commitClassAssignment(capacity, enrollments, {
      reservationKey: 'reservation:1',
      expectedReservationVersion: 0,
      expectedPoolVersion: 2,
      enrollmentKey: 'enrollment:order:test-1:1',
      expectedEnrollmentVersion: 0,
      entitlementKey: 'entitlement:order:test-1:m1',
      assignmentKey: 'assignment:sep:1',
      assignmentState: 'active',
      evidenceSha256: SHA_B,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    combined = transferClassAssignment(combined.capacity, combined.enrollment, {
      originAssignmentKey: 'assignment:sep:1',
      expectedOriginAssignmentVersion: 0,
      expectedOriginPoolVersion: 3,
      destinationPoolKey: 'pool:acc:m1:2026-10-07',
      expectedDestinationPoolVersion: 1,
      newAssignmentKey: 'assignment:oct:1',
      expectedEnrollmentVersion: 1,
      evidenceSha256: SHA_C,
      actor: 'capacity-admin',
      occurredAt: '2026-09-06T20:00:00Z',
    });
    expect(combined.enrollment.assignments['assignment:sep:1'].state).toBe(
      'transferred',
    );
    expect(combined.enrollment.assignments['assignment:oct:1'].state).toBe(
      'active',
    );
    expect(
      showInventory(
        combined.capacity,
        combined.enrollment,
        'pool:acc:m1:2026-09-07',
        '2026-09-06T20:00:00Z',
      ).available,
    ).toBe(1);
    expect(
      showInventory(
        combined.capacity,
        combined.enrollment,
        'pool:acc:m1:2026-10-07',
        '2026-09-06T20:00:00Z',
      ).available,
    ).toBe(0);
    expect(
      transferClassAssignment(combined.capacity, combined.enrollment, {
        originAssignmentKey: 'assignment:sep:1',
        expectedOriginAssignmentVersion: 0,
        expectedOriginPoolVersion: 3,
        destinationPoolKey: 'pool:acc:m1:2026-10-07',
        expectedDestinationPoolVersion: 1,
        newAssignmentKey: 'assignment:oct:1',
        expectedEnrollmentVersion: 1,
        evidenceSha256: SHA_C,
        actor: 'capacity-admin',
        occurredAt: '2026-09-06T20:00:00Z',
      }),
    ).toEqual(combined);
  });

  it('withdraws a class assignment without rewriting enrollment or finance', () => {
    const enrollments = enrollment();
    let capacity = reserve(capacityFixture(), enrollments);
    const committed = commitClassAssignment(capacity, enrollments, {
      reservationKey: 'reservation:1',
      expectedReservationVersion: 0,
      expectedPoolVersion: 2,
      enrollmentKey: 'enrollment:order:test-1:1',
      expectedEnrollmentVersion: 0,
      entitlementKey: 'entitlement:order:test-1:m1',
      assignmentKey: 'assignment:sep:1',
      assignmentState: 'active',
      evidenceSha256: SHA_B,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    const result = withdrawClassAssignment(
      committed.capacity,
      committed.enrollment,
      {
        assignmentKey: 'assignment:sep:1',
        expectedAssignmentVersion: 0,
        expectedPoolVersion: 3,
        reasonCode: 'student_deferred',
        evidenceSha256: SHA_D,
        actor: 'capacity-admin',
        occurredAt: '2026-09-06T20:00:00Z',
      },
    );
    expect(result.enrollment.assignments['assignment:sep:1'].state).toBe(
      'cancelled',
    );
    expect(
      result.enrollment.enrollments['enrollment:order:test-1:1'].state,
    ).toBe('active');
    expect(
      showInventory(
        result.capacity,
        result.enrollment,
        'pool:acc:m1:2026-09-07',
        '2026-09-06T20:00:00Z',
      ).available,
    ).toBe(1);
    expect(
      withdrawClassAssignment(result.capacity, result.enrollment, {
        assignmentKey: 'assignment:sep:1',
        expectedAssignmentVersion: 0,
        expectedPoolVersion: 3,
        reasonCode: 'student_deferred',
        evidenceSha256: SHA_D,
        actor: 'capacity-admin',
        occurredAt: '2026-09-06T20:00:00Z',
      }),
    ).toEqual(result);
  });

  it('keeps explicit closure separate from derived sold-out state', () => {
    const enrollments = enrollment();
    let capacity = capacityFixture();
    capacity = closeSeatPool(capacity, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      reason: 'operator safety hold',
      evidenceSha256: SHA_A,
      actor: 'capacity-admin',
      occurredAt: NOW,
    });
    expect(
      showInventory(capacity, enrollments, 'pool:acc:m1:2026-09-07', NOW)
        .publicState,
    ).toBe('closed');
    expectCode(
      () =>
        reopenSeatPool(capacity, enrollments, {
          poolKey: 'pool:acc:m1:2026-09-07',
          expectedPoolVersion: 2,
          expectedOccupied: 1,
          expectedReserved: 0,
          evidenceSha256: SHA_B,
          actor: 'capacity-admin',
          occurredAt: NEXT,
        }),
      'inventory_changed',
    );
    capacity = reopenSeatPool(capacity, enrollments, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 2,
      expectedOccupied: 0,
      expectedReserved: 0,
      evidenceSha256: SHA_B,
      actor: 'capacity-admin',
      occurredAt: NEXT,
    });
    expect(capacity.seatPools['pool:acc:m1:2026-09-07']).toMatchObject({
      operationalState: 'open',
      closeReason: null,
    });
    expect(
      reopenSeatPool(capacity, enrollments, {
        poolKey: 'pool:acc:m1:2026-09-07',
        expectedPoolVersion: 2,
        expectedOccupied: 0,
        expectedReserved: 0,
        evidenceSha256: SHA_B,
        actor: 'capacity-admin',
        occurredAt: NEXT,
      }),
    ).toEqual(capacity);
  });

  it('stages only the oldest waitlist entry and requires human approval before sent', () => {
    const enrollments = enrollment();
    let capacity = capacityFixture();
    capacity = joinWaitlist(capacity, {
      entryKey: 'waitlist:older',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      offerKey: 'acc-full',
      catalogRevision: 1,
      participantPartyId: 100,
      contactReferenceSha256: SHA_A,
      sequenceNumber: 1,
      actor: 'waitlist-host',
      joinedAt: '2026-09-01T10:00:00Z',
    });
    capacity = joinWaitlist(capacity, {
      entryKey: 'waitlist:newer',
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 2,
      offerKey: 'acc-full',
      catalogRevision: 1,
      participantPartyId: 101,
      contactReferenceSha256: SHA_B,
      sequenceNumber: 2,
      actor: 'waitlist-host',
      joinedAt: '2026-09-02T10:00:00Z',
    });
    capacity = stageWaitlistOffer(capacity, enrollments, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 3,
      waitlistOfferKey: 'waitlist-offer:1',
      reservationKey: 'reservation:waitlist:1',
      reservationIdempotencyKey: 'waitlist-offer:1',
      expiresAt: '2026-09-06T20:00:00Z',
      evidenceSha256: SHA_C,
      actor: 'capacity-host',
      occurredAt: NOW,
    });
    expect(capacity.waitlistOffers['waitlist-offer:1'].entryKey).toBe(
      'waitlist:older',
    );
    expect(capacity.waitlistEntries['waitlist:newer'].state).toBe('waiting');
    expectCode(
      () =>
        resolveWaitlistOffer(capacity, {
          waitlistOfferKey: 'waitlist-offer:1',
          expectedOfferVersion: 0,
          expectedReservationVersion: 0,
          expectedPoolVersion: 4,
          outcome: 'sent',
          approvalEvidenceSha256: null,
          deliveryReceiptSha256: SHA_D,
          evidenceSha256: SHA_D,
          actor: 'mailman-host',
          occurredAt: NEXT,
        }),
      'invalid_waitlist_transition',
    );
    capacity = resolveWaitlistOffer(capacity, {
      waitlistOfferKey: 'waitlist-offer:1',
      expectedOfferVersion: 0,
      expectedReservationVersion: 0,
      expectedPoolVersion: 4,
      outcome: 'approved',
      approvalEvidenceSha256: SHA_D,
      deliveryReceiptSha256: null,
      evidenceSha256: SHA_D,
      actor: 'owner-admin',
      occurredAt: NEXT,
    });
    expect(
      resolveWaitlistOffer(capacity, {
        waitlistOfferKey: 'waitlist-offer:1',
        expectedOfferVersion: 0,
        expectedReservationVersion: 0,
        expectedPoolVersion: 3,
        outcome: 'approved',
        approvalEvidenceSha256: SHA_D,
        deliveryReceiptSha256: null,
        evidenceSha256: SHA_D,
        actor: 'owner-admin',
        occurredAt: NEXT,
      }),
    ).toEqual(capacity);
    expectCode(
      () =>
        resolveWaitlistOffer(capacity, {
          waitlistOfferKey: 'waitlist-offer:1',
          expectedOfferVersion: 1,
          expectedReservationVersion: 0,
          expectedPoolVersion: 4,
          outcome: 'sent',
          approvalEvidenceSha256: SHA_D,
          deliveryReceiptSha256: null,
          evidenceSha256: SHA_D,
          actor: 'mailman-host',
          occurredAt: NEXT,
        }),
      'delivery_receipt_required',
    );
    capacity = resolveWaitlistOffer(capacity, {
      waitlistOfferKey: 'waitlist-offer:1',
      expectedOfferVersion: 1,
      expectedReservationVersion: 0,
      expectedPoolVersion: 4,
      outcome: 'sent',
      approvalEvidenceSha256: SHA_D,
      deliveryReceiptSha256: SHA_C,
      evidenceSha256: SHA_C,
      actor: 'mailman-host',
      occurredAt: NEXT,
    });
    capacity = resolveWaitlistOffer(capacity, {
      waitlistOfferKey: 'waitlist-offer:1',
      expectedOfferVersion: 2,
      expectedReservationVersion: 0,
      expectedPoolVersion: 4,
      outcome: 'accepted',
      approvalEvidenceSha256: SHA_D,
      deliveryReceiptSha256: SHA_C,
      evidenceSha256: SHA_B,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    const converted = commitClassAssignment(capacity, enrollments, {
      reservationKey: 'reservation:waitlist:1',
      expectedReservationVersion: 0,
      expectedPoolVersion: 4,
      enrollmentKey: 'enrollment:order:test-1:1',
      expectedEnrollmentVersion: 0,
      entitlementKey: 'entitlement:order:test-1:m1',
      assignmentKey: 'assignment:waitlist:1',
      assignmentState: 'active',
      evidenceSha256: SHA_B,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    expect(converted.capacity.waitlistOffers['waitlist-offer:1'].state).toBe(
      'converted',
    );
    expect(converted.capacity.waitlistEntries['waitlist:older'].state).toBe(
      'enrolled',
    );
    expect(
      showInventory(
        converted.capacity,
        converted.enrollment,
        'pool:acc:m1:2026-09-07',
        NEXT,
      ),
    ).toMatchObject({ occupied: 1, reserved: 0, available: 0 });
  });

  it('releases declined waitlist holds so the next person can be staged', () => {
    const enrollments = enrollment();
    let capacity = capacityFixture();
    for (const [entryKey, hash, sequence, joinedAt] of [
      ['waitlist:1', SHA_A, 1, '2026-09-01T10:00:00Z'],
      ['waitlist:2', SHA_B, 2, '2026-09-02T10:00:00Z'],
    ] as const) {
      capacity = joinWaitlist(capacity, {
        entryKey,
        poolKey: 'pool:acc:m1:2026-09-07',
        expectedPoolVersion:
          capacity.seatPools['pool:acc:m1:2026-09-07'].version,
        offerKey: 'acc-full',
        catalogRevision: 1,
        participantPartyId: null,
        contactReferenceSha256: hash,
        sequenceNumber: sequence,
        actor: 'waitlist-host',
        joinedAt,
      });
    }
    capacity = stageWaitlistOffer(capacity, enrollments, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 3,
      waitlistOfferKey: 'offer:1',
      reservationKey: 'reservation:offer:1',
      reservationIdempotencyKey: 'offer:1',
      expiresAt: '2026-09-06T20:00:00Z',
      evidenceSha256: SHA_C,
      actor: 'capacity-host',
      occurredAt: NOW,
    });
    capacity = resolveWaitlistOffer(capacity, {
      waitlistOfferKey: 'offer:1',
      expectedOfferVersion: 0,
      expectedReservationVersion: 0,
      expectedPoolVersion: 4,
      outcome: 'declined',
      approvalEvidenceSha256: null,
      deliveryReceiptSha256: null,
      evidenceSha256: SHA_D,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    expect(capacity.reservations['reservation:offer:1'].state).toBe('released');
    expect(
      showInventory(capacity, enrollments, 'pool:acc:m1:2026-09-07', NEXT)
        .available,
    ).toBe(1);
    capacity = stageWaitlistOffer(capacity, enrollments, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 5,
      waitlistOfferKey: 'offer:2',
      reservationKey: 'reservation:offer:2',
      reservationIdempotencyKey: 'offer:2',
      expiresAt: '2026-09-06T20:00:00Z',
      evidenceSha256: SHA_C,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    expect(capacity.waitlistOffers['offer:2'].entryKey).toBe('waitlist:2');
  });

  it('reconciles exact aggregate counts and rejects drift', () => {
    const enrollments = enrollment();
    const capacity = capacityFixture(12);
    const next = reconcileSeatPool(capacity, enrollments, {
      poolKey: 'pool:acc:m1:2026-09-07',
      expectedPoolVersion: 1,
      expectedOccupied: 0,
      expectedReserved: 0,
      expectedWaitlistCount: 0,
      evidenceSha256: SHA_A,
      actor: 'capacity-host',
      occurredAt: NOW,
    });
    expect(next.seatPools['pool:acc:m1:2026-09-07'].version).toBe(2);
    expectCode(
      () =>
        reconcileSeatPool(capacity, enrollments, {
          poolKey: 'pool:acc:m1:2026-09-07',
          expectedPoolVersion: 1,
          expectedOccupied: 12,
          expectedReserved: 0,
          expectedWaitlistCount: 0,
          evidenceSha256: SHA_A,
          actor: 'capacity-host',
          occurredAt: NOW,
        }),
      'reconciliation_mismatch',
    );
  });

  it('releases only held reservations using exact versions', () => {
    const enrollments = enrollment();
    let capacity = reserve(capacityFixture(), enrollments);
    capacity = releaseReservation(capacity, {
      reservationKey: 'reservation:1',
      expectedReservationVersion: 0,
      expectedPoolVersion: 2,
      outcome: 'released',
      evidenceSha256: SHA_A,
      actor: 'capacity-host',
      occurredAt: NEXT,
    });
    expect(capacity.reservations['reservation:1'].state).toBe('released');
    expect(
      releaseReservation(capacity, {
        reservationKey: 'reservation:1',
        expectedReservationVersion: 0,
        expectedPoolVersion: 2,
        outcome: 'released',
        evidenceSha256: SHA_A,
        actor: 'capacity-host',
        occurredAt: NEXT,
      }),
    ).toEqual(capacity);
    expectCode(
      () =>
        releaseReservation(capacity, {
          reservationKey: 'reservation:1',
          expectedReservationVersion: 0,
          expectedPoolVersion: 2,
          outcome: 'released',
          evidenceSha256: SHA_B,
          actor: 'capacity-host',
          occurredAt: NEXT,
        }),
      'idempotency_conflict',
    );
  });
});
