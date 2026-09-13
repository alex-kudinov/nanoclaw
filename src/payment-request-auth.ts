import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PaymentDomainError } from './payment-domain.js';

const envelopeSchema = z
  .object({
    version: z.literal(1),
    keyId: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    caller: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    method: z.literal('POST'),
    path: z.enum([
      '/internal/payments/attempts',
      '/internal/payments/sessions',
      '/internal/payments/status',
      '/internal/payments/returns',
      '/internal/payments/session-retries',
      '/internal/payments/session-submit-checks',
      '/internal/payments/identity/resolve',
      '/internal/payments/identity/status',
      '/internal/payments/enrollment-admissions',
      '/internal/payments/documents/prepare',
      '/internal/payments/documents/download',
      '/internal/payments/documents/email',
    ]),
    timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    nonce: z.uuid(),
    operationId: z.uuid(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type PaymentRequestEnvelope = z.infer<typeof envelopeSchema>;
type UnsignedEnvelope = Omit<PaymentRequestEnvelope, 'signature'>;
export interface PaymentRequestKey {
  caller: string;
  secret: Buffer;
}
export interface VerifiedPaymentRequest {
  caller: string;
  operationId: string;
  nonceSha256: string;
  requestSha256: string;
  receivedAt: number;
  retainNonceUntil: number;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function signingText(input: UnsignedEnvelope, body: Buffer): string {
  return [
    'tandem-payments-v1',
    input.keyId,
    input.caller,
    input.method,
    input.path,
    String(input.timestamp),
    input.nonce,
    input.operationId,
    digest(body),
  ].join('\n');
}

/** Authenticates bytes; caller must atomically admit the returned nonce BEFORE effects. */
export class PaymentRequestAuthenticator {
  private readonly keys: Map<string, PaymentRequestKey>;
  constructor(keys: ReadonlyMap<string, PaymentRequestKey>) {
    this.keys = new Map(
      [...keys].map(([id, key]) => [
        id,
        { caller: key.caller, secret: Buffer.from(key.secret) },
      ]),
    );
    if (
      !this.keys.size ||
      [...this.keys].some(
        ([id, key]) =>
          !/^[a-zA-Z0-9_-]{1,40}$/.test(id) ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(key.caller) ||
          key.secret.length < 32,
      )
    )
      throw new PaymentDomainError('invalid_request_key_configuration');
  }

  sign(input: UnsignedEnvelope, body: Buffer): PaymentRequestEnvelope {
    const parsed = envelopeSchema.safeParse({
      ...input,
      signature: '0'.repeat(64),
    });
    if (!parsed.success || body.length > 65536)
      throw new PaymentDomainError('invalid_internal_request');
    const key = this.keys.get(input.keyId);
    if (!key || key.caller !== input.caller)
      throw new PaymentDomainError('internal_request_denied');
    return {
      ...parsed.data,
      signature: createHmac('sha256', key.secret)
        .update(signingText(parsed.data, body))
        .digest('hex'),
    };
  }

  verify(
    input: unknown,
    body: Buffer,
    expected: { caller: string; method: string; path: string },
    now = Date.now(),
  ): VerifiedPaymentRequest {
    const parsed = envelopeSchema.safeParse(input);
    if (
      !parsed.success ||
      !Buffer.isBuffer(body) ||
      body.length > 65536 ||
      !Number.isSafeInteger(now) ||
      now < 0
    )
      throw new PaymentDomainError('internal_request_denied');
    const envelope = parsed.data;
    const key = this.keys.get(envelope.keyId);
    if (
      !key ||
      key.caller !== expected.caller ||
      envelope.caller !== expected.caller ||
      envelope.method !== expected.method ||
      envelope.path !== expected.path ||
      Math.abs(now - envelope.timestamp) > 300000
    )
      throw new PaymentDomainError('internal_request_denied');
    const expectedSignature = createHmac('sha256', key.secret)
      .update(signingText(envelope, body))
      .digest();
    if (
      !timingSafeEqual(
        expectedSignature,
        Buffer.from(envelope.signature, 'hex'),
      )
    )
      throw new PaymentDomainError('internal_request_denied');
    return {
      caller: envelope.caller,
      operationId: envelope.operationId,
      nonceSha256: digest(`${envelope.caller}:${envelope.nonce}`),
      requestSha256: digest(signingText(envelope, body)),
      receivedAt: now,
      // Includes the full remaining acceptance window for a future-dated request.
      retainNonceUntil: envelope.timestamp + 300001,
    };
  }
}
