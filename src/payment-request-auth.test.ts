import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';

describe('internal payment request authentication', () => {
  const now = 1800000000000;
  const secret = randomBytes(32);
  const auth = new PaymentRequestAuthenticator(
    new Map([['current', { caller: 'wordpress-test', secret }]]),
  );
  const body = Buffer.from('{"amount":29900}');
  const expected = {
    caller: 'wordpress-test',
    method: 'POST',
    path: '/internal/payments/sessions',
  };
  const unsigned = () => ({
    version: 1 as const,
    keyId: 'current',
    caller: 'wordpress-test',
    method: 'POST' as const,
    path: '/internal/payments/sessions' as const,
    timestamp: now,
    nonce: randomUUID(),
    operationId: randomUUID(),
  });
  it('authenticates exact bytes and returns a minimized durable replay-admission receipt', () => {
    const envelope = auth.sign(unsigned(), body);
    const result = auth.verify(envelope, body, expected, now);
    expect(result).toMatchObject({
      caller: expected.caller,
      operationId: envelope.operationId,
      receivedAt: now,
      retainNonceUntil: now + 300001,
    });
    expect(result.nonceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(envelope.signature);
    expect(JSON.stringify(result)).not.toContain('amount');
  });
  it.each([
    { caller: 'other' },
    { path: '/internal/payments/status' },
    { method: 'GET' },
    { operationId: randomUUID() },
    { nonce: randomUUID() },
    { timestamp: now + 1 },
    { keyId: 'unknown' },
    { signature: '0'.repeat(64) },
    { version: 2 },
  ])('rejects envelope tampering %o', (change) => {
    expect(() =>
      auth.verify(
        { ...auth.sign(unsigned(), body), ...change },
        body,
        expected,
        now,
      ),
    ).toThrow('internal_request_denied');
  });
  it('rejects body changes, route mismatch, oversized bytes and extra fields', () => {
    const envelope = auth.sign(unsigned(), body);
    for (const b of [
      Buffer.from('{"amount":1}'),
      Buffer.concat([body, Buffer.from(' ')]),
      Buffer.alloc(65537),
    ]) {
      expect(() => auth.verify(envelope, b, expected, now)).toThrow(
        'internal_request_denied',
      );
    }
    expect(() =>
      auth.verify(
        envelope,
        body,
        { ...expected, path: '/internal/payments/status' },
        now,
      ),
    ).toThrow('internal_request_denied');
    expect(() =>
      auth.verify({ ...envelope, rawApiKey: 'fixture' }, body, expected, now),
    ).toThrow('internal_request_denied');
  });
  it.each([-300001, 300001])(
    'rejects timestamps outside the skew window %d',
    (offset) => {
      expect(() =>
        auth.verify(
          auth.sign({ ...unsigned(), timestamp: now + offset }, body),
          body,
          expected,
          now,
        ),
      ).toThrow('internal_request_denied');
    },
  );
  it('retains future-dated nonces until their full validity window closes', () => {
    const envelope = auth.sign(
      { ...unsigned(), timestamp: now + 300000 },
      body,
    );
    expect(auth.verify(envelope, body, expected, now).retainNonceUntil).toBe(
      now + 600001,
    );
  });
  it('binds a key to its caller and supports explicit previous-key rotation', () => {
    const rotated = new PaymentRequestAuthenticator(
      new Map([
        ['current', { caller: 'wordpress-test', secret }],
        ['next', { caller: 'wordpress-test', secret: randomBytes(32) }],
      ]),
    );
    expect(
      rotated.verify(auth.sign(unsigned(), body), body, expected, now).caller,
    ).toBe(expected.caller);
    expect(() =>
      rotated.sign({ ...unsigned(), caller: 'other' }, body),
    ).toThrow('internal_request_denied');
  });
  it('does not claim replay prevention without the separate durable nonce admission', () => {
    const envelope = auth.sign(unsigned(), body);
    expect(auth.verify(envelope, body, expected, now)).toEqual(
      auth.verify(envelope, body, expected, now),
    );
  });
});
