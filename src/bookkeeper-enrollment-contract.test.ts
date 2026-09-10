import { describe, expect, it } from 'vitest';
import {
  applyBookkeeperFundingReceipt as apply,
  bookkeeperContractHash as hash,
  type BookkeeperFundingReceipt,
  type BookkeeperEnrollmentAuthority,
  type BookkeeperEnrollmentState,
} from './bookkeeper-enrollment-contract.js';
import {
  createEmptyEnrollmentFoundationState,
  recordProjectionReadback,
  captureOrder,
  correctOrderTerms,
  resolveEnrollmentException,
  requestProjection,
} from './student-enrollment-foundation.js';
import {
  createEmptyAcademyCapacityState,
  configureSeatPool,
  registerDeliveryBlock,
  mapOfferToSeatPool,
  showInventory,
  reserveCapacity,
} from './academy-capacity.js';

const at = '2026-09-07T00:00:00Z';
const a = 'a'.repeat(64),
  b = 'b'.repeat(64);
function receipt(): BookkeeperFundingReceipt {
  return {
    version: 1,
    sourceChannel: 'manual_stripe_payment',
    source: {
      scope: 'stripe:tandem',
      objectType: 'payment_intent',
      objectId: 'pi_Synthetic',
      evidenceSha256: a,
      effectiveAt: at,
    },
    offerKey: 'synthetic-full',
    payerPartyId: 1,
    seatCount: 1,
    seatCountEvidenceSha256: a,
    funding: {
      kind: 'settled_payment',
      amountMinor: 10000,
      currency: 'USD',
      agreedAmountMinor: 10000,
      agreedCurrency: 'USD',
      evidenceSha256: a,
      confirmedBy: 'synthetic-finance',
      confirmerRole: 'finance_operator',
    },
    seats: [
      {
        participantPartyId: 2,
        participantEvidenceSha256: b,
        payerRelationship: 'separate_payer',
        assignment: {
          poolKey: 'pool:synthetic',
          componentKey: 'synthetic.module-1',
          evidenceSha256: b,
        },
      },
    ],
  };
}
function authority(r: BookkeeperFundingReceipt): BookkeeperEnrollmentAuthority {
  return {
    acceptedReceiptSha256: hash(r),
    partyIds: [1, 2, 3],
    occurredAt: at,
    offers: [
      {
        offerKey: 'synthetic-full',
        bundleKey: 'synthetic-bundle',
        bundleVersion: 1,
        catalogRevision: 1,
        evidenceSha256: a,
        components: [
          {
            componentKey: 'synthetic.module-1',
            state: 'included',
            requiresAssignment: true,
          },
          {
            componentKey: 'synthetic.mentoring',
            state: 'conditional',
            requiresAssignment: false,
          },
        ],
      },
    ],
  };
}
function state(count = 2): BookkeeperEnrollmentState {
  let capacity = registerDeliveryBlock(createEmptyAcademyCapacityState(), {
    deliveryBlockKey: 'class:synthetic',
    componentKey: 'synthetic.module-1',
    sourceScope: 'calendar:synthetic',
    sourceObjectId: 'synthetic-event',
    startsAt: '2026-10-01T15:00:00Z',
    endsAt: '2026-10-30T17:00:00Z',
    timezone: 'America/Chicago',
    sessionSetSha256: a,
    scheduleEvidenceSha256: b,
    state: 'scheduled',
    version: 0,
    actor: 'synthetic-host',
    occurredAt: at,
  });
  capacity = configureSeatPool(capacity, {
    poolKey: 'pool:synthetic',
    deliveryBlockKey: 'class:synthetic',
    capacity: count,
    operationalState: 'open',
    closeReason: null,
    version: 0,
    evidenceSha256: a,
    actor: 'synthetic-host',
    occurredAt: at,
  });
  capacity = mapOfferToSeatPool(capacity, {
    mappingKey: 'mapping:synthetic',
    poolKey: 'pool:synthetic',
    offerKey: 'synthetic-full',
    catalogRevision: 1,
    state: 'active',
    version: 0,
    evidenceSha256: a,
    expectedPoolVersion: 0,
    actor: 'synthetic-host',
    occurredAt: at,
  });
  return { capacity, enrollment: createEmptyEnrollmentFoundationState() };
}
const reasons = (s: BookkeeperEnrollmentState) =>
  Object.values(s.enrollment.exceptions).map((x) => x.reasonCode);
const run = (r = receipt(), s = state(), auth = authority(r)) =>
  apply(s, r, auth);

describe('local Bookkeeper funding to canonical enrollment contract', () => {
  it.each([
    'website_stripe_checkout',
    'manual_stripe_payment',
    'plutio_invoice_or_contract',
    'check_ach_or_wire',
    'sponsored_cohort',
  ] as const)('supports settled %s without payer inference', (channel) => {
    const r = receipt();
    r.sourceChannel = channel;
    if (channel === 'plutio_invoice_or_contract')
      r.source = {
        ...r.source,
        scope: 'plutio:synthetic',
        objectType: 'invoice_payment',
        objectId: 'payment:synthetic',
      };
    if (channel === 'check_ach_or_wire')
      r.source = {
        ...r.source,
        scope: 'bank:synthetic',
        objectType: 'payment_receipt',
        objectId: 'payment:synthetic',
      };
    const result = run(r);
    expect(reasons(result)).toEqual([]);
    expect(Object.values(result.enrollment.orders)[0].payerPartyId).toBe(1);
    expect(Object.values(result.enrollment.enrollments)[0]).toMatchObject({
      participantPartyId: 2,
      state: 'pending',
    });
    expect(
      Object.values(result.enrollment.entitlements).map((e) => e.componentKey),
    ).toEqual(['synthetic.module-1', 'synthetic.mentoring']);
    expect(Object.keys(result.enrollment.assignments)).toHaveLength(1);
    expect(Object.values(result.capacity.reservations)[0].state).toBe(
      'consumed',
    );
    expect(Object.values(result.capacity.reservations)[0].sourceScope).toBe(
      channel === 'website_stripe_checkout'
        ? 'website_stripe_sale'
        : channel === 'plutio_invoice_or_contract'
          ? 'invoice'
          : channel === 'check_ach_or_wire'
            ? 'check'
            : channel === 'sponsored_cohort'
              ? 'sponsor'
              : 'manual_sale',
    );
    expect(
      showInventory(result.capacity, result.enrollment, 'pool:synthetic', at)
        .available,
    ).toBe(1);
    expect(Object.values(result.enrollment.obligations)[0]).toMatchObject({
      amountMinor: 10000,
      currency: 'USD',
      state: 'paid',
    });
  });
  it.each(['scholarship', 'complimentary_owner_grant'] as const)(
    'supports exact owner grant %s',
    (channel) => {
      const r = receipt();
      r.sourceChannel = channel;
      r.source = {
        ...r.source,
        scope: 'owner:synthetic',
        objectType: 'grant',
        objectId: 'grant:synthetic',
      };
      r.payerPartyId = null;
      r.funding = {
        kind: 'owner_grant',
        amountMinor: null,
        currency: null,
        agreedAmountMinor: null,
        agreedCurrency: null,
        evidenceSha256: a,
        confirmedBy: 'synthetic-owner',
        confirmerRole: 'owner_admin',
      };
      r.seats[0].payerRelationship = 'not_applicable';
      const result = run(r);
      expect(reasons(result)).toEqual([]);
      expect(
        result.enrollment.orders[result.orderKey].financialClassification,
      ).toBe('not_applicable');
      expect(Object.keys(result.enrollment.obligations)).toHaveLength(0);
    },
  );
  it('requires explicit self-purchase', () => {
    const r = receipt();
    r.seats[0].participantPartyId = 1;
    r.seats[0].payerRelationship = 'self_purchase_explicit';
    expect(reasons(run(r))).toEqual([]);
    r.seats[0].payerRelationship = 'separate_payer';
    expect(reasons(run(r))).toContain('payer_relationship_conflict');
  });
  it('is immutable, serializable, and idempotent across process/time/catalog changes', () => {
    const s = state();
    const before = structuredClone(s);
    const r = receipt();
    const first = run(r, s);
    expect(s).toEqual(before);
    const restored = JSON.parse(JSON.stringify(first));
    const auth = authority(r);
    auth.offers = [];
    auth.occurredAt = '2026-09-08T00:00:00Z';
    const replay = run(r, restored, auth);
    expect(replay.duplicate).toBe(true);
    expect(replay.enrollment).toEqual(first.enrollment);
    expect(replay.capacity).toEqual(first.capacity);
  });
  it('scopes the same provider object by account', () => {
    const r = receipt();
    const first = run(r);
    r.source.scope = 'stripe:heartbeat';
    const second = run(r, first);
    expect(Object.keys(second.enrollment.orders)).toHaveLength(2);
  });
  it('replays immutable admission after later legitimate order terms change', () => {
    const r = receipt();
    const first = run(r);
    const o = first.enrollment.orders[first.orderKey];
    first.enrollment = correctOrderTerms(first.enrollment, {
      orderKey: first.orderKey,
      expectedOrderVersion: o.version,
      offerKey: o.offerKey!,
      bundleKey: o.bundleKey!,
      bundleVersion: o.bundleVersion!,
      financialClassification: 'held',
      evidenceSha256: b,
      actor: 'synthetic-owner',
      occurredAt: at,
    });
    const replay = run(r, first);
    expect(replay.duplicate).toBe(true);
    expect(replay.enrollment).toEqual(first.enrollment);
    expect(reasons(replay)).toEqual([]);
  });
  it('does not let an unattested conflicting proposal freeze an existing order', () => {
    const r = receipt();
    const first = run(r);
    const before = structuredClone(first);
    const auth = authority(r);
    r.seats[0].participantPartyId = 3;
    expect(() => run(r, first, auth)).toThrow(
      'unattested conflict cannot change an existing order',
    );
    expect(first).toEqual(before);
    expect(Object.values(first.enrollment.projections)[0].state).toBe('queued');
  });
  it('replays a resolved source conflict without freezing a later authorized projection', () => {
    const r = receipt();
    const first = run(r);
    r.seats[0].participantPartyId = 3;
    const conflict = run(r, first);
    const exception = Object.values(conflict.enrollment.exceptions)[0];
    conflict.enrollment = resolveEnrollmentException(conflict.enrollment, {
      exceptionKey: exception.exceptionKey,
      expectedVersion: exception.version,
      resolution: 'accepted_no_action',
      resolutionSha256: b,
      actor: 'synthetic-owner',
      occurredAt: at,
    });
    const projection = Object.values(conflict.enrollment.projections)[0];
    conflict.enrollment = requestProjection(conflict.enrollment, {
      ...projection,
      projectionKey: 'projection:authorized-later',
      actor: 'synthetic-owner',
      occurredAt: at,
    });
    const replay = run(r, conflict);
    expect(replay.enrollment).toEqual(conflict.enrollment);
    expect(
      replay.enrollment.projections['projection:authorized-later'].state,
    ).toBe('queued');
  });
  it('holds a second funded order for the same person and delivery block', () => {
    const r = receipt();
    const first = run(r);
    r.source.objectId = 'pi_SecondSynthetic';
    const second = run(r, first);
    expect(reasons(second)).toEqual(['participant_already_enrolled']);
    expect(Object.keys(second.enrollment.assignments)).toHaveLength(1);
    expect(Object.keys(second.enrollment.projections)).toHaveLength(1);
    expect(
      Object.values(second.capacity.reservations)
        .map((x) => x.state)
        .sort(),
    ).toEqual(['consumed', 'held']);
    expect(Object.values(second.enrollment.exceptions)[0].ownerRole).toBe(
      'owner_admin',
    );
  });
  it('holds an ambiguous repeat active nonscheduled offer but permits a completed episode', () => {
    const r = receipt();
    r.seats[0].assignment = null;
    const auth = authority(r);
    auth.offers[0].components = [
      {
        componentKey: 'synthetic.content',
        state: 'included',
        requiresAssignment: false,
      },
    ];
    const first = run(r, state(), auth);
    r.source.objectId = 'pi_SecondSynthetic';
    auth.acceptedReceiptSha256 = hash(r);
    expect(reasons(run(r, first, auth))).toEqual([
      'participant_already_enrolled',
    ]);
    const finished = structuredClone(first);
    Object.values(finished.enrollment.enrollments)[0].state = 'completed';
    expect(reasons(run(r, finished, auth))).toEqual([]);
  });
  it('holds expired or closed delivery blocks', () => {
    const r = receipt();
    const auth = authority(r);
    auth.occurredAt = '2026-11-01T00:00:00Z';
    const expired = run(r, state(), auth);
    expect(reasons(expired)).toEqual(['delivery_block_expired']);
    expect(Object.keys(expired.capacity.reservations)).toHaveLength(0);
    const closed = state();
    closed.capacity.seatPools['pool:synthetic'].operationalState = 'closed';
    expect(reasons(run(r, closed))).toEqual(['pool_closed']);
  });
  it('does not accept delivery events or checkout aliases as canonical funding', () => {
    const r = receipt();
    r.source.objectType = 'checkout_session';
    r.source.objectId = 'cs_Synthetic';
    const out = run(r);
    expect(reasons(out)).toEqual(['source_identity_invalid']);
    expect(Object.keys(out.enrollment.seats)).toHaveLength(0);
  });
  it('owns conflicting receipt reuse without a second order or seat', () => {
    const r = receipt();
    const first = run(r);
    r.seats[0].participantPartyId = 3;
    const conflict = run(r, first);
    expect(reasons(conflict)).toEqual(['duplicate_source_conflict']);
    expect(Object.keys(conflict.enrollment.orders)).toHaveLength(1);
    expect(conflict.capacity).toEqual(first.capacity);
    expect(Object.values(conflict.enrollment.projections)[0].state).toBe(
      'held',
    );
    const replay = run(r, conflict);
    expect(replay.enrollment).toEqual(conflict.enrollment);
  });
  it('honors an existing source alias belonging to a different canonical order', () => {
    const r = receipt();
    const s = state();
    s.enrollment = captureOrder(s.enrollment, {
      orderKey: 'order:existing',
      sourceChannel: r.sourceChannel,
      offerKey: null,
      bundleKey: null,
      bundleVersion: null,
      payerPartyId: 1,
      seatCount: 1,
      financialClassification: 'unverified',
      policyRevision: 1,
      evidenceSha256: a,
      effectiveAt: at,
      createdAt: at,
      updatedAt: at,
      updatedBy: 'synthetic',
      sourceReference: {
        sourceScope: r.source.scope,
        sourceObjectType: r.source.objectType,
        sourceObjectId: r.source.objectId,
        idempotencyKey: 'existing',
        evidenceSha256: a,
        observedAt: at,
        recordedAt: at,
        recordedBy: 'synthetic',
      },
    }).state;
    const out = run(r, s);
    expect(out.orderKey).toBe('order:existing');
    expect(reasons(out)).toEqual(['duplicate_source_conflict']);
    expect(Object.keys(out.enrollment.orders)).toHaveLength(1);
  });
  it.each([
    [
      'missing participant',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].participantPartyId = null;
      },
      'participant_missing',
    ],
    [
      'missing participant evidence',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].participantEvidenceSha256 = null;
      },
      'participant_missing',
    ],
    [
      'unknown Party',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].participantPartyId = 999;
      },
      'participant_missing',
    ],
    [
      'missing relationship',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].payerRelationship = 'unknown';
      },
      'payer_relationship_missing',
    ],
    [
      'missing assignment',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].assignment = null;
      },
      'assignment_missing',
    ],
    [
      'unknown assignment',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].assignment!.poolKey = 'missing';
      },
      'assignment_unknown',
    ],
    [
      'wrong component',
      (r: BookkeeperFundingReceipt) => {
        r.seats[0].assignment!.componentKey = 'synthetic.mentoring';
      },
      'assignment_unknown',
    ],
    [
      'unknown product',
      (r: BookkeeperFundingReceipt) => {
        r.offerKey = 'missing';
      },
      'offer_unknown',
    ],
    [
      'seat count mismatch',
      (r: BookkeeperFundingReceipt) => {
        r.seatCount = 2;
      },
      'seat_count_unverified',
    ],
    [
      'amount mismatch',
      (r: BookkeeperFundingReceipt) => {
        r.funding.amountMinor = 999;
      },
      'financial_terms_unverified',
    ],
    [
      'currency mismatch',
      (r: BookkeeperFundingReceipt) => {
        r.funding.currency = 'EUR';
      },
      'financial_terms_unverified',
    ],
    [
      'unpaid invoice',
      (r: BookkeeperFundingReceipt) => {
        r.funding.kind = 'unverified';
      },
      'financial_terms_unverified',
    ],
    [
      'unconfirmed check',
      (r: BookkeeperFundingReceipt) => {
        r.sourceChannel = 'check_ach_or_wire';
        r.source = {
          ...r.source,
          scope: 'bank:synthetic',
          objectType: 'payment_receipt',
        };
        r.funding.confirmerRole = 'source_adapter';
      },
      'financial_terms_unverified',
    ],
  ] as const)(
    'holds %s with durable owner and no enrollment/projection',
    (_, mutate, expected) => {
      const r = receipt();
      mutate(r);
      const out = run(r);
      expect(reasons(out)).toContain(expected);
      expect(Object.keys(out.enrollment.enrollments)).toHaveLength(0);
      expect(Object.keys(out.enrollment.projections)).toHaveLength(0);
      expect(Object.values(out.enrollment.exceptions)[0]).toMatchObject({
        state: 'open',
        reviewAt: at,
      });
      expect(
        Object.values(out.enrollment.exceptions)[0].ownerRole,
      ).toBeTruthy();
    },
  );
  it('requires an exact trusted host attestation independently of the input proposal', () => {
    const r = receipt();
    const auth = authority(r);
    r.seats[0].participantPartyId = 3;
    const out = run(r, state(), auth);
    expect(reasons(out)).toEqual(['source_unverified']);
    expect(Object.keys(out.capacity.reservations)).toHaveLength(0);
  });
  it('advances valid sponsor seats while counting and holding unnamed ones', () => {
    const r = receipt();
    r.sourceChannel = 'sponsored_cohort';
    r.seatCount = 2;
    r.seats.push({
      ...r.seats[0],
      participantPartyId: null,
      participantEvidenceSha256: null,
    });
    const out = run(r);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(1);
    expect(reasons(out)).toEqual(['participant_missing']);
    expect(
      Object.values(out.capacity.reservations)
        .map((x) => x.state)
        .sort(),
    ).toEqual(['consumed', 'held']);
    expect(
      showInventory(out.capacity, out.enrollment, 'pool:synthetic', at)
        .available,
    ).toBe(0);
  });
  it('holds every ambiguous repeated participant rather than choosing a seat', () => {
    const r = receipt();
    r.seatCount = 2;
    r.seats.push(structuredClone(r.seats[0]));
    const out = run(r);
    expect(reasons(out)).toEqual([
      'participant_ambiguous',
      'participant_ambiguous',
    ]);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(0);
  });
  it('records an already-paid oversale as a counted commitment and owner exception', () => {
    const r = receipt();
    const first = run(r, state(1));
    r.source.objectId = 'pi_SecondSynthetic';
    r.seats[0].participantPartyId = 3;
    const out = run(r, first);
    expect(reasons(out)).toEqual(['capacity_overcommitted']);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(1);
    expect(
      Object.values(out.capacity.reservations).filter(
        (x) => x.state === 'held',
      ),
    ).toHaveLength(1);
    expect(Object.values(out.enrollment.exceptions)[0].ownerRole).toBe(
      'owner_admin',
    );
  });
  it('honors preexisting commitments in capacity disposition', () => {
    const s = state(1);
    s.capacity = reserveCapacity(s.capacity, s.enrollment, {
      reservationKey: 'commitment:existing',
      poolKey: 'pool:synthetic',
      expectedPoolVersion: s.capacity.seatPools['pool:synthetic'].version,
      channel: 'commitment',
      sourceScope: 'manual_sale',
      idempotencyKey: 'commitment:existing',
      offerKey: 'synthetic-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: s.capacity.deliveryBlocks['class:synthetic'].endsAt,
      reason: 'synthetic promise',
      sourceEvidenceSha256: a,
      actor: 'synthetic',
      occurredAt: at,
    });
    expect(reasons(run(receipt(), s))).toEqual(['capacity_overcommitted']);
  });
  it('supports nonscheduled entitlement without inventing class assignments', () => {
    const r = receipt();
    r.seats[0].assignment = null;
    const auth = authority(r);
    auth.offers[0].components = [
      {
        componentKey: 'synthetic.content',
        state: 'included',
        requiresAssignment: false,
      },
    ];
    const out = run(r, state(), auth);
    expect(reasons(out)).toEqual([]);
    expect(Object.values(out.enrollment.enrollments)[0].state).toBe('active');
    expect(Object.keys(out.capacity.reservations)).toHaveLength(0);
    expect(Object.keys(out.enrollment.assignments)).toHaveLength(0);
  });
  it('requires exact versioned roster readback, not queued status', () => {
    const out = run();
    const projection = Object.values(out.enrollment.projections)[0];
    expect(projection.state).toBe('queued');
    expect(Object.keys(out.enrollment.receipts)).toHaveLength(0);
    const args = {
      projectionKey: projection.projectionKey,
      expectedProjectionVersion: 0,
      receiptKey: 'receipt:synthetic',
      subjectVersion: projection.subjectVersion,
      actor: 'synthetic-worker',
      occurredAt: at,
      recordedAt: at,
    };
    const wrong = recordProjectionReadback(out.enrollment, {
      ...args,
      readbackSha256: a,
    });
    expect(wrong.projections[projection.projectionKey].state).not.toBe(
      'verified',
    );
    const exact = recordProjectionReadback(out.enrollment, {
      ...args,
      readbackSha256: projection.expectedReadbackSha256,
    });
    expect(exact.projections[projection.projectionKey].state).toBe('verified');
  });
  it.each([
    null,
    {},
    { version: 2 },
    { ...receipt(), secret: 'rejected-extra-field' },
    { ...receipt(), seatCount: 0 },
  ])('rejects a malformed envelope before any state mutation', (candidate) => {
    const s = state();
    const before = structuredClone(s);
    expect(() => apply(s, candidate, authority(receipt()))).toThrow(
      'invalid bounded funding envelope',
    );
    expect(s).toEqual(before);
  });
});
