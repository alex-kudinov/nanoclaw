import { z } from 'zod';

import type { PaymentAdmissionStore } from './payment-admission-store.js';
import type { PaymentApiResponse } from './payment-api-controller.js';
import { PaymentRequestLimiter } from './payment-api-controller.js';
import {
  PaymentCheckoutDocumentOwner,
  type PaymentCheckoutDocumentKind,
} from './payment-checkout-documents.js';
import { PaymentDomainError } from './payment-domain.js';

const paths = new Set([
  '/internal/payments/documents/prepare',
  '/internal/payments/documents/download',
  '/internal/payments/documents/email',
]);
const transportSchema = z
  .object({ auth: z.unknown(), payloadBase64: z.string().max(87384) })
  .strict();
const baseSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.uuid(),
    attemptId: z.uuid(),
    checkoutCapability: z.string().regex(/^pcap_[A-Za-z0-9_-]{43}$/),
    documentKind: z.enum(['receipt', 'paid_invoice']),
  })
  .strict();
const downloadSchema = baseSchema
  .extend({ downloadCapability: z.string().regex(/^dcap_[A-Za-z0-9_-]{43}$/) })
  .strict();

export class PaymentCheckoutDocumentApiController {
  constructor(
    private readonly caller: 'tandem-wordpress-live',
    private readonly limiter: PaymentRequestLimiter,
    private readonly admission: Pick<
      PaymentAdmissionStore,
      'preflightSignature' | 'admit' | 'permitsStatus'
    >,
    private readonly owner: PaymentCheckoutDocumentOwner,
  ) {
    if (!(limiter instanceof PaymentRequestLimiter))
      throw new PaymentDomainError('invalid_checkout_document_configuration');
  }

  private response(
    status: number,
    body: Record<string, unknown>,
  ): PaymentApiResponse {
    return {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body,
    };
  }

  async handle(
    method: string,
    path: string,
    raw: Buffer,
  ): Promise<PaymentApiResponse> {
    if (!paths.has(path)) return this.response(404, { error: 'not_found' });
    if (method !== 'POST')
      return this.response(405, { error: 'method_not_allowed' });
    let release: (() => void) | null = null;
    try {
      if (!Buffer.isBuffer(raw) || raw.length > 100000)
        return this.response(413, { error: 'request_too_large' });
      const outer = transportSchema.parse(JSON.parse(raw.toString('utf8')));
      const body = Buffer.from(outer.payloadBase64, 'base64');
      if (
        body.length > 65536 ||
        body.toString('base64') !== outer.payloadBase64
      )
        return this.response(400, { error: 'invalid_request' });
      const expected = { caller: this.caller, method: 'POST', path };
      this.admission.preflightSignature(outer.auth, body, expected);
      release = this.limiter.acquire();
      if (!release)
        return {
          ...this.response(429, { error: 'payment_rate_limited' }),
          headers: { ...this.response(429, {}).headers, 'Retry-After': '1' },
        };
      const receipt = await this.admission.admit(outer.auth, body, expected);
      const command = JSON.parse(body.toString('utf8')) as unknown;
      const parsed =
        path === '/internal/payments/documents/download'
          ? downloadSchema.safeParse(command)
          : baseSchema.safeParse(command);
      if (!parsed.success || parsed.data.requestId !== receipt.operationId)
        return this.response(400, { error: 'invalid_request' });
      if (
        !(await this.admission.permitsStatus(
          parsed.data.checkoutCapability,
          parsed.data.attemptId,
        ))
      )
        return this.response(403, { error: 'document_access_denied' });
      const kind = parsed.data.documentKind as PaymentCheckoutDocumentKind;
      if (path === '/internal/payments/documents/prepare')
        return this.response(
          200,
          await this.owner.prepare(parsed.data.attemptId, kind),
        );
      if (path === '/internal/payments/documents/email')
        return this.response(
          200,
          await this.owner.email(parsed.data.attemptId, kind),
        );
      const download = downloadSchema.parse(parsed.data);
      return this.response(
        200,
        await this.owner.download(
          download.attemptId,
          kind,
          download.downloadCapability,
        ),
      );
    } catch (error) {
      const code =
        error instanceof PaymentDomainError && typeof error.code === 'string'
          ? error.code
          : '';
      if (code === 'internal_request_denied')
        return this.response(401, { error: 'request_access_denied' });
      if (code === 'internal_request_replayed')
        return this.response(409, { error: 'request_replayed' });
      if (
        code === 'paid_invoice_unavailable' ||
        code === 'paid_invoice_details_required'
      )
        return this.response(409, { error: code });
      if (code === 'receipt_unavailable')
        return this.response(409, { error: 'receipt_unavailable' });
      if (code === 'checkout_document_access_denied')
        return this.response(403, { error: 'document_access_denied' });
      return this.response(503, { error: 'document_service_unavailable' });
    } finally {
      release?.();
    }
  }
}
