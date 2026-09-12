import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PaymentAdmissionStore } from './payment-admission-store.js';
import { PaymentRequestLimiter } from './payment-api-controller.js';
import { PaymentCheckoutAdmissionController } from './payment-checkout-admission-controller.js';
import { CheckoutAdmissionEvidenceIssuer } from './payment-checkout-admission.js';
import { PaymentCheckoutAdmissionStore } from './payment-checkout-admission-store.js';
import {
  createPaymentAttempt,
  paymentScopeFingerprint,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentHttpAdapter } from './payment-http-adapter.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import { PaymentResponseSigner } from './payment-signed-response-controller.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';

const database = `nc_checkout_admission_${process.pid}_${randomUUID().replaceAll('-', '')}`;
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 6,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let server: Server;
let baseUrl: string;
let checkoutStore: PaymentCheckoutAdmissionStore;
let paymentStore: PaymentStore;
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
const requestKey = Buffer.from('r'.repeat(32));
const responseKey = Buffer.from('s'.repeat(32));
const requestKeys = new Map([['req-v1', { caller, secret: requestKey }]]);
const auth = new PaymentRequestAuthenticator(requestKeys);
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
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const now = Date.now() - 1000;
const attempt = createPaymentAttempt({
  attemptId: '40000000-0000-4000-8000-000000000004',
  now,
  scope,
  paymentMethodCapabilities: ['ach_direct_debit'],
  quote: {
    schemaVersion: 1,
    quoteId: '50000000-0000-4000-8000-000000000005',
    authority: 'wordpress:test',
    offerKey: 'mcs-foundations-es',
    catalogVersion: 'foundations-test:1',
    bundleVersion: 'mcs-foundations-es-419:v1',
    deliveryVersion: 'foundations-test:1',
    locale: 'es-419',
    country: 'MX',
    payerReference: `party-ref:v1:${'a'.repeat(64)}`,
    participantReference: `party-ref:v1:${'a'.repeat(64)}`,
    currency: 'USD',
    originalAmount: 29900,
    discountAmount: 10000,
    finalAmount: 19900,
    discountPolicyReference: 'latam-resident-v1',
    redemptionReference: null,
    paymentOption: 'one_time',
    termsVersion: 'terms-v1',
    consentReceipt: 'consent-bundle:v1:fixture',
    acceptedAt: now,
    createdAt: now,
    expiresAt: now + 300000,
  },
});
const command = {
  schemaVersion: 1,
  requestId: '60000000-0000-4000-8000-000000000006',
  attemptId: attempt.attemptId,
  quoteId: attempt.quote.quoteId,
  quoteFingerprint: attempt.quoteFingerprint,
  identity: {
    preparationId: '10000000-0000-4000-8000-000000000001',
    originOperationId: '20000000-0000-4000-8000-000000000002',
    receiptReference: `identity-preparation:v1:${'b'.repeat(64)}`,
    payerReference: attempt.quote.payerReference!,
    participantReference: attempt.quote.participantReference!,
    payerRoleProof: `party-role-proof:v1:${'c'.repeat(64)}`,
    participantRoleProof: `party-role-proof:v1:${'d'.repeat(64)}`,
    purchaseRelationship: 'self',
  },
  consentBundle: {
    bundleReceiptReference: attempt.quote.consentReceipt,
    enrollmentTerms: {
      version: attempt.quote.termsVersion,
      contentSha256: 'e'.repeat(64),
      receiptReference: 'terms-consent:v1:fixture',
      acceptedAt: attempt.quote.acceptedAt,
    },
    privacy: {
      version: 'privacy-v1',
      contentSha256: 'f'.repeat(64),
      receiptReference: 'privacy-consent:v1:fixture',
      acceptedAt: attempt.quote.acceptedAt,
    },
    achMandate: {
      version: 'ach-mandate-v1',
      contentSha256: '1'.repeat(64),
      receiptReference: 'ach-mandate:v1:fixture',
      acceptedAt: attempt.quote.acceptedAt + 1,
      amountMinor: attempt.quote.finalAmount,
      currency: attempt.quote.currency,
      frequency: 'one_time',
      secCode: 'WEB',
    },
  },
};

function wire(value: Record<string, unknown>, nonce = randomUUID()) {
  const body = Buffer.from(JSON.stringify(value));
  return JSON.stringify({
    auth: auth.sign(
      {
        version: 1,
        keyId: 'req-v1',
        caller,
        method: 'POST',
        path: '/internal/payments/enrollment-admissions',
        timestamp: Date.now(),
        nonce,
        operationId: String(value.requestId),
      },
      body,
    ),
    payloadBase64: body.toString('base64'),
  });
}

async function post(value: Record<string, unknown>) {
  const response = await fetch(
    `${baseUrl}/internal/payments/enrollment-admissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: wire(value),
    },
  );
  const outer = (await response.json()) as any;
  return {
    status: response.status,
    inner: JSON.parse(Buffer.from(outer.payloadBase64, 'base64').toString()),
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
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
    '153_website_checkout_provisional_finance.sql',
    '154_payment_identity_preparation.sql',
    '161_payment_checkout_billing_profile.sql',
    '155_website_checkout_admission_evidence.sql',
    'rollback_155_website_checkout_admission_evidence.sql',
    '155_website_checkout_admission_evidence.sql',
  ])
    await pool.query(sql(migration));
  const vault = new PaymentPayloadVault(
    'payload-v1',
    new Map([['payload-v1', randomBytes(32)]]),
  );
  paymentStore = new PaymentStore(transaction, vault);
  await paymentStore.acceptAttempt(attempt);
  await transaction(async (client) => {
    const party = await client.query<{ id: string }>(
      `SELECT business_v2.fn_create_party('person','Fixture Person',
       'fixture-person@example.test'::citext,'wordpress','{}'::jsonb)::text id`,
    );
    const interaction = await client.query<{ id: string }>(
      `SELECT business_v2.fn_log_interaction_dedup($1,'form-submission',
       'inbound','fixture',$2::timestamptz,'{}'::jsonb,'wordpress',$3)::text id`,
      [party.rows[0].id, new Date(now).toISOString(), 'identity-fixture'],
    );
    await client.query(
      `INSERT INTO business_v2.payment_identity_preparations
       (preparation_id,caller,origin_operation_id,intent_id,offer_key,
        purchase_relationship,identity_request_sha256,source,source_sha256,
        payer_party_id,participant_party_id,payer_interaction_id,
        participant_interaction_id,payer_reference,participant_reference,
        payer_role_proof,participant_role_proof,receipt_reference,resolved_at)
       VALUES($1,$2,$3,$4,$5,'self',repeat('2',64),$6::jsonb,$7,$8,$8,$9,$9,
        $10,$10,$11,$12,$13,$14)`,
      [
        command.identity.preparationId,
        caller,
        command.identity.originOperationId,
        '30000000-0000-4000-8000-000000000003',
        attempt.quote.offerKey,
        JSON.stringify(scope),
        paymentScopeFingerprint(scope),
        party.rows[0].id,
        interaction.rows[0].id,
        command.identity.payerReference,
        command.identity.payerRoleProof,
        command.identity.participantRoleProof,
        command.identity.receiptReference,
        now,
      ],
    );
  });
  const admission = new PaymentAdmissionStore(
    transaction,
    auth,
    vault,
    () => false,
  );
  checkoutStore = new PaymentCheckoutAdmissionStore(
    transaction,
    caller,
    scope,
    new CheckoutAdmissionEvidenceIssuer(Buffer.from('e'.repeat(32))),
    [
      {
        kind: 'enrollment_terms',
        version: 'terms-v1',
        contentSha256: 'e'.repeat(64),
        effectiveFrom: 0,
        effectiveTo: null,
      },
      {
        kind: 'privacy',
        version: 'privacy-v1',
        contentSha256: 'f'.repeat(64),
        effectiveFrom: 0,
        effectiveTo: null,
      },
      {
        kind: 'ach_mandate',
        version: 'ach-mandate-v1',
        contentSha256: '1'.repeat(64),
        effectiveFrom: 0,
        effectiveTo: null,
      },
    ],
  );
  const controller = new PaymentCheckoutAdmissionController(
    caller,
    new PaymentRequestLimiter(100, 5, 60000),
    new PaymentResponseSigner('resp-v1', { caller, secret: responseKey }, [
      requestKey,
    ]),
    { admission, store: checkoutStore },
  );
  server = createServer(new PaymentHttpAdapter(controller).handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
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

describe('authenticated checkout admission evidence', () => {
  it('rejects new evidence whose policy content is not in the host registry', async () => {
    const unapproved = structuredClone(command);
    unapproved.consentBundle.privacy.contentSha256 = '0'.repeat(64);
    expect(await post(unapproved)).toMatchObject({
      status: 401,
      inner: { error: 'checkout_document_policy_denied' },
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence',
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('accepts and reconstructs one exact durable evidence receipt', async () => {
    const first = await post(command);
    expect(first.status).toBe(200);
    expect(first.inner).toMatchObject({
      schemaVersion: 1,
      status: 'accepted',
      checkoutAdmissionEvidence: {
        kind: 'checkout_admission_evidence',
        attemptId: attempt.attemptId,
        identityReceiptReference: command.identity.receiptReference,
        consentBundleReceiptReference:
          command.consentBundle.bundleReceiptReference,
      },
    });
    expect((await post(command)).inner).toEqual(first.inner);
    const durable = await checkoutStore.readByAttempt(attempt.attemptId);
    expect(durable).not.toBeNull();
    expect(checkoutStore.receiptForRow(durable!)).toEqual(
      first.inner.checkoutAdmissionEvidence,
    );
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence',
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('returns signed conflict for changed replay and unknown attempt without writes', async () => {
    const changed = structuredClone(command);
    changed.consentBundle.privacy.receiptReference = 'privacy:changed';
    expect(await post(changed)).toMatchObject({
      status: 409,
      inner: { error: 'checkout_admission_evidence_conflict' },
    });
    const newCommand = structuredClone(command);
    newCommand.requestId = randomUUID();
    newCommand.attemptId = randomUUID();
    newCommand.consentBundle.privacy.contentSha256 = '0'.repeat(64);
    expect(await post(newCommand)).toMatchObject({
      status: 409,
      inner: { error: 'checkout_admission_binding_conflict' },
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence',
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('returns signed conflict for missing exact identity without writes', async () => {
    const createdAt = Date.now() - 1000;
    const missingIdentityAttempt = createPaymentAttempt({
      attemptId: randomUUID(),
      now: createdAt,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        ...attempt.quote,
        quoteId: randomUUID(),
        acceptedAt: createdAt,
        createdAt,
        expiresAt: createdAt + 300000,
      },
    });
    await paymentStore.acceptAttempt(missingIdentityAttempt);
    const missingIdentity = structuredClone(command);
    missingIdentity.requestId = randomUUID();
    missingIdentity.attemptId = missingIdentityAttempt.attemptId;
    missingIdentity.quoteId = missingIdentityAttempt.quote.quoteId;
    missingIdentity.quoteFingerprint = missingIdentityAttempt.quoteFingerprint;
    missingIdentity.identity.preparationId = randomUUID();
    missingIdentity.identity.originOperationId = randomUUID();
    missingIdentity.consentBundle.enrollmentTerms.acceptedAt = createdAt;
    missingIdentity.consentBundle.privacy.acceptedAt = createdAt;
    (missingIdentity.consentBundle as { achMandate: unknown }).achMandate =
      null;
    expect(await post(missingIdentity)).toMatchObject({
      status: 409,
      inner: { error: 'checkout_admission_binding_conflict' },
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_checkout_admission_evidence WHERE attempt_id=$1',
          [missingIdentityAttempt.attemptId],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('refuses populated rollback and stores no contacts or browser payloads', async () => {
    await expect(
      pool.query(sql('rollback_155_website_checkout_admission_evidence.sql')),
    ).rejects.toThrow('rollback155 refused');
    await pool.query('ROLLBACK');
    const stored = JSON.stringify(
      (
        await pool.query(
          'SELECT * FROM business_v2.payment_checkout_admission_evidence',
        )
      ).rows,
    );
    expect(stored).not.toContain('fixture-person@example.test');
    expect(stored).not.toContain('firstName');
  });
});
