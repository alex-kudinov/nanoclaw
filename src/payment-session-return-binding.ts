import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';

import { PaymentDomainError } from './payment-domain.js';

const payloadSchema = z
  .object({
    attemptId: z.uuid(),
    paymentOperationId: z.uuid(),
    sessionSequence: z.number().int().min(1).max(3),
    sessionIdSha256: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type PaymentSessionReturnBinding = Readonly<
  z.infer<typeof payloadSchema>
>;

const AAD = Buffer.from('payment-session-return-binding:v1');
export const SESSION_RESULT_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

export class PaymentSessionReturnBindingIssuer {
  private readonly secret: Buffer;

  constructor(secret: Buffer) {
    this.secret = Buffer.from(secret);
    if (this.secret.length !== 32)
      throw new PaymentDomainError('invalid_return_binding_configuration');
  }

  issue(input: PaymentSessionReturnBinding): string {
    const payload = payloadSchema.parse(input);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.secret, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return `prb1_${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
  }

  open(value: string, now = Date.now()): PaymentSessionReturnBinding {
    if (
      typeof value !== 'string' ||
      !/^prb1_[A-Za-z0-9_-]{80,800}$/.test(value) ||
      !Number.isSafeInteger(now) ||
      now < 0
    )
      throw new PaymentDomainError('invalid_return_binding');
    try {
      const raw = Buffer.from(value.slice(5), 'base64url');
      if (raw.length < 29) throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.secret,
        raw.subarray(0, 12),
      );
      decipher.setAAD(AAD);
      decipher.setAuthTag(raw.subarray(12, 28));
      const payload = payloadSchema.parse(
        JSON.parse(
          Buffer.concat([
            decipher.update(raw.subarray(28)),
            decipher.final(),
          ]).toString('utf8'),
        ),
      );
      if (now >= payload.expiresAt)
        throw new PaymentDomainError('return_binding_expired');
      return Object.freeze(payload);
    } catch (error) {
      if (
        error instanceof PaymentDomainError &&
        error.code === 'return_binding_expired'
      )
        throw error;
      throw new PaymentDomainError('invalid_return_binding');
    }
  }
}

export function sessionIdSha256(sessionId: string): string {
  if (
    typeof sessionId !== 'string' ||
    sessionId.length < 1 ||
    sessionId.length > 200
  )
    throw new PaymentDomainError('invalid_session_identity');
  return createHash('sha256').update(sessionId).digest('hex');
}
