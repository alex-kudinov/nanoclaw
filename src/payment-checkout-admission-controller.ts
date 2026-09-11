import { z } from 'zod';

import type { PaymentAdmissionStore } from './payment-admission-store.js';
import {
  PaymentRequestLimiter,
  type PaymentApiResponse,
} from './payment-api-controller.js';
import {
  checkoutAdmissionBodySha256,
  parsePaymentCheckoutAdmissionCommand,
} from './payment-checkout-admission.js';
import type { PaymentCheckoutAdmissionStore } from './payment-checkout-admission-store.js';
import { PaymentDomainError } from './payment-domain.js';
import type { PaymentResponseSigner } from './payment-signed-response-controller.js';

const path = '/internal/payments/enrollment-admissions' as const;
const outerSchema = z
  .object({ auth: z.unknown(), payloadBase64: z.string().max(87384) })
  .strict();
const authSchema = z
  .object({ operationId: z.uuid(), nonce: z.uuid() })
  .passthrough();

export class PaymentCheckoutAdmissionController {
  constructor(
    private readonly caller: string,
    private readonly limiter: PaymentRequestLimiter,
    private readonly signer: PaymentResponseSigner,
    private readonly deps: {
      admission: Pick<PaymentAdmissionStore, 'preflightSignature' | 'admit'>;
      store: Pick<PaymentCheckoutAdmissionStore, 'accept'>;
    },
  ) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      signer.caller !== caller ||
      !(limiter instanceof PaymentRequestLimiter)
    )
      throw new PaymentDomainError('invalid_checkout_admission_configuration');
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

  private signed(
    operationId: string,
    requestNonce: string,
    status: number,
    body: Record<string, unknown>,
  ): PaymentApiResponse {
    return this.response(
      status,
      this.signer.sign({
        path,
        operationId,
        requestNonce,
        status,
        body: Buffer.from(JSON.stringify(body)),
      }),
    );
  }

  async handle(
    method: string,
    requestPath: string,
    raw: Buffer,
  ): Promise<PaymentApiResponse> {
    if (requestPath !== path) return this.response(404, { error: 'not_found' });
    if (method !== 'POST')
      return this.response(405, { error: 'method_not_allowed' });
    let outer: z.infer<typeof outerSchema>;
    let body: Buffer;
    let auth: z.infer<typeof authSchema>;
    try {
      if (!Buffer.isBuffer(raw) || raw.length > 100000) throw new Error();
      outer = outerSchema.parse(JSON.parse(raw.toString('utf8')));
      body = Buffer.from(outer.payloadBase64, 'base64');
      if (
        body.length < 1 ||
        body.length > 65536 ||
        body.toString('base64') !== outer.payloadBase64
      )
        throw new Error();
      this.deps.admission.preflightSignature(outer.auth, body, {
        caller: this.caller,
        method: 'POST',
        path,
      });
      auth = authSchema.parse(outer.auth);
    } catch {
      return this.response(400, { error: 'invalid_request' });
    }
    const release = this.limiter.acquire();
    if (!release)
      return this.signed(auth.operationId, auth.nonce, 429, {
        error: 'payment_rate_limited',
      });
    try {
      const admitted = await this.deps.admission.admit(outer.auth, body, {
        caller: this.caller,
        method: 'POST',
        path,
      });
      let command: unknown;
      try {
        command = JSON.parse(body.toString('utf8'));
      } catch {
        throw new PaymentDomainError('invalid_checkout_admission_request');
      }
      const receipt = await this.deps.store.accept({
        command: parsePaymentCheckoutAdmissionCommand(command),
        bodySha256: checkoutAdmissionBodySha256(body),
        admitted,
      });
      return this.signed(auth.operationId, auth.nonce, 200, {
        schemaVersion: 1,
        status: 'accepted',
        checkoutAdmissionEvidence: receipt,
      });
    } catch (error) {
      const code =
        error instanceof PaymentDomainError
          ? error.code
          : 'payment_service_unavailable';
      const publicCode = [
        'checkout_attempt_not_found',
        'checkout_identity_evidence_missing',
      ].includes(code)
        ? 'checkout_admission_binding_conflict'
        : code;
      const status = publicCode.includes('invalid')
        ? 400
        : publicCode.includes('conflict') ||
            publicCode === 'internal_request_replayed'
          ? 409
          : publicCode.includes('denied') ||
              publicCode === 'request_admission_required'
            ? 401
            : 503;
      return this.signed(auth.operationId, auth.nonce, status, {
        error: publicCode,
      });
    } finally {
      release();
    }
  }
}
