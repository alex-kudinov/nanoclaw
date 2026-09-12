import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PgPaymentCheckoutDocumentStore,
  parseWebsiteCheckoutDocumentConfig,
  websiteCheckoutPaidInvoiceActivationHash,
  type PaymentCheckoutDocumentAuthority,
} from './payment-checkout-documents.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import type { PaymentTransaction } from './payment-store.js';

const database = `nc_checkout_documents_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_checkout_documents_[0-9]+_[a-f0-9]{32}$/u.test(database))
  throw new Error('unsafe disposable database name');
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 12,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let created = false;
let transaction: PaymentTransaction;
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const scope = {
  provider: 'adyen' as const,
  environment: 'live' as const,
  company: 'company',
  merchant: 'merchant',
  store: 'store',
  endpointRegion: 'eu',
};
const receiptConfig = parseWebsiteCheckoutDocumentConfig(undefined);

function authority(
  attemptId: string,
  paymentReference: string,
  billing = false,
): PaymentCheckoutDocumentAuthority {
  return {
    attemptId,
    preparationId: randomUUID(),
    payerPartyId: 1,
    participantPartyId: 1,
    relationship: 'self',
    payer: { name: 'José Example', email: 'jose@example.test' },
    participant: { name: 'José Example', email: 'jose@example.test' },
    billingProfile: billing
      ? {
          schemaVersion: 1,
          companyLegalName: 'Example Coaching LLC',
          invoiceEmail: 'accounts@example.test',
          taxId: '12-3456789',
          address: {
            street: 'Main Street',
            houseNumberOrName: '42',
            city: 'Austin',
            postalCode: '78701',
            stateOrProvince: 'TX',
            country: 'US',
          },
        }
      : null,
    originalAmount: 29900,
    discountAmount: 0,
    finalAmount: 29900,
    discountPolicyReference: null,
    paymentReference,
    tandemReference: `TCA-${paymentReference.padEnd(12, 'A').slice(0, 12).toUpperCase()}`,
    paymentRecordedAt: '2026-09-12T12:00:00.000Z',
    termsVersion: 'terms-v1',
    termsSha256: '1'.repeat(64),
    privacyVersion: 'privacy-v1',
    privacySha256: '2'.repeat(64),
  };
}

async function insertAttempt(attemptId: string) {
  await pool.query(
    `INSERT INTO business_v2.payment_attempts(attempt_id,scope_sha256,quote_id,contract)
     VALUES($1,$2,$3,'{}')`,
    [attemptId, 'a'.repeat(64), randomUUID()],
  );
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
  await pool.query(
    `CREATE FUNCTION business_v2.fn_company_work_append_only() RETURNS trigger
     LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only fixture'; END $$;
     ALTER FUNCTION business_v2.fn_company_work_append_only() OWNER TO nanoclaw_admin`,
  );
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
    '163_payment_checkout_documents.sql',
  ])
    await pool.query(sql(migration));
  await pool.query(sql('rollback_163_payment_checkout_documents.sql'));
  await pool.query(sql('163_payment_checkout_documents.sql'));
  transaction = async (work) => {
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
});

afterAll(async () => {
  if (pool) await pool.end();
  if (created) {
    await maintenance.query(
      `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
    );
    created = false;
  }
  await maintenance.end();
});

describe('migration 163 checkout document store', () => {
  it('creates one immutable receipt under concurrency and binds short-lived download access', async () => {
    const attemptId = randomUUID();
    await insertAttempt(attemptId);
    const store = new PgPaymentCheckoutDocumentStore(
      transaction,
      'tandem-wordpress-live',
      scope,
      new PaymentPayloadVault(
        'docs-v1',
        new Map([['docs-v1', randomBytes(32)]]),
      ),
      randomBytes(32),
    );
    const input = authority(attemptId, 'ABCDEF123456');
    const rows = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.ensure('receipt', input, receiptConfig),
      ),
    );
    expect(new Set(rows.map((row) => row.documentId)).size).toBe(1);
    expect(new Set(rows.map((row) => row.pdfSha256)).size).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int count FROM business_v2.payment_checkout_documents',
        )
      ).rows[0].count,
    ).toBe(1);
    const stored = (
      await pool.query(
        'SELECT encrypted_snapshot,encrypted_pdf FROM business_v2.payment_checkout_documents WHERE document_id=$1',
        [rows[0].documentId],
      )
    ).rows[0];
    expect(`${stored.encrypted_snapshot}${stored.encrypted_pdf}`).not.toContain(
      'José',
    );
    expect(stored.encrypted_pdf).not.toContain('%PDF-');
    const capability = await store.issueDownloadCapability(rows[0], 30_000);
    expect(
      (await store.readDownload(attemptId, 'receipt', capability.capability))
        .pdfSha256,
    ).toBe(rows[0].pdfSha256);
    const otherAttempt = randomUUID();
    await insertAttempt(otherAttempt);
    await expect(
      store.readDownload(otherAttempt, 'receipt', capability.capability),
    ).rejects.toThrow('checkout_document_access_denied');
    await expect(
      pool.query(
        `UPDATE business_v2.payment_checkout_documents SET document_number='TCA-FFFFFFFFFFFF-R'`,
      ),
    ).rejects.toThrow(/immutable/);
  }, 30_000);

  it('allocates unique invoice numbers but refuses issuance without the finance receipt', async () => {
    const attemptA = randomUUID();
    const attemptB = randomUUID();
    await insertAttempt(attemptA);
    await insertAttempt(attemptB);
    const store = new PgPaymentCheckoutDocumentStore(
      transaction,
      'tandem-wordpress-live',
      scope,
      new PaymentPayloadVault(
        'docs-v1',
        new Map([['docs-v1', randomBytes(32)]]),
      ),
      randomBytes(32),
    );
    await expect(
      store.ensure(
        'paid_invoice',
        authority(attemptA, 'AAAABBBBCCCC', true),
        receiptConfig,
      ),
    ).rejects.toThrow('paid_invoice_unavailable');
    const approved = {
      enabled: true as const,
      decisionReference: 'decision:finance-fixture',
      approvedAt: '2026-09-12T12:00:00Z',
      sequencePrefix: 'TCA' as const,
      seller: {
        displayName: 'Tandem Coaching Academy',
        legalName: 'Tandem Coaching Partners, LLC',
        addressLines: ['123 Example St', 'Austin, TX 78701'],
        country: 'US',
        taxId: null,
        supportEmail: 'hello@tandemcoach.co',
      },
      taxPolicy: {
        version: 'tax-v1',
        jurisdiction: 'US-TX',
        taxMinor: 0 as const,
        taxLabel: 'No tax charged' as const,
      },
      retentionPolicy: 'retention-v1',
      correctionPolicy: 'credit_note_or_replacement_only' as const,
    };
    const config = parseWebsiteCheckoutDocumentConfig({
      receiptEnabled: true,
      downloadCapabilityTtlMs: 300000,
      paidInvoice: {
        ...approved,
        activationReceiptSha256:
          websiteCheckoutPaidInvoiceActivationHash(approved),
      },
    });
    const [a, b] = await Promise.all([
      store.ensure(
        'paid_invoice',
        authority(attemptA, 'AAAABBBBCCCC', true),
        config,
      ),
      store.ensure(
        'paid_invoice',
        authority(attemptB, 'DDDDEEEEFFFF', true),
        config,
      ),
    ]);
    expect(new Set([a.documentNumber, b.documentNumber])).toEqual(
      new Set(['TCA-2026-000001', 'TCA-2026-000002']),
    );
    await expect(
      pool.query(sql('rollback_163_payment_checkout_documents.sql')),
    ).rejects.toThrow(/rollback refused/);
  }, 30_000);

  it('holds a lost email acknowledgement and adopts exact later Gmail evidence without resend', async () => {
    const attemptId = randomUUID();
    await insertAttempt(attemptId);
    const store = new PgPaymentCheckoutDocumentStore(
      transaction,
      'tandem-wordpress-live',
      scope,
      new PaymentPayloadVault(
        'docs-v1',
        new Map([['docs-v1', randomBytes(32)]]),
      ),
      randomBytes(32),
    );
    const document = await store.ensure(
      'receipt',
      authority(attemptId, '123456ABCDEF'),
      receiptConfig,
    );
    let job = await store.ensureEmailJob(
      document,
      'payer@example.test',
      'b'.repeat(64),
      '2026-09-12T12:00:00Z',
    );
    job = await store.claimEmail(
      job.jobId,
      '2026-09-12T12:00:01Z',
      '2026-09-12T12:00:31Z',
    );
    job = await store.holdEmail(
      job.jobId,
      'gmail_acceptance_unknown',
      true,
      'c'.repeat(64),
      '2026-09-12T12:00:02Z',
    );
    expect(job).toMatchObject({ state: 'held', uncertainAcceptance: true });
    job = await store.adoptEmail(
      job.jobId,
      'gmail-1',
      'thread-1',
      '2026-09-12T12:01:00Z',
    );
    job = await store.confirmEmail(
      job.jobId,
      'gmail-1',
      'thread-1',
      'd'.repeat(64),
      '2026-09-12T12:01:01Z',
    );
    expect(job).toMatchObject({ state: 'confirmed', version: 4 });
    expect(
      (
        await pool.query(
          'SELECT stage FROM business_v2.payment_checkout_document_email_receipts WHERE job_id=$1 ORDER BY version',
          [job.jobId],
        )
      ).rows.map((row) => row.stage),
    ).toEqual(['queued', 'claimed', 'held', 'sent_acknowledged', 'readback']);
  }, 30_000);
});
