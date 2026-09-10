import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assignParticipant,
  attachEnrollmentEvidence,
  captureOrder,
  correctOrderTerms,
  createSeats,
  EnrollmentCommandError,
  materializeEnrollment,
  openEnrollmentException,
  recordFinancialAgreement,
  recordFinancialObligation,
  requestProjection,
  type EnrollmentFoundationState,
} from './student-enrollment-foundation.js';
import {
  CapacityCommandError,
  commitClassAssignment,
  reserveCapacity,
  showInventory,
  type AcademyCapacityState,
} from './academy-capacity.js';

const key = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,149}$/);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const party = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const time = z.iso.datetime({ offset: true });
const channels = z.enum([
  'website_checkout',
  'website_stripe_checkout',
  'manual_stripe_payment',
  'plutio_invoice_or_contract',
  'check_ach_or_wire',
  'sponsored_cohort',
  'scholarship',
  'complimentary_owner_grant',
]);
const receiptSchema = z.strictObject({
  version: z.literal(1),
  sourceChannel: channels,
  source: z.strictObject({
    scope: key,
    objectType: key,
    sourceType: key.optional(),
    objectId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    evidenceSha256: sha,
    effectiveAt: time,
  }),
  offerKey: key.nullable(),
  payerPartyId: party.nullable(),
  seatCount: z.number().int().min(1).max(100),
  seatCountEvidenceSha256: sha.nullable(),
  funding: z.strictObject({
    kind: z.enum([
      'settled_payment',
      'provider_accepted_provisional',
      'owner_grant',
      'unverified',
    ]),
    amountMinor: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    agreedAmountMinor: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    agreedCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    evidenceSha256: sha.nullable(),
    confirmedBy: key.nullable(),
    confirmerRole: z
      .enum(['source_adapter', 'finance_operator', 'owner_admin'])
      .nullable(),
  }),
  seats: z
    .array(
      z.strictObject({
        participantPartyId: party.nullable(),
        participantEvidenceSha256: sha.nullable(),
        payerRelationship: z.enum([
          'unknown',
          'self_purchase_explicit',
          'separate_payer',
          'sponsor',
          'not_applicable',
        ]),
        assignment: z
          .strictObject({
            poolKey: key,
            componentKey: key,
            evidenceSha256: sha,
          })
          .nullable(),
      }),
    )
    .max(100),
});
export type BookkeeperFundingReceipt = z.infer<typeof receiptSchema>;

const authoritySchema = z.strictObject({
  // Supplied by a trusted host admission boundary, NEVER by the proposing model.
  acceptedReceiptSha256: sha.nullable(),
  partyIds: z.array(party),
  offers: z.array(
    z.strictObject({
      offerKey: key,
      bundleKey: key,
      bundleVersion: z.number().int().positive(),
      catalogRevision: z.number().int().positive(),
      evidenceSha256: sha,
      components: z
        .array(
          z.strictObject({
            componentKey: key,
            state: z.enum(['included', 'conditional', 'earned_on_completion']),
            requiresAssignment: z.boolean(),
          }),
        )
        .min(1)
        .max(100),
    }),
  ),
  occurredAt: time,
});
export type BookkeeperEnrollmentAuthority = z.infer<typeof authoritySchema>;
export interface BookkeeperEnrollmentState {
  enrollment: EnrollmentFoundationState;
  capacity: AcademyCapacityState;
}

/** Canonical hash: property ordering does not change source identity. */
export function bookkeeperContractHash(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v !== null && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, canonical(x)]),
      );
    return v;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

/** Pure local transition. Caller must atomically persist BOTH returned aggregates
 * under a serializable transaction / CAS before acknowledging admission.
 * No runtime consumer or provider writer is installed by this contract. */
export function applyBookkeeperFundingReceipt(
  original: BookkeeperEnrollmentState,
  candidate: unknown,
  trustedAuthority: BookkeeperEnrollmentAuthority,
): BookkeeperEnrollmentState & { orderKey: string; duplicate: boolean } {
  const parsed = receiptSchema.safeParse(candidate);
  if (!parsed.success)
    throw new EnrollmentCommandError(
      'invalid_receipt',
      'invalid bounded funding envelope',
    );
  const receipt = parsed.data;
  const authority = authoritySchema.parse(trustedAuthority);
  if (receipt.sourceChannel === 'website_checkout')
    throw new EnrollmentCommandError(
      'dedicated_adapter_required',
      'website checkout requires authenticated quote-first admission',
    );
  const fingerprint = bookkeeperContractHash(receipt);
  const sourceIdentity = bookkeeperContractHash([
    receipt.source.scope,
    receipt.source.objectType,
    receipt.source.objectId,
  ]);
  const orderKey = `bookkeeper:${sourceIdentity}`;
  const actor = 'bookkeeper-enrollment:host';
  const occurredAt = authority.occurredAt;
  let enrollment = original.enrollment;
  let capacity = original.capacity;
  const old = enrollment.orders[orderKey];
  const priorRef = Object.values(enrollment.sourceReferences).find(
    (r) =>
      r.sourceScope === receipt.source.scope &&
      r.sourceObjectType === receipt.source.objectType &&
      r.sourceObjectId === receipt.source.objectId,
  );
  const boundKey = priorRef?.orderKey ?? orderKey;
  const exceptionKeyFor = (
    subjectType: 'order' | 'seat',
    subjectKey: string,
    reasonCode: string,
  ) =>
    `bk-exception:${bookkeeperContractHash([subjectType, subjectKey, reasonCode, fingerprint])}`;
  const hold = (
    subjectType: 'order' | 'seat',
    subjectKey: string,
    reasonCode: string,
    ownerRole:
      | 'enrollment_operator'
      | 'finance_operator'
      | 'owner_admin' = 'enrollment_operator',
  ) => {
    const exceptionKey = exceptionKeyFor(subjectType, subjectKey, reasonCode);
    if (enrollment.exceptions[exceptionKey]) return;
    enrollment = openEnrollmentException(enrollment, {
      exceptionKey,
      subjectType,
      subjectKey,
      reasonCode,
      ownerRole,
      severity: 'high',
      evidenceSha256: fingerprint,
      reviewAt: occurredAt,
      actor,
      occurredAt,
    });
  };
  // A duplicate is the original decision, even when catalog, capacity, or time changed.
  if (old || priorRef) {
    if (
      priorRef?.orderKey === orderKey &&
      old &&
      enrollment.evidence[`${orderKey}:admission`]?.evidenceSha256 ===
        fingerprint
    )
      return { ...original, orderKey, duplicate: true };
    if (
      authority.acceptedReceiptSha256 !== fingerprint ||
      Date.parse(receipt.source.effectiveAt) > Date.parse(occurredAt)
    )
      throw new EnrollmentCommandError(
        'source_unverified',
        'unattested conflict cannot change an existing order',
      );
    if (
      enrollment.exceptions[
        exceptionKeyFor('order', boundKey, 'duplicate_source_conflict')
      ]
    )
      return { ...original, orderKey: boundKey, duplicate: true };
    hold('order', boundKey, 'duplicate_source_conflict', 'owner_admin');
    // Freeze pending projections from the disputed order without rewriting any
    // already verified target receipt or silently revoking entitlements.
    enrollment = structuredClone(enrollment);
    for (const projection of Object.values(enrollment.projections)) {
      if (
        enrollment.enrollments[projection.subjectKey]?.orderKey !== boundKey ||
        !['queued', 'failed'].includes(projection.state)
      )
        continue;
      const previousVersion = projection.version;
      projection.state = 'held';
      projection.version += 1;
      projection.updatedAt = occurredAt;
      enrollment.history.push({
        subjectType: 'projection',
        subjectKey: projection.projectionKey,
        previousVersion,
        newVersion: projection.version,
        commandKey: 'bookkeeper_source_hold',
        reasonCode: 'duplicate_source_conflict',
        evidenceSha256: fingerprint,
        actor,
        occurredAt,
        recordedAt: occurredAt,
      });
    }
    return { enrollment, capacity, orderKey: boundKey, duplicate: false };
  }
  const offers = authority.offers.filter(
    (o) => o.offerKey === receipt.offerKey,
  );
  const offer = offers.length === 1 ? offers[0] : undefined;
  enrollment = captureOrder(enrollment, {
    orderKey,
    sourceChannel: receipt.sourceChannel,
    offerKey: receipt.offerKey,
    bundleKey: offer?.bundleKey ?? null,
    bundleVersion: offer?.bundleVersion ?? null,
    payerPartyId: receipt.payerPartyId,
    seatCount: receipt.seatCount,
    financialClassification: 'unverified',
    policyRevision: 1,
    evidenceSha256: fingerprint,
    effectiveAt: receipt.source.effectiveAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    updatedBy: actor,
    sourceReference: {
      sourceScope: receipt.source.scope,
      sourceObjectType: receipt.source.objectType,
      sourceObjectId: receipt.source.objectId,
      idempotencyKey: `bookkeeper:${sourceIdentity}`,
      evidenceSha256: receipt.source.evidenceSha256,
      observedAt: receipt.source.effectiveAt,
      recordedAt: occurredAt,
      recordedBy: actor,
    },
  }).state;
  enrollment = attachEnrollmentEvidence(enrollment, {
    evidenceKey: `${orderKey}:admission`,
    subjectType: 'order',
    subjectKey: orderKey,
    evidenceType: 'bookkeeper_admission',
    sourceReferenceKey: null,
    evidenceSha256: fingerprint,
    observedAt: receipt.source.effectiveAt,
    recordedAt: occurredAt,
    recordedBy: actor,
  });
  const finish = () => ({ enrollment, capacity, orderKey, duplicate: false });
  if (
    authority.acceptedReceiptSha256 !== fingerprint ||
    Date.parse(receipt.source.effectiveAt) > Date.parse(occurredAt)
  ) {
    hold('order', orderKey, 'source_unverified', 'finance_operator');
    return finish();
  }
  const stripeSource =
    /^stripe:(tandem|heartbeat)$/.test(receipt.source.scope) &&
    receipt.source.objectType === 'payment_intent' &&
    /^pi_[A-Za-z0-9_]+$/.test(receipt.source.objectId);
  const bankSource =
    receipt.source.scope.startsWith('bank:') &&
    receipt.source.objectType === 'payment_receipt';
  const plutioSource =
    receipt.source.scope.startsWith('plutio:') &&
    receipt.source.objectType === 'invoice_payment';
  const grantSource =
    receipt.source.scope.startsWith('owner:') &&
    receipt.source.objectType === 'grant';
  const sourceValid = receipt.sourceChannel.includes('stripe')
    ? stripeSource
    : receipt.sourceChannel === 'plutio_invoice_or_contract'
      ? plutioSource
      : receipt.sourceChannel === 'check_ach_or_wire'
        ? bankSource
        : receipt.sourceChannel === 'sponsored_cohort'
          ? stripeSource || bankSource || plutioSource
          : grantSource;
  if (!sourceValid) {
    hold('order', orderKey, 'source_identity_invalid', 'finance_operator');
    return finish();
  }
  if (
    !offer ||
    new Set(offer.components.map((c) => c.componentKey)).size !==
      offer.components.length
  ) {
    hold('order', orderKey, 'offer_unknown');
    return finish();
  }
  if (
    !receipt.seatCountEvidenceSha256 ||
    receipt.seats.length !== receipt.seatCount
  ) {
    hold('order', orderKey, 'seat_count_unverified');
    return finish();
  }
  const f = receipt.funding;
  const grant = ['scholarship', 'complimentary_owner_grant'].includes(
    receipt.sourceChannel,
  );
  const financeValid =
    !!f.evidenceSha256 &&
    !!f.confirmedBy &&
    (grant
      ? f.kind === 'owner_grant' &&
        f.confirmerRole === 'owner_admin' &&
        receipt.payerPartyId === null &&
        f.amountMinor === null &&
        f.currency === null &&
        f.agreedAmountMinor === null &&
        f.agreedCurrency === null
      : f.kind === 'settled_payment' &&
        receipt.payerPartyId !== null &&
        authority.partyIds.includes(receipt.payerPartyId) &&
        f.amountMinor !== null &&
        f.amountMinor > 0 &&
        f.amountMinor === f.agreedAmountMinor &&
        f.currency !== null &&
        f.currency === f.agreedCurrency &&
        (['check_ach_or_wire', 'sponsored_cohort'].includes(
          receipt.sourceChannel,
        )
          ? f.confirmerRole === 'finance_operator'
          : ['finance_operator', 'source_adapter'].includes(
              f.confirmerRole ?? '',
            )));
  if (!financeValid) {
    hold(
      'order',
      orderKey,
      'financial_terms_unverified',
      grant ? 'owner_admin' : 'finance_operator',
    );
    return finish();
  }
  // Financial classification is a validated host decision recorded through the
  // existing command, not a flag copied from the proposed receipt.
  enrollment = correctFunding(
    enrollment,
    orderKey,
    grant,
    fingerprint,
    actor,
    occurredAt,
  );
  enrollment = recordFinancialAgreement(enrollment, {
    agreementKey: `${orderKey}:finance`,
    orderKey,
    expectedOrderVersion: enrollment.orders[orderKey].version,
    agreementType: grant
      ? receipt.sourceChannel === 'scholarship'
        ? 'scholarship'
        : 'complimentary'
      : 'paid_in_full',
    state: 'complete',
    version: 0,
    evidenceSha256: f.evidenceSha256!,
    actor,
    occurredAt,
  });
  if (!grant)
    enrollment = recordFinancialObligation(enrollment, {
      obligationKey: `${orderKey}:paid`,
      agreementKey: `${orderKey}:finance`,
      expectedAgreementVersion: 0,
      sequenceNumber: 1,
      amountMinor: f.amountMinor,
      currency: f.currency,
      dueAt: receipt.source.effectiveAt,
      state: 'paid',
      version: 0,
      evidenceSha256: f.evidenceSha256!,
      actor,
      occurredAt,
    });
  enrollment = attachEnrollmentEvidence(enrollment, {
    evidenceKey: `${orderKey}:catalog`,
    subjectType: 'order',
    subjectKey: orderKey,
    evidenceType: 'catalog_binding',
    sourceReferenceKey: null,
    evidenceSha256: offer.evidenceSha256,
    observedAt: occurredAt,
    recordedAt: occurredAt,
    recordedBy: actor,
  });
  const seatKeys = receipt.seats.map((_, i) => `${orderKey}:seat:${i + 1}`);
  enrollment = createSeats(enrollment, {
    orderKey,
    expectedOrderVersion: enrollment.orders[orderKey].version,
    seatKeys,
    evidenceSha256: receipt.seatCountEvidenceSha256,
    actor,
    occurredAt,
  });
  const named = receipt.seats
    .map((s) => s.participantPartyId)
    .filter((x) => x !== null);
  for (const [i, seat] of receipt.seats.entries()) {
    const seatKey = seatKeys[i];
    const enrollmentKey = `${seatKey}:enrollment`;
    let pool = seat.assignment
      ? capacity.seatPools[seat.assignment.poolKey]
      : undefined;
    const block = pool
      ? capacity.deliveryBlocks[pool.deliveryBlockKey]
      : undefined;
    if (block && Date.parse(block.endsAt) <= Date.parse(occurredAt)) {
      hold('seat', seatKey, 'delivery_block_expired');
      continue;
    }
    if (
      seat.assignment &&
      (!pool ||
        !block ||
        block.componentKey !== seat.assignment.componentKey ||
        !offer.components.some(
          (c) =>
            c.componentKey === block.componentKey && c.state === 'included',
        ))
    ) {
      hold('seat', seatKey, 'assignment_unknown');
      continue;
    }
    if (
      !seat.assignment &&
      offer.components.some((c) => c.requiresAssignment)
    ) {
      hold('seat', seatKey, 'assignment_missing');
      continue;
    }
    let reservationKey: string | null = null;
    if (pool && block) {
      try {
        const inventory = showInventory(
          capacity,
          enrollment,
          pool.poolKey,
          occurredAt,
        );
        reservationKey = `${seatKey}:commitment`;
        capacity = reserveCapacity(capacity, enrollment, {
          reservationKey,
          poolKey: pool.poolKey,
          expectedPoolVersion: pool.version,
          channel: 'commitment',
          sourceScope:
            receipt.sourceChannel === 'website_stripe_checkout'
              ? 'website_stripe_sale'
              : receipt.sourceChannel === 'plutio_invoice_or_contract'
                ? 'invoice'
                : receipt.sourceChannel === 'check_ach_or_wire'
                  ? 'check'
                  : receipt.sourceChannel === 'sponsored_cohort'
                    ? 'sponsor'
                    : 'manual_sale',
          idempotencyKey: reservationKey,
          offerKey: offer.offerKey,
          catalogRevision: offer.catalogRevision,
          orderKey,
          seatKey,
          expiresAt: block.endsAt,
          reason: 'source-bound Bookkeeper funding',
          sourceEvidenceSha256: fingerprint,
          actor,
          occurredAt,
        });
        if (inventory.available === 0) {
          hold('seat', seatKey, 'capacity_overcommitted', 'owner_admin');
          continue;
        }
      } catch (error) {
        if (!(error instanceof CapacityCommandError)) throw error;
        hold('seat', seatKey, error.code);
        continue;
      }
    }
    if (
      !seat.participantPartyId ||
      !seat.participantEvidenceSha256 ||
      !authority.partyIds.includes(seat.participantPartyId)
    ) {
      hold('seat', seatKey, 'participant_missing');
      continue;
    }
    if (named.filter((id) => id === seat.participantPartyId).length !== 1) {
      hold('seat', seatKey, 'participant_ambiguous');
      continue;
    }
    // Roll back this seat's materialization if any gate fails; its actual funding
    // commitment remains counted and its exception remains durably owned.
    const beforeSeat = enrollment;
    try {
      const existingParticipant = Object.values(enrollment.enrollments).some(
        (e) =>
          e.participantPartyId === seat.participantPartyId &&
          ['pending', 'active', 'held'].includes(e.state) &&
          (block
            ? Object.values(enrollment.assignments).some(
                (a) =>
                  a.enrollmentKey === e.enrollmentKey &&
                  a.deliveryBlockKey === block.deliveryBlockKey &&
                  ['pending', 'active'].includes(a.state),
              )
            : e.offerKey === offer.offerKey),
      );
      if (existingParticipant) {
        hold('seat', seatKey, 'participant_already_enrolled', 'owner_admin');
        continue;
      }
      if (seat.payerRelationship === 'unknown')
        throw new EnrollmentCommandError(
          'payer_relationship_missing',
          'explicit relationship required',
        );
      enrollment = assignParticipant(enrollment, {
        seatKey,
        expectedSeatVersion: 0,
        participantPartyId: seat.participantPartyId,
        participantEvidenceSha256: seat.participantEvidenceSha256,
        payerRelationship: seat.payerRelationship,
        actor,
        occurredAt,
      });
      const future =
        block && Date.parse(block.startsAt) > Date.parse(occurredAt);
      enrollment = materializeEnrollment(enrollment, {
        orderKey,
        expectedOrderVersion: enrollment.orders[orderKey].version,
        seatKey,
        expectedSeatVersion: 1,
        enrollmentKey,
        catalogRevision: offer.catalogRevision,
        enrollmentState: future ? 'pending' : 'active',
        effectiveAt: future ? block.startsAt : null,
        materializationSha256: fingerprint,
        components: offer.components.map((c, n) => ({
          componentKey: c.componentKey,
          state: c.state,
          entitlementKey: `${seatKey}:entitlement:${n + 1}`,
        })),
        actor,
        occurredAt,
      });
      if (reservationKey && pool && block) {
        const componentIndex = offer.components.findIndex(
          (c) => c.componentKey === block.componentKey,
        );
        const committed = commitClassAssignment(capacity, enrollment, {
          reservationKey,
          expectedReservationVersion: 0,
          expectedPoolVersion: capacity.seatPools[pool.poolKey].version,
          enrollmentKey,
          expectedEnrollmentVersion:
            enrollment.enrollments[enrollmentKey].version,
          entitlementKey: `${seatKey}:entitlement:${componentIndex + 1}`,
          assignmentKey: `${seatKey}:assignment`,
          assignmentState: future ? 'pending' : 'active',
          evidenceSha256: seat.assignment!.evidenceSha256,
          actor,
          occurredAt,
        });
        capacity = committed.capacity;
        enrollment = committed.enrollment;
      }
    } catch (error) {
      if (
        !(
          error instanceof EnrollmentCommandError ||
          error instanceof CapacityCommandError
        )
      )
        throw error;
      enrollment = beforeSeat;
      hold('seat', seatKey, error.code);
      continue;
    }
    const subject = enrollment.enrollments[enrollmentKey];
    const payload = {
      enrollmentKey,
      participantPartyId: seat.participantPartyId,
      offerKey: offer.offerKey,
      bundleKey: offer.bundleKey,
      bundleVersion: offer.bundleVersion,
      catalogRevision: offer.catalogRevision,
      enrollmentState: subject.state,
      deliveryBlockKey: block?.deliveryBlockKey ?? null,
      assignmentKey: reservationKey ? `${seatKey}:assignment` : null,
    };
    const payloadSha256 = bookkeeperContractHash(payload);
    enrollment = requestProjection(enrollment, {
      projectionKey: `${seatKey}:roster:v${subject.version}`,
      target: 'student_roster',
      subjectType: 'enrollment',
      subjectKey: enrollmentKey,
      subjectVersion: subject.version,
      payload,
      payloadSha256,
      expectedReadbackSha256: payloadSha256,
      state: 'queued',
      version: 0,
      actor,
      occurredAt,
    });
  }
  return finish();
}

function correctFunding(
  state: EnrollmentFoundationState,
  orderKey: string,
  grant: boolean,
  evidenceSha256: string,
  actor: string,
  occurredAt: string,
): EnrollmentFoundationState {
  const o = state.orders[orderKey];
  return correctOrderTerms(state, {
    orderKey,
    expectedOrderVersion: o.version,
    offerKey: o.offerKey!,
    bundleKey: o.bundleKey!,
    bundleVersion: o.bundleVersion!,
    financialClassification: grant ? 'not_applicable' : 'settled',
    evidenceSha256,
    actor,
    occurredAt,
  });
}
