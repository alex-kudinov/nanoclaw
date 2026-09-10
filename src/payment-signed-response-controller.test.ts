import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import {
  PaymentResponseSigner,
  PaymentSignedResponseController,
  type AttemptAcceptanceReceipt,
} from './payment-signed-response-controller.js';

const NOW = 1789072000000;
const caller = 'tandem-wordpress-test';
const responseKey = Buffer.from('s'.repeat(32));
const requestKey = Buffer.from('r'.repeat(32));
const fixtureContext = {
  path: '/internal/payments/sessions' as const,
  operationId: '10000000-0000-4000-8000-000000000001',
  requestNonce: '00000000-0000-4000-8000-000000000001',
};
const fixtureInner =
  '{"state":"checkout_ready","attemptAcceptanceReceipt":{"schemaVersion":1,"receiptReference":"attempt-acceptance:fixture:001","kind":"attempt_acceptance","caller":"tandem-wordpress-test","operationId":"10000000-0000-4000-8000-000000000001","quoteId":"30000000-0000-4000-8000-000000000003","quoteFingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":{"provider":"adyen","environment":"test","company":"test-company","merchant":"test-merchant","store":"test-store","endpointRegion":"eu"},"attemptId":"40000000-0000-4000-8000-000000000004","providerScopeFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","discountPolicyReference":"mcs-promo-v1-005"}}';

function verify(
  outer: ReturnType<PaymentResponseSigner['sign']>,
  context = fixtureContext,
  status = 200,
) {
  const body = Buffer.from(outer.payloadBase64, 'base64');
  const input = [
    'tandem-payments-response-v1',
    outer.auth.keyId,
    outer.auth.caller,
    'POST',
    context.path,
    context.operationId,
    context.requestNonce,
    String(status),
    String(outer.auth.timestamp),
    createHash('sha256').update(body).digest('hex'),
  ].join('\n');
  return createHmac('sha256', responseKey).update(input).digest('hex');
}

function setup() {
  const auth = new PaymentRequestAuthenticator(
    new Map([['request-key-v1', { caller, secret: requestKey }]]),
  );
  const signer = new PaymentResponseSigner(
    'response-key-v1',
    { caller, secret: responseKey },
    [requestKey],
    () => NOW,
  );
  const receipt: AttemptAcceptanceReceipt = {
    schemaVersion: 1,
    receiptReference: 'attempt-acceptance:fixture:001',
    kind: 'attempt_acceptance',
    caller,
    operationId: fixtureContext.operationId,
    quoteId: '30000000-0000-4000-8000-000000000003',
    quoteFingerprint: 'a'.repeat(64),
    source: {
      provider: 'adyen',
      environment: 'test',
      company: 'test-company',
      merchant: 'test-merchant',
      store: 'test-store',
      endpointRegion: 'eu',
    },
    attemptId: '40000000-0000-4000-8000-000000000004',
    providerScopeFingerprint: 'b'.repeat(64),
    discountPolicyReference: 'mcs-promo-v1-005',
  };
  const core = {
    handle: vi.fn(async () => ({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: { state: 'checkout_ready', attemptId: receipt.attemptId },
    })),
  };
  const receipts = { read: vi.fn(async () => receipt) };
  const controller = new PaymentSignedResponseController(
    caller,
    auth,
    core,
    signer,
    receipts,
  );
  const inner = Buffer.from(
    JSON.stringify({ requestId: fixtureContext.operationId, attempt: {} }),
  );
  const envelope = auth.sign(
    {
      version: 1,
      keyId: 'request-key-v1',
      caller,
      method: 'POST',
      path: fixtureContext.path,
      timestamp: Date.now(),
      nonce: fixtureContext.requestNonce,
      operationId: fixtureContext.operationId,
    },
    inner,
  );
  const wire = Buffer.from(
    JSON.stringify({
      auth: envelope,
      payloadBase64: inner.toString('base64'),
    }),
  );
  return { signer, receipt, core, receipts, controller, wire };
}

describe('private payment response signing and acceptance receipt wrapper', () => {
  it('matches the shared PHP non-secret response fixture exactly', () => {
    const { signer } = setup();
    const signed = signer.sign({
      ...fixtureContext,
      status: 200,
      body: Buffer.from(fixtureInner),
    });
    expect(createHash('sha256').update(fixtureInner).digest('hex')).toBe(
      '4b1fe2f34769027b1c688d69bc19def3f5c724d90c397bc994eff2d7a77a47be',
    );
    expect(signed.auth.signature).toBe(
      '3053a42e2700f4a34d64fb94f52285abe86cdca5c288d307609d063b622155e6',
    );
    expect(verify(signed)).toBe(signed.auth.signature);
  });

  it('wraps an authenticated core response and includes only durable acceptance receipt', async () => {
    const s = setup();
    const result = await s.controller.handle(
      'POST',
      fixtureContext.path,
      s.wire,
    );
    expect(result.status).toBe(200);
    const outer = result.body as ReturnType<PaymentResponseSigner['sign']>;
    expect(verify(outer)).toBe(outer.auth.signature);
    expect(outer.auth).toMatchObject({
      ...fixtureContext,
      caller,
      status: 200,
      timestamp: NOW,
    });
    const decoded = JSON.parse(
      Buffer.from(outer.payloadBase64, 'base64').toString(),
    );
    expect(decoded.attemptAcceptanceReceipt).toEqual(s.receipt);
    expect(decoded).not.toHaveProperty('promotionConsumptionReceipt');
    expect(decoded).not.toHaveProperty('freeOrderAdmissionReceipt');
    expect(s.receipts.read).toHaveBeenCalledWith({
      attemptId: s.receipt.attemptId,
      operationId: fixtureContext.operationId,
    });
  });

  it('does not sign unauthenticated requests or invent a missing durable receipt', async () => {
    const invalid = setup();
    const changed = JSON.parse(invalid.wire.toString());
    changed.auth.signature = '0'.repeat(64);
    const unsigned = await invalid.controller.handle(
      'POST',
      fixtureContext.path,
      Buffer.from(JSON.stringify(changed)),
    );
    expect(unsigned.body).toEqual({
      state: 'checkout_ready',
      attemptId: invalid.receipt.attemptId,
    });
    expect(invalid.receipts.read).not.toHaveBeenCalled();

    const missing = setup();
    missing.receipts.read.mockResolvedValueOnce(null as never);
    const unavailable = await missing.controller.handle(
      'POST',
      fixtureContext.path,
      missing.wire,
    );
    expect(unavailable.status).toBe(503);
    const outer = unavailable.body as ReturnType<PaymentResponseSigner['sign']>;
    expect(outer.auth.status).toBe(503);
    expect(verify(outer, fixtureContext, 503)).toBe(outer.auth.signature);
    expect(
      JSON.parse(Buffer.from(outer.payloadBase64, 'base64').toString()),
    ).toEqual({
      error: 'payment_service_unavailable',
    });
  });

  it('binds nonce/path/operation/status/key/timestamp/body and rejects reused request keys', () => {
    const { signer } = setup();
    const signed = signer.sign({
      ...fixtureContext,
      status: 200,
      body: Buffer.from('{}'),
    });
    expect(verify(signed)).toBe(signed.auth.signature);
    for (const changed of [
      {
        context: { ...fixtureContext, requestNonce: randomUUID() },
        status: 200,
      },
      {
        context: { ...fixtureContext, operationId: randomUUID() },
        status: 200,
      },
      { context: fixtureContext, status: 201 },
    ])
      expect(verify(signed, changed.context, changed.status)).not.toBe(
        signed.auth.signature,
      );
    expect(
      () =>
        new PaymentResponseSigner(
          'response-key-v1',
          { caller, secret: requestKey },
          [requestKey],
        ),
    ).toThrow('invalid_payment_response_configuration');
    expect(() =>
      new PaymentResponseSigner(
        'response-key-v1',
        { caller, secret: randomBytes(32) },
        [],
        () => -1,
      ).sign({
        ...fixtureContext,
        status: 200,
        body: Buffer.from('{}'),
      }),
    ).toThrow('invalid_payment_response');
  });
});
