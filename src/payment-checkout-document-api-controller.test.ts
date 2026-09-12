import { describe, expect, it, vi } from 'vitest';

import { PaymentRequestLimiter } from './payment-api-controller.js';
import { PaymentCheckoutDocumentApiController } from './payment-checkout-document-api-controller.js';
import { PaymentDomainError } from './payment-domain.js';

const attemptId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const checkoutCapability = `pcap_${'a'.repeat(43)}`;
const downloadCapability = `dcap_${'b'.repeat(43)}`;

function raw(value: Record<string, unknown>) {
  return Buffer.from(
    JSON.stringify({
      auth: { fixture: true },
      payloadBase64: Buffer.from(JSON.stringify(value)).toString('base64'),
    }),
  );
}

function fixture(permitted = true) {
  const admission = {
    preflightSignature: vi.fn(),
    admit: vi.fn(async () => ({ operationId: requestId })),
    permitsStatus: vi.fn(async () => permitted),
  };
  const owner = {
    prepare: vi.fn(async () => ({
      documentKind: 'receipt',
      documentNumber: 'TCA-0123456789AB-R',
      filename: 'TCA-0123456789AB-R-receipt.pdf',
      pdfSha256: '0'.repeat(64),
      capability: downloadCapability,
      expiresAt: '2026-09-12T12:05:00.000Z',
    })),
    download: vi.fn(async () => ({
      documentKind: 'receipt',
      documentNumber: 'TCA-0123456789AB-R',
      filename: 'TCA-0123456789AB-R-receipt.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.from('%PDF').toString('base64'),
      pdfSha256: '0'.repeat(64),
    })),
    email: vi.fn(async () => ({
      state: 'verified',
      destination: 'a**@example.test',
    })),
  };
  return {
    admission,
    owner,
    controller: new PaymentCheckoutDocumentApiController(
      'tandem-wordpress-live',
      new PaymentRequestLimiter(10, 2, 60_000, () => 1),
      admission as never,
      owner as never,
    ),
  };
}

const base = {
  schemaVersion: 1,
  requestId,
  attemptId,
  checkoutCapability,
  documentKind: 'receipt',
};

describe('payment checkout document API', () => {
  it('prepares an idempotent document only after exact attempt capability proof', async () => {
    const { controller, admission, owner } = fixture();
    const result = await controller.handle(
      'POST',
      '/internal/payments/documents/prepare',
      raw(base),
    );
    expect(result.status).toBe(200);
    expect(admission.permitsStatus).toHaveBeenCalledWith(
      checkoutCapability,
      attemptId,
    );
    expect(owner.prepare).toHaveBeenCalledWith(attemptId, 'receipt');
  });

  it('denies a cross-attempt or expired checkout capability without probing documents', async () => {
    const { controller, owner } = fixture(false);
    const result = await controller.handle(
      'POST',
      '/internal/payments/documents/prepare',
      raw(base),
    );
    expect(result).toMatchObject({
      status: 403,
      body: { error: 'document_access_denied' },
    });
    expect(owner.prepare).not.toHaveBeenCalled();
  });

  it('requires the short-lived document capability for download', async () => {
    const { controller, owner } = fixture();
    const result = await controller.handle(
      'POST',
      '/internal/payments/documents/download',
      raw({ ...base, downloadCapability }),
    );
    expect(result.status).toBe(200);
    expect(owner.download).toHaveBeenCalledWith(
      attemptId,
      'receipt',
      downloadCapability,
    );
  });

  it('keeps the paid-invoice finance gate explicit', async () => {
    const { controller, owner } = fixture();
    owner.prepare.mockRejectedValueOnce(
      new PaymentDomainError('paid_invoice_unavailable'),
    );
    const result = await controller.handle(
      'POST',
      '/internal/payments/documents/prepare',
      raw({ ...base, documentKind: 'paid_invoice' }),
    );
    expect(result).toMatchObject({
      status: 409,
      body: { error: 'paid_invoice_unavailable' },
    });
  });
});
