import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import {
  bookkeeperContractHash as hash,
  type BookkeeperEnrollmentState,
} from './bookkeeper-enrollment-contract.js';
import {
  claimEnrollmentWriter,
  createEnrollmentAdmission,
  type EnrollmentIssuer,
  type SignedEnrollmentStatement,
} from './student-enrollment-admission.js';
import type {
  EnrollmentIngressEnvelope,
  EnrollmentIngressResult,
} from './student-enrollment-ingress.js';
import { enrollmentIngressProofPayload } from './student-enrollment-ingress.js';
import {
  requestProjection,
  supersedeProjection,
} from './student-enrollment-foundation.js';
import {
  buildSupervisionPilotProjections,
  type ProjectionDestinationReadiness,
  type SupervisionProjectionSubject,
} from './student-enrollment-projection.js';
import {
  EnrollmentCommitUncertainError,
  persistEnrollmentDecisionWithGuard,
} from './student-enrollment-store.js';
import type { ReleaseIdentity } from './release-integrity.js';
import type { ResolvedStripePaymentSource } from './stripe-payment-source.js';

export const STUDENT_ENROLLMENT_PILOT_POLICY =
  'student_enrollment_supervision_inaugural_v1_one_event' as const;
export const STUDENT_ENROLLMENT_PILOT_MODE =
  'one_future_natural_event' as const;
export const STUDENT_ENROLLMENT_PILOT_POOL = 'supervision:2026-10-07' as const;
const OFFER = 'supervision-inaugural' as const;
const BUNDLE = 'coaching-supervision-mastery:v1' as const;
const COMPONENT = 'supervision.live-practicum' as const;
const ACCESS_GROUP = 'fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83' as const;
const LEGACY_WRITER_POLICY = 'legacy_student_roster_v1' as const;
const SHA256 = /^[0-9a-f]{64}$/;

export type EnrollmentPilotRefusalCode =
  | 'pilot_disabled'
  | 'event_before_activation'
  | 'event_identity_invalid'
  | 'population_not_selected'
  | 'native_evidence_incomplete'
  | 'participant_identity_unresolved'
  | 'projection_preflight_unready'
  | 'capacity_preflight_unready'
  | 'writer_owned_by_legacy'
  | 'one_event_budget_closed';

export class EnrollmentPilotRefusalError extends Error {
  constructor(public readonly code: EnrollmentPilotRefusalCode) {
    super(code);
    this.name = 'EnrollmentPilotRefusalError';
  }
}

export interface NativeStripeEnrollmentEvidence {
  account: 'tandem';
  eventId: string;
  eventType: 'payment_intent.succeeded' | 'checkout.session.completed';
  eventCreated: number;
  paymentIntentId: string;
  paymentIntentCreated: number;
  paymentIntentStatus: 'succeeded';
  amountMinor: number;
  amountReceivedMinor: number;
  currency: 'usd';
  purchasePath: 'tandem_payment_intent' | 'stripe_checkout_session';
  checkoutSessionId: string | null;
  checkoutPaymentStatus: 'paid' | null;
  checkoutMode: 'payment' | null;
  checkoutAmountMinor: number | null;
  discountMinor: number;
  discountCount: number;
  couponCode: string | null;
  pricingPolicy: 'standard';
  regionalPriceApplied: false;
  baseAmountMinor: 399600;
  originalAmountMinor: null;
  productId: string | null;
  priceId: string | null;
  quantity: 1;
  offerKey: 'supervision-inaugural';
  cohortProgram: 'supervision';
  cohortStart: '2026-10-07';
  chargeId: string;
  chargePaid: true;
  chargeAmountMinor: number;
  chargeCurrency: 'usd';
  chargeDisputed: false;
  amountRefundedMinor: 0;
  invoiceId: null;
  termsAccepted: true;
  termsVersion: '2026-09-06';
  connectedAccountTransfer: false;
  participantPartyId: number;
  participantEmail: string;
  participantName: string;
  observedAt: string;
  evidenceSha256: string;
}

export interface StudentEnrollmentPilotConfig {
  enabled: boolean;
  activationEpoch: string | null;
  expectedReleaseCommit: string | null;
  release: ReleaseIdentity;
  databaseName: 'nanoclaw_business';
  databaseRole: 'nanoclaw_admin';
  preflightReceiptSha256: string | null;
  markerGroupId: string | null;
  markerGroupName: 'class:supervision:live-practicum:2026-10-07:inaugural';
  providerEventKey: Uint8Array | null;
  providerReadKey: Uint8Array | null;
  ownerDecisionKey: Uint8Array | null;
  catalogEvidenceSha256: string;
  components: ReadonlyArray<{
    componentKey: string;
    state: 'included' | 'conditional' | 'earned_on_completion';
    requiresAssignment: boolean;
  }>;
  readiness: readonly ProjectionDestinationReadiness[];
}

export interface EnrollmentPilotRouteInput {
  payload: unknown;
  source: ResolvedStripePaymentSource;
}

export type EnrollmentPilotRouteResult =
  | { writer: 'legacy'; code: EnrollmentPilotRefusalCode }
  | {
      writer: 'uncertain';
      code: 'enrollment_commit_or_readback_uncertain';
      orderKey: string | null;
    }
  | {
      writer: 'enrollment';
      admission: EnrollmentIngressResult;
      evidence: NativeStripeEnrollmentEvidence;
      projections: SupervisionProjectionSubject;
    };

export type EnrollmentPilotEvidenceResolver = (
  input: EnrollmentPilotRouteInput,
) => Promise<NativeStripeEnrollmentEvidence>;

function secureKey(value: Uint8Array | null, label: string): Uint8Array {
  if (!value || value.byteLength < 32) throw new Error(`${label}_unconfigured`);
  return Buffer.from(value);
}

function assertProductionConfig(config: StudentEnrollmentPilotConfig): void {
  if (!config.enabled) return;
  if (
    config.release.mode !== 'release' ||
    !config.release.verified ||
    !config.release.codeRootMatchesRelease ||
    !config.release.commit ||
    config.release.commit !== config.expectedReleaseCommit
  )
    throw new Error('enrollment_pilot_release_unbound');
  if (
    !config.activationEpoch ||
    !Number.isFinite(Date.parse(config.activationEpoch)) ||
    !config.preflightReceiptSha256 ||
    !SHA256.test(config.preflightReceiptSha256) ||
    !config.markerGroupId ||
    !/^[0-9a-f-]{36}$/.test(config.markerGroupId) ||
    !SHA256.test(config.catalogEvidenceSha256)
  )
    throw new Error('enrollment_pilot_preflight_unbound');
  const fingerprints = [
    secureKey(config.providerEventKey, 'enrollment_pilot_event_key'),
    secureKey(config.providerReadKey, 'enrollment_pilot_read_key'),
    secureKey(config.ownerDecisionKey, 'enrollment_pilot_owner_key'),
  ].map((key) => createHash('sha256').update(key).digest('hex'));
  if (new Set(fingerprints).size !== fingerprints.length)
    throw new Error('enrollment_pilot_issuer_key_reuse');
  const required = config.readiness.filter(
    (entry) => entry.disposition === 'required',
  );
  if (
    required.length !== 2 ||
    required.some(
      (entry) =>
        !entry.reviewedAdapter ||
        !entry.permissionReady ||
        !entry.activationReady ||
        !entry.destinationKey,
    )
  )
    throw new EnrollmentPilotRefusalError('projection_preflight_unready');
}

function parsePayload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

export function assertNativePilotEvidence(
  input: EnrollmentPilotRouteInput,
  evidence: NativeStripeEnrollmentEvidence,
  activationEpoch: string,
): void {
  const payload = parsePayload(input.payload);
  if (
    evidence.account !== 'tandem' ||
    input.source.stripeAccount !== 'tandem' ||
    evidence.eventType !== input.source.eventType ||
    evidence.eventId !== payload.event_id ||
    evidence.eventId !== input.source.sourceEventId ||
    evidence.paymentIntentId !== input.source.paymentIntentId ||
    evidence.eventCreated !== Number(payload.event_created) ||
    evidence.eventCreated * 1000 < Date.parse(activationEpoch)
  )
    throw new EnrollmentPilotRefusalError('event_identity_invalid');
  if (
    !/^evt_[A-Za-z0-9_]+$/.test(evidence.eventId) ||
    !/^pi_[A-Za-z0-9_]+$/.test(evidence.paymentIntentId) ||
    !/^(ch|py)_[A-Za-z0-9_]+$/.test(evidence.chargeId) ||
    payload.payment_intent_id !== evidence.paymentIntentId
  )
    throw new EnrollmentPilotRefusalError('event_identity_invalid');
  const checkoutPathValid =
    evidence.purchasePath === 'tandem_payment_intent'
      ? evidence.eventType === 'payment_intent.succeeded' &&
        input.source.sourceObjectId === evidence.paymentIntentId &&
        evidence.checkoutSessionId === null &&
        evidence.checkoutPaymentStatus === null &&
        evidence.checkoutMode === null &&
        evidence.checkoutAmountMinor === null &&
        evidence.productId === null &&
        evidence.priceId === null
      : evidence.purchasePath === 'stripe_checkout_session' &&
        evidence.checkoutSessionId !== null &&
        /^cs_[A-Za-z0-9_]+$/.test(evidence.checkoutSessionId) &&
        evidence.checkoutPaymentStatus === 'paid' &&
        evidence.checkoutMode === 'payment' &&
        evidence.checkoutAmountMinor === 399600 &&
        evidence.productId === 'prod_UvqkpUONPWr8Bo' &&
        evidence.priceId === 'price_1Tvz3MA7hTBWpVVqhF708kPv';
  if (
    !checkoutPathValid ||
    evidence.paymentIntentStatus !== 'succeeded' ||
    evidence.amountMinor !== 399600 ||
    evidence.amountReceivedMinor !== 399600 ||
    evidence.currency !== 'usd' ||
    evidence.discountMinor !== 0 ||
    evidence.discountCount !== 0 ||
    evidence.couponCode !== null ||
    evidence.pricingPolicy !== 'standard' ||
    evidence.regionalPriceApplied ||
    evidence.baseAmountMinor !== 399600 ||
    evidence.originalAmountMinor !== null ||
    evidence.quantity !== 1 ||
    evidence.offerKey !== OFFER ||
    evidence.cohortProgram !== 'supervision' ||
    evidence.cohortStart !== '2026-10-07' ||
    evidence.invoiceId !== null ||
    !evidence.termsAccepted ||
    evidence.termsVersion !== '2026-09-06' ||
    evidence.connectedAccountTransfer ||
    !evidence.chargePaid ||
    evidence.chargeAmountMinor !== 399600 ||
    evidence.chargeCurrency !== 'usd' ||
    evidence.chargeDisputed ||
    evidence.amountRefundedMinor !== 0
  )
    throw new EnrollmentPilotRefusalError('population_not_selected');
  if (
    !Number.isSafeInteger(evidence.participantPartyId) ||
    evidence.participantPartyId < 1 ||
    !evidence.participantEmail.includes('@') ||
    !evidence.participantName.trim()
  )
    throw new EnrollmentPilotRefusalError('participant_identity_unresolved');
  if (!SHA256.test(evidence.evidenceSha256))
    throw new EnrollmentPilotRefusalError('native_evidence_incomplete');
}

function buildEnvelope(
  evidence: NativeStripeEnrollmentEvidence,
): EnrollmentIngressEnvelope {
  const scope = 'stripe:tandem';
  const source = {
    scope,
    objectType: 'payment_intent',
    objectId: evidence.paymentIntentId,
  };
  return {
    version: 1,
    intakeKey: `pilot:${evidence.eventId}`,
    channel: 'website_stripe_checkout',
    sourceAlias: source,
    funding: {
      source,
      aliases: [
        { scope, objectType: 'event', objectId: evidence.eventId },
        ...(evidence.checkoutSessionId
          ? [
              {
                scope,
                objectType: 'checkout_session',
                objectId: evidence.checkoutSessionId,
              },
            ]
          : []),
        { scope, objectType: 'charge', objectId: evidence.chargeId },
      ],
      status: 'settled',
      amountMinor: evidence.amountMinor,
      currency: 'USD',
      payerPartyId: evidence.participantPartyId,
      effectiveAt: new Date(evidence.paymentIntentCreated * 1000).toISOString(),
      proofKey: `proof:funding:${evidence.eventId}`,
    },
    commercial: {
      offerKey: OFFER,
      seatCount: 1,
      totalMinor: 399600,
      currency: 'USD',
      proofKey: `proof:commercial:${evidence.paymentIntentId}`,
    },
    seats: [
      {
        participantPartyId: evidence.participantPartyId,
        payerRelationship: 'self_purchase_explicit',
        proofKey: `proof:participant:${evidence.paymentIntentId}`,
        assignment: {
          poolKey: STUDENT_ENROLLMENT_PILOT_POOL,
          componentKey: COMPONENT,
          proofKey: `proof:assignment:${evidence.paymentIntentId}`,
        },
      },
    ],
  };
}

function sign(
  issuer: EnrollmentIssuer,
  envelope: EnrollmentIngressEnvelope,
  purpose: 'funding' | 'commercial' | 'participant' | 'assignment',
  payload: unknown,
  receiptId: string,
  proofKey: string,
  issuedAt: number,
): SignedEnrollmentStatement {
  const body = JSON.stringify({
    version: 1,
    audience: 'enrollment_admission_v1',
    issuerId: issuer.issuerId,
    transport: issuer.transport,
    channel: envelope.channel,
    receiptId,
    proofKey,
    purpose,
    issuedAt,
    expiresAt: issuedAt + 300_000,
    payload,
  });
  return {
    issuerId: issuer.issuerId,
    body,
    signature: createHmac('sha256', issuer.key).update(body).digest('hex'),
  };
}

export async function assertStudentEnrollmentProductionDatabase(
  client: PoolClient,
  config: StudentEnrollmentPilotConfig,
): Promise<void> {
  const identity = await client.query(
    'SELECT current_database() AS database, current_user AS role',
  );
  if (
    identity.rows[0]?.database !== config.databaseName ||
    identity.rows[0]?.role !== config.databaseRole
  )
    throw new Error('enrollment_pilot_database_identity_mismatch');
  const shape = await client.query(
    `SELECT
       to_regclass('business_v2.student_enrollment_writer_claims') IS NOT NULL AS claims,
       to_regclass('business_v2.student_enrollment_authenticated_receipts') IS NOT NULL AS receipts,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='business_v2' AND table_name='student_projection_outbox' AND column_name='version') AS outbox_version,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='business_v2' AND table_name='student_projection_outbox' AND column_name='target_idempotency_key') AS target_idempotency`,
  );
  if (
    !shape.rows[0]?.claims ||
    !shape.rows[0]?.receipts ||
    !shape.rows[0]?.outbox_version ||
    !shape.rows[0]?.target_idempotency
  )
    throw new Error('enrollment_pilot_schema_unready');
}

async function assertCapacityReady(client: PoolClient): Promise<void> {
  const result = await client.query(
    `SELECT occupancy.capacity, occupancy.available, occupancy.public_state,
            block.state AS block_state, mapping.state AS mapping_state,
            mapping.catalog_revision
       FROM business_v2.v_academy_seat_pool_occupancy occupancy
       JOIN business_v2.academy_seat_pools pool ON pool.pool_key=occupancy.pool_key
       JOIN business_v2.academy_delivery_blocks block ON block.id=pool.delivery_block_id
       JOIN business_v2.academy_seat_pool_offers mapping ON mapping.pool_id=pool.id
      WHERE occupancy.pool_key=$1 AND block.delivery_block_key=$1
        AND mapping.offer_key=$2`,
    [STUDENT_ENROLLMENT_PILOT_POOL, OFFER],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    Number(row.capacity) !== 15 ||
    Number(row.available) < 1 ||
    row.public_state !== 'open' ||
    row.block_state !== 'scheduled' ||
    row.mapping_state !== 'active' ||
    Number(row.catalog_revision) !== 1
  )
    throw new EnrollmentPilotRefusalError('capacity_preflight_unready');
}

async function claimLegacyWriter(
  pool: Pick<Pool, 'connect'>,
  config: StudentEnrollmentPilotConfig,
  evidence: NativeStripeEnrollmentEvidence,
  at: string,
): Promise<boolean> {
  const client = await pool.connect();
  let began = false;
  let committing = false;
  let discard = false;
  try {
    await assertStudentEnrollmentProductionDatabase(client, config);
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    began = true;
    const claimed = await claimEnrollmentWriter(
      client,
      {
        scope: 'stripe:tandem',
        objectType: 'payment_intent',
        objectId: evidence.paymentIntentId,
      },
      'legacy',
      LEGACY_WRITER_POLICY,
      evidence.evidenceSha256,
      'enrollment-pilot:legacy-route',
      at,
      (guarded) => assertStudentEnrollmentProductionDatabase(guarded, config),
    );
    committing = true;
    await client.query('COMMIT');
    began = false;
    committing = false;
    return claimed;
  } catch {
    if (committing) discard = true;
    if (began)
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
    return false;
  } finally {
    client.release(discard);
  }
}

function buildProjectionSubject(
  result: EnrollmentIngressResult,
  evidence: NativeStripeEnrollmentEvidence,
  markerGroupId: string,
): SupervisionProjectionSubject {
  const enrollment = Object.values(result.enrollment.enrollments).find(
    (item) => item.orderKey === result.orderKey,
  );
  const assignment = Object.values(result.enrollment.assignments).find(
    (item) => item.enrollmentKey === enrollment?.enrollmentKey,
  );
  if (!enrollment || !assignment)
    throw new Error('enrollment_pilot_materialization_missing');
  return {
    offerKey: OFFER,
    offerVersion: 1,
    fundingStatus: 'settled',
    payerRelationship: 'self_purchase_explicit',
    sourceAdmissionAuthenticated: true,
    openBlockingExceptions: Object.values(result.enrollment.exceptions).filter(
      (item) =>
        ['open', 'acknowledged'].includes(item.state) &&
        [
          result.orderKey,
          enrollment.enrollmentKey,
          assignment.assignmentKey,
        ].includes(item.subjectKey),
    ).length,
    enrollmentKey: enrollment.enrollmentKey,
    enrollmentVersion: enrollment.version,
    assignmentKey: assignment.assignmentKey,
    assignmentVersion: assignment.version,
    participantKey: `party:${evidence.participantPartyId}`,
    participantEmail: evidence.participantEmail,
    participantName: evidence.participantName,
    deliveryBlockKey: STUDENT_ENROLLMENT_PILOT_POOL,
    deliveryStartsAt: '2026-10-07T14:00:00.000Z',
    courseAccessGroupKey: ACCESS_GROUP,
    deliveryMarkerGroupKey: markerGroupId,
  };
}

function replacePreviewProjections(
  state: BookkeeperEnrollmentState,
  result: EnrollmentIngressResult,
  evidence: NativeStripeEnrollmentEvidence,
  config: StudentEnrollmentPilotConfig,
  occurredAt: string,
): EnrollmentIngressResult {
  if (result.disposition !== 'accepted') return result;
  let enrollment = result.enrollment;
  for (const projection of Object.values(enrollment.projections)) {
    if (
      projection.target === 'student_roster' &&
      projection.state === 'queued' &&
      projection.subjectType === 'enrollment'
    )
      enrollment = supersedeProjection(enrollment, {
        projectionKey: projection.projectionKey,
        evidenceSha256: config.preflightReceiptSha256!,
        reasonCode: 'production_target_contract',
        actor: 'enrollment-pilot:host',
        occurredAt,
      });
  }
  const current = { ...state, enrollment } as EnrollmentIngressResult;
  current.orderKey = result.orderKey;
  current.disposition = result.disposition;
  const subject = buildProjectionSubject(
    current,
    evidence,
    config.markerGroupId!,
  );
  for (const envelope of buildSupervisionPilotProjections(
    subject,
    config.readiness,
  ))
    enrollment = requestProjection(enrollment, {
      projectionKey: envelope.idempotencyKey,
      target: envelope.target,
      subjectType: envelope.subjectType,
      subjectKey: envelope.subjectKey,
      subjectVersion: envelope.subjectVersion,
      payload: envelope.payload,
      payloadSha256: envelope.payloadSha256,
      expectedReadbackSha256: envelope.expectedReadbackSha256,
      state: 'queued',
      version: 0,
      actor: 'enrollment-pilot:host',
      occurredAt,
    });
  return { ...result, enrollment };
}

export function createStudentEnrollmentProductionFacade(input: {
  pool: Pick<Pool, 'connect'>;
  config: StudentEnrollmentPilotConfig;
  resolveEvidence: EnrollmentPilotEvidenceResolver;
  clock?: () => number;
}) {
  const config = input.config;
  assertProductionConfig(config);
  const clock = input.clock ?? Date.now;
  const issuers: EnrollmentIssuer[] = config.enabled
    ? [
        {
          issuerId: 'stripe:tandem:event',
          actor: 'stripe:tandem',
          role: 'source_adapter',
          transport: 'provider_event',
          purposes: ['funding'],
          sourceScopes: ['stripe:tandem'],
          channels: ['website_stripe_checkout'],
          key: secureKey(config.providerEventKey, 'enrollment_pilot_event_key'),
        },
        {
          issuerId: 'stripe:tandem:read',
          actor: 'stripe:tandem',
          role: 'source_adapter',
          transport: 'provider_read',
          purposes: ['commercial', 'participant'],
          sourceScopes: ['stripe:tandem'],
          channels: ['website_stripe_checkout'],
          key: secureKey(config.providerReadKey, 'enrollment_pilot_read_key'),
        },
        {
          issuerId: 'owner:enrollment-pilot',
          actor: 'owner:alex-kudinov',
          role: 'owner_admin',
          transport: 'operator_decision',
          purposes: ['assignment'],
          sourceScopes: ['stripe:tandem'],
          channels: ['website_stripe_checkout'],
          key: secureKey(config.ownerDecisionKey, 'enrollment_pilot_owner_key'),
        },
      ]
    : [];

  return Object.freeze({
    status() {
      return {
        enabled: config.enabled,
        mode: STUDENT_ENROLLMENT_PILOT_MODE,
        policyKey: STUDENT_ENROLLMENT_PILOT_POLICY,
        activationEpoch: config.activationEpoch,
        releaseBound:
          config.enabled &&
          config.release.verified &&
          config.release.commit === config.expectedReleaseCommit,
        preflightsBound: Boolean(config.preflightReceiptSha256),
      };
    },
    async route(
      routeInput: EnrollmentPilotRouteInput,
    ): Promise<EnrollmentPilotRouteResult> {
      if (!config.enabled || !config.activationEpoch)
        return { writer: 'legacy', code: 'pilot_disabled' };
      const payload = parsePayload(routeInput.payload);
      if (
        Number(payload.event_created) * 1000 <
        Date.parse(config.activationEpoch)
      )
        return { writer: 'legacy', code: 'event_before_activation' };
      let evidence: NativeStripeEnrollmentEvidence | null = null;
      try {
        evidence = await input.resolveEvidence(routeInput);
        assertNativePilotEvidence(routeInput, evidence, config.activationEpoch);
      } catch (error) {
        if (error instanceof EnrollmentPilotRefusalError) {
          const current = evidence;
          if (
            [
              'population_not_selected',
              'participant_identity_unresolved',
            ].includes(error.code) &&
            current?.account === 'tandem' &&
            current.offerKey === OFFER &&
            current.eventCreated * 1000 >= Date.parse(config.activationEpoch)
          ) {
            const legacyClaimed = await claimLegacyWriter(
              input.pool,
              config,
              current,
              new Date(clock()).toISOString(),
            );
            if (!legacyClaimed)
              return {
                writer: 'uncertain',
                code: 'enrollment_commit_or_readback_uncertain',
                orderKey: null,
              };
          }
          return { writer: 'legacy', code: error.code };
        }
        return { writer: 'legacy', code: 'native_evidence_incomplete' };
      }
      if (!evidence)
        return { writer: 'legacy', code: 'native_evidence_incomplete' };
      const envelope = buildEnvelope(evidence);
      const readIssuer = issuers[1];
      const issuedAt = clock();
      const receiptId = (purpose: string) =>
        `receipt:${hash([purpose, evidence.eventId, issuedAt]).slice(0, 48)}`;
      const statements = [
        sign(
          issuers[0],
          envelope,
          'funding',
          enrollmentIngressProofPayload(envelope, 'funding', 0),
          receiptId('funding'),
          envelope.funding.proofKey,
          issuedAt,
        ),
        sign(
          readIssuer,
          envelope,
          'commercial',
          enrollmentIngressProofPayload(envelope, 'commercial', 0),
          receiptId('commercial'),
          envelope.commercial.proofKey,
          issuedAt,
        ),
        sign(
          readIssuer,
          envelope,
          'participant',
          enrollmentIngressProofPayload(envelope, 'participant', 0),
          receiptId('participant'),
          envelope.seats[0].proofKey!,
          issuedAt,
        ),
        sign(
          issuers[2],
          envelope,
          'assignment',
          enrollmentIngressProofPayload(envelope, 'assignment', 0),
          receiptId('assignment'),
          envelope.seats[0].assignment!.proofKey,
          issuedAt,
        ),
      ];
      const service = createEnrollmentAdmission({
        issuers,
        policyKey: STUDENT_ENROLLMENT_PILOT_POLICY,
        clock,
        catalog: {
          partyIds: [evidence.participantPartyId],
          offers: [
            {
              offerKey: OFFER,
              bundleKey: BUNDLE,
              bundleVersion: 1,
              catalogRevision: 1,
              evidenceSha256: config.catalogEvidenceSha256,
              components: config.components.map((component) => ({
                ...component,
              })),
            },
          ],
        },
        persistDecision: (pool, decide) =>
          persistEnrollmentDecisionWithGuard(
            pool,
            decide,
            (client) =>
              assertStudentEnrollmentProductionDatabase(client, config),
            async (client, result) => {
              if (result.disposition !== 'accepted') return;
              for (const projection of Object.values(
                result.enrollment.projections,
              )) {
                if (
                  projection.subjectType !== 'assignment' ||
                  projection.state !== 'queued'
                )
                  continue;
                const destination = config.readiness.find(
                  (entry) => entry.target === projection.target,
                )?.destinationKey;
                if (!destination)
                  throw new Error(
                    'enrollment_pilot_projection_destination_missing',
                  );
                const updated = await client.query(
                  `UPDATE business_v2.student_projection_outbox
                      SET target_idempotency_key=$1,destination_key=$2
                    WHERE projection_key=$1 AND target=$3
                      AND target_idempotency_key IS NULL AND destination_key IS NULL
                    RETURNING target_idempotency_key,destination_key`,
                  [projection.projectionKey, destination, projection.target],
                );
                if (
                  updated.rowCount !== 1 ||
                  updated.rows[0].target_idempotency_key !==
                    projection.projectionKey ||
                  updated.rows[0].destination_key !== destination
                )
                  throw new Error(
                    'enrollment_pilot_projection_identity_readback_mismatch',
                  );
              }
            },
          ),
        claimWriter: async (...args) => {
          const [client, source, writer, policyKey, evidenceSha256, actor, at] =
            args;
          await assertCapacityReady(client);
          await client.query(
            'LOCK TABLE business_v2.student_enrollment_writer_claims IN SHARE ROW EXCLUSIVE MODE',
          );
          const existing = await client.query(
            `SELECT writer,policy_key FROM business_v2.student_enrollment_writer_claims
              WHERE source_scope=$1 AND source_object_type=$2 AND source_object_id=$3`,
            [source.scope, source.objectType, source.objectId],
          );
          if (existing.rows[0]?.writer === 'legacy')
            throw new EnrollmentPilotRefusalError('writer_owned_by_legacy');
          if (existing.rowCount === 0) {
            const budget = await client.query(
              `SELECT count(*)::int AS count FROM business_v2.student_enrollment_writer_claims
                WHERE writer='enrollment' AND policy_key=$1`,
              [STUDENT_ENROLLMENT_PILOT_POLICY],
            );
            if (Number(budget.rows[0]?.count) >= 1)
              throw new EnrollmentPilotRefusalError('one_event_budget_closed');
          }
          return claimEnrollmentWriter(
            client,
            source,
            writer,
            policyKey,
            evidenceSha256,
            actor,
            at,
            (claimClient) =>
              assertStudentEnrollmentProductionDatabase(claimClient, config),
          );
        },
        finalizeDecision: async ({ result, occurredAt }) =>
          replacePreviewProjections(
            result,
            result,
            evidence,
            config,
            occurredAt,
          ),
      });
      const certificate = service.verify(envelope, statements);
      let admission: EnrollmentIngressResult;
      try {
        admission = await service.admit(input.pool, certificate);
      } catch (error) {
        if (error instanceof EnrollmentPilotRefusalError) {
          if (error.code !== 'writer_owned_by_legacy') {
            const legacyClaimed = await claimLegacyWriter(
              input.pool,
              config,
              evidence,
              new Date(clock()).toISOString(),
            );
            if (!legacyClaimed)
              return {
                writer: 'uncertain',
                code: 'enrollment_commit_or_readback_uncertain',
                orderKey: null,
              };
          }
          return { writer: 'legacy', code: error.code };
        }
        if (!(error instanceof EnrollmentCommitUncertainError))
          return {
            writer: 'legacy',
            code: 'native_evidence_incomplete',
          };
        // The only safe recovery is exact immutable intake replay. It either
        // reads the committed writer/order or applies the previously aborted
        // transaction; it never creates a new source identity.
        try {
          admission = await service.admit(input.pool, certificate);
        } catch {
          return {
            writer: 'uncertain',
            code: 'enrollment_commit_or_readback_uncertain',
            orderKey: null,
          };
        }
      }
      try {
        return {
          writer: 'enrollment',
          admission,
          evidence,
          projections: buildProjectionSubject(
            admission,
            evidence,
            config.markerGroupId!,
          ),
        };
      } catch {
        return {
          writer: 'uncertain',
          code: 'enrollment_commit_or_readback_uncertain',
          orderKey: admission.orderKey ?? null,
        };
      }
    },
  });
}

/** Compare opaque preflight receipts without logging either value. */
export function enrollmentPilotReceiptMatches(
  expected: string,
  actual: string,
): boolean {
  if (!SHA256.test(expected) || !SHA256.test(actual)) return false;
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(actual, 'hex'),
  );
}
