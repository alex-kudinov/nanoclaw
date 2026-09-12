import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  CanonicalGmailWebsiteCheckoutDocumentSender,
  CHECKOUT_DOCUMENT_MAX_PDF_BYTES,
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
  schemaVersion: 1,
  documentVersion: 'mcs-checkout-document-v1',
  documentKind: 'receipt',
  documentNumber: 'TCA-0123456789AB-R',
  issuedAt: '2026-09-12T12:00:00.000Z',
  seller: {
    displayName: 'Tandem Coaching Academy',
    legalName: 'Tandem Coaching Partners, LLC',
    supportEmail: 'hello@tandemcoach.co',
    country: 'US',
    addressLines: [],
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
    status: 'authorized_for_automatic_capture',
    tandemReference: 'TCA-0123456789AB',
    providerReferenceSha256:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    recordedAt: '2026-09-12T12:00:00.000Z',
    settlement: 'unproven',
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
    correctionPolicy: 'original_payment_evidence_immutable',
  },
} as const;

describe('checkout payment documents', () => {
  it('keeps paid invoices disabled by default', () => {
    expect(parseWebsiteCheckoutDocumentConfig(undefined)).toEqual({
      receiptEnabled: true,
      downloadCapabilityTtlMs: 300000,
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
        addressLines: ['123 Example St', 'Austin, TX 78701'],
        country: 'US',
        taxId: null,
        supportEmail: 'hello@tandemcoach.co',
      },
      taxPolicy: {
        version: 'tax-policy-v1',
        jurisdiction: 'US-TX',
        taxMinor: 0 as const,
        taxLabel: 'No tax charged' as const,
      },
      retentionPolicy: 'finance-retention-v1',
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
    const transaction = async (work: (client: unknown) => Promise<unknown>) =>
      work({ query: async () => ({ rowCount: 1, rows: [row] }) });
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
    row.retry_exception = true;
    await expect(reader.read(attemptId)).rejects.toThrow(
      'checkout_document_authority_conflict',
    );
  });
});
