import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { PoolClient } from 'pg';
import { z } from 'zod';

import type {
  PaymentApiController,
  PaymentApiResponse,
} from './payment-api-controller.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentRequestAuthenticator } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';

const uuid = z.uuid();
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const paths = z.enum([
  '/internal/payments/sessions',
  '/internal/payments/attempts',
  '/internal/payments/status',
  '/internal/payments/returns',
]);
const requestTransport = z
  .object({
    auth: z
      .object({
        version: z.literal(1),
        keyId: ref,
        caller: ref,
        method: z.literal('POST'),
        path: paths,
        timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        nonce: uuid,
        operationId: uuid,
        signature: digest,
      })
      .strict(),
    payloadBase64: z.string().max(87384),
  })
  .strict();

export interface AttemptAcceptanceReceipt {
  schemaVersion: 1;
  receiptReference: string;
  kind: 'attempt_acceptance';
  caller: string;
  operationId: string;
  quoteId: string;
  quoteFingerprint: string;
  source: PaymentScope;
  attemptId: string;
  providerScopeFingerprint: string;
  discountPolicyReference: string | null;
}

export class PaymentAttemptAcceptanceReceiptReader {
  private readonly scopeHash: string;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: string,
    scope: PaymentScope,
  ) {
    if (!ref.safeParse(caller).success)
      throw new PaymentDomainError('invalid_response_receipt_configuration');
    this.scopeHash = paymentScopeFingerprint(scope);
  }

  async read(input: {
    attemptId: string;
    operationId: string;
  }): Promise<AttemptAcceptanceReceipt | null> {
    if (
      !uuid.safeParse(input.attemptId).success ||
      !uuid.safeParse(input.operationId).success
    )
      throw new PaymentDomainError('invalid_response_receipt_request');
    return this.transaction(async (client: PoolClient) => {
      const result = await client.query<{ contract: unknown }>(
        `SELECT a.contract FROM business_v2.payment_attempts a
        JOIN business_v2.payment_operations o ON o.attempt_id=a.attempt_id
        JOIN business_v2.payment_status_capabilities c ON c.attempt_id=a.attempt_id
          AND c.caller=$2 AND c.operation_id=$3
        WHERE a.attempt_id=$1`,
        [input.attemptId, this.caller, input.operationId],
      );
      if (result.rowCount !== 1) return null;
      const attempt = validateAttempt(result.rows[0].contract);
      if (paymentScopeFingerprint(attempt.scope) !== this.scopeHash)
        return null;
      return Object.freeze({
        schemaVersion: 1,
        receiptReference: `attempt-acceptance:${attempt.attemptId}:${input.operationId}`,
        kind: 'attempt_acceptance',
        caller: this.caller,
        operationId: input.operationId,
        quoteId: attempt.quote.quoteId,
        quoteFingerprint: attempt.quoteFingerprint,
        source: attempt.scope,
        attemptId: attempt.attemptId,
        providerScopeFingerprint: this.scopeHash,
        discountPolicyReference: attempt.quote.discountPolicyReference,
      });
    });
  }
}

export interface PaymentResponseKey {
  caller: string;
  secret: Buffer;
}

export class PaymentResponseSigner {
  #secret: Buffer;
  constructor(
    private readonly keyId: string,
    key: PaymentResponseKey,
    requestSecrets: readonly Buffer[],
    private readonly clock = () => Date.now(),
    private readonly maxBodyBytes = 65536,
  ) {
    this.#secret = Buffer.from(key.secret);
    if (
      !ref.safeParse(keyId).success ||
      !ref.safeParse(key.caller).success ||
      this.#secret.length < 32 ||
      requestSecrets.some(
        (requestSecret) =>
          requestSecret.length === this.#secret.length &&
          timingSafeEqual(requestSecret, this.#secret),
      ) ||
      !Number.isSafeInteger(maxBodyBytes) ||
      maxBodyBytes < 256 ||
      maxBodyBytes > 1048576
    )
      throw new PaymentDomainError('invalid_payment_response_configuration');
    this.caller = key.caller;
  }
  readonly caller: string;

  sign(input: {
    path: z.infer<typeof paths>;
    operationId: string;
    requestNonce: string;
    status: number;
    body: Buffer;
  }) {
    const timestamp = this.clock();
    if (
      !uuid.safeParse(input.operationId).success ||
      !uuid.safeParse(input.requestNonce).success ||
      !paths.safeParse(input.path).success ||
      !Number.isInteger(input.status) ||
      input.status < 100 ||
      input.status > 599 ||
      !Buffer.isBuffer(input.body) ||
      input.body.length > this.maxBodyBytes ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0
    )
      throw new PaymentDomainError('invalid_payment_response');
    const bodyHash = createHash('sha256').update(input.body).digest('hex');
    const signingInput = [
      'tandem-payments-response-v1',
      this.keyId,
      this.caller,
      'POST',
      input.path,
      input.operationId,
      input.requestNonce,
      String(input.status),
      String(timestamp),
      bodyHash,
    ].join('\n');
    return {
      auth: {
        version: 1 as const,
        keyId: this.keyId,
        caller: this.caller,
        method: 'POST' as const,
        path: input.path,
        operationId: input.operationId,
        requestNonce: input.requestNonce,
        status: input.status,
        timestamp,
        signature: createHmac('sha256', this.#secret)
          .update(signingInput)
          .digest('hex'),
      },
      payloadBase64: input.body.toString('base64'),
    };
  }
}

type ReceiptReader = Pick<PaymentAttemptAcceptanceReceiptReader, 'read'>;

/** Signs only requests whose original request HMAC preflight succeeds. */
export class PaymentSignedResponseController {
  constructor(
    private readonly caller: string,
    private readonly authenticator: Pick<PaymentRequestAuthenticator, 'verify'>,
    private readonly controller: Pick<PaymentApiController, 'handle'>,
    private readonly signer: PaymentResponseSigner,
    private readonly receipts: ReceiptReader,
  ) {
    if (signer.caller !== caller)
      throw new PaymentDomainError('invalid_payment_response_configuration');
  }

  async handle(
    method: string,
    path: string,
    raw: Buffer,
  ): Promise<PaymentApiResponse> {
    let verified: {
      path: z.infer<typeof paths>;
      operationId: string;
      requestNonce: string;
      body: Buffer;
    } | null = null;
    try {
      const outer = requestTransport.parse(JSON.parse(raw.toString('utf8')));
      const body = Buffer.from(outer.payloadBase64, 'base64');
      if (body.toString('base64') !== outer.payloadBase64) throw new Error();
      this.authenticator.verify(outer.auth, body, {
        caller: this.caller,
        method,
        path,
      });
      verified = {
        path: outer.auth.path,
        operationId: outer.auth.operationId,
        requestNonce: outer.auth.nonce,
        body,
      };
    } catch {
      // The core returns its existing unsigned transport/auth error. Signing an
      // unauthenticated request would create misleading response provenance.
    }
    const result = await this.controller.handle(method, path, raw);
    if (!verified) return result;
    let status = result.status;
    let body: Record<string, unknown> = { ...result.body };
    if (
      verified.path === '/internal/payments/sessions' &&
      result.status === 200
    ) {
      const attemptId = result.body.attemptId;
      try {
        const receipt =
          typeof attemptId === 'string'
            ? await this.receipts.read({
                attemptId,
                operationId: verified.operationId,
              })
            : null;
        if (!receipt) throw new Error();
        body.attemptAcceptanceReceipt = receipt;
      } catch {
        status = 503;
        body = { error: 'payment_service_unavailable' };
      }
    }
    const inner = Buffer.from(JSON.stringify(body));
    const signed = this.signer.sign({
      path: verified.path,
      operationId: verified.operationId,
      requestNonce: verified.requestNonce,
      status,
      body: inner,
    });
    return {
      status,
      headers: result.headers,
      body: signed,
    };
  }
}
