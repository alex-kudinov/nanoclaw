import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  CanonicalGmailWebsiteCheckoutDocumentSender,
  CHECKOUT_DOCUMENT_MAX_PDF_BYTES,
  PaymentCheckoutDocumentRetentionWorker,
  PgPaymentCheckoutDocumentAuthorityReader,
  checkoutDocumentSnapshotSha256,
  parseCheckoutDocumentSnapshot,
  parseWebsiteCheckoutDocumentConfig,
  renderCheckoutDocumentPdf,
  websiteCheckoutPaidInvoiceActivationHash,
} from './payment-checkout-documents.js';
import {
  createPaymentAttempt,
  paymentScopeFingerprint,
} from './payment-domain.js';

const receipt = {
  schemaVersion: 2,
  documentVersion: 'mcs-checkout-document-v2',
  documentKind: 'receipt',
  documentNumber: 'TCA-0123456789AB-R',
  issuedAt: '2026-09-12T12:00:00.000Z',
  seller: {
    displayName: 'Tandem Coaching Academy',
    legalName: 'Tandem Coaching Partners, LLC',
    supportEmail: 'hello@tandemcoach.co',
    country: 'US',
    addressLines: [
      '104 E Ovilla Rd, Ste 1278',
      'Red Oak, TX 75154, United States',
    ],
    taxId: null,
  },
  buyer: {
    name: 'José Žagar',
    email: 'jose@example.test',
    billingProfile: null,
  },
  purchase: {
    offerKey: 'mcq-program-a-foundations',
    productName: 'Mentor Coaching Foundations',
    locale: 'en-US',
    quantity: 1,
    unitAmountMinor: 29900,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 29900,
    currency: 'USD',
    discountPolicyReference: null,
  },
  payment: {
    method: 'card',
    status: 'paid',
    captureMode: 'immediate_automatic_capture',
    providerEvent: 'authorisation',
    tandemReference: 'TCA-0123456789AB',
    providerReferenceSha256:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    recordedAt: '2026-09-12T12:00:00.000Z',
  },
  policy: {
    enrollmentTermsVersion: 'terms-2026-09-11',
    enrollmentTermsSha256:
      '1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    privacyVersion: 'privacy-2026-09-11',
    privacySha256:
      '2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    taxPolicyVersion: null,
    taxJurisdiction: null,
    taxClassification: null,
    retentionPolicyVersion: 'mcs-checkout-documents-7y-v1',
    purgeAfter: '2033-09-12T12:00:00.000Z',
    correctionPolicy: 'original_payment_evidence_immutable',
  },
} as const;

describe('checkout payment documents', () => {
  it('keeps paid invoices disabled by default', () => {
    expect(parseWebsiteCheckoutDocumentConfig(undefined)).toEqual({
      receiptEnabled: true,
      downloadCapabilityTtlMs: 300000,
      retentionPolicy: {
        version: 'mcs-checkout-documents-7y-v1',
        years: 7,
        legalHold: 'explicit_hold_blocks_purge',
        purge: 'customer_pdf_recipient_and_sent_message',
        tombstone: 'number_date_amount_currency_hashes_and_purge_receipt',
        sweepIntervalMs: 86400000,
        batchSize: 25,
      },
      paidInvoice: { enabled: false },
    });
  });

  it('keeps worst-case PDF double-base64 delivery below the one-megabyte WordPress envelope', () => {
    const contentBase64 = Buffer.alloc(
      CHECKOUT_DOCUMENT_MAX_PDF_BYTES,
    ).toString('base64');
    const inner = Buffer.from(
      JSON.stringify({
        documentKind: 'receipt',
        documentNumber: 'TCA-0123456789AB-R',
        filename: 'TCA-0123456789AB-R-receipt.pdf',
        mimeType: 'application/pdf',
        contentBase64,
        pdfSha256: '0'.repeat(64),
      }),
    );
    const outer = Buffer.byteLength(
      JSON.stringify({
        auth: {
          version: 1,
          keyId: 'live-response-v1',
          caller: 'tandem-wordpress-live',
          method: 'POST',
          path: '/internal/payments/documents/download',
          operationId: '00000000-0000-4000-8000-000000000000',
          requestNonce: '00000000-0000-4000-8000-000000000000',
          status: 200,
          timestamp: Number.MAX_SAFE_INTEGER,
          signature: '0'.repeat(64),
        },
        payloadBase64: inner.toString('base64'),
      }),
    );
    expect(inner.length).toBeLessThan(1_048_576);
    expect(outer).toBeLessThan(1_048_576);
  });

  it('requires an exact finance/legal activation receipt for paid invoices', () => {
    const approved = {
      enabled: true as const,
      decisionReference: 'decision:finance-paid-invoice-v1',
      approvedAt: '2026-09-12T12:00:00Z',
      sequencePrefix: 'TCA' as const,
      seller: {
        displayName: 'Tandem Coaching Academy',
        legalName: 'Tandem Coaching Partners, LLC',
        addressLines: [
          '104 E Ovilla Rd, Ste 1278',
          'Red Oak, TX 75154, United States',
        ],
        country: 'US',
        taxId: null,
        supportEmail: 'hello@tandemcoach.co',
      },
      capturePolicy: {
        version: 'adyen-immediate-auto-capture-v1' as const,
        mode: 'immediate_automatic_capture' as const,
        evidenceReference: 'capture-policy-live-v1',
      },
      taxPolicy: {
        version: 'mcs-foundations-zero-tax-display-v1' as const,
        jurisdiction: 'US-TX' as const,
        taxMinor: 0 as const,
        taxLabel: 'Tax' as const,
        classification: 'not_stated' as const,
      },
      retentionPolicyVersion: 'mcs-checkout-documents-7y-v1' as const,
      correctionPolicy: 'credit_note_or_replacement_only' as const,
    };
    expect(() =>
      parseWebsiteCheckoutDocumentConfig({
        receiptEnabled: true,
        downloadCapabilityTtlMs: 300000,
        paidInvoice: {
          ...approved,
          activationReceiptSha256: '0'.repeat(64),
        },
      }),
    ).toThrow('invalid_checkout_document_configuration');
    const activationReceiptSha256 =
      websiteCheckoutPaidInvoiceActivationHash(approved);
    expect(
      parseWebsiteCheckoutDocumentConfig({
        receiptEnabled: true,
        downloadCapabilityTtlMs: 300000,
        paidInvoice: { ...approved, activationReceiptSha256 },
      }).paidInvoice.enabled,
    ).toBe(true);
  });

  it('renders byte-identical PDF output for the same immutable snapshot', async () => {
    const parsed = parseCheckoutDocumentSnapshot(receipt);
    const first = await renderCheckoutDocumentPdf(parsed);
    const second = await renderCheckoutDocumentPdf(parsed);
    expect(first.subarray(0, 8).toString('ascii')).toBe('%PDF-1.7');
    expect(first.equals(second)).toBe(true);
    expect(first.length).toBeGreaterThan(10000);
    expect(checkoutDocumentSnapshotSha256(parsed)).toBe(
      checkoutDocumentSnapshotSha256(receipt),
    );
  });

  it('renders a paid invoice when the optional apartment or suite is empty', async () => {
    const parsed = parseCheckoutDocumentSnapshot({
      ...receipt,
      documentKind: 'paid_invoice',
      documentNumber: 'TCA-2026-000001',
      buyer: {
        ...receipt.buyer,
        billingProfile: {
          companyLegalName: 'Hooves & Horns Inc',
          invoiceEmail: 'accounts@example.test',
          taxId: null,
          address: {
            street: '13507 Mooring Pointe Dr',
            houseNumberOrName: '',
            city: 'Pearland',
            postalCode: '77584',
            stateOrProvince: 'TX',
            country: 'US',
          },
        },
      },
      policy: {
        ...receipt.policy,
        taxPolicyVersion: 'mcs-foundations-zero-tax-display-v1',
        taxJurisdiction: 'US-TX',
        taxClassification: 'not_stated',
        correctionPolicy: 'credit_note_or_replacement_only',
      },
    });
    const pdf = await renderCheckoutDocumentPdf(parsed);
    expect(pdf.subarray(0, 8).toString('ascii')).toBe('%PDF-1.7');
    expect(pdf.length).toBeGreaterThan(10000);
  });

  it('rejects receipt arithmetic and invoice-shape drift', () => {
    expect(() =>
      parseCheckoutDocumentSnapshot({
        ...receipt,
        purchase: { ...receipt.purchase, totalMinor: 29899 },
      }),
    ).toThrow('invalid_checkout_document_snapshot');
    expect(() =>
      parseCheckoutDocumentSnapshot({
        ...receipt,
        documentKind: 'paid_invoice',
        documentNumber: 'TCA-2026-000001',
      }),
    ).toThrow('invalid_checkout_document_snapshot');
  });

  it('verifies exact Gmail headers and attached PDF bytes on readback', async () => {
    const pdf = Buffer.from('%PDF-1.7\nfixture');
    const gmail = {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: 'message-1',
              threadId: 'thread-1',
              payload: {
                headers: [
                  { name: 'To', value: 'payer@example.test' },
                  {
                    name: 'From',
                    value: 'Tandem Coaching <info@tandemcoach.co>',
                  },
                  { name: 'Subject', value: 'Your receipt' },
                ],
                parts: [
                  {
                    filename: 'receipt.pdf',
                    mimeType: 'application/pdf',
                    body: { data: pdf.toString('base64url') },
                  },
                ],
              },
            },
          }),
        },
      },
    };
    const sender = new CanonicalGmailWebsiteCheckoutDocumentSender(
      gmail as never,
      'info@tandemcoach.co',
      'Tandem Coaching <info@tandemcoach.co>',
    );
    await expect(
      sender.readback({
        messageId: 'message-1',
        threadId: 'thread-1',
        to: 'payer@example.test',
        subject: 'Your receipt',
        filename: 'receipt.pdf',
        pdfSha256:
          'f581fc87f30296eff11777c3ce1b9a8b7077071ad8abedfcba317fef0c807224',
      }),
    ).resolves.toMatchObject({ messageId: 'message-1', threadId: 'thread-1' });
    await expect(
      sender.readback({
        messageId: 'message-1',
        threadId: 'thread-1',
        to: 'payer@example.test',
        subject: 'Your receipt',
        filename: 'receipt.pdf',
        pdfSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('document_gmail_readback_mismatch');
  });

  it('derives document authority only from one canonical authorized enrollment', async () => {
    const attemptId = randomUUID();
    const scope = {
      provider: 'adyen' as const,
      environment: 'live' as const,
      company: 'company',
      merchant: 'merchant',
      store: 'store',
      endpointRegion: 'eu',
    };
    const now = Date.parse('2026-09-12T11:00:00Z');
    const attempt = createPaymentAttempt({
      attemptId,
      now,
      scope,
      quote: {
        schemaVersion: 1,
        quoteId: randomUUID(),
        authority: 'wordpress:live',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: 'catalog-v1',
        bundleVersion: 'bundle-v1',
        deliveryVersion: 'delivery-v1',
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
        consentReceipt: 'consent-v1',
        acceptedAt: now - 1,
        createdAt: now,
        expiresAt: now + 60_000,
      },
    });
    const row = {
      contract: attempt,
      projection: {
        state: 'authorization_recorded',
        payments: [
          {
            paymentReference: 'PSP-REFERENCE',
            evidence: { authorization: 'authorized' },
          },
        ],
      },
      preparation_id: randomUUID(),
      purchase_relationship: 'self',
      payer_party_id: '7',
      participant_party_id: '7',
      payer_name: 'José Example',
      payer_email: 'jose@example.test',
      participant_name: 'José Example',
      participant_email: 'jose@example.test',
      payment_method: 'card',
      payment_reference: 'PSP-REFERENCE',
      payment_recorded_at: '2026-09-12T12:00:00Z',
      terms_version: 'terms-v1',
      terms_content_sha256: '1'.repeat(64),
      privacy_version: 'privacy-v1',
      privacy_content_sha256: '2'.repeat(64),
      scope_sha256: paymentScopeFingerprint(scope),
      enrollment_active: true,
      retry_exception: false,
    };
    const query = vi.fn(async (_sql: string) => ({
      rowCount: 1,
      rows: [row],
    }));
    const transaction = async (work: (client: unknown) => Promise<unknown>) =>
      work({ query });
    const reader = new PgPaymentCheckoutDocumentAuthorityReader(
      transaction as never,
      'tandem-wordpress-live',
      scope,
      async () => ({
        payerPartyId: 7,
        participantPartyId: 7,
        billingProfile: null,
      }),
    );
    await expect(reader.read(attemptId)).resolves.toMatchObject({
      attemptId,
      payerPartyId: 7,
      paymentReference: 'PSP-REFERENCE',
      finalAmount: 29900,
    });
    const authoritySql = String(query.mock.calls[0]?.[0] ?? '');
    expect(authoritySql).toContain(
      'JOIN business_v2.payment_identity_materializations m',
    );
    expect(authoritySql).toContain('pp.id=m.payer_party_id');
    expect(authoritySql).toContain('lp.id=m.participant_party_id');
    expect(authoritySql).not.toContain('pp.id=ip.payer_party_id');
    row.retry_exception = true;
    await expect(reader.read(attemptId)).rejects.toThrow(
      'checkout_document_authority_conflict',
    );
  });

  it('deletes exact sent copies before purging an expired local document', async () => {
    const document = {
      documentId: randomUUID(),
      attemptId: randomUUID(),
      kind: 'receipt' as const,
      documentNumber: receipt.documentNumber,
      snapshot: parseCheckoutDocumentSnapshot(receipt),
      snapshotSha256: checkoutDocumentSnapshotSha256(receipt),
      pdfSha256: '3'.repeat(64),
      pdf: Buffer.from('%PDF-1.7 fixture'),
      issuedAt: receipt.issuedAt,
    };
    const candidate = {
      document,
      emailJobs: [
        {
          jobId: randomUUID(),
          recipient: 'jose@example.test',
          gmailMessageId: 'message-1',
          gmailThreadId: 'thread-1',
        },
        {
          jobId: randomUUID(),
          recipient: 'accounts@example.test',
          gmailMessageId: 'message-1',
          gmailThreadId: 'thread-1',
        },
      ],
    };
    const store = {
      dueForPurge: async () => [candidate],
      purge: async (_candidate: unknown, evidence: readonly string[]) => {
        expect(evidence).toEqual(['4'.repeat(64), '4'.repeat(64)]);
        return 'purged' as const;
      },
    };
    const gmail = {
      deleteExact: async (input: { to: string; subject: string }) => {
        expect(['jose@example.test', 'accounts@example.test']).toContain(
          input.to,
        );
        expect(input.subject).toContain(document.documentNumber);
        return { evidenceSha256: '4'.repeat(64) };
      },
    };
    const worker = new PaymentCheckoutDocumentRetentionWorker(
      parseWebsiteCheckoutDocumentConfig(undefined),
      store as never,
      gmail as never,
      () => new Date('2033-09-12T12:00:00Z'),
    );
    await expect(worker.sweep()).resolves.toEqual({
      examined: 1,
      purged: 1,
      held: 0,
    });
  });

  it('reports a privacy-minimized retention hold instead of swallowing purge failure', async () => {
    const document = {
      documentId: randomUUID(),
      attemptId: randomUUID(),
      kind: 'receipt' as const,
      documentNumber: receipt.documentNumber,
      snapshot: parseCheckoutDocumentSnapshot(receipt),
      snapshotSha256: checkoutDocumentSnapshotSha256(receipt),
      pdfSha256: '3'.repeat(64),
      pdf: Buffer.from('%PDF-1.7 fixture'),
      issuedAt: receipt.issuedAt,
    };
    const reports: unknown[] = [];
    const worker = new PaymentCheckoutDocumentRetentionWorker(
      parseWebsiteCheckoutDocumentConfig(undefined),
      {
        dueForPurge: async () => [{ document, emailJobs: [] }],
        purge: async () => {
          throw new Error('raw private failure must not be reported');
        },
      } as never,
      undefined,
      () => new Date('2033-09-12T12:00:00Z'),
      (event) => reports.push(event),
    );
    await expect(worker.sweep()).resolves.toEqual({
      examined: 1,
      purged: 0,
      held: 1,
    });
    expect(reports).toEqual([
      {
        documentId: document.documentId,
        documentKind: 'receipt',
        code: 'checkout_document_retention_sweep_failed',
      },
    ]);
    expect(JSON.stringify(reports)).not.toContain('raw private failure');
  });

  it('reports an expired emailed document when Gmail retention deletion is unavailable', async () => {
    const document = {
      documentId: randomUUID(),
      attemptId: randomUUID(),
      kind: 'paid_invoice' as const,
      documentNumber: 'TCA-2026-000001',
      snapshot: parseCheckoutDocumentSnapshot({
        ...receipt,
        documentKind: 'paid_invoice',
        documentNumber: 'TCA-2026-000001',
        buyer: {
          ...receipt.buyer,
          billingProfile: {
            companyLegalName: 'Example Coaching LLC',
            invoiceEmail: 'accounts@example.test',
            taxId: null,
            address: {
              street: 'Main Street',
              houseNumberOrName: '42',
              city: 'Austin',
              postalCode: '78701',
              stateOrProvince: 'TX',
              country: 'US',
            },
          },
        },
        policy: {
          ...receipt.policy,
          taxPolicyVersion: 'mcs-foundations-zero-tax-display-v1',
          taxJurisdiction: 'US-TX',
          taxClassification: 'not_stated',
          correctionPolicy: 'credit_note_or_replacement_only',
        },
      }),
      snapshotSha256: '5'.repeat(64),
      pdfSha256: '6'.repeat(64),
      pdf: Buffer.from('%PDF-1.7 fixture'),
      issuedAt: receipt.issuedAt,
    };
    const reports: unknown[] = [];
    const worker = new PaymentCheckoutDocumentRetentionWorker(
      parseWebsiteCheckoutDocumentConfig(undefined),
      {
        dueForPurge: async () => [
          {
            document,
            emailJobs: [
              {
                jobId: randomUUID(),
                recipient: 'accounts@example.test',
                gmailMessageId: 'message-1',
                gmailThreadId: 'thread-1',
              },
            ],
          },
        ],
        purge: async () => {
          throw new Error('must not purge without Gmail deletion');
        },
      } as never,
      undefined,
      () => new Date('2033-09-12T12:00:00Z'),
      (event) => reports.push(event),
    );
    await expect(worker.sweep()).resolves.toEqual({
      examined: 1,
      purged: 0,
      held: 1,
    });
    expect(reports).toEqual([
      {
        documentId: document.documentId,
        documentKind: 'paid_invoice',
        code: 'checkout_document_retention_gmail_unconfigured',
      },
    ]);
  });
});
