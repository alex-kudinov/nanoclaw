import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import {
  bookkeeperContractHash as hash,
  type BookkeeperEnrollmentState,
} from './bookkeeper-enrollment-contract.js';
import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import type { CheckoutAdmissionEvidenceRow } from './payment-checkout-admission-store.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentAttempt,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentMethodBinding } from './payment-method-reconciliation-store.js';
import {
  decidePaymentReadiness,
  type PaymentReadinessPolicy,
} from './payment-readiness.js';
import { claimEnrollmentWriter } from './student-enrollment-admission.js';
import {
  assignParticipant,
  attachEnrollmentEvidence,
  captureOrder,
  createSeats,
  linkSourceReference,
  materializeEnrollment,
  recordFinancialAgreement,
  recordFinancialObligation,
  type EnrollmentFoundationState,
} from './student-enrollment-foundation.js';
import { persistEnrollmentDecision } from './student-enrollment-store.js';
import { guardEnrollmentStore } from './student-enrollment-store-mapping.js';
import type { ProjectionDatabaseGuard } from './student-enrollment-projection-store.js';

const actor = 'website-checkout-enrollment-adapter:host';
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const routeSchema = z
  .object({
    offer_key: ref,
    content_locale: z.string().regex(/^[a-z]{2}(?:-(?:[A-Z]{2}|[0-9]{3}))?$/),
    active: z.literal(true),
    pricing_authority: z
      .object({
        authority: z.literal('wordpress_quote_v1'),
        base_amount_minor: z.number().int().positive(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        regional_policy_reference: ref.nullable(),
        locale_infers_country: z.literal(false),
      })
      .strict(),
    entitlement: z
      .object({
        catalog_revision: z.number().int().positive(),
        bundle_key: ref,
        bundle_version: z.number().int().positive(),
        component_key: ref,
        enrollment_scope: z.literal('standalone_course'),
      })
      .strict(),
    delivery: z
      .object({
        mode: z.literal('self_paced'),
        scheduling_model: z.literal('self_paced'),
        marker_policy: z.literal('none'),
        requires_cohort_selection: z.literal(false),
        heartbeat: z.object({}).passthrough(),
      })
      .strict(),
    certificate: z
      .object({
        preset_key: z.literal('mcs-foundation'),
        campaign_key: z.literal('mcs-foundation@v1'),
        campaign_id: uuid,
        detail_id: uuid,
        native_identity_verified: z.literal(true),
        locale_academic_mapping_verified: z.literal(false),
        publication_status: z.literal('held'),
      })
      .strict(),
  })
  .strict();
const sharedPublication = {
  schema_version: z.literal(1),
  publication_revision: z.number().int().positive(),
  population_keys: z.array(ref).min(1).max(100),
  source_versions: z.record(z.string(), z.string()),
  source_sha256: z.record(z.string(), digest),
  routes: z.array(routeSchema).min(1).max(100),
  resolution_profile: z
    .object({
      required_identity_fields: z.tuple([
        z.literal('offer'),
        z.literal('locale'),
      ]),
      shared_provider_identity_selects_route: z.literal(false),
      mismatch: z.literal('hold'),
      unknown: z.literal('hold'),
      incomplete: z.literal('hold'),
    })
    .strict(),
  evidence_limits: z
    .object({
      group_course_attachment_verified: z.boolean(),
      learner_access_verified: z.literal(false),
      progress_verified: z.literal(false),
      completion_verified: z.literal(false),
      foundations_certificate_outcome_verified: z.literal(false),
      runtime_consumer_enabled: z.literal(false),
    })
    .strict(),
  payload_sha256: digest,
} as const;
const testPublicationSchema = z
  .object({
    ...sharedPublication,
    publication_id: z.literal('student-foundations-publication-v1'),
    profile: z.literal('foundations-test'),
    coverage_state: z.literal('staged'),
  })
  .strict();
const livePublicationSchema = z
  .object({
    ...sharedPublication,
    publication_id: z.literal('student-foundations-publication-v1'),
    profile: z.literal('foundations-production-candidate'),
    coverage_state: z.literal('verified_candidate'),
  })
  .strict();
const publicationSchema = z.union([
  testPublicationSchema,
  livePublicationSchema,
]);
type Publication = z.infer<typeof publicationSchema>;
type Route = Publication['routes'][number];

type MethodRow = PaymentMethodBinding & {
  operationId: string | null;
  sourceKind: 'session_result' | 'card_scope_webhook';
  sourceEventId: string | null;
};
type ProjectionRow = { projection: CheckoutPaymentEvidence; version: number };
type IdentityRow = {
  caller: string;
  preparation_id: string;
  origin_operation_id: string;
  receipt_reference: string;
  offer_key: string;
  source_sha256: string;
  payer_party_id: string;
  participant_party_id: string;
  payer_reference: string;
  participant_reference: string;
  payer_role_proof: string;
  participant_role_proof: string;
  purchase_relationship: 'self' | 'other';
};
type ConsumedRow = {
  scope_sha256: string;
  attempt_id: string;
  checkout_caller: string;
  checkout_operation_id: string;
  checkout_evidence_reference: string;
  identity_receipt_reference: string;
  payment_reference: string;
  payment_method: 'card' | 'ach_direct_debit';
  method_operation_id: string | null;
  method_source_kind: 'session_result' | 'card_scope_webhook';
  method_event_id: string | null;
  method_evidence_sha256: string;
  payment_projection_version: number;
  payment_projection_sha256: string;
  publication_id: string;
  publication_revision: number;
  publication_payload_sha256: string;
  offer_key: string;
  content_locale: string;
  bundle_key: string;
  component_key: string;
  order_key: string;
  seat_key: string;
  enrollment_key: string;
  financial_evidence_sha256: string;
  admission_evidence_sha256: string;
  evidence_reference: string;
  state: 'provisional_materialized';
  materialized_at: string;
};

export interface WebsiteCheckoutEnrollmentResult {
  disposition: 'accepted' | 'duplicate' | 'held';
  orderKey: string;
  canonicalEnrollment: 'materialized' | 'not_materialized';
  accessDelivery: 'not_requested' | 'queued' | 'membership_verified' | 'held';
  certificateFinancialClearance: 'not_evaluated';
  currentPaymentState: 'eligible' | 'pending' | 'needs_review';
  reasons: string[];
  evidenceReference: string | null;
}

export interface WebsiteCheckoutPublicationPin {
  publicationId: 'student-foundations-publication-v1';
  publicationRevision: number;
  payloadSha256: string;
}

export interface WebsiteCheckoutPublicationActivationReceipt {
  schemaVersion: 1;
  environment: 'live';
  status: 'accepted';
  caller: 'tandem-wordpress-live';
  publicationId: 'student-foundations-publication-v1';
  publicationRevision: number;
  publicationPayloadSha256: string;
  offerLocale: 'mcq-program-a-foundations:en-US';
  decisionReference: string;
  approvedAt: string;
  receiptSha256: string;
}

export type WebsiteCheckoutEnrollmentRuntimeProfile =
  | { environment: 'test'; activationReceipt?: never }
  | {
      environment: 'live';
      activationReceipt: WebsiteCheckoutPublicationActivationReceipt;
    };

export function websiteCheckoutPublicationVersions(input: {
  publicationId: string;
  publicationRevision: number;
  checkoutSourceVersion: string;
  offerKey: string;
  bundleKey: string;
  bundleVersion: number;
}) {
  if (
    input.publicationId !== 'student-foundations-publication-v1' ||
    !Number.isInteger(input.publicationRevision) ||
    input.publicationRevision < 1 ||
    !ref.safeParse(input.checkoutSourceVersion).success ||
    !ref.safeParse(input.offerKey).success ||
    !ref.safeParse(input.bundleKey).success ||
    !Number.isInteger(input.bundleVersion) ||
    input.bundleVersion < 1
  )
    throw new PaymentDomainError('invalid_website_adapter_configuration');
  return Object.freeze({
    catalogVersion: input.checkoutSourceVersion,
    bundleVersion: `${input.bundleKey}:revision-${input.bundleVersion}`,
    deliveryVersion: `publication:${input.publicationId}:r${input.publicationRevision}:${input.offerKey}`,
  });
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

function publicationPayloadHash(publication: Publication): string {
  const { payload_sha256: _digest, ...payload } = publication;
  const calculated = hash(payload);
  ensure(
    calculated === publication.payload_sha256,
    'publication_hash_conflict',
  );
  return calculated;
}

export function websiteCheckoutActivationReceiptHash(
  receipt: Omit<WebsiteCheckoutPublicationActivationReceipt, 'receiptSha256'>,
): string {
  return hash(receipt);
}

function validLiveActivation(
  caller: string,
  publication: Publication,
  receipt: WebsiteCheckoutPublicationActivationReceipt | undefined,
): boolean {
  if (
    publication.publication_id !== 'student-foundations-publication-v1' ||
    publication.profile !== 'foundations-production-candidate' ||
    publication.coverage_state !== 'verified_candidate' ||
    publication.population_keys.length !== 1 ||
    publication.population_keys[0] !== 'mcq-program-a-foundations' ||
    publication.routes.length !== 1 ||
    publication.routes[0].offer_key !== 'mcq-program-a-foundations' ||
    publication.routes[0].content_locale !== 'en-US' ||
    publication.evidence_limits.group_course_attachment_verified !== true ||
    publication.evidence_limits.runtime_consumer_enabled !== false ||
    !receipt
  )
    return false;
  const { receiptSha256, ...payload } = receipt;
  return (
    receipt.schemaVersion === 1 &&
    receipt.environment === 'live' &&
    receipt.status === 'accepted' &&
    receipt.caller === caller &&
    caller === 'tandem-wordpress-live' &&
    receipt.publicationId === publication.publication_id &&
    receipt.publicationRevision === publication.publication_revision &&
    receipt.publicationPayloadSha256 === publication.payload_sha256 &&
    receipt.offerLocale === 'mcq-program-a-foundations:en-US' &&
    ref.safeParse(receipt.decisionReference).success &&
    Number.isFinite(Date.parse(receipt.approvedAt)) &&
    receiptSha256 === websiteCheckoutActivationReceiptHash(payload)
  );
}

export class WebsiteCheckoutEnrollmentAdapter {
  private readonly scopeHash: string;
  private readonly publication: Publication;
  private readonly publicationHash: string;
  private readonly routes: ReadonlyMap<string, Route>;
  private readonly policy: PaymentReadinessPolicy;

  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly caller: string,
    scope: PaymentScope,
    publication: unknown,
    publicationPin: WebsiteCheckoutPublicationPin,
    cardCaptureConfigurationEvidence: string | null,
    private readonly attributionRequired = false,
    runtimeProfile: WebsiteCheckoutEnrollmentRuntimeProfile = {
      environment: 'test',
    },
    private readonly enrollmentDatabaseGuard: ProjectionDatabaseGuard = guardEnrollmentStore,
    private readonly excludedFulfillmentAttemptIds: ReadonlySet<string> = new Set(),
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    const parsed = publicationSchema.safeParse(publication);
    if (
      !parsed.success ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      scope.provider !== 'adyen' ||
      scope.environment !== runtimeProfile.environment ||
      scope.store === null ||
      publicationPin.publicationId !== parsed.data.publication_id ||
      publicationPin.publicationRevision !== parsed.data.publication_revision ||
      publicationPin.payloadSha256 !== parsed.data.payload_sha256 ||
      typeof attributionRequired !== 'boolean' ||
      excludedFulfillmentAttemptIds.size > 100 ||
      [...excludedFulfillmentAttemptIds].some(
        (attemptId) => !uuid.safeParse(attemptId).success,
      ) ||
      (runtimeProfile.environment === 'live' &&
        enrollmentDatabaseGuard === guardEnrollmentStore) ||
      (cardCaptureConfigurationEvidence !== null &&
        !ref.safeParse(cardCaptureConfigurationEvidence).success) ||
      (runtimeProfile.environment === 'test'
        ? parsed.data.publication_id !== 'student-foundations-publication-v1' ||
          parsed.data.profile !== 'foundations-test' ||
          parsed.data.coverage_state !== 'staged' ||
          parsed.data.evidence_limits.group_course_attachment_verified !== false
        : !validLiveActivation(
            caller,
            parsed.data,
            runtimeProfile.activationReceipt,
          ))
    )
      throw new PaymentDomainError('invalid_website_adapter_configuration');
    this.publication = Object.freeze(structuredClone(parsed.data));
    this.publicationHash = publicationPayloadHash(this.publication);
    this.routes = new Map(
      this.publication.routes.map((route) => [
        `${route.offer_key}\0${route.content_locale}`,
        route,
      ]),
    );
    ensure(
      this.routes.size === this.publication.routes.length &&
        JSON.stringify(
          [...this.routes.values()].map((route) => route.offer_key),
        ) === JSON.stringify(this.publication.population_keys),
      'invalid_website_adapter_configuration',
    );
    this.policy = Object.freeze({
      achAccess: 'verified_acceptance_provisional',
      achCertificate: 'received_funds_required',
      cardAccess: 'verified_authorization_and_auto_capture',
      cardCaptureConfigurationEvidence,
    });
  }

  private orderKey(attempt: PaymentAttempt): string {
    return `website-checkout:${hash([this.scopeHash, attempt.quote.quoteId])}`;
  }

  private async currentEvidence(
    client: PoolClient,
    attempt: PaymentAttempt,
  ): Promise<{
    method: MethodRow | null;
    projection: ProjectionRow | null;
    readiness: ReturnType<typeof decidePaymentReadiness>;
  }> {
    const methodRows = await client.query<{
      attempt_id: string;
      payment_reference: string;
      method: 'card' | 'ach_direct_debit';
      evidence_sha256: string;
      operation_id: string | null;
      source_kind: 'session_result' | 'card_scope_webhook';
      source_event_id: string | null;
    }>(
      `SELECT attempt_id,payment_reference,method,evidence_sha256,operation_id,
         source_kind,source_event_id
       FROM business_v2.payment_method_bindings
       WHERE scope_sha256=$1 AND attempt_id=$2`,
      [this.scopeHash, attempt.attemptId],
    );
    const projectionRows = await client.query<ProjectionRow>(
      `SELECT projection,version FROM business_v2.payment_checkout_evidence
       WHERE attempt_id=$1`,
      [attempt.attemptId],
    );
    const retryExceptions = await client.query<{ reason: string }>(
      `SELECT DISTINCT reason FROM business_v2.payment_session_retry_exceptions
       WHERE attempt_id=$1`,
      [attempt.attemptId],
    );
    const method =
      methodRows.rowCount === 1
        ? {
            attemptId: methodRows.rows[0].attempt_id,
            paymentReference: methodRows.rows[0].payment_reference,
            paymentMethod: methodRows.rows[0].method,
            evidenceSha256: methodRows.rows[0].evidence_sha256,
            operationId: methodRows.rows[0].operation_id,
            sourceKind: methodRows.rows[0].source_kind,
            sourceEventId: methodRows.rows[0].source_event_id,
          }
        : null;
    const projection =
      projectionRows.rowCount === 1
        ? {
            ...projectionRows.rows[0],
            ...(retryExceptions.rowCount
              ? {
                  projection: {
                    ...projectionRows.rows[0].projection,
                    state: 'needs_review' as const,
                    exceptions: [
                      ...new Set([
                        ...projectionRows.rows[0].projection.exceptions,
                        ...retryExceptions.rows.map((row) => row.reason),
                      ]),
                    ].sort(),
                  },
                }
              : {}),
          }
        : null;
    const readiness = decidePaymentReadiness({
      attempt,
      evidence: projection?.projection ?? {
        state: 'no_payment_evidence',
        payments: [],
        exceptions: [],
        settlement: 'unproven',
        fulfillment: 'not_evaluated',
      },
      methodBinding: method,
      receivedFunds: null,
      policy: this.policy,
      accessAlreadyGranted: false,
    });
    return { method, projection, readiness };
  }

  private currentState(
    input: Awaited<ReturnType<typeof this.currentEvidence>>,
  ) {
    if (
      input.readiness.reasons.includes(
        'adverse_or_conflicting_payment_evidence',
      ) ||
      input.projection?.projection.state === 'needs_review'
    )
      return 'needs_review' as const;
    return input.readiness.courseAccess === 'eligible'
      ? ('eligible' as const)
      : ('pending' as const);
  }

  private async authority(
    client: PoolClient,
    attempt: PaymentAttempt,
  ): Promise<{
    checkout: CheckoutAdmissionEvidenceRow;
    identity: IdentityRow;
    route: Route | null;
    providerOperationId: string;
  } | null> {
    const checkoutRows = await client.query<CheckoutAdmissionEvidenceRow>(
      `SELECT * FROM business_v2.payment_checkout_admission_evidence
       WHERE scope_sha256=$1 AND caller=$2 AND attempt_id=$3 FOR UPDATE`,
      [this.scopeHash, this.caller, attempt.attemptId],
    );
    if (checkoutRows.rowCount !== 1) return null;
    const checkout = checkoutRows.rows[0];
    if (this.attributionRequired) {
      const attribution = await client.query(
        `SELECT 1 FROM business_v2.payment_checkout_attribution_admissions
         WHERE scope_sha256=$1 AND caller=$2 AND attempt_id=$3
           AND checkout_evidence_reference=$4 FOR UPDATE`,
        [
          this.scopeHash,
          this.caller,
          attempt.attemptId,
          checkout.evidence_reference,
        ],
      );
      ensure(
        attribution.rowCount === 1,
        'checkout_attribution_evidence_missing',
      );
    }
    ensure(
      checkout.quote_id === attempt.quote.quoteId &&
        checkout.quote_fingerprint === attempt.quoteFingerprint &&
        checkout.payer_reference === attempt.quote.payerReference &&
        checkout.participant_reference === attempt.quote.participantReference &&
        checkout.consent_bundle_receipt === attempt.quote.consentReceipt &&
        checkout.terms_version === attempt.quote.termsVersion &&
        Number(checkout.terms_accepted_at) === attempt.quote.acceptedAt,
      'checkout_admission_binding_conflict',
    );
    const identities = await client.query<IdentityRow>(
      `SELECT * FROM business_v2.payment_identity_preparations
       WHERE caller=$1 AND preparation_id=$2 AND origin_operation_id=$3
         AND receipt_reference=$4 FOR UPDATE`,
      [
        this.caller,
        checkout.identity_preparation_id,
        checkout.identity_origin_operation_id,
        checkout.identity_receipt_reference,
      ],
    );
    ensure(identities.rowCount === 1, 'checkout_identity_evidence_missing');
    const identity = identities.rows[0];
    ensure(
      identity.source_sha256 === this.scopeHash &&
        identity.offer_key === attempt.quote.offerKey &&
        identity.payer_reference === checkout.payer_reference &&
        identity.participant_reference === checkout.participant_reference &&
        identity.payer_role_proof === checkout.payer_role_proof &&
        identity.participant_role_proof === checkout.participant_role_proof &&
        identity.purchase_relationship === checkout.purchase_relationship,
      'checkout_admission_binding_conflict',
    );
    const route = this.routes.get(
      `${attempt.quote.offerKey}\0${attempt.quote.locale}`,
    );
    const operations = await client.query<{ operation_id: string }>(
      `SELECT operation_id FROM business_v2.payment_operations
       WHERE attempt_id=$1 AND state='session_available'
       ORDER BY session_sequence DESC LIMIT 1`,
      [attempt.attemptId],
    );
    ensure(operations.rowCount === 1, 'checkout_provider_operation_missing');
    return {
      checkout,
      identity,
      route: route ?? null,
      providerOperationId: operations.rows[0].operation_id,
    };
  }

  private async assertMethodOperationLineage(
    client: PoolClient,
    current: Awaited<ReturnType<typeof this.currentEvidence>>,
    providerOperationId: string,
  ): Promise<void> {
    if (!current.method) return;
    const lineage =
      current.method.sourceKind === 'session_result'
        ? await client.query(
            `SELECT 1 FROM business_v2.payment_session_result_operations
             WHERE operation_id=$1 AND payment_operation_id=$2
               AND attempt_id=$3 AND state='verified'`,
            [
              current.method.operationId,
              providerOperationId,
              current.method.attemptId,
            ],
          )
        : await client.query(
            `SELECT 1 FROM business_v2.payment_events
             WHERE scope_sha256=$1 AND event_id=$2 AND payment_operation_id=$3
               AND attempt_id=$4 AND fact->>'kind'='authorization'
               AND fact->>'success'='true'`,
            [
              this.scopeHash,
              current.method.sourceEventId,
              providerOperationId,
              current.method.attemptId,
            ],
          );
    ensure(lineage.rowCount === 1, 'checkout_provider_operation_mismatch');
  }

  private validateConsumed(
    state: BookkeeperEnrollmentState,
    consumed: ConsumedRow,
    attempt: PaymentAttempt,
    authority: NonNullable<Awaited<ReturnType<typeof this.authority>>>,
    current: Awaited<ReturnType<typeof this.currentEvidence>>,
  ): void {
    const order = state.enrollment.orders[consumed.order_key];
    const seat = state.enrollment.seats[consumed.seat_key];
    const enrollment = state.enrollment.enrollments[consumed.enrollment_key];
    ensure(
      consumed.scope_sha256 === this.scopeHash &&
        consumed.attempt_id === attempt.attemptId &&
        consumed.checkout_caller === this.caller &&
        consumed.checkout_operation_id === authority.checkout.operation_id &&
        consumed.checkout_evidence_reference ===
          authority.checkout.evidence_reference &&
        consumed.identity_receipt_reference ===
          authority.identity.receipt_reference &&
        consumed.offer_key === attempt.quote.offerKey &&
        consumed.content_locale === attempt.quote.locale &&
        current.method !== null &&
        consumed.payment_reference === current.method.paymentReference &&
        consumed.payment_method === current.method.paymentMethod &&
        consumed.method_operation_id === current.method.operationId &&
        consumed.method_source_kind === current.method.sourceKind &&
        consumed.method_event_id === current.method.sourceEventId &&
        consumed.method_evidence_sha256 === current.method.evidenceSha256 &&
        consumed.evidence_reference ===
          `enrollment-admission:v1:${consumed.admission_evidence_sha256}` &&
        order?.sourceChannel === 'website_checkout' &&
        order.offerKey === consumed.offer_key &&
        order.bundleKey === consumed.bundle_key &&
        order.evidenceSha256 === consumed.admission_evidence_sha256 &&
        seat?.orderKey === consumed.order_key &&
        enrollment?.orderKey === consumed.order_key &&
        enrollment.seatKey === consumed.seat_key &&
        enrollment.materializationSha256 ===
          consumed.admission_evidence_sha256 &&
        enrollment.participantPartyId ===
          Number(authority.identity.participant_party_id) &&
        Object.values(state.enrollment.sourceReferences).some(
          (reference) =>
            reference.orderKey === consumed.order_key &&
            reference.sourceScope === `adyen:${this.scopeHash}` &&
            reference.sourceObjectType === 'payment' &&
            reference.sourceObjectId === consumed.payment_reference,
        ) &&
        Object.values(state.enrollment.agreements).some(
          (agreement) =>
            agreement.orderKey === consumed.order_key &&
            agreement.state === 'active' &&
            agreement.evidenceSha256 === consumed.financial_evidence_sha256,
        ) &&
        Object.values(state.enrollment.obligations).some(
          (obligation) =>
            state.enrollment.agreements[obligation.agreementKey]?.orderKey ===
              consumed.order_key &&
            obligation.state === 'accepted_pending_receipt' &&
            obligation.evidenceSha256 === consumed.financial_evidence_sha256,
        ) &&
        [
          'registered_adyen_funding_source',
          'provider_acceptance_readiness',
        ].every((type) =>
          Object.values(state.enrollment.evidence).some(
            (evidence) =>
              evidence.subjectKey === consumed.order_key &&
              evidence.evidenceType === type &&
              evidence.evidenceSha256 === consumed.financial_evidence_sha256,
          ),
        ) &&
        Object.values(state.enrollment.entitlements).some(
          (entitlement) =>
            entitlement.enrollmentKey === consumed.enrollment_key &&
            entitlement.componentKey === consumed.component_key,
        ),
      'consumed_enrollment_evidence_conflict',
    );
  }

  async admit(attemptId: string): Promise<WebsiteCheckoutEnrollmentResult> {
    if (!uuid.safeParse(attemptId).success)
      throw new PaymentDomainError('invalid_attempt_identity');
    if (this.excludedFulfillmentAttemptIds.has(attemptId)) {
      return {
        disposition: 'held',
        orderKey: `website-checkout:excluded:${hash(attemptId)}`,
        canonicalEnrollment: 'not_materialized',
        accessDelivery: 'not_requested',
        certificateFinancialClearance: 'not_evaluated',
        currentPaymentState: 'needs_review',
        reasons: ['owner_test_fulfillment_excluded'],
        evidenceReference: null,
      };
    }
    let metadata: Omit<
      WebsiteCheckoutEnrollmentResult,
      'disposition' | 'orderKey'
    > = {
      canonicalEnrollment: 'not_materialized',
      accessDelivery: 'not_requested',
      certificateFinancialClearance: 'not_evaluated',
      currentPaymentState: 'pending',
      reasons: ['payment_evidence_pending'],
      evidenceReference: null,
    };
    const result = await persistEnrollmentDecision(
      this.pool,
      async (client, state) => {
        const attempts = await client.query<{ contract: unknown }>(
          'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
          [attemptId],
        );
        ensure(attempts.rowCount === 1, 'checkout_attempt_not_found');
        const attempt = validateAttempt(attempts.rows[0].contract);
        ensure(
          paymentScopeFingerprint(attempt.scope) === this.scopeHash,
          'checkout_admission_scope_denied',
        );
        const orderKey = this.orderKey(attempt);
        const authority = await this.authority(client, attempt);
        if (!authority)
          return { ...state, orderKey, disposition: 'held' as const };
        const current = await this.currentEvidence(client, attempt);
        await this.assertMethodOperationLineage(
          client,
          current,
          authority.providerOperationId,
        );
        const consumedRows = await client.query<ConsumedRow>(
          `SELECT * FROM business_v2.payment_enrollment_admissions
           WHERE scope_sha256=$1 AND attempt_id=$2 FOR UPDATE`,
          [this.scopeHash, attempt.attemptId],
        );
        if (consumedRows.rowCount) {
          ensure(
            consumedRows.rowCount === 1,
            'consumed_enrollment_evidence_conflict',
          );
          const consumed = consumedRows.rows[0];
          this.validateConsumed(state, consumed, attempt, authority, current);
          const currentPaymentState = this.currentState(current);
          metadata = {
            canonicalEnrollment: 'materialized',
            accessDelivery: 'not_requested',
            certificateFinancialClearance: 'not_evaluated',
            currentPaymentState,
            reasons:
              currentPaymentState === 'eligible'
                ? ['exact_enrollment_replay']
                : current.readiness.reasons,
            evidenceReference: consumed.evidence_reference,
          };
          return { ...state, orderKey, disposition: 'duplicate' as const };
        }
        if (
          !current.method ||
          !current.projection ||
          current.readiness.courseAccess !== 'eligible'
        ) {
          metadata = {
            ...metadata,
            currentPaymentState: this.currentState(current),
            reasons: current.readiness.reasons,
          };
          return { ...state, orderKey, disposition: 'held' as const };
        }
        const route = authority.route;
        const versions = route
          ? websiteCheckoutPublicationVersions({
              publicationId: this.publication.publication_id,
              publicationRevision: this.publication.publication_revision,
              checkoutSourceVersion:
                this.publication.source_versions.checkout_catalog,
              offerKey: route.offer_key,
              bundleKey: route.entitlement.bundle_key,
              bundleVersion: route.entitlement.bundle_version,
            })
          : null;
        if (
          !route ||
          !versions ||
          route.pricing_authority.base_amount_minor !==
            attempt.quote.originalAmount ||
          route.pricing_authority.currency !== attempt.quote.currency ||
          attempt.quote.catalogVersion !== versions.catalogVersion ||
          attempt.quote.bundleVersion !== versions.bundleVersion ||
          attempt.quote.deliveryVersion !== versions.deliveryVersion
        ) {
          metadata = {
            ...metadata,
            currentPaymentState: 'needs_review',
            reasons: ['checkout_catalog_binding_conflict'],
          };
          return { ...state, orderKey, disposition: 'held' as const };
        }
        const authorized = current.projection.projection.payments.filter(
          (payment) => payment.evidence.authorization === 'authorized',
        );
        const payment = authorized.find(
          (candidate) =>
            candidate.paymentReference === current.method?.paymentReference,
        );
        if (authorized.length !== 1 || !payment) {
          metadata = {
            ...metadata,
            currentPaymentState: 'needs_review',
            reasons: ['multiple_or_mismatched_provider_payments'],
          };
          return { ...state, orderKey, disposition: 'held' as const };
        }
        if (
          current.method.paymentMethod === 'ach_direct_debit' &&
          authority.checkout.mandate_version === null
        ) {
          metadata = {
            ...metadata,
            reasons: ['ach_mandate_evidence_required'],
          };
          return { ...state, orderKey, disposition: 'held' as const };
        }
        ensure(
          !state.enrollment.orders[orderKey],
          'checkout_order_identity_conflict',
        );
        const sourceScope = `adyen:${this.scopeHash}`;
        const psp = current.method.paymentReference;
        const source = {
          scope: sourceScope,
          objectType: 'payment',
          objectId: psp,
          sourceType: 'adyen_payment_acceptance_v1' as const,
        };
        if (
          !(await claimEnrollmentWriter(
            client,
            source,
            'website_checkout',
            'enrollment',
            'policy:mcs-foundations-v1',
            current.method.evidenceSha256,
            actor,
            new Date(await this.databaseNow(client)).toISOString(),
            [
              {
                channel: 'website_checkout',
                sourceType: 'adyen_payment_acceptance_v1',
                scope: sourceScope,
                objectType: 'payment',
              },
            ],
            this.enrollmentDatabaseGuard,
          ))
        ) {
          metadata = {
            ...metadata,
            currentPaymentState: 'needs_review',
            reasons: ['writer_ownership_conflict'],
          };
          return { ...state, orderKey, disposition: 'held' as const };
        }
        const occurredAtMs = await this.databaseNow(client);
        const occurredAt = new Date(occurredAtMs).toISOString();
        const projectionHash = hash(current.projection.projection);
        const financialDigest = hash({
          checkoutEvidence: authority.checkout.evidence_sha256,
          methodEvidence: current.method.evidenceSha256,
          projectionVersion: current.projection.version,
          projectionHash,
          publicationHash: this.publicationHash,
          cardCaptureConfigurationEvidence:
            current.method.paymentMethod === 'card'
              ? this.policy.cardCaptureConfigurationEvidence
              : null,
        });
        const admissionDigest = hash({
          attemptId: attempt.attemptId,
          quoteFingerprint: attempt.quoteFingerprint,
          identityReceipt: authority.identity.receipt_reference,
          financialDigest,
          route,
        });
        let enrollment = this.capture(
          state.enrollment,
          attempt,
          { ...authority, route },
          orderKey,
          admissionDigest,
          occurredAt,
        );
        enrollment = this.linkAliases(
          enrollment,
          attempt,
          orderKey,
          authority.providerOperationId,
          psp,
          sourceScope,
          admissionDigest,
          occurredAt,
        );
        const pspReferenceKey = `${sourceScope}:payment:${psp}`;
        for (const [key, type, digestValue, sourceReferenceKey] of [
          [
            `${orderKey}:checkout-admission`,
            'checkout_admission_evidence',
            authority.checkout.evidence_sha256,
            null,
          ],
          [
            `${orderKey}:identity-preparation`,
            'identity_preparation_evidence',
            hash([
              authority.identity.receipt_reference,
              authority.identity.payer_role_proof,
              authority.identity.participant_role_proof,
            ]),
            null,
          ],
          [
            `${orderKey}:catalog`,
            'catalog_binding',
            this.publicationHash,
            null,
          ],
          [
            `${orderKey}:registered-adyen-funding-source`,
            'registered_adyen_funding_source',
            financialDigest,
            pspReferenceKey,
          ],
          [
            `${orderKey}:provider-acceptance-readiness`,
            'provider_acceptance_readiness',
            financialDigest,
            pspReferenceKey,
          ],
        ] as const)
          enrollment = attachEnrollmentEvidence(enrollment, {
            evidenceKey: key,
            subjectType: 'order',
            subjectKey: orderKey,
            evidenceType: type,
            sourceReferenceKey,
            evidenceSha256: digestValue,
            observedAt: occurredAt,
            recordedAt: occurredAt,
            recordedBy: actor,
          });
        enrollment = recordFinancialAgreement(enrollment, {
          agreementKey: `${orderKey}:finance`,
          orderKey,
          expectedOrderVersion: enrollment.orders[orderKey].version,
          agreementType: 'paid_in_full',
          state: 'active',
          version: 0,
          evidenceSha256: financialDigest,
          actor,
          occurredAt,
        });
        enrollment = recordFinancialObligation(enrollment, {
          obligationKey: `${orderKey}:obligation`,
          agreementKey: `${orderKey}:finance`,
          expectedAgreementVersion: 0,
          sequenceNumber: 1,
          amountMinor: attempt.quote.finalAmount,
          currency: attempt.quote.currency,
          dueAt: occurredAt,
          state: 'accepted_pending_receipt',
          version: 0,
          evidenceSha256: financialDigest,
          actor,
          occurredAt,
        });
        const seatKey = `${orderKey}:seat:1`;
        const enrollmentKey = `${seatKey}:enrollment`;
        enrollment = createSeats(enrollment, {
          orderKey,
          expectedOrderVersion: enrollment.orders[orderKey].version,
          seatKeys: [seatKey],
          evidenceSha256: admissionDigest,
          actor,
          occurredAt,
        });
        enrollment = assignParticipant(enrollment, {
          seatKey,
          expectedSeatVersion: 0,
          participantPartyId: Number(authority.identity.participant_party_id),
          participantEvidenceSha256: hash(
            authority.identity.participant_role_proof,
          ),
          payerRelationship:
            authority.identity.purchase_relationship === 'self'
              ? 'self_purchase_explicit'
              : 'separate_payer',
          actor,
          occurredAt,
        });
        enrollment = materializeEnrollment(enrollment, {
          orderKey,
          expectedOrderVersion: enrollment.orders[orderKey].version,
          seatKey,
          expectedSeatVersion: 1,
          enrollmentKey,
          catalogRevision: route.entitlement.catalog_revision,
          enrollmentState: 'active',
          effectiveAt: null,
          materializationSha256: admissionDigest,
          components: [
            {
              entitlementKey: `${enrollmentKey}:component:1`,
              componentKey: route.entitlement.component_key,
              state: 'included',
            },
          ],
          actor,
          occurredAt,
        });
        const evidenceReference = `enrollment-admission:v1:${admissionDigest}`;
        await client.query(
          `INSERT INTO business_v2.payment_enrollment_admissions
           (scope_sha256,attempt_id,checkout_caller,checkout_operation_id,
            checkout_evidence_reference,identity_receipt_reference,
            payment_reference,payment_method,method_operation_id,
            method_source_kind,method_event_id,
            method_evidence_sha256,payment_projection_version,
            payment_projection_sha256,publication_id,publication_revision,
            publication_payload_sha256,offer_key,content_locale,bundle_key,
            component_key,order_key,seat_key,enrollment_key,
            financial_evidence_sha256,admission_evidence_sha256,
            evidence_reference,state,materialized_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
             'provisional_materialized',$28)`,
          [
            this.scopeHash,
            attempt.attemptId,
            this.caller,
            authority.checkout.operation_id,
            authority.checkout.evidence_reference,
            authority.identity.receipt_reference,
            psp,
            current.method.paymentMethod,
            current.method.operationId,
            current.method.sourceKind,
            current.method.sourceEventId,
            current.method.evidenceSha256,
            current.projection.version,
            projectionHash,
            this.publication.publication_id,
            this.publication.publication_revision,
            this.publicationHash,
            route.offer_key,
            route.content_locale,
            route.entitlement.bundle_key,
            route.entitlement.component_key,
            orderKey,
            seatKey,
            enrollmentKey,
            financialDigest,
            admissionDigest,
            evidenceReference,
            occurredAtMs,
          ],
        );
        metadata = {
          canonicalEnrollment: 'materialized',
          accessDelivery: 'not_requested',
          certificateFinancialClearance: 'not_evaluated',
          currentPaymentState: 'eligible',
          reasons: ['provisional_canonical_enrollment_materialized'],
          evidenceReference,
        };
        return {
          ...state,
          enrollment,
          orderKey,
          disposition: 'accepted' as const,
        };
      },
      this.enrollmentDatabaseGuard,
    );
    return {
      disposition: result.disposition,
      orderKey: result.orderKey,
      ...metadata,
    };
  }

  private async databaseNow(client: PoolClient): Promise<number> {
    return Number(
      (
        await client.query(
          'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now',
        )
      ).rows[0].now,
    );
  }

  private capture(
    state: EnrollmentFoundationState,
    attempt: PaymentAttempt,
    authority: NonNullable<Awaited<ReturnType<typeof this.authority>>> & {
      route: Route;
    },
    orderKey: string,
    admissionDigest: string,
    occurredAt: string,
  ) {
    return captureOrder(state, {
      orderKey,
      sourceChannel: 'website_checkout',
      offerKey: authority.route.offer_key,
      bundleKey: authority.route.entitlement.bundle_key,
      bundleVersion: authority.route.entitlement.bundle_version,
      payerPartyId: Number(authority.identity.payer_party_id),
      seatCount: 1,
      financialClassification: 'provider_accepted_provisional',
      policyRevision: 1,
      evidenceSha256: admissionDigest,
      effectiveAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      updatedBy: actor,
      sourceReference: {
        sourceScope: `adyen:${this.scopeHash}`,
        sourceObjectType: 'quote',
        sourceObjectId: attempt.quote.quoteId,
        idempotencyKey: `website-checkout:${this.scopeHash}:${attempt.quote.quoteId}`,
        evidenceSha256: attempt.quoteFingerprint,
        observedAt: occurredAt,
        recordedAt: occurredAt,
        recordedBy: actor,
      },
    }).state;
  }

  private linkAliases(
    original: EnrollmentFoundationState,
    attempt: PaymentAttempt,
    orderKey: string,
    providerOperationId: string,
    psp: string,
    scope: string,
    evidenceSha256: string,
    occurredAt: string,
  ) {
    let state = original;
    for (const [objectType, objectId] of [
      ['payment_attempt', attempt.attemptId],
      ['session_operation', providerOperationId],
      ['payment', psp],
    ])
      state = linkSourceReference(state, {
        orderKey,
        expectedOrderVersion: state.orders[orderKey].version,
        reference: {
          sourceScope: scope,
          sourceObjectType: objectType,
          sourceObjectId: objectId,
          idempotencyKey: `website-checkout:${scope}:${objectType}:${objectId}`,
          evidenceSha256,
          observedAt: occurredAt,
          recordedAt: occurredAt,
          recordedBy: actor,
        },
      });
    return state;
  }
}
