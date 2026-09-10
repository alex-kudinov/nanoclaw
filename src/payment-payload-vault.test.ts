import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PaymentPayloadVault,
  paymentPayloadFingerprint,
} from './payment-payload-vault.js';

describe('payment payload encryption', () => {
  const old = randomBytes(32),
    next = randomBytes(32);
  const vault = new PaymentPayloadVault('old', new Map([['old', old]]));
  it('round trips exact bytes with randomized authenticated ciphertext', () => {
    const body = '{"session":"sandbox-fixture","amount":29900}';
    const a = vault.seal(body, 'op:request'),
      b = vault.seal(body, 'op:request');
    expect(a).not.toBe(b);
    expect(a).not.toContain('sandbox-fixture');
    expect(vault.open(a, 'op:request')).toBe(body);
    expect(paymentPayloadFingerprint(body)).not.toBe(
      paymentPayloadFingerprint(body + ' '),
    );
  });
  it('rejects tampering and cross-operation/response transplantation without leaking data', () => {
    const sealed = vault.seal('fixture-sensitive', 'op:request');
    expect(() => vault.open(sealed, 'op:response')).toThrow(
      'payment_payload_unavailable',
    );
    const parts = sealed.split('.');
    parts[2] = 'tampered';
    expect(() => vault.open(parts.join('.'), 'op:request')).toThrow(
      'payment_payload_unavailable',
    );
  });
  it('supports explicit key rotation while retaining old decryption capability', () => {
    const sealed = vault.seal('fixture', 'op');
    const rotated = new PaymentPayloadVault(
      'next',
      new Map([
        ['old', old],
        ['next', next],
      ]),
    );
    expect(rotated.open(sealed, 'op')).toBe('fixture');
    expect(rotated.seal('fixture', 'op').startsWith('next.')).toBe(true);
    expect(() =>
      new PaymentPayloadVault('next', new Map([['next', next]])).open(
        sealed,
        'op',
      ),
    ).toThrow('payment_payload_unavailable');
  });
  it('rejects bad key configuration and oversized payloads', () => {
    expect(() => new PaymentPayloadVault('missing', new Map())).toThrow(
      'invalid_payload_key_configuration',
    );
    expect(() => vault.seal('x'.repeat(65537), 'op')).toThrow(
      'invalid_payload_size',
    );
  });
});
