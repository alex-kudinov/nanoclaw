import { z } from 'zod';

import { CheckoutCustomerIdentityError } from './checkout-customer-identity.js';
import type { PaymentAdmissionStore } from './payment-admission-store.js';
import {
  PaymentRequestLimiter,
  type PaymentApiResponse,
} from './payment-api-controller.js';
import {
  identityBodySha256,
  parsePaymentIdentityResolveCommand,
  parsePaymentIdentityStatusCommand,
  type IdentityPreparationResult,
} from './payment-identity-preparation.js';
import type { PaymentIdentityPreparationStore } from './payment-identity-preparation-store.js';
import { PaymentDomainError } from './payment-domain.js';
import type { PaymentResponseSigner } from './payment-signed-response-controller.js';

const paths = z.enum([
  '/internal/payments/identity/resolve',
  '/internal/payments/identity/status',
]);
const outerSchema = z
  .object({ auth: z.unknown(), payloadBase64: z.string().max(87384) })
  .strict();
const admittedAuthSchema = z
  .object({
    operationId: z.uuid(),
    nonce: z.uuid(),
  })
  .passthrough();

type Dependencies = {
  admission: Pick<PaymentAdmissionStore, 'preflightSignature' | 'admit'>;
  store: Pick<PaymentIdentityPreparationStore, 'resolve' | 'status'>;
};

export class PaymentIdentityApiController {
  constructor(
    private readonly caller: string,
    private readonly limiter: PaymentRequestLimiter,
    private readonly signer: PaymentResponseSigner,
    private readonly deps: Dependencies,
  ) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      signer.caller !== caller ||
      !(limiter instanceof PaymentRequestLimiter)
    )
      throw new PaymentDomainError('invalid_identity_configuration');
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
    path: z.infer<typeof paths>,
    operationId: string,
    requestNonce: string,
    status: number,
    body: Record<string, unknown>,
  ): PaymentApiResponse {
    const inner = Buffer.from(JSON.stringify(body));
    return this.response(
      status,
      this.signer.sign({
        path,
        operationId,
        requestNonce,
        status,
        body: inner,
      }),
    );
  }

  async handle(
    method: string,
    pathInput: string,
    raw: Buffer,
  ): Promise<PaymentApiResponse> {
    const parsedPath = paths.safeParse(pathInput);
    if (!parsedPath.success) return this.response(404, { error: 'not_found' });
    const path = parsedPath.data;
    if (method !== 'POST')
      return this.response(405, { error: 'method_not_allowed' });
    if (!Buffer.isBuffer(raw) || raw.length > 100000)
      return this.response(413, { error: 'request_too_large' });

    let outer: z.infer<typeof outerSchema>;
    let body: Buffer;
    let auth: z.infer<typeof admittedAuthSchema>;
    try {
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
      auth = admittedAuthSchema.parse(outer.auth);
    } catch {
      return this.response(400, { error: 'invalid_request' });
    }

    const release = this.limiter.acquire();
    if (!release)
      return {
        ...this.signed(path, auth.operationId, auth.nonce, 429, {
          error: 'payment_rate_limited',
        }),
        headers: {
          ...this.response(429, {}).headers,
          'Retry-After': '1',
        },
      };
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
        throw new PaymentDomainError('invalid_identity_request');
      }
      let result: IdentityPreparationResult;
      if (path === '/internal/payments/identity/resolve') {
        result = await this.deps.store.resolve({
          command: parsePaymentIdentityResolveCommand(command),
          identityRequestSha256: identityBodySha256(body),
          admitted,
        });
      } else {
        result = await this.deps.store.status({
          command: parsePaymentIdentityStatusCommand(command),
          admitted,
        });
      }
      return this.signed(path, auth.operationId, auth.nonce, 200, result);
    } catch (error) {
      const code =
        error instanceof PaymentDomainError
          ? error.code
          : error instanceof CheckoutCustomerIdentityError
            ? 'identity_resolution_failed'
            : 'payment_service_unavailable';
      const status =
        code === 'invalid_identity_request'
          ? 400
          : code === 'internal_request_replayed' ||
              code === 'identity_operation_conflict' ||
              code === 'identity_relationship_conflict' ||
              code === 'identity_resolution_failed'
            ? 409
            : code === 'identity_scope_denied' ||
                code === 'request_admission_required'
              ? 401
              : 503;
      return this.signed(path, auth.operationId, auth.nonce, status, {
        error: code,
      });
    } finally {
      release();
    }
  }
}
