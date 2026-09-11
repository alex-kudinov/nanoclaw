import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

import { PaymentDomainError } from './payment-domain.js';

/** Host-only encryption; never a permission to collect raw card/bank credentials. */
export class PaymentPayloadVault {
  private readonly keys: Map<string, Buffer>;

  constructor(
    private readonly currentKeyId: string,
    keys: ReadonlyMap<string, Buffer>,
  ) {
    this.keys = new Map([...keys].map(([id, key]) => [id, Buffer.from(key)]));
    if (
      !this.keys.has(currentKeyId) ||
      [...this.keys].some(
        ([id, key]) => !/^[a-zA-Z0-9_-]{1,40}$/.test(id) || key.length !== 32,
      )
    ) {
      throw new PaymentDomainError('invalid_payload_key_configuration');
    }
  }

  seal(plaintext: string, binding: string): string {
    if (
      typeof plaintext !== 'string' ||
      Buffer.byteLength(plaintext, 'utf8') > 65536
    )
      throw new PaymentDomainError('invalid_payload_size');
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.keys.get(this.currentKeyId)!,
      iv,
    );
    cipher.setAAD(Buffer.from(`${this.currentKeyId}:${binding}`));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      this.currentKeyId,
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  open(envelope: string, binding: string): string {
    try {
      if (envelope.length > 90000) throw new Error();
      const parts = envelope.split('.');
      if (parts.length !== 4) throw new Error();
      const [id, iv, body, tag] = parts;
      const key = this.keys.get(id);
      if (
        !key ||
        Buffer.from(iv, 'base64url').length !== 12 ||
        Buffer.from(tag, 'base64url').length !== 16
      )
        throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(`${id}:${binding}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new PaymentDomainError('payment_payload_unavailable');
    }
  }
}

export function paymentPayloadFingerprint(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}
