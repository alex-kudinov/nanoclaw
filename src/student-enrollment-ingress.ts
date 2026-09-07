import { z } from 'zod';
import {
  applyBookkeeperFundingReceipt,
  bookkeeperContractHash as hash,
  type BookkeeperEnrollmentAuthority,
  type BookkeeperEnrollmentState,
  type BookkeeperFundingReceipt,
} from './bookkeeper-enrollment-contract.js';
import {
  attachEnrollmentEvidence,
  captureOrder,
  EnrollmentCommandError,
  linkSourceReference,
  openEnrollmentException,
} from './student-enrollment-foundation.js';

/** No registry, IPC, provider client, database writer, CLI, or activation flag. */
export const ENROLLMENT_INGRESS_MODE = 'synthetic_only' as const;
const key = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,99}$/);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const amount = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .nullable();
const party = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
const refSchema = z.strictObject({
  scope: key,
  objectType: key,
  objectId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/),
});
const channelSchema = z.enum([
  'website_stripe_checkout',
  'manual_stripe_payment',
  'plutio_invoice_or_contract',
  'check_ach_or_wire',
  'sponsored_cohort',
  'scholarship',
  'complimentary_owner_grant',
  'migration_or_correction',
]);
const envelopeSchema = z.strictObject({
  version: z.literal(1),
  intakeKey: key,
  channel: channelSchema,
  sourceAlias: refSchema,
  funding: z.strictObject({
    source: refSchema,
    aliases: z.array(refSchema).max(20),
    status: z.enum(['settled', 'grant', 'unverified']),
    amountMinor: amount,
    currency,
    payerPartyId: party,
    effectiveAt: z.iso.datetime({ offset: true }),
    proofKey: key,
  }),
  commercial: z.strictObject({
    offerKey: key.nullable(),
    seatCount: z.number().int().min(1).max(100),
    totalMinor: amount,
    currency,
    proofKey: key,
  }),
  seats: z
    .array(
      z.strictObject({
        participantPartyId: party,
        payerRelationship: z.enum([
          'unknown',
          'self_purchase_explicit',
          'separate_payer',
          'sponsor',
          'not_applicable',
        ]),
        proofKey: key.nullable(),
        assignment: z
          .strictObject({ poolKey: key, componentKey: key, proofKey: key })
          .nullable(),
      }),
    )
    .max(100),
});
export type EnrollmentIngressEnvelope = z.infer<typeof envelopeSchema>;
type Ref = z.infer<typeof refSchema>;
type Purpose = 'funding' | 'commercial' | 'participant' | 'assignment';
const proofSchema = z.strictObject({
  proofKey: key,
  purpose: z.enum(['funding', 'commercial', 'participant', 'assignment']),
  payloadSha256: sha,
  actor: key,
  role: z.enum([
    'source_adapter',
    'finance_operator',
    'enrollment_operator',
    'owner_admin',
  ]),
  observedAt: z.iso.datetime({ offset: true }),
});
export type EnrollmentIngressProof = z.infer<typeof proofSchema>;
export interface EnrollmentIngressAuthority {
  /** Authenticated HOST observations only. Never populate from the candidate. */
  proofs: EnrollmentIngressProof[];
  catalog: Omit<BookkeeperEnrollmentAuthority, 'acceptedReceiptSha256'>;
}
export interface EnrollmentIngressResult extends BookkeeperEnrollmentState {
  orderKey: string;
  disposition: 'accepted' | 'held' | 'duplicate';
}
const refId = (r: Ref) => hash([r.scope, r.objectType, r.objectId]);
const sameRef = (a: Ref, b: Ref) => refId(a) === refId(b);
function financialAlias(r: Ref, canonical: Ref): boolean {
  if (r.scope !== canonical.scope) return false;
  if (r.scope.startsWith('stripe:')) {
    const patterns: Record<string, RegExp> = {
      payment_intent: /^pi_[A-Za-z0-9_]+$/,
      checkout_session: /^cs_[A-Za-z0-9_]+$/,
      charge: /^(ch|py)_[A-Za-z0-9_]+$/,
      event: /^evt_[A-Za-z0-9_]+$/,
    };
    return (
      Object.hasOwn(patterns, r.objectType) &&
      patterns[r.objectType].test(r.objectId)
    );
  }
  if (r.scope.startsWith('plutio:'))
    return ['invoice_payment', 'invoice'].includes(r.objectType);
  return sameRef(r, canonical);
}
function canonicalFunding(e: EnrollmentIngressEnvelope) {
  const { proofKey: _proof, aliases: _aliases, ...funding } = e.funding;
  return funding;
}

/** Reproducible proof payloads bind each fact to source, offer, and seat.
 * Computing a hash does NOT authenticate it; the trusted host supplies receipts. */
export function enrollmentIngressProofPayload(
  e: EnrollmentIngressEnvelope,
  purpose: Purpose,
  seatIndex = 0,
): unknown {
  const source = e.funding.source;
  if (purpose === 'funding')
    return {
      purpose,
      funding: canonicalFunding(e),
      aliases: [...e.funding.aliases].sort((a, b) =>
        refId(a).localeCompare(refId(b)),
      ),
    };
  if (purpose === 'commercial') {
    const { proofKey: _proof, ...commercial } = e.commercial;
    return { purpose, source, channel: e.channel, commercial };
  }
  const seat = e.seats[seatIndex];
  if (!seat)
    throw new EnrollmentCommandError('invalid_seat', 'proof seat is absent');
  const context = {
    purpose,
    source,
    channel: e.channel,
    offerKey: e.commercial.offerKey,
    seatCount: e.commercial.seatCount,
    seatNumber: seatIndex + 1,
    participantPartyId: seat.participantPartyId,
  };
  if (purpose === 'participant')
    return { ...context, payerRelationship: seat.payerRelationship };
  return {
    ...context,
    assignment: seat.assignment
      ? {
          poolKey: seat.assignment.poolKey,
          componentKey: seat.assignment.componentKey,
        }
      : null,
  };
}

export function parseEnrollmentIngressEnvelope(
  candidate: unknown,
): EnrollmentIngressEnvelope {
  const parsed = envelopeSchema.safeParse(candidate);
  if (!parsed.success)
    throw new EnrollmentCommandError(
      'invalid_ingress',
      'invalid bounded ingress envelope',
    );
  const e = parsed.data;
  e.funding.aliases.sort((a, b) => refId(a).localeCompare(refId(b)));
  return e;
}

/** Snapshot adapter; no real source retrieval or authentication happens here. */
export function applyEnrollmentIngress(
  original: BookkeeperEnrollmentState,
  candidate: unknown,
  host: EnrollmentIngressAuthority,
): EnrollmentIngressResult {
  const e = parseEnrollmentIngressEnvelope(candidate);
  const proofs = z.array(proofSchema).max(1000).parse(host.proofs);
  const at = z.iso.datetime({ offset: true }).parse(host.catalog.occurredAt);
  const fingerprint = hash(e);
  const markerKey = `ingress:${hash(e.intakeKey)}`;
  const marker = original.enrollment.evidence[markerKey];
  if (marker?.evidenceSha256 === fingerprint)
    return {
      ...original,
      orderKey: marker.subjectKey,
      disposition: 'duplicate',
    };
  const usedProofs = new Map<string, EnrollmentIngressProof>();
  const proof = (
    purpose: Purpose,
    proofKey: string | null,
    roles: EnrollmentIngressProof['role'][],
    seat = 0,
  ) => {
    const matches = proofs.filter((p) => p.proofKey === proofKey);
    const p = matches.length === 1 ? matches[0] : undefined;
    if (
      p &&
      p.purpose === purpose &&
      roles.includes(p.role) &&
      Date.parse(p.observedAt) <= Date.parse(at) &&
      p.payloadSha256 === hash(enrollmentIngressProofPayload(e, purpose, seat))
    ) {
      usedProofs.set(p.proofKey, p);
      return p;
    }
    return undefined;
  };
  const actor = 'enrollment-ingress:host';
  function recordMarker(state: BookkeeperEnrollmentState, orderKey: string) {
    let enrollment = state.enrollment;
    for (const p of usedProofs.values())
      enrollment = attachEnrollmentEvidence(enrollment, {
        evidenceKey: `${markerKey}:proof:${p.proofKey}`,
        subjectType: 'order',
        subjectKey: orderKey,
        evidenceType: `ingress_${p.purpose}`,
        sourceReferenceKey: null,
        evidenceSha256: p.payloadSha256,
        observedAt: p.observedAt,
        recordedAt: at,
        recordedBy: p.actor,
      });
    return {
      ...state,
      enrollment: attachEnrollmentEvidence(enrollment, {
        evidenceKey: markerKey,
        subjectType: 'order',
        subjectKey: orderKey,
        evidenceType: 'ingress_admission',
        sourceReferenceKey: null,
        evidenceSha256: fingerprint,
        observedAt: at,
        recordedAt: at,
        recordedBy: actor,
      }),
    };
  }
  // Unverified intake never claims a native funding alias or mutates a prior
  // enrollment. Its quarantined canonical order has no seats or entitlements.
  function quarantine(
    reasonCode: string,
    ownerRole: 'enrollment_operator' | 'finance_operator' | 'owner_admin',
  ): EnrollmentIngressResult {
    const identity = hash([e.intakeKey, fingerprint, reasonCode]);
    const orderKey = `intake-hold:${identity}`;
    if (original.enrollment.orders[orderKey])
      return { ...original, orderKey, disposition: 'duplicate' };
    let enrollment = captureOrder(original.enrollment, {
      orderKey,
      sourceChannel: e.channel,
      offerKey: null,
      bundleKey: null,
      bundleVersion: null,
      payerPartyId: null,
      seatCount: e.commercial.seatCount,
      financialClassification: 'unverified',
      policyRevision: 1,
      evidenceSha256: fingerprint,
      effectiveAt: null,
      createdAt: at,
      updatedAt: at,
      updatedBy: actor,
      sourceReference: {
        sourceScope: 'enrollment_intake',
        sourceObjectType: 'quarantine',
        sourceObjectId: identity,
        idempotencyKey: `intake-hold:${identity}`,
        evidenceSha256: fingerprint,
        observedAt: at,
        recordedAt: at,
        recordedBy: actor,
      },
    }).state;
    enrollment = openEnrollmentException(enrollment, {
      exceptionKey: `${orderKey}:exception`,
      subjectType: 'order',
      subjectKey: orderKey,
      reasonCode,
      severity: 'high',
      ownerRole,
      evidenceSha256: fingerprint,
      reviewAt: at,
      actor,
      occurredAt: at,
    });
    let result = { enrollment, capacity: original.capacity };
    if (!marker) result = recordMarker(result, orderKey);
    return { ...result, orderKey, disposition: 'held' };
  }
  if (marker) return quarantine('intake_key_conflict', 'owner_admin');
  if (e.channel === 'migration_or_correction')
    return quarantine('correction_requires_resolution', 'owner_admin');
  const grant =
    e.channel === 'scholarship' || e.channel === 'complimentary_owner_grant';
  const fundingRoles: EnrollmentIngressProof['role'][] = grant
    ? ['owner_admin']
    : ['check_ach_or_wire', 'sponsored_cohort'].includes(e.channel)
      ? ['finance_operator']
      : ['source_adapter', 'finance_operator'];
  const fundingProof = proof('funding', e.funding.proofKey, fundingRoles);
  if (!fundingProof || Date.parse(e.funding.effectiveAt) > Date.parse(at))
    return quarantine(
      'funding_evidence_unverified',
      grant ? 'owner_admin' : 'finance_operator',
    );
  const commercialRoles: EnrollmentIngressProof['role'][] = grant
    ? ['owner_admin']
    : ['website_stripe_checkout', 'plutio_invoice_or_contract'].includes(
          e.channel,
        )
      ? ['source_adapter', 'enrollment_operator', 'owner_admin']
      : ['enrollment_operator', 'owner_admin'];
  const commercialProof = proof(
    'commercial',
    e.commercial.proofKey,
    commercialRoles,
  );
  if (!commercialProof || e.seats.length !== e.commercial.seatCount)
    return quarantine('commercial_evidence_unverified', 'enrollment_operator');

  const canonical = e.funding.source;
  const nativeAliases = [canonical, ...e.funding.aliases];
  if (
    !nativeAliases.some((r) => sameRef(r, e.sourceAlias)) ||
    nativeAliases.some((r) => !financialAlias(r, canonical))
  )
    return quarantine('source_alias_unverified', 'finance_operator');
  const orderKey = `bookkeeper:${refId(canonical)}`;
  const intakeRef: Ref = {
    scope: 'enrollment_intake',
    objectType: 'request',
    objectId: e.intakeKey,
  };
  const aliases = [
    ...new Map(
      [...nativeAliases, intakeRef].map((r) => [refId(r), r]),
    ).values(),
  ];
  for (const alias of aliases) {
    const prior = Object.values(original.enrollment.sourceReferences).find(
      (r) =>
        r.sourceScope === alias.scope &&
        r.sourceObjectType === alias.objectType &&
        r.sourceObjectId === alias.objectId,
    );
    if (prior && prior.orderKey !== orderKey)
      return quarantine('source_alias_conflict', 'owner_admin');
  }
  const participantRoles: EnrollmentIngressProof['role'][] = [
    'website_stripe_checkout',
    'plutio_invoice_or_contract',
  ].includes(e.channel)
    ? ['source_adapter', 'enrollment_operator', 'owner_admin']
    : ['enrollment_operator', 'owner_admin'];
  const invalidAssignments = new Set<number>();
  let participantEvidenceMissing = false;
  const receipt: BookkeeperFundingReceipt = {
    version: 1,
    sourceChannel: e.channel,
    source: {
      ...canonical,
      evidenceSha256: hash(canonicalFunding(e)),
      effectiveAt: e.funding.effectiveAt,
    },
    offerKey: e.commercial.offerKey,
    payerPartyId: e.funding.payerPartyId,
    seatCount: e.commercial.seatCount,
    seatCountEvidenceSha256: commercialProof.payloadSha256,
    funding: {
      kind:
        e.funding.status === 'settled'
          ? 'settled_payment'
          : e.funding.status === 'grant'
            ? 'owner_grant'
            : 'unverified',
      amountMinor: e.funding.amountMinor,
      currency: e.funding.currency,
      agreedAmountMinor: e.commercial.totalMinor,
      agreedCurrency: e.commercial.currency,
      evidenceSha256: hash(canonicalFunding(e)),
      confirmedBy: fundingProof.actor,
      confirmerRole:
        fundingProof.role as BookkeeperFundingReceipt['funding']['confirmerRole'],
    },
    seats: e.seats.map((seat, index) => {
      const personProof = proof(
        'participant',
        seat.proofKey,
        participantRoles,
        index,
      );
      const assignmentProof = seat.assignment
        ? proof(
            'assignment',
            seat.assignment.proofKey,
            ['enrollment_operator', 'owner_admin'],
            index,
          )
        : undefined;
      if (!personProof) participantEvidenceMissing = true;
      if (seat.assignment && !assignmentProof) invalidAssignments.add(index);
      const usablePerson = personProof && !invalidAssignments.has(index);
      return {
        participantPartyId: usablePerson ? seat.participantPartyId : null,
        participantEvidenceSha256: usablePerson
          ? personProof.payloadSha256
          : null,
        payerRelationship: usablePerson ? seat.payerRelationship : 'unknown',
        assignment:
          seat.assignment && assignmentProof
            ? {
                poolKey: seat.assignment.poolKey,
                componentKey: seat.assignment.componentKey,
                evidenceSha256: assignmentProof.payloadSha256,
              }
            : null,
      };
    }),
  };
  if (
    original.enrollment.orders[orderKey] &&
    original.enrollment.evidence[`${orderKey}:admission`]?.evidenceSha256 !==
      hash(receipt) &&
    (participantEvidenceMissing || invalidAssignments.size > 0)
  )
    return quarantine(
      invalidAssignments.size
        ? 'assignment_evidence_unverified'
        : 'participant_evidence_unverified',
      'enrollment_operator',
    );
  const applied = applyBookkeeperFundingReceipt(original, receipt, {
    ...host.catalog,
    acceptedReceiptSha256: hash(receipt),
  });
  // Bookkeeper can reject canonical source identity. Do not bind provider aliases
  // in that case, even though a canonical owned exception was returned.
  if (
    Object.values(applied.enrollment.exceptions).some(
      (x) =>
        x.subjectKey === applied.orderKey &&
        [
          'source_identity_invalid',
          'source_unverified',
          'duplicate_source_conflict',
        ].includes(x.reasonCode),
    )
  )
    return {
      ...recordMarker(applied, applied.orderKey),
      orderKey: applied.orderKey,
      disposition: 'held',
    };
  let enrollment = applied.enrollment;
  for (const index of invalidAssignments) {
    const seat = Object.values(enrollment.seats).find(
      (s) => s.orderKey === applied.orderKey && s.seatNumber === index + 1,
    );
    if (seat)
      enrollment = openEnrollmentException(enrollment, {
        exceptionKey: `${markerKey}:assignment:${index + 1}`,
        subjectType: 'seat',
        subjectKey: seat.seatKey,
        reasonCode: 'assignment_evidence_unverified',
        severity: 'high',
        ownerRole: 'enrollment_operator',
        evidenceSha256: fingerprint,
        reviewAt: at,
        actor,
        occurredAt: at,
      });
  }
  for (const alias of aliases) {
    if (sameRef(alias, canonical)) continue;
    enrollment = linkSourceReference(enrollment, {
      orderKey: applied.orderKey,
      expectedOrderVersion: enrollment.orders[applied.orderKey].version,
      reference: {
        sourceScope: alias.scope,
        sourceObjectType: alias.objectType,
        sourceObjectId: alias.objectId,
        idempotencyKey: `ingress-alias:${refId(alias)}`,
        evidenceSha256:
          alias.scope === 'enrollment_intake'
            ? fingerprint
            : fundingProof.payloadSha256,
        observedAt: at,
        recordedAt: at,
        recordedBy: actor,
      },
    });
  }
  const result = recordMarker(
    { enrollment, capacity: applied.capacity },
    applied.orderKey,
  );
  const held = Object.values(enrollment.exceptions).some(
    (x) =>
      ['open', 'acknowledged'].includes(x.state) &&
      (x.subjectKey === applied.orderKey ||
        enrollment.seats[x.subjectKey]?.orderKey === applied.orderKey),
  );
  return {
    ...result,
    orderKey: applied.orderKey,
    disposition: held ? 'held' : 'accepted',
  };
}
