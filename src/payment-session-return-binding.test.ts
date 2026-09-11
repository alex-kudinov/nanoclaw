import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  PaymentSessionReturnBindingIssuer,
  sessionIdSha256,
} from './payment-session-return-binding.js';

describe('exact Session-operation return binding', () => {
  it('round-trips only the exact operation, sequence, Session hash and expiry', () => {
    const issuer = new PaymentSessionReturnBindingIssuer(randomBytes(32));
    const payload = {
      attemptId: randomUUID(),
      paymentOperationId: randomUUID(),
      sessionSequence: 2,
      sessionIdSha256: sessionIdSha256('private-session-id'),
      expiresAt: 2_000,
    } as const;
    const token = issuer.issue(payload);
    expect(token).toMatch(/^prb1_/);
    expect(token).not.toContain('private-session-id');
    expect(issuer.open(token, 1_999)).toEqual(payload);
    expect(() => issuer.open(token, 2_000)).toThrow('return_binding_expired');
  });

  it('rejects tampering, another key, invalid sequence and invalid key size', () => {
    const issuer = new PaymentSessionReturnBindingIssuer(randomBytes(32));
    const token = issuer.issue({
      attemptId: randomUUID(),
      paymentOperationId: randomUUID(),
      sessionSequence: 1,
      sessionIdSha256: sessionIdSha256('session'),
      expiresAt: 2_000,
    });
    const changed = Buffer.from(token.slice('prb1_'.length), 'base64url');
    changed[28] ^= 0x01;
    expect(() =>
      issuer.open(`prb1_${changed.toString('base64url')}`, 1_000),
    ).toThrow('invalid_return_binding');
    expect(() =>
      new PaymentSessionReturnBindingIssuer(randomBytes(32)).open(token, 1_000),
    ).toThrow('invalid_return_binding');
    expect(() =>
      issuer.issue({
        attemptId: randomUUID(),
        paymentOperationId: randomUUID(),
        sessionSequence: 4,
        sessionIdSha256: sessionIdSha256('session'),
        expiresAt: 2_000,
      }),
    ).toThrow();
    expect(
      () => new PaymentSessionReturnBindingIssuer(randomBytes(31)),
    ).toThrow('invalid_return_binding_configuration');
  });
});
