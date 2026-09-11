import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADYEN_TEST_REFERENCE_PREFIX,
  adyenTestAttemptReference,
} from './adyen-payment-identifiers.js';
import { standardWebhookSigningPayload } from './adyen-webhook.js';
import {
  createPaymentAttempt,
  paymentScopeFingerprint,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentEventStore } from './payment-event-store.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';
import {
  WebsiteCheckoutEnrollmentAdapter,
  type WebsiteCheckoutPublicationPin,
} from './website-checkout-enrollment-adapter.js';
import { bookkeeperContractHash as canonicalHash } from './bookkeeper-enrollment-contract.js';

const database = `nc_student_enrollment_store_${randomUUID().replaceAll('-', '')}`;
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 8,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let store: PaymentStore;
let events: PaymentEventStore;
let created = false;
const caller = 'tandem-wordpress-test';
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'company',
  merchant: 'merchant',
  store: 'store',
  endpointRegion: 'eu',
};
const scopeHash = paymentScopeFingerprint(scope);
const webhookKey = randomBytes(32).toString('hex');
const publication = JSON.parse(
  readFileSync(
    new URL(
      '../facts/generated/student-foundations-publication-v1.scoped.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const trustedPublicationPin = Object.freeze({
  publicationId: 'student-foundations-publication-v1',
  publicationRevision: 1,
  payloadSha256:
    '430f11c7cc8299621abb59b4ea0cca29209de6143277f6145d616060da22b9c0',
}) satisfies WebsiteCheckoutPublicationPin;
const trustedQuoteVersions = Object.freeze({
  catalogVersion: 'git:b9c6ab342f9491d820753ffb0d2f14df4d78479a',
  bundleVersion: 'mcs-foundations-en:v1:revision-1',
  deliveryVersion:
    'publication:student-foundations-publication-v1:r1:mcq-program-a-foundations',
});
const rotatedPublicationPin = Object.freeze({
  publicationId: 'student-foundations-publication-v1',
  publicationRevision: 1,
  payloadSha256:
    '5ef6f2985c0dab0039e271713f6446c630723203b53a78bfba9538c76129871c',
}) satisfies WebsiteCheckoutPublicationPin;
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const transaction: PaymentTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SET LOCAL ROLE nanoclaw_admin');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

type Fixture = Awaited<ReturnType<typeof seed>>;
let ordinal = 0;
async function seed(
  method: PaymentMethodCapability,
  options: {
    mandate?: boolean;
    secondPayment?: boolean;
    other?: boolean;
    catalogVersion?: string;
    bundleVersion?: string;
    deliveryVersion?: string;
    offerKey?: string;
    locale?: string;
    country?: string;
    quoteId?: string;
    originalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    paymentReference?: string;
    authorizationAmount?: number;
    authorizationCurrency?: string;
  } = {},
) {
  ordinal++;
  const now = Date.now() - 1000;
  const payerReference = `party-ref:v1:${ordinal.toString(16).padStart(64, '0')}`;
  const participantReference = options.other
    ? `party-ref:v1:${(ordinal + 1000).toString(16).padStart(64, '0')}`
    : payerReference;
  const attempt = createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: [method],
    quote: {
      schemaVersion: 1,
      quoteId: options.quoteId ?? randomUUID(),
      authority: 'wordpress:test',
      offerKey: options.offerKey ?? 'mcq-program-a-foundations',
      catalogVersion:
        options.catalogVersion ?? trustedQuoteVersions.catalogVersion,
      bundleVersion:
        options.bundleVersion ?? trustedQuoteVersions.bundleVersion,
      deliveryVersion:
        options.deliveryVersion ?? trustedQuoteVersions.deliveryVersion,
      locale: options.locale ?? 'en-US',
      country: options.country ?? 'US',
      payerReference,
      participantReference,
      currency: 'USD',
      originalAmount: options.originalAmount ?? 29900,
      discountAmount: options.discountAmount ?? 0,
      finalAmount: options.finalAmount ?? 29900,
      discountPolicyReference:
        (options.discountAmount ?? 0) > 0 ? 'latam-resident-v1' : null,
      redemptionReference:
        (options.discountAmount ?? 0) > 0
          ? `promotion-reservation:v1:${ordinal}`
          : null,
      paymentOption: 'one_time',
      termsVersion: 'terms-v1',
      consentReceipt: `consent-bundle:v1:${ordinal}`,
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 300000,
    },
  });
  await store.acceptAttempt(attempt);
  const providerOperationId = randomUUID();
  await store.prepareSession({
    attemptId: attempt.attemptId,
    operationId: providerOperationId,
    idempotencyKey: attempt.attemptId,
    request: JSON.stringify({
      reference: adyenTestAttemptReference(attempt.attemptId),
    }),
    retryWindowMs: 120000,
  });
  const dispatch = await store.acquireDispatch(providerOperationId);
  if (dispatch.decision !== 'dispatch') throw new Error('fixture dispatch');
  await store.finishDispatch({
    operationId: providerOperationId,
    leaseToken: dispatch.leaseToken,
    version: dispatch.version,
    result: 'session_available',
    response: JSON.stringify({
      id: `session-${attempt.attemptId}`,
      expiresAt: new Date(attempt.quote.expiresAt).toISOString(),
    }),
    sessionExpiresAt: attempt.quote.expiresAt,
  });
  const paymentReference =
    options.paymentReference ?? randomUUID().replaceAll('-', '').slice(0, 16);
  const methodOperationId = randomUUID();
  await transaction(async (client) => {
    const party = await client.query<{ id: string }>(
      `SELECT business_v2.fn_create_party('person',$1,$2::citext,'wordpress','{}'::jsonb)::text id`,
      [`Fixture ${ordinal}`, `fixture-${ordinal}@example.test`],
    );
    const payerInteraction = await client.query<{ id: string }>(
      `SELECT business_v2.fn_log_interaction_dedup($1,'form-submission','inbound',
       'fixture',$2::timestamptz,'{}'::jsonb,'wordpress',$3)::text id`,
      [party.rows[0].id, new Date(now).toISOString(), `identity-${ordinal}`],
    );
    let participantPartyId = party.rows[0].id;
    let participantInteractionId = payerInteraction.rows[0].id;
    if (options.other) {
      const participant = await client.query<{ id: string }>(
        `SELECT business_v2.fn_create_party('person',$1,$2::citext,'wordpress','{}'::jsonb)::text id`,
        [`Participant ${ordinal}`, `participant-${ordinal}@example.test`],
      );
      const participantInteraction = await client.query<{ id: string }>(
        `SELECT business_v2.fn_log_interaction_dedup($1,'form-submission','inbound',
         'fixture',$2::timestamptz,'{}'::jsonb,'wordpress',$3)::text id`,
        [
          participant.rows[0].id,
          new Date(now).toISOString(),
          `identity-participant-${ordinal}`,
        ],
      );
      participantPartyId = participant.rows[0].id;
      participantInteractionId = participantInteraction.rows[0].id;
    }
    const identityReceipt = `identity-preparation:v1:${canonicalHash(['identity', ordinal])}`;
    const payerProof = `party-role-proof:v1:${canonicalHash(['payer', ordinal])}`;
    const participantProof = `party-role-proof:v1:${canonicalHash(['participant', ordinal])}`;
    const preparationId = randomUUID();
    const identityOperationId = randomUUID();
    await client.query(
      `INSERT INTO business_v2.payment_identity_preparations
       (preparation_id,caller,origin_operation_id,intent_id,offer_key,
        purchase_relationship,identity_request_sha256,source,source_sha256,
        payer_party_id,participant_party_id,payer_interaction_id,
        participant_interaction_id,payer_reference,participant_reference,
        payer_role_proof,participant_role_proof,receipt_reference,resolved_at)
       VALUES($1,$2,$3,$4,$5,$6,repeat('4',64),$7::jsonb,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18)`,
      [
        preparationId,
        caller,
        identityOperationId,
        randomUUID(),
        attempt.quote.offerKey,
        options.other ? 'other' : 'self',
        JSON.stringify(scope),
        scopeHash,
        party.rows[0].id,
        participantPartyId,
        payerInteraction.rows[0].id,
        participantInteractionId,
        attempt.quote.payerReference,
        attempt.quote.participantReference,
        payerProof,
        participantProof,
        identityReceipt,
        now,
      ],
    );
    const checkoutOperationId = randomUUID();
    const checkoutEvidence = `checkout-admission:v1:${canonicalHash(['checkout', ordinal])}`;
    await client.query(
      `INSERT INTO business_v2.payment_checkout_admission_evidence
       (scope_sha256,caller,operation_id,attempt_id,quote_id,quote_fingerprint,
        identity_preparation_id,identity_origin_operation_id,
        identity_receipt_reference,payer_reference,participant_reference,
        payer_role_proof,participant_role_proof,purchase_relationship,
        consent_bundle_receipt,terms_version,terms_content_sha256,
        terms_receipt_reference,terms_accepted_at,privacy_version,
        privacy_content_sha256,privacy_receipt_reference,privacy_accepted_at,
        mandate_version,mandate_content_sha256,mandate_receipt_reference,
        mandate_accepted_at,mandate_amount_minor,mandate_currency,
        mandate_frequency,mandate_sec_code,request_body_sha256,evidence_sha256,
        evidence_reference,accepted_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        repeat('6',64),'terms:fixture',$17,'privacy-v1',repeat('7',64),
        'privacy:fixture',$17,$18,$19,$20,$21,$22,$23,$24,$25,repeat('8',64),
        repeat('9',64),$26,$17)`,
      [
        scopeHash,
        caller,
        checkoutOperationId,
        attempt.attemptId,
        attempt.quote.quoteId,
        attempt.quoteFingerprint,
        preparationId,
        identityOperationId,
        identityReceipt,
        attempt.quote.payerReference,
        attempt.quote.participantReference,
        payerProof,
        participantProof,
        options.other ? 'other' : 'self',
        attempt.quote.consentReceipt,
        attempt.quote.termsVersion,
        attempt.quote.acceptedAt,
        options.mandate ? 'mandate-v1' : null,
        options.mandate ? 'a'.repeat(64) : null,
        options.mandate ? 'mandate:fixture' : null,
        options.mandate ? attempt.quote.acceptedAt + 1 : null,
        options.mandate ? attempt.quote.finalAmount : null,
        options.mandate ? attempt.quote.currency : null,
        options.mandate ? 'one_time' : null,
        options.mandate ? 'WEB' : null,
        checkoutEvidence,
      ],
    );
    await client.query(
      `INSERT INTO business_v2.payment_session_result_operations
       (operation_id,attempt_id,session_id_sha256,result_sha256,
        encrypted_result,retry_until,state,version)
       VALUES($1,$2,repeat('a',64),repeat('b',64),'fixture',$3,'verified',1)`,
      [methodOperationId, attempt.attemptId, attempt.quote.expiresAt],
    );
    await client.query(
      `INSERT INTO business_v2.payment_method_bindings
       (scope_sha256,payment_reference,attempt_id,method,operation_id,evidence_sha256)
       VALUES($1,$2,$3,$4,$5,repeat('c',64))`,
      [
        scopeHash,
        paymentReference,
        attempt.attemptId,
        method,
        methodOperationId,
      ],
    );
  });
  await events.recordWebhook(
    webhook(attempt, paymentReference, 'AUTHORISATION', {
      amount: options.authorizationAmount,
      currency: options.authorizationCurrency,
    }),
  );
  if (options.secondPayment)
    await events.recordWebhook(
      webhook(
        attempt,
        randomUUID().replaceAll('-', '').slice(0, 16),
        'AUTHORISATION',
      ),
    );
  return { attempt, paymentReference, providerOperationId, methodOperationId };
}

function webhook(
  attempt: ReturnType<typeof createPaymentAttempt>,
  pspReference: string,
  eventCode: 'AUTHORISATION' | 'CHARGEBACK',
  override: { amount?: number; currency?: string } = {},
) {
  const item = {
    pspReference:
      eventCode === 'AUTHORISATION'
        ? pspReference
        : randomUUID().replaceAll('-', '').slice(0, 16),
    originalReference: eventCode === 'CHARGEBACK' ? pspReference : '',
    merchantAccountCode: scope.merchant,
    merchantReference: adyenTestAttemptReference(attempt.attemptId),
    eventCode,
    eventDate: new Date().toISOString(),
    success: 'true',
    amount: {
      value: override.amount ?? attempt.quote.finalAmount,
      currency: override.currency ?? attempt.quote.currency,
    },
    additionalData: { store: scope.store },
  };
  const signature = createHmac('sha256', Buffer.from(webhookKey, 'hex'))
    .update(standardWebhookSigningPayload(item as never))
    .digest('base64');
  return {
    live: 'false',
    notificationItems: [
      {
        NotificationRequestItem: {
          ...item,
          additionalData: { ...item.additionalData, hmacSignature: signature },
        },
      },
    ],
  };
}

const adapter = (
  cardProof: string | null = null,
  catalog: unknown = publication,
  publicationPin: WebsiteCheckoutPublicationPin = trustedPublicationPin,
) => {
  return new WebsiteCheckoutEnrollmentAdapter(
    pool,
    caller,
    scope,
    catalog,
    publicationPin,
    cardProof,
  );
};

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...pgConfig, database });
  await pool.query('CREATE EXTENSION citext');
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(`CREATE FUNCTION business_v2.fn_company_work_append_only()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'append-only synthetic relation';
    END $$;
    ALTER FUNCTION business_v2.fn_company_work_append_only() OWNER TO nanoclaw_admin`);
  for (const migration of [
    '01_extensions.sql',
    '02_lookups.sql',
    '03_parties.sql',
    '04_roles.sql',
    '05_engagements.sql',
    '06_programs.sql',
    '07_pipeline.sql',
    '08_interactions.sql',
    '09_documents.sql',
    '10_outbox.sql',
    '11_helpers.sql',
    '12_triggers.sql',
    '13_views.sql',
    '14_grants.sql',
    '16_cutover_helpers.sql',
    '137_relationship_context_dark.sql',
    '142_student_enrollment_dark_foundation.sql',
    '143_academy_capacity_dark.sql',
    '146_student_enrollment_store_contract.sql',
    '147_student_enrollment_writer_claims.sql',
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
    '153_website_checkout_provisional_finance.sql',
    '154_payment_identity_preparation.sql',
    '155_website_checkout_admission_evidence.sql',
  ])
    await pool.query(sql(migration));
  store = new PaymentStore(
    transaction,
    new PaymentPayloadVault(
      'fixture-vault',
      new Map([['fixture-vault', randomBytes(32)]]),
    ),
  );
  events = new PaymentEventStore(transaction, scope, {
    hmacKeys: [webhookKey],
    merchantAccount: scope.merchant,
    storeReference: scope.store!,
    referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
    allowedEventCodes: ['AUTHORISATION', 'CHARGEBACK'],
  });
});

afterAll(async () => {
  if (pool) await pool.end();
  if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
  await maintenance.end();
});

describe('quote-derived website checkout enrollment adapter', () => {
  it('materializes one provisional ACH canonical enrollment and replays exactly', async () => {
    const fixture = await seed('ach_direct_debit', { mandate: true });
    const first = await adapter().admit(fixture.attempt.attemptId);
    expect(first).toMatchObject({
      disposition: 'accepted',
      canonicalEnrollment: 'materialized',
      accessDelivery: 'not_requested',
      certificateFinancialClearance: 'not_evaluated',
      currentPaymentState: 'eligible',
    });
    expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
      disposition: 'duplicate',
      evidenceReference: first.evidenceReference,
    });
    const rotated = structuredClone(publication);
    rotated.source_versions.checkout_catalog =
      'fixture:rotated-after-admission';
    const { payload_sha256: _old, ...rotatedPayload } = rotated;
    rotated.payload_sha256 = canonicalHash(rotatedPayload);
    expect(rotated.payload_sha256).toBe(rotatedPublicationPin.payloadSha256);
    expect(() => adapter(null, rotated)).toThrow(
      'invalid_website_adapter_configuration',
    );
    expect(
      await adapter(null, rotated, rotatedPublicationPin).admit(
        fixture.attempt.attemptId,
      ),
    ).toMatchObject({
      disposition: 'duplicate',
      evidenceReference: first.evidenceReference,
    });
    const counts = await pool.query(
      `SELECT
       (SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key=$1)::int orders,
       (SELECT count(*) FROM business_v2.student_enrollments_v2)::int enrollments,
       (SELECT count(*) FROM business_v2.student_projection_outbox)::int projections,
       (SELECT count(*) FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$2)::int admissions`,
      [first.orderKey, fixture.attempt.attemptId],
    );
    expect(counts.rows[0]).toMatchObject({
      orders: 1,
      enrollments: 1,
      projections: 0,
      admissions: 1,
    });
  });

  it('preserves an explicit separate payer and participant identity', async () => {
    const fixture = await seed('ach_direct_debit', {
      mandate: true,
      other: true,
    });
    const result = await adapter().admit(fixture.attempt.attemptId);
    expect(result.disposition).toBe('accepted');
    const rows = await pool.query(
      `SELECT o.payer_party_id,e.participant_party_id,s.payer_relationship
       FROM business_v2.student_enrollment_orders o
       JOIN business_v2.student_enrollment_seats s ON s.order_id=o.id
       JOIN business_v2.student_enrollments_v2 e ON e.seat_id=s.id
       WHERE o.order_key=$1`,
      [result.orderKey],
    );
    expect(rows.rows[0].payer_party_id).not.toBe(
      rows.rows[0].participant_party_id,
    );
    expect(rows.rows[0].payer_relationship).toBe('separate_payer');
  });

  it('binds publication base price while persisting a nonzero regional discount obligation', async () => {
    const fixture = await seed('ach_direct_debit', {
      mandate: true,
      offerKey: 'mcs-foundations-es',
      locale: 'es-419',
      country: 'MX',
      bundleVersion: 'mcs-foundations-es-419:v1:revision-1',
      deliveryVersion:
        'publication:student-foundations-publication-v1:r1:mcs-foundations-es',
      originalAmount: 29900,
      discountAmount: 14950,
      finalAmount: 14950,
    });
    const result = await adapter().admit(fixture.attempt.attemptId);
    expect(result).toMatchObject({
      disposition: 'accepted',
      canonicalEnrollment: 'materialized',
      currentPaymentState: 'eligible',
    });
    const rows = await pool.query(
      `SELECT o.offer_key,o.bundle_key,o.financial_classification,
        a.agreement_type,a.state agreement_state,
        f.amount_minor::int amount_minor,f.currency,f.state obligation_state,
        p.content_locale,p.payment_reference
       FROM business_v2.student_enrollment_orders o
       JOIN business_v2.student_financial_agreements a ON a.order_id=o.id
       JOIN business_v2.student_financial_obligations f ON f.agreement_id=a.id
       JOIN business_v2.payment_enrollment_admissions p ON p.order_key=o.order_key
       WHERE o.order_key=$1`,
      [result.orderKey],
    );
    expect(rows.rows[0]).toMatchObject({
      offer_key: 'mcs-foundations-es',
      bundle_key: 'mcs-foundations-es-419:v1',
      financial_classification: 'provider_accepted_provisional',
      agreement_type: 'paid_in_full',
      agreement_state: 'active',
      amount_minor: 14950,
      currency: 'USD',
      obligation_state: 'accepted_pending_receipt',
      content_locale: 'es-419',
      payment_reference: fixture.paymentReference,
    });
  });

  it('requires ACH mandate and card capture configuration evidence', async () => {
    const ach = await seed('ach_direct_debit');
    expect(await adapter().admit(ach.attempt.attemptId)).toMatchObject({
      disposition: 'held',
      reasons: ['ach_mandate_evidence_required'],
    });
    const card = await seed('card');
    expect(await adapter().admit(card.attempt.attemptId)).toMatchObject({
      disposition: 'held',
      reasons: ['card_capture_configuration_unverified'],
    });
    expect(
      await adapter('synthetic-card-auto-capture-readback').admit(
        card.attempt.attemptId,
      ),
    ).toMatchObject({ disposition: 'accepted' });
  });

  it('holds multiple PSP evidence before writer claim or enrollment', async () => {
    const fixture = await seed('ach_direct_debit', {
      mandate: true,
      secondPayment: true,
    });
    expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
      disposition: 'held',
      currentPaymentState: 'needs_review',
    });
    const rows = await pool.query(
      `SELECT
       (SELECT count(*) FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1)::int admissions,
       (SELECT count(*) FROM business_v2.student_enrollment_writer_claims WHERE source_object_id=$2)::int claims`,
      [fixture.attempt.attemptId, fixture.paymentReference],
    );
    expect(rows.rows[0]).toEqual({ admissions: 0, claims: 0 });
  });

  it.each([
    ['amount', { authorizationAmount: 29899 }],
    ['currency', { authorizationCurrency: 'EUR' }],
  ] as const)(
    'holds a provider authorization %s mismatch rejected by the trusted evidence projection',
    async (_field, override) => {
      const fixture = await seed('ach_direct_debit', {
        mandate: true,
        ...override,
      });
      expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
        disposition: 'held',
        canonicalEnrollment: 'not_materialized',
        currentPaymentState: 'needs_review',
        reasons: ['payment_evidence_pending'],
      });
      const rows = await pool.query(
        `SELECT
         (SELECT count(*) FROM business_v2.payment_event_exceptions
          WHERE attempt_id=$1 AND reason='amount_or_fact_conflict')::int exceptions,
         (SELECT count(*) FROM business_v2.payment_enrollment_admissions
          WHERE attempt_id=$1)::int admissions,
         (SELECT count(*) FROM business_v2.student_enrollment_writer_claims
          WHERE source_object_id=$2)::int claims`,
        [fixture.attempt.attemptId, fixture.paymentReference],
      );
      expect(rows.rows[0]).toEqual({ exceptions: 1, admissions: 0, claims: 0 });
    },
  );

  it('does not consume a PSP already claimed by another enrollment writer', async () => {
    const fixture = await seed('ach_direct_debit', { mandate: true });
    const sourceScope = `adyen:${scopeHash}`;
    await pool.query(
      `INSERT INTO business_v2.student_enrollment_writer_claims
       (source_key,source_scope,source_object_type,source_object_id,writer,
        policy_key,evidence_sha256,claimed_at,claimed_by)
       VALUES($1,$2,'payment',$3,'legacy','policy:legacy-fixture',repeat('d',64),
        clock_timestamp(),'fixture')`,
      [
        canonicalHash([sourceScope, 'payment', fixture.paymentReference]),
        sourceScope,
        fixture.paymentReference,
      ],
    );
    expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
      disposition: 'held',
      canonicalEnrollment: 'not_materialized',
      currentPaymentState: 'needs_review',
      reasons: ['writer_ownership_conflict'],
    });
    const rows = await pool.query(
      `SELECT
       (SELECT count(*) FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1)::int admissions,
       (SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key=$2)::int orders`,
      [
        fixture.attempt.attemptId,
        `website-checkout:${canonicalHash([scopeHash, fixture.attempt.quote.quoteId])}`,
      ],
    );
    expect(rows.rows[0]).toEqual({ admissions: 0, orders: 0 });
  });

  it('rejects cross-attempt reuse of either the quote or native PSP identity', async () => {
    const quoteId = randomUUID();
    const first = await seed('ach_direct_debit', { mandate: true, quoteId });
    const accepted = await adapter().admit(first.attempt.attemptId);
    expect(accepted.disposition).toBe('accepted');

    await expect(
      seed('ach_direct_debit', { mandate: true, quoteId }),
    ).rejects.toThrow('attempt_identity_conflict');

    await expect(
      seed('ach_direct_debit', {
        mandate: true,
        paymentReference: first.paymentReference,
      }),
    ).rejects.toMatchObject({ code: '23505' });
    const rows = await pool.query(
      `SELECT
       (SELECT count(*) FROM business_v2.payment_enrollment_admissions WHERE order_key=$1)::int admissions,
       (SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key=$1)::int orders,
       (SELECT count(*) FROM business_v2.student_enrollment_writer_claims WHERE source_object_id=$2)::int claims`,
      [accepted.orderKey, first.paymentReference],
    );
    expect(rows.rows[0]).toEqual({ admissions: 1, orders: 1, claims: 1 });
  });

  it('rolls back the writer claim and canonical state when final admission persistence fails', async () => {
    const fixture = await seed('ach_direct_debit', { mandate: true });
    await pool.query(`CREATE FUNCTION business_v2.test_refuse_enrollment_admission()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'synthetic admission insert failure';
      END $$;
      CREATE TRIGGER test_refuse_enrollment_admission
      BEFORE INSERT ON business_v2.payment_enrollment_admissions
      FOR EACH ROW EXECUTE FUNCTION business_v2.test_refuse_enrollment_admission()`);
    try {
      await expect(adapter().admit(fixture.attempt.attemptId)).rejects.toThrow(
        'synthetic admission insert failure',
      );
    } finally {
      await pool.query(`DROP TRIGGER test_refuse_enrollment_admission
        ON business_v2.payment_enrollment_admissions;
        DROP FUNCTION business_v2.test_refuse_enrollment_admission()`);
    }
    const orderKey = `website-checkout:${canonicalHash([
      scopeHash,
      fixture.attempt.quote.quoteId,
    ])}`;
    const rows = await pool.query(
      `SELECT
       (SELECT count(*) FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1)::int admissions,
       (SELECT count(*) FROM business_v2.student_enrollment_writer_claims WHERE source_object_id=$2)::int claims,
       (SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key=$3)::int orders`,
      [fixture.attempt.attemptId, fixture.paymentReference, orderKey],
    );
    expect(rows.rows[0]).toEqual({ admissions: 0, claims: 0, orders: 0 });
    expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
      disposition: 'accepted',
      orderKey,
    });
  });

  it.each([
    ['catalog', { catalogVersion: 'git:wrong-catalog-version' }],
    ['bundle', { bundleVersion: 'mcs-foundations-en:v1:revision-2' }],
    [
      'delivery',
      {
        deliveryVersion:
          'publication:student-foundations-publication-v1:r2:mcq-program-a-foundations',
      },
    ],
  ] as const)(
    'holds an exact %s version mismatch before writer claim or enrollment',
    async (_field, override) => {
      const fixture = await seed('ach_direct_debit', {
        mandate: true,
        ...override,
      });
      expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
        disposition: 'held',
        canonicalEnrollment: 'not_materialized',
        currentPaymentState: 'needs_review',
        reasons: ['checkout_catalog_binding_conflict'],
      });
      const rows = await pool.query(
        `SELECT
         (SELECT count(*) FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1)::int admissions,
         (SELECT count(*) FROM business_v2.student_enrollment_writer_claims WHERE source_object_id=$2)::int claims,
         (SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key=$3)::int orders`,
        [
          fixture.attempt.attemptId,
          fixture.paymentReference,
          `website-checkout:${canonicalHash([scopeHash, fixture.attempt.quote.quoteId])}`,
        ],
      );
      expect(rows.rows[0]).toEqual({ admissions: 0, claims: 0, orders: 0 });
    },
  );

  it('rejects publication tampering and self-rehashed rotation against an independent trusted pin', () => {
    const tampered = structuredClone(publication);
    tampered.routes[0].pricing_authority.base_amount_minor = 30000;
    expect(() => adapter(null, tampered)).toThrow('publication_hash_conflict');

    const selfRehashed = structuredClone(tampered);
    const { payload_sha256: _old, ...selfRehashedPayload } = selfRehashed;
    selfRehashed.payload_sha256 = canonicalHash(selfRehashedPayload);
    expect(selfRehashed.payload_sha256).not.toBe(
      trustedPublicationPin.payloadSha256,
    );
    expect(() => adapter(null, selfRehashed)).toThrow(
      'invalid_website_adapter_configuration',
    );
  });

  it('preserves immutable consumed evidence while surfacing later adverse state', async () => {
    const fixture = await seed('ach_direct_debit', { mandate: true });
    const first = await adapter().admit(fixture.attempt.attemptId);
    const before = (
      await pool.query(
        'SELECT * FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1',
        [fixture.attempt.attemptId],
      )
    ).rows[0];
    await events.recordWebhook(
      webhook(fixture.attempt, fixture.paymentReference, 'CHARGEBACK'),
    );
    expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
      disposition: 'duplicate',
      currentPaymentState: 'needs_review',
      evidenceReference: first.evidenceReference,
    });
    const after = (
      await pool.query(
        'SELECT * FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1',
        [fixture.attempt.attemptId],
      )
    ).rows[0];
    expect(after).toEqual(before);
  });

  it('preserves an accepted enrollment while surfacing a later mismatched authorization fact', async () => {
    const fixture = await seed('ach_direct_debit', { mandate: true });
    const first = await adapter().admit(fixture.attempt.attemptId);
    const before = (
      await pool.query(
        'SELECT * FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1',
        [fixture.attempt.attemptId],
      )
    ).rows[0];
    await events.recordWebhook(
      webhook(fixture.attempt, fixture.paymentReference, 'AUTHORISATION', {
        amount: fixture.attempt.quote.finalAmount - 1,
      }),
    );
    expect(await adapter().admit(fixture.attempt.attemptId)).toMatchObject({
      disposition: 'duplicate',
      canonicalEnrollment: 'materialized',
      currentPaymentState: 'needs_review',
      evidenceReference: first.evidenceReference,
    });
    const after = (
      await pool.query(
        'SELECT * FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1',
        [fixture.attempt.attemptId],
      )
    ).rows[0];
    expect(after).toEqual(before);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int n FROM business_v2.payment_event_exceptions
           WHERE attempt_id=$1 AND reason='delivery_payload_conflict'`,
          [fixture.attempt.attemptId],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('serializes concurrent duplicate admission to one order and grant', async () => {
    const fixture = await seed('ach_direct_debit', { mandate: true });
    const results = await Promise.all([
      adapter().admit(fixture.attempt.attemptId),
      adapter().admit(fixture.attempt.attemptId),
    ]);
    expect(results.map((result) => result.disposition).sort()).toEqual([
      'accepted',
      'duplicate',
    ]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1',
          [fixture.attempt.attemptId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
