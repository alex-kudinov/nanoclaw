import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADYEN_TEST_REFERENCE_PREFIX,
  adyenAttemptReference,
  adyenTestAttemptReference,
  parseAdyenPaymentOperationReference,
} from './adyen-payment-identifiers.js';
import { standardWebhookSigningPayload } from './adyen-webhook.js';
import { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import {
  canonicalCheckoutAttributionJson,
  parseCheckoutAttributionHandoff,
  type CheckoutAttributionBinding,
  type CheckoutAttributionHandoff,
  type CheckoutAttributionSnapshot,
} from './payment-checkout-attribution.js';
import {
  createPaymentAttempt,
  paymentScopeFingerprint,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';
import {
  verifyPaymentChaosObservabilitySchema,
  verifyWebsiteCheckoutLiveSchema,
} from './website-checkout-live-runner.js';
import { createWebsiteCheckoutTestService } from './website-checkout-test-service.js';

const database = `nc_student_enrollment_store_${randomUUID().replaceAll('-', '')}`;
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 10,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let server: Server;
let baseUrl: string;
let service: ReturnType<typeof createWebsiteCheckoutTestService>;
let serviceConfig: Parameters<typeof createWebsiteCheckoutTestService>[0];
let serviceDependencies: Parameters<typeof createWebsiteCheckoutTestService>[1];
let created = false;
let sessionCalls = 0;
let resultCalls = 0;
let heartbeatMember = false;
let heartbeatMutationCalls = 0;
let heartbeatReadCalls = 0;
let heartbeatUncertainOnce = true;
let acceptedAttribution: CheckoutAttributionHandoff;
let acceptedAdmissionCommand: Record<string, any>;
let providerMethod = 'scheme';
let providerTerminalStatus: 'refused' | 'canceled' | 'expired' | null = null;
let providerResultUnavailable = false;
const noticeEffects = new Set<string>();
let noticeReconcileCalls = 0;
const caller = 'tandem-wordpress-test';
const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'test-company',
  merchant: 'test-merchant',
  store: 'test-store',
  endpointRegion: 'eu',
};
const requestSecret = Buffer.from('r'.repeat(32));
const responseSecret = Buffer.from('s'.repeat(32));
const webhookKey = randomBytes(32).toString('hex');
const requestKeys = new Map([
  ['request-v1', { caller, secret: requestSecret }],
]);
const requestSigner = new PaymentRequestAuthenticator(requestKeys);
const publication = JSON.parse(
  readFileSync(
    new URL(
      '../facts/generated/student-foundations-publication-v1.scoped.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const publicationPin = {
  publicationId: 'student-foundations-publication-v1' as const,
  publicationRevision: 1,
  payloadSha256:
    '430f11c7cc8299621abb59b4ea0cca29209de6143277f6145d616060da22b9c0',
};
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

type Path =
  | '/internal/payments/sessions'
  | '/internal/payments/attempts'
  | '/internal/payments/status'
  | '/internal/payments/returns'
  | '/internal/payments/session-retries'
  | '/internal/payments/session-submit-checks'
  | '/internal/payments/identity/resolve'
  | '/internal/payments/identity/status'
  | '/internal/payments/enrollment-admissions';

function wire(path: Path, command: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(command));
  const nonce = randomUUID();
  return {
    nonce,
    body: JSON.stringify({
      auth: requestSigner.sign(
        {
          version: 1,
          keyId: 'request-v1',
          caller,
          method: 'POST',
          path,
          timestamp: Date.now(),
          nonce,
          operationId: String(command.requestId),
        },
        body,
      ),
      payloadBase64: body.toString('base64'),
    }),
  };
}

async function post(path: Path, command: Record<string, unknown>) {
  const wired = wire(path, command);
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: wired.body,
  });
  const outer = (await response.json()) as {
    auth: {
      version: 1;
      keyId: string;
      caller: string;
      method: 'POST';
      path: Path;
      operationId: string;
      requestNonce: string;
      status: number;
      timestamp: number;
      signature: string;
    };
    payloadBase64: string;
  };
  const innerBytes = Buffer.from(outer.payloadBase64, 'base64');
  const signingInput = [
    'tandem-payments-response-v1',
    outer.auth.keyId,
    outer.auth.caller,
    outer.auth.method,
    outer.auth.path,
    outer.auth.operationId,
    outer.auth.requestNonce,
    String(outer.auth.status),
    String(outer.auth.timestamp),
    createHash('sha256').update(innerBytes).digest('hex'),
  ].join('\n');
  expect(outer.auth).toMatchObject({
    caller,
    path,
    operationId: command.requestId,
    requestNonce: wired.nonce,
    status: response.status,
  });
  expect(
    createHmac('sha256', responseSecret).update(signingInput).digest('hex'),
  ).toBe(outer.auth.signature);
  return {
    response,
    outer,
    inner: JSON.parse(innerBytes.toString()) as Record<string, any>,
  };
}

async function postWebhook(payload: unknown) {
  const response = await fetch(`${baseUrl}/hook/adyen-test-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.text() };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function attribution(input: {
  intentId: string;
  attemptId: string;
  attemptOperationId: string;
  quote: ReturnType<typeof createPaymentAttempt>['quote'];
  quoteFingerprint: string;
  privacyVersion: string;
  privacyReceipt: string;
  fieldMap?: { id: string; sha256: string };
}) {
  const snapshotId = randomUUID();
  const capturedAt = input.quote.acceptedAt - 10;
  const snapshotRequest = {
    schemaVersion: 1 as const,
    snapshotId,
    intentId: input.intentId,
    offerKey: input.quote.offerKey,
    program: 'mcs-foundations',
    productName: 'Mentor Coaching Foundations',
    canonicalLocale: input.quote.locale,
    country: input.quote.country,
    pricingPreference: 'standard' as const,
    promotionCodeHash: '1'.repeat(64),
    catalogVersion: input.quote.catalogVersion,
    bundleVersion: input.quote.bundleVersion,
    deliveryVersion: input.quote.deliveryVersion,
    returnContextReference: 'checkout-return:v1:fixture',
    pricing: {
      baseAmount: input.quote.originalAmount,
      displayAmount: input.quote.originalAmount,
      currency: input.quote.currency,
      regionalEligible: false,
      regionalApplied: false,
      pricingPolicy: 'standard-usd-v1',
    },
    recovery: {
      consent: 'granted' as const,
      policy: 'checkout-reminder-v3-us-optout',
      country: 'US',
      choice: 'default' as const,
      mode: 'default_on' as const,
    },
    fieldMapId: input.fieldMap?.id ?? 'payment-attribution-v1',
    fieldMapSha256: input.fieldMap?.sha256 ?? '2'.repeat(64),
    origin: 'tandem_wordpress_preview' as const,
    enrollmentScope: 'standalone_course' as const,
    cohortDisposition: 'not_applicable_self_paced' as const,
    promotionStatus: 'pending_validation' as const,
    trackingConsent: {
      state: 'unknown' as const,
      provenance: 'cmp:server-proof-unavailable',
      receipt: null,
      claimReference: null,
    },
  };
  const snapshot: CheckoutAttributionSnapshot = {
    ...snapshotRequest,
    tracking: {
      consentReceipt: null,
      joinStatus: 'permission_unknown',
      trackerSessionReference: null,
      gclid: null,
    },
    requestFingerprint: sha256(
      canonicalCheckoutAttributionJson(snapshotRequest),
    ),
    capturedAt,
  };
  const snapshotJson = canonicalCheckoutAttributionJson(snapshot);
  const snapshotSha256 = sha256(snapshotJson);
  const binding: CheckoutAttributionBinding = {
    schemaVersion: 1,
    snapshotId,
    snapshotSha256,
    intentId: input.intentId,
    quoteId: input.quote.quoteId,
    quoteFingerprint: input.quoteFingerprint,
    dispatchKind: 'payment',
    attemptReference: input.attemptId,
    attemptOperationReference: input.attemptOperationId,
    freeOrderId: null,
    freeOrderOperationReference: null,
    offerKey: input.quote.offerKey,
    catalogVersion: input.quote.catalogVersion,
    bundleVersion: input.quote.bundleVersion,
    deliveryVersion: input.quote.deliveryVersion,
    locale: input.quote.locale,
    country: input.quote.country,
    currency: input.quote.currency,
    originalAmount: input.quote.originalAmount,
    discountAmount: input.quote.discountAmount,
    finalAmount: input.quote.finalAmount,
    discountPolicyReference: input.quote.discountPolicyReference,
    paymentOption: 'one_time',
    payerReference: input.quote.payerReference!,
    participantReference: input.quote.participantReference!,
    termsVersion: input.quote.termsVersion,
    termsAcceptedAt: input.quote.acceptedAt,
    consentBundleReference: input.quote.consentReceipt,
    privacyVersion: input.privacyVersion,
    privacyAcknowledgementReference: input.privacyReceipt,
  };
  const bindingJson = canonicalCheckoutAttributionJson(binding);
  return {
    snapshotId,
    snapshotSha256,
    snapshotJsonBase64: Buffer.from(snapshotJson).toString('base64'),
    bindingReference: `attribution-binding:v1:${input.quote.quoteId}`,
    bindingSha256: sha256(bindingJson),
    bindingJsonBase64: Buffer.from(bindingJson).toString('base64'),
  };
}

function webhook(
  attemptId: string,
  amount: number,
  pspReference: string,
  eventCode = 'AUTHORISATION',
  sessionSequence = 1,
) {
  const item = {
    pspReference,
    originalReference: '',
    merchantAccountCode: scope.merchant,
    merchantReference: adyenAttemptReference(
      attemptId,
      { referencePrefix: ADYEN_TEST_REFERENCE_PREFIX },
      sessionSequence,
    ),
    eventCode,
    eventDate: new Date().toISOString(),
    success: 'true',
    amount: { value: amount, currency: 'USD' },
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
    '148_student_enrollment_projection_foundation.sql',
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
    '153_website_checkout_provisional_finance.sql',
    '154_payment_identity_preparation.sql',
    '161_payment_checkout_billing_profile.sql',
    '162_payment_provider_optimization_evidence.sql',
    '155_website_checkout_admission_evidence.sql',
    '156_website_checkout_attribution_admission.sql',
    'rollback_156_website_checkout_attribution_admission.sql',
    '156_website_checkout_attribution_admission.sql',
    '157_payment_webhook_method_evidence.sql',
    '158_website_checkout_customer_notices.sql',
    '159_payment_terminal_card_retry.sql',
    '160_payment_chaos_observability.sql',
    '163_payment_checkout_documents.sql',
    '164_payment_checkout_document_retention.sql',
    '165_deferred_checkout_identity.sql',
  ])
    await pool.query(sql(migration));
  await transaction(async (client) => {
    const party = await client.query<{ id: string }>(
      `SELECT business_v2.fn_create_party(
       'person','ACC Enrollment QA','test@tandemcoach.co'::citext,'wordpress','{}'::jsonb
       )::text id`,
    );
    await client.query(
      `INSERT INTO business_v2.party_external_refs
       (party_id,provider,source_scope,entity_type,external_id,adapter_key,
        adapter_version,schema_version,status,verified_at,first_seen_at,
        last_seen_at,source_receipt_sha256)
       VALUES($1,'stripe','tandem','customer','cus_fixture_identity',
        'identity_fixture','1.0.0',1,'active',now(),now(),now(),repeat('a',64))`,
      [party.rows[0].id],
    );
  });
  const sessions = new Map<
    string,
    {
      attemptId: string;
      sessionSequence: number;
      reference: string;
      expiresAt: string;
      amount: number;
      currency: string;
      psp: string;
    }
  >();
  const providerTransport = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    if (init?.method === 'POST') {
      sessionCalls++;
      const body = JSON.parse(String(init.body));
      const correlation = parseAdyenPaymentOperationReference(
        String(body.reference),
        { referencePrefix: ADYEN_TEST_REFERENCE_PREFIX },
      );
      const attemptId = correlation.attemptId;
      const id = `fixture-session-${attemptId}-s${correlation.sessionSequence}`;
      sessions.set(id, {
        attemptId,
        sessionSequence: correlation.sessionSequence,
        reference: String(body.reference),
        expiresAt: String(body.expiresAt),
        amount: body.amount.value,
        currency: body.amount.currency,
        psp: attemptId.replaceAll('-', '').slice(0, 16).toUpperCase(),
      });
      return new Response(
        JSON.stringify({
          id,
          sessionData: `fixture-data-${attemptId}`,
          expiresAt: String(body.expiresAt),
        }),
        { status: 201 },
      );
    }
    resultCalls++;
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
    const session = sessions.get(id);
    if (!session) return new Response('{}', { status: 404 });
    if (providerResultUnavailable) return new Response('{}', { status: 503 });
    if (providerTerminalStatus)
      return new Response(
        JSON.stringify({
          id,
          status: providerTerminalStatus,
          reference: session.reference,
        }),
      );
    return new Response(
      JSON.stringify({
        id,
        status: 'completed',
        reference: adyenAttemptReference(
          session.attemptId,
          { referencePrefix: ADYEN_TEST_REFERENCE_PREFIX },
          session.sessionSequence,
        ),
        payments: [
          {
            pspReference: session.psp,
            resultCode: 'Authorised',
            amount: { value: session.amount, currency: session.currency },
            paymentMethod: { type: providerMethod, brand: 'visa' },
          },
        ],
      }),
    );
  }) as typeof fetch;
  serviceConfig = {
    payment: {
      mode: 'test',
      caller,
      scope,
      quoteAuthorities: ['wordpress:test'],
      recoveryOfferLocales: ['mcq-program-a-foundations:en-US'],
      newAttemptOfferLocales: ['mcq-program-a-foundations:en-US'],
      paymentMethodCapabilities: ['card'],
      recoveryMode: 'dispatch',
      requestKeys,
      signedResponses: {
        keyId: 'response-v1',
        key: { caller, secret: responseSecret },
      },
      payloadKeyId: 'payload-v1',
      payloadKeys: new Map([['payload-v1', Buffer.from('p'.repeat(32))]]),
      returnBindingKey: Buffer.from('b'.repeat(32)),
      adyenApiKey: 'synthetic-test-api-key',
      sessionRouting: {
        allowedOrigin: 'https://preview.example.test',
        returnPath: '/checkout-return',
      },
      webhook: {
        hmacKeys: [webhookKey],
        merchantAccount: scope.merchant,
        storeReference: scope.store!,
        referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
        allowedEventCodes: ['AUTHORISATION'],
        retainVerifiedOwnedUnsupported: true,
      },
      limits: {
        requestsPerWindow: 1000,
        maxActive: 10,
        windowMs: 60000,
        maxBodyBytes: 100000,
        bodyReadTimeoutMs: 1000,
      },
    },
    identitySecret: 'i'.repeat(32),
    identityTokenSecret: Buffer.from('t'.repeat(32)),
    identityReferenceSecret: Buffer.from('o'.repeat(32)),
    checkoutEvidenceSecret: Buffer.from('e'.repeat(32)),
    attributionFieldMap: {
      id: 'payment-attribution-v1',
      sha256: '2'.repeat(64),
    },
    promotionPolicyReferences: ['mcs-promo-v1-005'],
    checkoutDocumentPolicies: [
      {
        kind: 'enrollment_terms',
        version: 'terms-v1',
        contentSha256: '3'.repeat(64),
        effectiveFrom: 0,
        effectiveTo: null,
      },
      {
        kind: 'privacy',
        version: 'privacy-v1',
        contentSha256: '4'.repeat(64),
        effectiveFrom: 0,
        effectiveTo: null,
      },
    ],
    publication,
    publicationPin,
    cardCaptureConfigurationEvidence: 'adyen-test-auto-capture-readback-v1',
    heartbeatAccess: {
      enabled: true,
      email: 'test@tandemcoach.co',
      userId: '97f4285a-18d4-44a9-961d-17e582aa278f',
      groupId: '4c54983c-0e7b-4dd0-aebc-0f0cb1c82298',
      courseId: 'abd312e4-b01a-4718-8918-f79d081753c0',
      cohortId: 'f2a36eca-a017-4536-9b83-368f51219895',
    },
  };
  serviceDependencies = {
    pool,
    transaction,
    identityResolver: resolveCheckoutCustomerIdentityWithClient,
    providerTransport,
    heartbeatToolbox: {
      async run(tool, args) {
        if (tool === 'heartbeat/add-to-group') {
          expect(args).toEqual([
            '--group-id',
            '4c54983c-0e7b-4dd0-aebc-0f0cb1c82298',
            '--emails',
            'test@tandemcoach.co',
            '--instance',
            'main',
          ]);
          heartbeatMutationCalls++;
          heartbeatMember = true;
          if (heartbeatUncertainOnce) {
            heartbeatUncertainOnce = false;
            throw new Error('synthetic_ack_lost_after_apply');
          }
          return { added: true };
        }
        heartbeatReadCalls++;
        return {
          id: '97f4285a-18d4-44a9-961d-17e582aa278f',
          email: 'test@tandemcoach.co',
          groups: heartbeatMember
            ? [{ id: '4c54983c-0e7b-4dd0-aebc-0f0cb1c82298' }]
            : [],
        };
      },
    },
    receiptWelcomeOwner: {
      async reconcile(input) {
        noticeReconcileCalls++;
        noticeEffects.add(input.idempotencyKey);
        expect(input.enrollment).toMatchObject({
          canonicalEnrollment: 'materialized',
          currentPaymentState: 'eligible',
        });
        return {
          state: 'verified' as const,
          receiptReference: `fixture-notice:${input.attemptId}`,
        };
      },
    },
  };
  service = createWebsiteCheckoutTestService(
    serviceConfig,
    serviceDependencies,
  );
  server = createServer(service.http.handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no listener');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  if (pool) await pool.end();
  if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
  await maintenance.end();
});

describe('complete isolated English card TEST checkout service', () => {
  it('passes production readiness checks on the exact migration chain', async () => {
    await expect(
      verifyWebsiteCheckoutLiveSchema(pool, database),
    ).resolves.toBeUndefined();
    await expect(
      verifyPaymentChaosObservabilitySchema(pool),
    ).resolves.toBeUndefined();
  });
  it('runs signed identity, Session, return, event and canonical admission with exact replay', async () => {
    const identityOperationId = randomUUID();
    const preparationId = randomUUID();
    const intentId = randomUUID();
    const identity = await post('/internal/payments/identity/resolve', {
      schemaVersion: 1,
      requestId: identityOperationId,
      preparationId,
      intentId,
      offerKey: 'mcq-program-a-foundations',
      purchaseRelationship: 'self',
      payer: {
        role: 'payer',
        candidate: {
          firstName: 'ACC Enrollment',
          lastName: 'QA',
          email: 'test@tandemcoach.co',
        },
      },
      participant: { role: 'participant', sameAs: 'payer' },
    });
    expect(identity.response.status).toBe(200);
    const identityReceipt = identity.inner.identityPreparationReceipt;
    expect(JSON.stringify(identity.inner)).not.toContain('test@tandemcoach.co');

    const acceptedAt = Date.now() - 1000;
    const attemptOperationId = randomUUID();
    const paymentAttempt = createPaymentAttempt({
      attemptId: randomUUID(),
      now: acceptedAt,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: randomUUID(),
        authority: 'wordpress:test',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: publication.source_versions.checkout_catalog,
        bundleVersion: 'mcs-foundations-en:v1:revision-1',
        deliveryVersion:
          'publication:student-foundations-publication-v1:r1:mcq-program-a-foundations',
        locale: 'en-US',
        country: 'US',
        payerReference: identityReceipt.payerReference,
        participantReference: identityReceipt.participantReference,
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 500,
        finalAmount: 29400,
        discountPolicyReference: 'promotion:mcs-promo-v1-005',
        redemptionReference: 'promotion-reservation:v1:fixture',
        paymentOption: 'one_time',
        termsVersion: 'terms-v1',
        consentReceipt: 'consent-bundle:v1:fixture',
        acceptedAt,
        createdAt: acceptedAt,
        expiresAt: acceptedAt + 300000,
      },
    });
    const started = await post('/internal/payments/sessions', {
      requestId: attemptOperationId,
      attempt: paymentAttempt,
    });
    expect(started.response.status).toBe(200);
    expect(started.inner).toMatchObject({
      state: 'checkout_ready',
      attemptId: paymentAttempt.attemptId,
      paymentMethodCapabilities: ['card'],
      attemptAcceptanceReceipt: {
        operationId: attemptOperationId,
        quoteId: paymentAttempt.quote.quoteId,
        quoteFingerprint: paymentAttempt.quoteFingerprint,
      },
    });
    expect(sessionCalls).toBe(1);
    const replayedStart = await post('/internal/payments/sessions', {
      requestId: attemptOperationId,
      attempt: paymentAttempt,
    });
    expect(replayedStart.inner.session).toEqual(started.inner.session);
    expect(replayedStart.inner.capability).toBe(started.inner.capability);
    expect(sessionCalls).toBe(1);
    const originalSubmitCalls = { sessionCalls, resultCalls };
    const originalSubmit = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: paymentAttempt.attemptId,
        capability: started.inner.capability,
        returnBinding: started.inner.returnBinding,
      },
    );
    expect(originalSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_allowed',
    });
    expect({ sessionCalls, resultCalls }).toEqual(originalSubmitCalls);

    const privacyReceipt = 'privacy-consent:v1:fixture';
    const admissionOperationId = randomUUID();
    acceptedAttribution = attribution({
      intentId,
      attemptId: paymentAttempt.attemptId,
      attemptOperationId,
      quote: paymentAttempt.quote,
      quoteFingerprint: paymentAttempt.quoteFingerprint,
      privacyVersion: 'privacy-v1',
      privacyReceipt,
    });
    const admissionCommand = {
      schemaVersion: 1,
      requestId: admissionOperationId,
      attemptId: paymentAttempt.attemptId,
      quoteId: paymentAttempt.quote.quoteId,
      quoteFingerprint: paymentAttempt.quoteFingerprint,
      identity: {
        preparationId,
        originOperationId: identityOperationId,
        receiptReference: identityReceipt.receiptReference,
        payerReference: identityReceipt.payerReference,
        participantReference: identityReceipt.participantReference,
        payerRoleProof: identityReceipt.payerRoleProof,
        participantRoleProof: identityReceipt.participantRoleProof,
        purchaseRelationship: 'self',
      },
      consentBundle: {
        bundleReceiptReference: paymentAttempt.quote.consentReceipt,
        enrollmentTerms: {
          version: paymentAttempt.quote.termsVersion,
          contentSha256: '3'.repeat(64),
          receiptReference: 'terms-consent:v1:fixture',
          acceptedAt,
        },
        privacy: {
          version: 'privacy-v1',
          contentSha256: '4'.repeat(64),
          receiptReference: privacyReceipt,
          acceptedAt,
        },
        achMandate: null,
      },
      attribution: acceptedAttribution,
    };
    acceptedAdmissionCommand = admissionCommand;
    const held = await post(
      '/internal/payments/enrollment-admissions',
      admissionCommand,
    );
    expect(held.inner).toMatchObject({
      schemaVersion: 1,
      status: 'accepted',
      checkoutAdmissionEvidence: {
        attemptId: paymentAttempt.attemptId,
      },
      enrollmentResult: {
        disposition: 'held',
        canonicalEnrollment: 'not_materialized',
      },
      promotionConsumptionReceipt: null,
    });
    expect(heartbeatMutationCalls).toBe(0);

    const unsupported = await postWebhook(
      webhook(
        paymentAttempt.attemptId,
        paymentAttempt.quote.finalAmount,
        `UNSUPPORTED${paymentAttempt.attemptId.replaceAll('-', '').slice(0, 8)}`,
        'FUTURE_EVENT_CODE',
      ),
    );
    expect(unsupported.response.status).toBe(202);
    expect(unsupported.body).toBe('[accepted]');
    expect(
      (
        await pool.query(
          `SELECT event_code,reason,attempt_hint::text
           FROM business_v2.payment_owned_event_exceptions`,
        )
      ).rows,
    ).toEqual([
      {
        event_code: 'FUTURE_EVENT_CODE',
        reason: 'unsupported_event',
        attempt_hint: paymentAttempt.attemptId,
      },
    ]);
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*)::int n FROM business_v2.payment_events',
          )
        ).rows[0].n,
      ),
    ).toBe(0);
    const checkoutEvidenceReference =
      held.inner.checkoutAdmissionEvidence.evidenceReference;

    providerTerminalStatus = 'refused';
    const firstReturn = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'synthetic-terminal-session-result',
      returnBinding: started.inner.returnBinding,
    });
    expect(firstReturn.inner).toMatchObject({
      state: 'terminal_nonpayment',
      retry: { disposition: 'eligible' },
    });
    const terminalSubmit = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: paymentAttempt.attemptId,
        capability: started.inner.capability,
        returnBinding: started.inner.returnBinding,
      },
    );
    expect(terminalSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'not_payable',
    });
    providerTerminalStatus = null;
    const successor = await post('/internal/payments/session-retries', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      terminalReceipt: firstReturn.inner.retry.terminalReceipt,
    });
    expect(successor.inner).toMatchObject({ state: 'checkout_ready' });
    expect(successor.inner.session.id).toContain('-s2');
    const successorSubmit = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: paymentAttempt.attemptId,
        capability: started.inner.capability,
        returnBinding: successor.inner.returnBinding,
      },
    );
    expect(successorSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_allowed',
    });
    const staleSubmit = await post('/internal/payments/session-submit-checks', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      returnBinding: started.inner.returnBinding,
    });
    expect(staleSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'stale_session',
    });
    const returned = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'synthetic-browser-session-result',
      returnBinding: successor.inner.returnBinding,
    });
    expect(returned.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'confirming_payment',
    });
    const positiveSubmit = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: paymentAttempt.attemptId,
        capability: started.inner.capability,
        returnBinding: successor.inner.returnBinding,
      },
    );
    expect(positiveSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'not_payable',
    });
    expect(resultCalls).toBe(2);
    expect(JSON.stringify(returned.inner)).not.toContain('session-result');

    const psp = paymentAttempt.attemptId
      .replaceAll('-', '')
      .slice(0, 16)
      .toUpperCase();
    const webhookResponse = await postWebhook(
      webhook(
        paymentAttempt.attemptId,
        paymentAttempt.quote.finalAmount,
        psp,
        'AUTHORISATION',
        2,
      ),
    );
    expect(webhookResponse.response.status).toBe(202);
    expect(webhookResponse.body).toBe('[accepted]');
    const status = await post('/internal/payments/status', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
    });
    expect(status.inner).toMatchObject({
      attemptId: paymentAttempt.attemptId,
      state: 'confirming_payment',
      confirmation: {
        schemaVersion: 1,
        offerKey: 'mcq-program-a-foundations',
        amount: 29400,
        currency: 'USD',
        paymentStatus: 'authorized',
        paymentReference: expect.stringMatching(/^TCA-[A-F0-9]{12}$/),
      },
    });

    await pool.query(
      `UPDATE business_v2.parties SET primary_email='other@example.test'
       WHERE lower(primary_email::text)='test@tandemcoach.co'`,
    );
    const denied = await post(
      '/internal/payments/enrollment-admissions',
      admissionCommand,
    );
    expect(denied.inner).toEqual({
      error: 'heartbeat_test_participant_denied',
    });
    expect(heartbeatMutationCalls).toBe(0);
    expect(heartbeatReadCalls).toBe(0);
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*)::int n FROM business_v2.student_projection_outbox',
          )
        ).rows[0].n,
      ),
    ).toBe(0);
    await pool.query(
      `UPDATE business_v2.parties SET primary_email='test@tandemcoach.co'
       WHERE lower(primary_email::text)='other@example.test'`,
    );

    const accepted = await post(
      '/internal/payments/enrollment-admissions',
      admissionCommand,
    );
    expect(accepted.inner).toMatchObject({
      schemaVersion: 1,
      status: 'accepted',
      checkoutAdmissionEvidence: {
        evidenceReference: checkoutEvidenceReference,
      },
      enrollmentResult: {
        disposition: 'duplicate',
        canonicalEnrollment: 'materialized',
        accessDelivery: 'held',
        reasons: expect.arrayContaining([
          'heartbeat_membership_acceptance_uncertain',
        ]),
        certificateFinancialClearance: 'not_evaluated',
        currentPaymentState: 'eligible',
      },
      promotionConsumptionReceipt: {
        schemaVersion: 1,
        kind: 'promotion_consumption',
        caller,
        operationId: attemptOperationId,
        quoteId: paymentAttempt.quote.quoteId,
        quoteFingerprint: paymentAttempt.quoteFingerprint,
        source: scope,
        attemptId: paymentAttempt.attemptId,
        policyReference: 'mcs-promo-v1-005',
        financialEvidenceClass: 'adyen_card_authorization_v1',
      },
    });
    expect(
      accepted.inner.promotionConsumptionReceipt.financialAdmissionReceipt,
    ).toBe(accepted.inner.enrollmentResult.evidenceReference);
    expect(heartbeatMutationCalls).toBe(1);
    expect(heartbeatReadCalls).toBe(2);
    const duplicate = await post(
      '/internal/payments/enrollment-admissions',
      admissionCommand,
    );
    expect(duplicate.inner.enrollmentResult).toMatchObject({
      disposition: 'duplicate',
      evidenceReference: accepted.inner.enrollmentResult.evidenceReference,
    });
    expect(duplicate.inner.promotionConsumptionReceipt).toEqual(
      accepted.inner.promotionConsumptionReceipt,
    );
    expect(duplicate.inner.enrollmentResult.accessDelivery).toBe(
      'membership_verified',
    );
    expect(duplicate.inner.enrollmentResult.reasons).toContain(
      'heartbeat_membership_verified',
    );
    expect(heartbeatMutationCalls).toBe(1);
    expect(heartbeatReadCalls).toBe(4);
    const fulfilled = await service.fulfillAttempt(paymentAttempt.attemptId);
    expect(fulfilled).toMatchObject({
      enrollmentResult: {
        canonicalEnrollment: 'materialized',
        currentPaymentState: 'eligible',
      },
      receiptWelcome: {
        state: 'verified',
        receiptReference: `fixture-notice:${paymentAttempt.attemptId}`,
      },
    });
    expect(noticeReconcileCalls).toBe(1);
    expect([...noticeEffects]).toEqual([
      `website_checkout_receipt_welcome:${paymentAttempt.attemptId}`,
    ]);
    const v2RecoveryService = createWebsiteCheckoutTestService(
      {
        ...serviceConfig,
        attributionFieldMap: {
          id: 'checkout-attribution-fields-en-mcs-card-v2',
          sha256:
            '0d7fbf7d6c3b548e7ba6cf3249418e50f14fb315d1dfee5cc597a4c748a8456e',
        },
        checkoutDocumentPolicies: serviceConfig.checkoutDocumentPolicies.map(
          (policy) =>
            policy.kind === 'enrollment_terms'
              ? {
                  ...policy,
                  version: 'terms-current-v2',
                  contentSha256: 'd'.repeat(64),
                }
              : policy,
        ),
      },
      { ...serviceDependencies, receiptWelcomeOwner: undefined },
    );
    await expect(
      v2RecoveryService.fulfillAttempt(paymentAttempt.attemptId),
    ).resolves.toMatchObject({
      enrollmentResult: {
        disposition: 'duplicate',
        canonicalEnrollment: 'materialized',
        currentPaymentState: 'eligible',
      },
      receiptWelcome: { state: 'held', receiptReference: null },
    });
    expect(noticeReconcileCalls).toBe(1);
    const callsBeforeLateReplay = sessionCalls;
    const lateRetryReplay = await post('/internal/payments/session-retries', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      terminalReceipt: firstReturn.inner.retry.terminalReceipt,
    });
    expect(lateRetryReplay.inner).toMatchObject({
      state: 'checkout_ready',
      session: successor.inner.session,
    });
    expect(sessionCalls).toBe(callsBeforeLateReplay);

    const counts = await pool.query(
      `SELECT
       (SELECT count(*) FROM business_v2.payment_attempts)::int attempts,
       (SELECT count(*) FROM business_v2.payment_operations)::int operations,
       (SELECT count(*) FROM business_v2.payment_session_terminal_nonpayment_receipts)::int terminal_receipts,
       (SELECT count(*) FROM business_v2.payment_method_bindings)::int methods,
       (SELECT count(*) FROM business_v2.payment_events)::int events,
       (SELECT count(*) FROM business_v2.payment_checkout_admission_evidence)::int checkout_evidence,
       (SELECT count(*) FROM business_v2.payment_checkout_attribution_admissions)::int attribution,
       (SELECT count(*) FROM business_v2.payment_enrollment_admissions)::int admissions,
       (SELECT count(*) FROM business_v2.student_enrollment_orders)::int orders,
       (SELECT count(*) FROM business_v2.student_enrollments_v2)::int enrollments,
       (SELECT count(*) FROM business_v2.student_projection_outbox)::int projections`,
    );
    expect(counts.rows[0]).toEqual({
      attempts: 1,
      operations: 2,
      terminal_receipts: 1,
      methods: 1,
      events: 1,
      checkout_evidence: 1,
      attribution: 1,
      admissions: 1,
      orders: 1,
      enrollments: 1,
      projections: 1,
    });
    const privateAttribution = JSON.stringify(
      (
        await pool.query(
          'SELECT * FROM business_v2.payment_checkout_attribution_admissions',
        )
      ).rows,
    );
    expect(privateAttribution).not.toContain('gclid');
    expect(privateAttribution).not.toContain('promotion-reservation');
    expect(
      (
        await pool.query(
          `SELECT attempt_operation_id::text original_operation,
             (SELECT operation_id::text FROM business_v2.payment_operations
              WHERE attempt_id=$1 ORDER BY session_sequence DESC LIMIT 1) latest_operation
           FROM business_v2.payment_checkout_attribution_admissions
           WHERE attempt_id=$1`,
          [paymentAttempt.attemptId],
        )
      ).rows[0],
    ).toEqual({
      original_operation: attemptOperationId,
      latest_operation: expect.not.stringMatching(attemptOperationId),
    });
    expect(JSON.stringify(duplicate.inner)).not.toContain(psp);
    expect(JSON.stringify(duplicate.inner)).not.toContain('payerRoleProof');
    await verifyRetainedV1HttpReplay();
    await expect(
      pool.query(
        sql('rollback_156_website_checkout_attribution_admission.sql'),
      ),
    ).rejects.toThrow('rollback156 refused');
    await pool.query('ROLLBACK');
  });

  async function verifyRetainedV1HttpReplay() {
    const before = (
      await pool.query(
        `SELECT
         (SELECT count(*) FROM business_v2.payment_checkout_attribution_admissions)::int attribution,
         (SELECT count(*) FROM business_v2.payment_enrollment_admissions)::int admissions,
         (SELECT count(*) FROM business_v2.student_enrollment_orders)::int orders,
         (SELECT count(*) FROM business_v2.student_enrollments_v2)::int enrollments`,
      )
    ).rows[0];
    const noticesBefore = noticeReconcileCalls;
    const v2Service = createWebsiteCheckoutTestService(
      {
        ...serviceConfig,
        attributionFieldMap: {
          id: 'checkout-attribution-fields-en-mcs-card-v2',
          sha256:
            '0d7fbf7d6c3b548e7ba6cf3249418e50f14fb315d1dfee5cc597a4c748a8456e',
        },
        checkoutDocumentPolicies: serviceConfig.checkoutDocumentPolicies.map(
          (policy) =>
            policy.kind === 'enrollment_terms'
              ? {
                  ...policy,
                  version: 'terms-current-v2',
                  contentSha256: 'd'.repeat(64),
                }
              : policy,
        ),
      },
      { ...serviceDependencies, receiptWelcomeOwner: undefined },
    );
    const v2Server = createServer(v2Service.http.handle);
    await new Promise<void>((resolve, reject) => {
      v2Server.once('error', reject);
      v2Server.listen(0, '127.0.0.1', resolve);
    });
    const address = v2Server.address();
    if (!address || typeof address === 'string') throw new Error('no listener');
    const originalBase = baseUrl;
    try {
      baseUrl = `http://127.0.0.1:${address.port}`;
      const exactReplay = await post(
        '/internal/payments/enrollment-admissions',
        acceptedAdmissionCommand,
      );
      expect(exactReplay.response.status).toBe(200);
      expect(exactReplay.inner.enrollmentResult).toMatchObject({
        disposition: 'duplicate',
        canonicalEnrollment: 'materialized',
        currentPaymentState: 'eligible',
      });

      const changed = structuredClone(acceptedAdmissionCommand);
      const snapshot = JSON.parse(
        Buffer.from(
          changed.attribution.snapshotJsonBase64,
          'base64',
        ).toString(),
      );
      snapshot.capturedAt -= 1;
      const snapshotJson = canonicalCheckoutAttributionJson(snapshot);
      changed.attribution.snapshotJsonBase64 =
        Buffer.from(snapshotJson).toString('base64');
      changed.attribution.snapshotSha256 = sha256(snapshotJson);
      const binding = JSON.parse(
        Buffer.from(changed.attribution.bindingJsonBase64, 'base64').toString(),
      );
      binding.snapshotSha256 = changed.attribution.snapshotSha256;
      const bindingJson = canonicalCheckoutAttributionJson(binding);
      changed.attribution.bindingJsonBase64 =
        Buffer.from(bindingJson).toString('base64');
      changed.attribution.bindingSha256 = sha256(bindingJson);
      const changedReplay = await post(
        '/internal/payments/enrollment-admissions',
        changed,
      );
      expect(changedReplay.response.status).toBe(409);
      expect(changedReplay.inner).toEqual({
        error: 'checkout_attribution_evidence_conflict',
      });

      baseUrl = originalBase;
      const oldAttempt = (
        await pool.query<{ contract: ReturnType<typeof createPaymentAttempt> }>(
          'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
          [acceptedAdmissionCommand.attemptId],
        )
      ).rows[0].contract;
      const now = Date.now() - 100;
      const newAttempt = createPaymentAttempt({
        attemptId: randomUUID(),
        now,
        scope,
        paymentMethodCapabilities: ['card'],
        quote: {
          ...oldAttempt.quote,
          quoteId: randomUUID(),
          consentReceipt: 'consent-bundle:v1:new-v1-rejected',
          acceptedAt: now,
          createdAt: now,
          expiresAt: now + 300000,
        },
      });
      const newAttemptOperationId = randomUUID();
      await post('/internal/payments/sessions', {
        requestId: newAttemptOperationId,
        attempt: newAttempt,
      });
      const oldSnapshot = JSON.parse(
        Buffer.from(
          acceptedAttribution.snapshotJsonBase64,
          'base64',
        ).toString(),
      );
      const newAttribution = attribution({
        intentId: oldSnapshot.intentId,
        attemptId: newAttempt.attemptId,
        attemptOperationId: newAttemptOperationId,
        quote: newAttempt.quote,
        quoteFingerprint: newAttempt.quoteFingerprint,
        privacyVersion: acceptedAdmissionCommand.consentBundle.privacy.version,
        privacyReceipt:
          acceptedAdmissionCommand.consentBundle.privacy.receiptReference,
      });
      const newV1Command = {
        ...structuredClone(acceptedAdmissionCommand),
        requestId: randomUUID(),
        attemptId: newAttempt.attemptId,
        quoteId: newAttempt.quote.quoteId,
        quoteFingerprint: newAttempt.quoteFingerprint,
        consentBundle: {
          ...structuredClone(acceptedAdmissionCommand.consentBundle),
          bundleReceiptReference: newAttempt.quote.consentReceipt,
          enrollmentTerms: {
            ...acceptedAdmissionCommand.consentBundle.enrollmentTerms,
            acceptedAt: now,
          },
          privacy: {
            ...acceptedAdmissionCommand.consentBundle.privacy,
            acceptedAt: now,
          },
        },
        attribution: newAttribution,
      };
      baseUrl = `http://127.0.0.1:${address.port}`;
      const newV1 = await post(
        '/internal/payments/enrollment-admissions',
        newV1Command,
      );
      expect(newV1.response.status).toBe(409);
      expect(newV1.inner).toEqual({
        error: 'checkout_attribution_binding_conflict',
      });

      const currentV2Attribution = attribution({
        intentId: oldSnapshot.intentId,
        attemptId: newAttempt.attemptId,
        attemptOperationId: newAttemptOperationId,
        quote: newAttempt.quote,
        quoteFingerprint: newAttempt.quoteFingerprint,
        privacyVersion: acceptedAdmissionCommand.consentBundle.privacy.version,
        privacyReceipt:
          acceptedAdmissionCommand.consentBundle.privacy.receiptReference,
        fieldMap: {
          id: 'checkout-attribution-fields-en-mcs-card-v2',
          sha256:
            '0d7fbf7d6c3b548e7ba6cf3249418e50f14fb315d1dfee5cc597a4c748a8456e',
        },
      });
      const oldTermsNewAdmission = {
        ...newV1Command,
        requestId: randomUUID(),
        attribution: currentV2Attribution,
      };
      const oldTerms = await post(
        '/internal/payments/enrollment-admissions',
        oldTermsNewAdmission,
      );
      expect(oldTerms.response.status).toBe(401);
      expect(oldTerms.inner).toEqual({
        error: 'checkout_document_policy_denied',
      });
    } finally {
      baseUrl = originalBase;
      await new Promise<void>((resolve, reject) =>
        v2Server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    const after = (
      await pool.query(
        `SELECT
         (SELECT count(*) FROM business_v2.payment_checkout_attribution_admissions)::int attribution,
         (SELECT count(*) FROM business_v2.payment_enrollment_admissions)::int admissions,
         (SELECT count(*) FROM business_v2.student_enrollment_orders)::int orders,
         (SELECT count(*) FROM business_v2.student_enrollments_v2)::int enrollments`,
      )
    ).rows[0];
    expect(after).toEqual(before);
    expect(noticeReconcileCalls).toBe(noticesBefore);
  }

  it('rejects incomplete service scope and attribution tampering before canonical writes', async () => {
    const beforeCheckout = Number(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence',
        )
      ).rows[0].n,
    );
    const missingAttribution = structuredClone(acceptedAdmissionCommand);
    missingAttribution.requestId = randomUUID();
    delete missingAttribution.attribution;
    const missing = await post(
      '/internal/payments/enrollment-admissions',
      missingAttribution,
    );
    expect(missing.response.status).toBe(400);
    expect(missing.inner).toEqual({ error: 'invalid_checkout_attribution' });
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence',
          )
        ).rows[0].n,
      ),
    ).toBe(beforeCheckout);

    const tampered = structuredClone(acceptedAttribution);
    const snapshot = JSON.parse(
      Buffer.from(tampered.snapshotJsonBase64, 'base64').toString(),
    );
    snapshot.productName = 'Changed product';
    tampered.snapshotJsonBase64 = Buffer.from(
      canonicalCheckoutAttributionJson(snapshot),
    ).toString('base64');
    expect(() => parseCheckoutAttributionHandoff(tampered)).toThrow(
      'checkout_attribution_snapshot_conflict',
    );

    const selfRehashed = structuredClone(tampered);
    selfRehashed.snapshotSha256 = sha256(
      Buffer.from(selfRehashed.snapshotJsonBase64, 'base64').toString(),
    );
    expect(() => parseCheckoutAttributionHandoff(selfRehashed)).toThrow(
      'checkout_attribution_binding_conflict',
    );

    const poisoned = structuredClone(acceptedAdmissionCommand);
    poisoned.requestId = randomUUID();
    const poisonedBinding = JSON.parse(
      Buffer.from(poisoned.attribution.bindingJsonBase64, 'base64').toString(),
    );
    poisonedBinding.privacyVersion = 'privacy-other';
    const poisonedBindingJson =
      canonicalCheckoutAttributionJson(poisonedBinding);
    poisoned.attribution.bindingJsonBase64 =
      Buffer.from(poisonedBindingJson).toString('base64');
    poisoned.attribution.bindingSha256 = sha256(poisonedBindingJson);
    const poisonResponse = await post(
      '/internal/payments/enrollment-admissions',
      poisoned,
    );
    expect(poisonResponse.response.status).toBe(409);
    expect(poisonResponse.inner).toEqual({
      error: 'checkout_attribution_binding_conflict',
    });
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence',
          )
        ).rows[0].n,
      ),
    ).toBe(beforeCheckout);

    const now = Date.now() - 1000;
    const wrongMethodAttempt = createPaymentAttempt({
      attemptId: randomUUID(),
      now,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: randomUUID(),
        authority: 'wordpress:test',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: publication.source_versions.checkout_catalog,
        bundleVersion: 'mcs-foundations-en:v1:revision-1',
        deliveryVersion:
          'publication:student-foundations-publication-v1:r1:mcq-program-a-foundations',
        locale: 'en-US',
        country: 'US',
        payerReference: null,
        participantReference: null,
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 0,
        finalAmount: 29900,
        discountPolicyReference: null,
        redemptionReference: null,
        paymentOption: 'one_time',
        termsVersion: 'terms-v1',
        consentReceipt: 'consent-bundle:v1:wrong-method',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 300000,
      },
    });
    const wrongStarted = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: wrongMethodAttempt,
    });
    providerMethod = 'ach';
    try {
      const wrongReturn = await post('/internal/payments/returns', {
        requestId: randomUUID(),
        attemptId: wrongMethodAttempt.attemptId,
        capability: wrongStarted.inner.capability,
        sessionResult: 'synthetic-wrong-method-result',
      });
      expect(wrongReturn.response.status).toBe(200);
      expect(wrongReturn.inner).toEqual({
        attemptId: wrongMethodAttempt.attemptId,
        state: 'needs_review',
      });
    } finally {
      providerMethod = 'scheme';
    }
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*)::int n FROM business_v2.payment_method_bindings WHERE attempt_id=$1',
            [wrongMethodAttempt.attemptId],
          )
        ).rows[0].n,
      ),
    ).toBe(0);

    expect(() =>
      createWebsiteCheckoutTestService(
        {
          payment: {
            mode: 'test',
            caller,
            scope,
            quoteAuthorities: ['wordpress:test'],
            recoveryOfferLocales: ['mcq-program-a-foundations:en-US'],
            newAttemptOfferLocales: ['mcq-program-a-foundations:en-US'],
            paymentMethodCapabilities: ['card', 'ach_direct_debit'],
            recoveryMode: 'dispatch',
            requestKeys,
            signedResponses: {
              keyId: 'response-v1',
              key: { caller, secret: responseSecret },
            },
            payloadKeyId: 'payload-v1',
            payloadKeys: new Map([['payload-v1', Buffer.from('p'.repeat(32))]]),
            returnBindingKey: Buffer.from('b'.repeat(32)),
            adyenApiKey: 'synthetic',
            sessionRouting: {
              allowedOrigin: 'https://preview.example.test',
              returnPath: '/checkout-return',
            },
            webhook: {
              hmacKeys: [webhookKey],
              merchantAccount: scope.merchant,
              storeReference: scope.store!,
              referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
              allowedEventCodes: ['AUTHORISATION'],
            },
            limits: {
              requestsPerWindow: 10,
              maxActive: 2,
              windowMs: 60000,
              maxBodyBytes: 100000,
              bodyReadTimeoutMs: 1000,
            },
          },
          identitySecret: 'i'.repeat(32),
          identityTokenSecret: Buffer.from('t'.repeat(32)),
          identityReferenceSecret: Buffer.from('o'.repeat(32)),
          checkoutEvidenceSecret: Buffer.from('e'.repeat(32)),
          attributionFieldMap: {
            id: 'payment-attribution-v1',
            sha256: '2'.repeat(64),
          },
          promotionPolicyReferences: ['mcs-promo-v1-005'],
          checkoutDocumentPolicies: [],
          publication,
          publicationPin,
          cardCaptureConfigurationEvidence: 'fixture',
        },
        { pool, transaction },
      ),
    ).toThrow('invalid_website_checkout_configuration');
  });

  it('creates at most two explicit successors from exact terminal receipts and diverts a late positive', async () => {
    const now = Date.now() - 1000;
    const paymentAttempt = createPaymentAttempt({
      attemptId: randomUUID(),
      now,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: randomUUID(),
        authority: 'wordpress:test',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: publication.source_versions.checkout_catalog,
        bundleVersion: 'mcs-foundations-en:v1:revision-1',
        deliveryVersion:
          'publication:student-foundations-publication-v1:r1:mcq-program-a-foundations',
        locale: 'en-US',
        country: 'US',
        payerReference: null,
        participantReference: null,
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 500,
        finalAmount: 29400,
        discountPolicyReference: 'promotion:mcs-promo-v1-005',
        redemptionReference: 'promotion-reservation:v1:retry-fixture',
        paymentOption: 'one_time',
        termsVersion: 'terms-v1',
        consentReceipt: 'consent-bundle:v1:retry-fixture',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 300000,
      },
    });
    const originalContract = JSON.stringify(paymentAttempt);
    const started = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: paymentAttempt,
    });
    expect(started.inner).toMatchObject({
      state: 'checkout_ready',
      attemptId: paymentAttempt.attemptId,
    });
    expect(started.inner.returnBinding).toMatch(/^prb1_/);

    providerTerminalStatus = 'refused';
    const refused = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'terminal-refused-result',
      returnBinding: started.inner.returnBinding,
    });
    expect(refused.inner).toMatchObject({
      state: 'terminal_nonpayment',
      retry: { disposition: 'eligible' },
    });
    const firstReceipt = refused.inner.retry.terminalReceipt;

    providerTerminalStatus = null;
    const successor2 = await post('/internal/payments/session-retries', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      terminalReceipt: firstReceipt,
    });
    expect(successor2.inner).toMatchObject({ state: 'checkout_ready' });
    expect(successor2.inner.session.id).toContain('-s2');
    expect(successor2.inner.returnBinding).not.toBe(
      started.inner.returnBinding,
    );
    const replay2 = await post('/internal/payments/session-retries', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      terminalReceipt: firstReceipt,
    });
    expect(replay2.inner.session).toEqual(successor2.inner.session);
    expect(replay2.inner.returnBinding).toMatch(/^prb1_/);

    providerTerminalStatus = 'canceled';
    const canceled = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'terminal-canceled-result',
      returnBinding: successor2.inner.returnBinding,
    });
    expect(canceled.inner).toMatchObject({
      state: 'terminal_nonpayment',
      retry: { disposition: 'eligible' },
    });

    providerTerminalStatus = null;
    const successor3 = await post('/internal/payments/session-retries', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      terminalReceipt: canceled.inner.retry.terminalReceipt,
    });
    expect(successor3.inner.session.id).toContain('-s3');

    providerTerminalStatus = 'expired';
    const expired = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'terminal-expired-result',
      returnBinding: successor3.inner.returnBinding,
    });
    expect(expired.inner).toMatchObject({
      state: 'terminal_nonpayment',
      retry: { disposition: 'limit_reached' },
    });

    const lateWebhook = await postWebhook(
      webhook(
        paymentAttempt.attemptId,
        paymentAttempt.quote.finalAmount,
        `LATEPOS${paymentAttempt.attemptId.replaceAll('-', '').slice(0, 8)}`,
        'AUTHORISATION',
        1,
      ),
    );
    expect(lateWebhook.response.status).toBe(202);
    expect(lateWebhook.body).toBe('[accepted]');
    const latePositiveSubmit = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: paymentAttempt.attemptId,
        capability: started.inner.capability,
        returnBinding: successor3.inner.returnBinding,
      },
    );
    expect(latePositiveSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'needs_review',
    });

    providerTerminalStatus = null;
    const stalePositive = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'late-positive-old-tab',
      returnBinding: started.inner.returnBinding,
    });
    expect(stalePositive.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'needs_review',
    });

    const proof = await pool.query(
      `SELECT
       (SELECT jsonb_agg(jsonb_build_object(
         'sequence',session_sequence,
         'predecessor',predecessor_operation_id,
         'receipt',retry_terminal_receipt_sha256)
         ORDER BY session_sequence)
        FROM business_v2.payment_operations WHERE attempt_id=$1) operations,
       (SELECT count(*)::int FROM business_v2.payment_session_terminal_nonpayment_receipts
        WHERE attempt_id=$1) terminal_receipts,
       (SELECT count(*)::int FROM business_v2.payment_session_retry_exceptions
        WHERE attempt_id=$1) exceptions,
       (SELECT count(*)::int FROM business_v2.payment_method_bindings
        WHERE attempt_id=$1) methods,
       (SELECT contract::text FROM business_v2.payment_attempts
        WHERE attempt_id=$1) contract`,
      [paymentAttempt.attemptId],
    );
    expect(proof.rows[0].operations).toHaveLength(3);
    expect(proof.rows[0].operations[0]).toMatchObject({
      sequence: 1,
      predecessor: null,
      receipt: null,
    });
    expect(proof.rows[0].operations[1]).toMatchObject({ sequence: 2 });
    expect(proof.rows[0].operations[2]).toMatchObject({ sequence: 3 });
    expect(proof.rows[0].terminal_receipts).toBe(3);
    expect(proof.rows[0].exceptions).toBe(2);
    expect(proof.rows[0].methods).toBe(0);
    expect(JSON.parse(proof.rows[0].contract)).toEqual(
      JSON.parse(originalContract),
    );
    expect(
      (
        await pool.query(
          `SELECT projection->>'state' state
           FROM business_v2.payment_checkout_evidence WHERE attempt_id=$1`,
          [paymentAttempt.attemptId],
        )
      ).rows[0].state,
    ).toBe('needs_review');
    await expect(
      pool.query(sql('rollback_159_payment_terminal_card_retry.sql')),
    ).rejects.toThrow('rollback refused: terminal retry evidence exists');
    await pool.query('ROLLBACK');
  });

  it('requires reconfirmation after quote expiry without creating a provider Session', async () => {
    const now = Date.now() - 100;
    const paymentAttempt = createPaymentAttempt({
      attemptId: randomUUID(),
      now,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: randomUUID(),
        authority: 'wordpress:test',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: publication.source_versions.checkout_catalog,
        bundleVersion: 'mcs-foundations-en:v1:revision-1',
        deliveryVersion:
          'publication:student-foundations-publication-v1:r1:mcq-program-a-foundations',
        locale: 'en-US',
        country: 'US',
        payerReference: null,
        participantReference: null,
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 0,
        finalAmount: 29900,
        discountPolicyReference: null,
        redemptionReference: null,
        paymentOption: 'one_time',
        termsVersion: 'terms-v1',
        consentReceipt: 'consent-bundle:v1:expiry-fixture',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 1200,
      },
    });
    const started = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: paymentAttempt,
    });
    providerTerminalStatus = 'expired';
    await delay(Math.max(0, paymentAttempt.quote.expiresAt - Date.now() + 25));
    const beforeCalls = sessionCalls;
    const expiredSubmit = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: paymentAttempt.attemptId,
        capability: started.inner.capability,
        returnBinding: started.inner.returnBinding,
      },
    );
    expect(expiredSubmit.inner).toEqual({
      attemptId: paymentAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'expired',
    });
    const terminal = await post('/internal/payments/returns', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      sessionResult: 'terminal-after-session-expiry',
      returnBinding: started.inner.returnBinding,
    });
    expect(terminal.inner).toMatchObject({
      state: 'terminal_nonpayment',
      retry: { disposition: 'reconfirmation_required' },
    });
    const status = await post('/internal/payments/status', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
    });
    expect(status.inner).toMatchObject({
      state: 'terminal_nonpayment',
      retry: { disposition: 'reconfirmation_required' },
    });
    const retry = await post('/internal/payments/session-retries', {
      requestId: randomUUID(),
      attemptId: paymentAttempt.attemptId,
      capability: started.inner.capability,
      terminalReceipt: terminal.inner.retry.terminalReceipt,
    });
    expect(retry.inner).toMatchObject({ state: 'reconfirmation_required' });
    expect(sessionCalls).toBe(beforeCalls);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_operations WHERE attempt_id=$1',
          [paymentAttempt.attemptId],
        )
      ).rows[0].n,
    ).toBe(1);
    providerTerminalStatus = null;
  });

  it('blocks pre-submit on pending facts and unknown result reconciliation without provider writes', async () => {
    const makeAttempt = (label: string) => {
      const now = Date.now() - 100;
      return createPaymentAttempt({
        attemptId: randomUUID(),
        now,
        scope,
        paymentMethodCapabilities: ['card'],
        quote: {
          schemaVersion: 1,
          quoteId: randomUUID(),
          authority: 'wordpress:test',
          offerKey: 'mcq-program-a-foundations',
          catalogVersion: publication.source_versions.checkout_catalog,
          bundleVersion: 'mcs-foundations-en:v1:revision-1',
          deliveryVersion:
            'publication:student-foundations-publication-v1:r1:mcq-program-a-foundations',
          locale: 'en-US',
          country: 'US',
          payerReference: null,
          participantReference: null,
          currency: 'USD',
          originalAmount: 29900,
          discountAmount: 0,
          finalAmount: 29900,
          discountPolicyReference: null,
          redemptionReference: null,
          paymentOption: 'one_time',
          termsVersion: 'terms-v1',
          consentReceipt: `consent-bundle:v1:${label}`,
          acceptedAt: now,
          createdAt: now,
          expiresAt: now + 60000,
        },
      });
    };

    const pendingAttempt = makeAttempt('pending-submit');
    const pendingStarted = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: pendingAttempt,
    });
    const pendingReference = `PENDING${pendingAttempt.attemptId.replaceAll('-', '').slice(0, 9)}`;
    await pool.query(
      `INSERT INTO business_v2.payment_provider_references
       (scope_sha256,payment_reference,attempt_id,payment_operation_id,session_sequence)
       VALUES($1,$2,$3,$3,1)`,
      [
        paymentScopeFingerprint(scope),
        pendingReference,
        pendingAttempt.attemptId,
      ],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_events
       (scope_sha256,event_id,payload_sha256,attempt_id,payment_reference,fact,
        payment_operation_id,session_sequence)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$4,1)`,
      [
        paymentScopeFingerprint(scope),
        `pending-submit-${pendingAttempt.attemptId}`,
        '9'.repeat(64),
        pendingAttempt.attemptId,
        pendingReference,
        JSON.stringify({ kind: 'pending', success: true }),
      ],
    );
    const pendingCalls = { sessionCalls, resultCalls };
    const pendingCheck = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: pendingAttempt.attemptId,
        capability: pendingStarted.inner.capability,
        returnBinding: pendingStarted.inner.returnBinding,
      },
    );
    expect(pendingCheck.inner).toEqual({
      attemptId: pendingAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'needs_review',
    });
    expect({ sessionCalls, resultCalls }).toEqual(pendingCalls);

    const unknownAttempt = makeAttempt('unknown-submit');
    const unknownStarted = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: unknownAttempt,
    });
    providerResultUnavailable = true;
    try {
      const unknownReturn = await post('/internal/payments/returns', {
        requestId: randomUUID(),
        attemptId: unknownAttempt.attemptId,
        capability: unknownStarted.inner.capability,
        sessionResult: 'unknown-provider-result',
        returnBinding: unknownStarted.inner.returnBinding,
      });
      expect(unknownReturn.inner).toEqual({
        attemptId: unknownAttempt.attemptId,
        state: 'confirming_payment',
      });
    } finally {
      providerResultUnavailable = false;
    }
    const unknownCalls = { sessionCalls, resultCalls };
    const unknownCheck = await post(
      '/internal/payments/session-submit-checks',
      {
        requestId: randomUUID(),
        attemptId: unknownAttempt.attemptId,
        capability: unknownStarted.inner.capability,
        returnBinding: unknownStarted.inner.returnBinding,
      },
    );
    expect(unknownCheck.inner).toEqual({
      attemptId: unknownAttempt.attemptId,
      state: 'session_submit_blocked',
      reason: 'needs_review',
    });
    expect({ sessionCalls, resultCalls }).toEqual(unknownCalls);

    const failedAttempt = makeAttempt('failed-card-submit');
    const failedStarted = await post('/internal/payments/sessions', {
      requestId: randomUUID(),
      attempt: failedAttempt,
    });
    const failedReference = `FAILED${failedAttempt.attemptId.replaceAll('-', '').slice(0, 10)}`;
    await pool.query(
      `INSERT INTO business_v2.payment_provider_references
       (scope_sha256,payment_reference,attempt_id,payment_operation_id,session_sequence)
       VALUES($1,$2,$3,$3,1)`,
      [
        paymentScopeFingerprint(scope),
        failedReference,
        failedAttempt.attemptId,
      ],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_events
       (scope_sha256,event_id,payload_sha256,attempt_id,payment_reference,fact,
        payment_operation_id,session_sequence)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$4,1)`,
      [
        paymentScopeFingerprint(scope),
        `failed-card-${failedAttempt.attemptId}`,
        '8'.repeat(64),
        failedAttempt.attemptId,
        failedReference,
        JSON.stringify({ kind: 'authorization', success: false }),
      ],
    );
    const failedCalls = { sessionCalls, resultCalls };
    const failedCheck = await post('/internal/payments/session-submit-checks', {
      requestId: randomUUID(),
      attemptId: failedAttempt.attemptId,
      capability: failedStarted.inner.capability,
      returnBinding: failedStarted.inner.returnBinding,
    });
    expect(failedCheck.inner).toEqual({
      attemptId: failedAttempt.attemptId,
      state: 'session_submit_allowed',
    });
    expect({ sessionCalls, resultCalls }).toEqual(failedCalls);
  });
});
