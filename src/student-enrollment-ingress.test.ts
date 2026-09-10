import { describe, expect, it } from 'vitest';
import {
  applyEnrollmentIngress as apply,
  enrollmentIngressProofPayload as payload,
  ENROLLMENT_INGRESS_MODE,
  type EnrollmentIngressEnvelope as Envelope,
  type EnrollmentIngressAuthority as Authority,
  type EnrollmentIngressProof as Proof,
} from './student-enrollment-ingress.js';
import {
  bookkeeperContractHash as hash,
  type BookkeeperEnrollmentState,
} from './bookkeeper-enrollment-contract.js';
import { createEmptyEnrollmentFoundationState } from './student-enrollment-foundation.js';
import {
  createEmptyAcademyCapacityState,
  registerDeliveryBlock,
  configureSeatPool,
  mapOfferToSeatPool,
  showInventory,
} from './academy-capacity.js';

const at = '2026-09-07T00:00:00Z';
const a = 'a'.repeat(64);
function envelope(
  channel: Envelope['channel'] = 'manual_stripe_payment',
): Envelope {
  const grant =
    channel === 'scholarship' || channel === 'complimentary_owner_grant';
  const source = grant
    ? { scope: 'owner:synthetic', objectType: 'grant', objectId: 'grant_a' }
    : channel === 'plutio_invoice_or_contract'
      ? {
          scope: 'plutio:synthetic',
          objectType: 'invoice_payment',
          objectId: 'payment_a',
        }
      : ['sponsored_cohort', 'check_ach_or_wire'].includes(channel)
        ? {
            scope: 'bank:synthetic',
            objectType: 'payment_receipt',
            objectId: 'payment_a',
          }
        : {
            scope: 'stripe:tandem',
            objectType: 'payment_intent',
            objectId: 'pi_A',
          };
  return {
    version: 1,
    intakeKey: 'intake:one',
    channel,
    sourceAlias: source,
    funding: {
      source,
      aliases: source.scope.startsWith('stripe:')
        ? [
            {
              scope: source.scope,
              objectType: 'checkout_session',
              objectId: 'cs_A',
            },
            { scope: source.scope, objectType: 'event', objectId: 'evt_A' },
          ]
        : [],
      status: grant ? 'grant' : 'settled',
      amountMinor: grant ? null : 10000,
      currency: grant ? null : 'USD',
      payerPartyId: grant ? null : 1,
      effectiveAt: at,
      proofKey: 'proof:funding',
    },
    commercial: {
      offerKey: 'synthetic-full',
      seatCount: 1,
      totalMinor: grant ? null : 10000,
      currency: grant ? null : 'USD',
      proofKey: 'proof:commercial',
    },
    seats: [
      {
        participantPartyId: 2,
        payerRelationship: grant ? 'not_applicable' : 'separate_payer',
        proofKey: 'proof:participant:1',
        assignment: {
          poolKey: 'pool:synthetic',
          componentKey: 'synthetic.module-1',
          proofKey: 'proof:assignment:1',
        },
      },
    ],
  };
}
function authority(e: Envelope): Authority {
  const grant =
    e.channel === 'scholarship' || e.channel === 'complimentary_owner_grant';
  const make = (
    purpose: Proof['purpose'],
    proofKey: string,
    role: Proof['role'],
    index = 0,
  ): Proof => ({
    proofKey,
    purpose,
    payloadSha256: hash(payload(e, purpose, index)),
    actor: `synthetic:${role}`,
    role,
    observedAt: at,
  });
  return {
    proofs: [
      make(
        'funding',
        e.funding.proofKey,
        grant ? 'owner_admin' : 'finance_operator',
      ),
      make(
        'commercial',
        e.commercial.proofKey,
        grant ? 'owner_admin' : 'enrollment_operator',
      ),
      ...e.seats.flatMap((s, i) => [
        ...(s.proofKey
          ? [make('participant', s.proofKey, 'enrollment_operator', i)]
          : []),
        ...(s.assignment
          ? [
              make(
                'assignment',
                s.assignment.proofKey,
                'enrollment_operator',
                i,
              ),
            ]
          : []),
      ]),
    ],
    catalog: {
      occurredAt: at,
      partyIds: [1, 2, 3],
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
          ],
        },
      ],
    },
  };
}
function state(cap = 3): BookkeeperEnrollmentState {
  let capacity = registerDeliveryBlock(createEmptyAcademyCapacityState(), {
    deliveryBlockKey: 'class:synthetic',
    componentKey: 'synthetic.module-1',
    sourceScope: 'calendar:synthetic',
    sourceObjectId: 'synthetic',
    startsAt: '2026-10-01T15:00:00Z',
    endsAt: '2026-10-30T17:00:00Z',
    timezone: 'America/Chicago',
    sessionSetSha256: a,
    scheduleEvidenceSha256: a,
    state: 'scheduled',
    version: 0,
    actor: 'synthetic',
    occurredAt: at,
  });
  capacity = configureSeatPool(capacity, {
    poolKey: 'pool:synthetic',
    deliveryBlockKey: 'class:synthetic',
    capacity: cap,
    operationalState: 'open',
    closeReason: null,
    version: 0,
    evidenceSha256: a,
    actor: 'synthetic',
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
    actor: 'synthetic',
    occurredAt: at,
  });
  return { enrollment: createEmptyEnrollmentFoundationState(), capacity };
}
const reasons = (s: BookkeeperEnrollmentState) =>
  Object.values(s.enrollment.exceptions).map((x) => x.reasonCode);
const run = (e = envelope(), s = state(), auth = authority(e)) =>
  apply(s, e, auth);

describe('default-off multi-source enrollment ingress', () => {
  it('parses typed website funding but requires the dedicated quote-first adapter', () => {
    const e = envelope();
    e.channel = 'website_checkout';
    e.funding.source = {
      scope: `adyen:${a}`,
      objectType: 'payment',
      objectId: 'ABCDEFGHIJKLMNOP',
      sourceType: 'adyen_payment_acceptance_v1',
    };
    e.sourceAlias = e.funding.source;
    e.funding.aliases = [];
    e.funding.status = 'accepted_pending_receipt';
    const auth = authority(e);
    const original = state();
    const before = structuredClone(original);
    expect(() => apply(original, e, auth)).toThrow(
      expect.objectContaining({ code: 'dedicated_adapter_required' }),
    );
    expect(original).toEqual(before);
  });

  it('has no runtime activation mode', () =>
    expect(ENROLLMENT_INGRESS_MODE).toBe('synthetic_only'));
  it.each([
    'website_stripe_checkout',
    'manual_stripe_payment',
    'plutio_invoice_or_contract',
    'check_ach_or_wire',
    'sponsored_cohort',
    'scholarship',
    'complimentary_owner_grant',
  ] as const)(
    'normalizes verified %s to the same canonical engine',
    (channel) => {
      const e = envelope(channel);
      const out = run(e);
      expect(out.disposition).toBe('accepted');
      expect(reasons(out)).toEqual([]);
      expect(out.enrollment.orders[out.orderKey].sourceChannel).toBe(channel);
      expect(
        Object.values(out.enrollment.enrollments)[0].participantPartyId,
      ).toBe(2);
      expect(Object.values(out.enrollment.projections)[0].state).toBe('queued');
      expect(Object.values(out.capacity.reservations)[0].state).toBe(
        'consumed',
      );
      expect(
        showInventory(out.capacity, out.enrollment, 'pool:synthetic', at)
          .available,
      ).toBe(2);
    },
  );
  it('routes migration/correction intake to an owned resolution gate without replaying history', () => {
    const out = run(envelope('migration_or_correction'));
    expect(reasons(out)).toEqual(['correction_requires_resolution']);
    expect(Object.values(out.enrollment.exceptions)[0].ownerRole).toBe(
      'owner_admin',
    );
    expect(Object.keys(out.enrollment.seats)).toHaveLength(0);
    expect(Object.keys(out.capacity.reservations)).toHaveLength(0);
  });
  it('resolves checkout, event and canonical aliases to one order across independent deliveries', () => {
    const e = envelope('website_stripe_checkout');
    e.sourceAlias = e.funding.aliases[0];
    const first = run(e);
    e.intakeKey = 'intake:second';
    e.sourceAlias = e.funding.aliases[1];
    const second = run(e, first);
    expect(second.orderKey).toBe(first.orderKey);
    expect(Object.keys(second.enrollment.orders)).toHaveLength(1);
    expect(Object.keys(second.enrollment.enrollments)).toHaveLength(1);
    expect(Object.keys(second.enrollment.projections)).toHaveLength(1);
    expect(Object.keys(second.capacity.reservations)).toHaveLength(1);
    expect(
      Object.values(second.enrollment.sourceReferences).filter(
        (r) => r.sourceObjectType === 'request',
      ),
    ).toHaveLength(2);
  });
  it('accepts additional independently verified aliases without changing canonical funding facts', () => {
    const e = envelope();
    const first = run(e);
    e.intakeKey = 'intake:second';
    e.funding.aliases.push({
      scope: 'stripe:tandem',
      objectType: 'charge',
      objectId: 'ch_A',
    });
    const second = run(e, first);
    expect(second.orderKey).toBe(first.orderKey);
    expect(reasons(second)).toEqual([]);
    expect(Object.keys(second.enrollment.orders)).toHaveLength(1);
  });
  it('replays exact intake without reapplying after serialization or catalog changes', () => {
    const e = envelope();
    const first = run(e);
    const restored = JSON.parse(JSON.stringify(first));
    const auth = authority(e);
    auth.catalog.offers = [];
    const retry = run(e, restored, auth);
    expect(retry.disposition).toBe('duplicate');
    expect(retry.enrollment).toEqual(first.enrollment);
    expect(retry.capacity).toEqual(first.capacity);
  });
  it('treats alias ordering as nonmaterial to exact intake replay', () => {
    const e = envelope();
    const first = run(e);
    e.funding.aliases.reverse();
    const retry = run(e, first);
    expect(retry.disposition).toBe('duplicate');
    expect(retry.enrollment).toEqual(first.enrollment);
  });
  it('holds a changed intake key without modifying the prior valid enrollment or request', () => {
    const e = envelope();
    const first = run(e);
    e.seats[0].participantPartyId = 3;
    const out = run(e, first);
    expect(reasons(out)).toContain('intake_key_conflict');
    expect(out.capacity).toEqual(first.capacity);
    expect(out.enrollment.projections).toEqual(first.enrollment.projections);
  });
  it('holds a verified alias collision atomically before allocating the second payment', () => {
    const e = envelope();
    const first = run(e);
    e.intakeKey = 'intake:two';
    e.funding.source = { ...e.funding.source, objectId: 'pi_B' };
    e.sourceAlias = e.funding.source;
    e.seats[0].participantPartyId = 3;
    const out = run(e, first);
    expect(reasons(out)).toEqual(['source_alias_conflict']);
    expect(out.capacity).toEqual(first.capacity);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(1);
    expect(
      Object.values(out.enrollment.sourceReferences).some(
        (r) => r.sourceObjectId === 'pi_B',
      ),
    ).toBe(false);
  });
  it('keeps identical Payment Intent IDs on separate accounts distinct', () => {
    const e = envelope();
    const first = run(e);
    e.intakeKey = 'intake:two';
    e.funding.source.scope = 'stripe:heartbeat';
    e.funding.aliases = e.funding.aliases.map((r) => ({
      ...r,
      scope: 'stripe:heartbeat',
    }));
    e.sourceAlias = e.funding.source;
    e.seats[0].participantPartyId = 3;
    const out = run(e, first);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(2);
    expect(reasons(out)).toEqual([]);
  });
  it('rejects cross-account alias claims even when the snapshot proof is present', () => {
    const e = envelope();
    e.funding.aliases[0].scope = 'stripe:heartbeat';
    expect(reasons(run(e))).toEqual(['source_alias_unverified']);
  });
  it('does not trust an unverified selection of a source alias', () => {
    const e = envelope();
    e.sourceAlias = { ...e.funding.source, objectId: 'pi_NotInSnapshot' };
    expect(reasons(run(e))).toEqual(['source_alias_unverified']);
  });
  it('does not bind a reusable customer identity as a funding alias', () => {
    const e = envelope();
    e.funding.aliases.push({
      scope: 'stripe:tandem',
      objectType: 'customer',
      objectId: 'cus_A',
    });
    expect(reasons(run(e))).toEqual(['source_alias_unverified']);
  });
  it('retains exact used proof receipts and their independent actors', () => {
    const e = envelope();
    const out = run(e);
    const records = Object.values(out.enrollment.evidence).filter(
      (x) => x.evidenceType === 'ingress_funding',
    );
    expect(records).toHaveLength(1);
    expect(records[0].evidenceSha256).toBe(hash(payload(e, 'funding')));
    expect(records[0].recordedBy).toBe('synthetic:finance_operator');
  });
  it('never lets missing participant evidence on another delivery change a valid enrollment', () => {
    const e = envelope();
    const first = run(e);
    e.intakeKey = 'intake:two';
    const h = authority(e);
    h.proofs = h.proofs.filter((p) => p.purpose !== 'participant');
    const out = run(e, first, h);
    expect(reasons(out)).toContain('participant_evidence_unverified');
    expect(out.enrollment.projections).toEqual(first.enrollment.projections);
    expect(out.capacity).toEqual(first.capacity);
  });
  it('holds an unverified optional assignment instead of silently granting nonscheduled access', () => {
    const e = envelope();
    const h = authority(e);
    h.catalog.offers[0].components[0].requiresAssignment = false;
    h.proofs = h.proofs.filter((p) => p.purpose !== 'assignment');
    const out = run(e, state(), h);
    expect(reasons(out)).toContain('assignment_evidence_unverified');
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(0);
    expect(Object.keys(out.enrollment.projections)).toHaveLength(0);
  });
  it('retains verified funding capacity but never materializes a student with invalid participant proof', () => {
    const e = envelope();
    const h = authority(e);
    h.proofs = h.proofs.filter((p) => p.purpose !== 'participant');
    const out = run(e, state(), h);
    expect(out.disposition).toBe('held');
    expect(reasons(out)).toContain('participant_missing');
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(0);
    expect(Object.keys(out.enrollment.entitlements)).toHaveLength(0);
    expect(Object.keys(out.enrollment.assignments)).toHaveLength(0);
    expect(Object.keys(out.enrollment.projections)).toHaveLength(0);
    expect(Object.values(out.enrollment.seats)[0]).toMatchObject({
      participantPartyId: null,
      state: 'unassigned',
    });
    expect(Object.values(out.capacity.reservations)).toHaveLength(1);
    expect(Object.values(out.capacity.reservations)[0]).toMatchObject({
      channel: 'commitment',
      state: 'held',
    });
    expect(
      showInventory(out.capacity, out.enrollment, 'pool:synthetic', at)
        .available,
    ).toBe(2);
  });
  it.each(['funding', 'commercial'] as const)(
    'holds missing %s evidence in canonical intake without claiming payment aliases',
    (purpose) => {
      const e = envelope();
      const auth = authority(e);
      auth.proofs = auth.proofs.filter((p) => p.purpose !== purpose);
      const out = run(e, state(), auth);
      expect(reasons(out)).toEqual([`${purpose}_evidence_unverified`]);
      expect(
        Object.values(out.enrollment.sourceReferences).every(
          (r) => r.sourceScope === 'enrollment_intake',
        ),
      ).toBe(true);
      expect(Object.keys(out.enrollment.seats)).toHaveLength(0);
    },
  );
  it('does not accept changing payer, product, or amount after evidence verification', () => {
    for (const change of [
      (e: Envelope) => {
        e.funding.payerPartyId = 3;
      },
      (e: Envelope) => {
        e.commercial.offerKey = 'other';
      },
      (e: Envelope) => {
        e.funding.amountMinor = 1;
      },
    ]) {
      const e = envelope();
      const auth = authority(e);
      change(e);
      const out = run(e, state(), auth);
      expect(out.disposition).toBe('held');
      expect(Object.keys(out.enrollment.enrollments)).toHaveLength(0);
    }
  });
  it('rejects swapped, duplicate and future host proof records', () => {
    const e = envelope();
    for (const edit of [
      (h: Authority) => {
        h.proofs[0].purpose = 'commercial';
      },
      (h: Authority) => {
        h.proofs.push(h.proofs[0]);
      },
      (h: Authority) => {
        h.proofs[0].observedAt = '2027-01-01T00:00:00Z';
      },
    ]) {
      const h = authority(e);
      edit(h);
      expect(reasons(run(e, state(), h))).toEqual([
        'funding_evidence_unverified',
      ]);
    }
  });
  it('requires finance confirmation for off-platform funds and owner authority for grants', () => {
    for (const channel of [
      'check_ach_or_wire',
      'sponsored_cohort',
      'scholarship',
      'complimentary_owner_grant',
    ] as const) {
      const e = envelope(channel);
      const h = authority(e);
      h.proofs[0].role = 'source_adapter';
      expect(reasons(run(e, state(), h))).toEqual([
        'funding_evidence_unverified',
      ]);
    }
  });
  it('does not promote unpaid invoices or partial settlement into paid enrollment', () => {
    const e = envelope('plutio_invoice_or_contract');
    e.funding.status = 'unverified';
    expect(reasons(run(e))).toContain('financial_terms_unverified');
    e.funding.status = 'settled';
    e.funding.amountMinor = 5000;
    expect(reasons(run(e))).toContain('financial_terms_unverified');
  });
  it('does not infer a self-purchaser from payer identity', () => {
    const e = envelope();
    e.seats[0].participantPartyId = 1;
    e.seats[0].payerRelationship = 'unknown';
    expect(reasons(run(e))).toContain('payer_relationship_missing');
    e.seats[0].payerRelationship = 'self_purchase_explicit';
    expect(reasons(run(e))).toEqual([]);
  });
  it('advances a verified sponsor participant while retaining an owned unnamed funded slot', () => {
    const e = envelope('sponsored_cohort');
    e.commercial.seatCount = 2;
    e.seats.push({
      participantPartyId: null,
      payerRelationship: 'unknown',
      proofKey: null,
      assignment: { ...e.seats[0].assignment!, proofKey: 'proof:assignment:2' },
    });
    const out = run(e);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(1);
    expect(reasons(out)).toContain('participant_missing');
    expect(
      Object.values(out.capacity.reservations)
        .map((r) => r.state)
        .sort(),
    ).toEqual(['consumed', 'held']);
  });
  it('binds participant evidence to the exact seat, not just the person', () => {
    const e = envelope('sponsored_cohort');
    e.commercial.seatCount = 2;
    e.seats.push({
      participantPartyId: 3,
      payerRelationship: 'sponsor',
      proofKey: 'proof:participant:2',
      assignment: null,
    });
    const h = authority(e);
    e.seats[1].proofKey = e.seats[0].proofKey;
    const out = run(e, state(), h);
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(1);
    expect(out.disposition).toBe('held');
  });
  it('binds class assignment evidence to its exact person and slot', () => {
    const e = envelope();
    const h = authority(e);
    e.seats[0].assignment!.poolKey = 'pool:other';
    const out = run(e, state(), h);
    expect(reasons(out)).toContain('assignment_missing');
    expect(Object.keys(out.capacity.reservations)).toHaveLength(0);
  });
  it('preserves the counted oversale and prevents an extra roster projection', () => {
    const e = envelope();
    const first = run(e, state(1));
    e.intakeKey = 'intake:two';
    e.funding.source = { ...e.funding.source, objectId: 'pi_B' };
    e.funding.aliases = [];
    e.sourceAlias = e.funding.source;
    e.seats[0].participantPartyId = 3;
    const out = run(e, first);
    expect(reasons(out)).toContain('capacity_overcommitted');
    expect(Object.keys(out.enrollment.projections)).toHaveLength(1);
  });
  it('does not mutate caller inputs or accept raw unbounded provider bodies', () => {
    const e = envelope();
    const s = state();
    const h = authority(e);
    const before = structuredClone({ e, s, h });
    run(e, s, h);
    expect({ e, s, h }).toEqual(before);
    for (const invalid of [
      null,
      {},
      { ...e, rawEmail: 'forbidden' },
      { ...e, version: 2 },
    ])
      expect(() => apply(s, invalid, h)).toThrow(
        'invalid bounded ingress envelope',
      );
  });
});
