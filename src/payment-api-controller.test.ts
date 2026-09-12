import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentApiController,
  PaymentRequestLimiter,
} from './payment-api-controller.js';
import {
  createPaymentAttempt,
  PaymentDomainError,
  validateAttempt,
} from './payment-domain.js';
import {
  PaymentRequestAuthenticator,
  type PaymentRequestEnvelope,
} from './payment-request-auth.js';
import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';

const scope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'fixture',
  store: 'fixture',
  endpointRegion: 'eu',
} as const;
function setup(
  limiter = new PaymentRequestLimiter(100, 32, 60000),
  existingAttempt = false,
) {
  const now = Date.now() - 1000;
  const attempt = createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture',
      bundleVersion: 'fixture',
      deliveryVersion: 'fixture',
      locale: 'en',
      country: 'US',
      payerReference: null,
      participantReference: null,
      currency: 'USD',
      originalAmount: 29900,
      discountAmount: 0,
      finalAmount: 29900,
      discountPolicyReference: null,
      redemptionReference: null,
      paymentOption: 'one_time',
      termsVersion: 'fixture',
      consentReceipt: 'fixture',
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 60000,
    },
  });
  const auth = new PaymentRequestAuthenticator(
    new Map([
      ['test', { caller: 'wordpress-test', secret: randomBytes(32) }],
      ['other', { caller: 'other', secret: randomBytes(32) }],
    ]),
  );
  const nonces = new Set<string>();
  const token = `pcap_${'x'.repeat(43)}`;
  const ready = {
    state: 'checkout_ready' as const,
    paymentMethodCapabilities: ['card'] as const,
    session: {
      id: 'fixture-session',
      sessionData: 'private-session-fixture',
      expiresAt: new Date(now + 60000).toISOString(),
    },
    returnBinding: 'fixture-private-return-binding',
  };
  const deps = {
    admission: {
      preflightSignature: vi.fn(
        (
          envelope: unknown,
          body: Buffer,
          expected: { caller: string; method: string; path: string },
        ) => {
          auth.verify(envelope, body, expected);
        },
      ),
      admit: vi.fn(
        async (
          envelope: unknown,
          body: Buffer,
          expected: { caller: string; method: string; path: string },
        ) => {
          const receipt = auth.verify(envelope, body, expected);
          if (nonces.has(receipt.nonceSha256))
            throw new PaymentDomainError('internal_request_replayed');
          nonces.add(receipt.nonceSha256);
          return receipt;
        },
      ),
      issueStatusCapability: vi.fn(async () => ({
        id: randomUUID(),
        token,
        expiresAt: now + 86400000,
      })),
      permitsStatus: vi.fn(
        async (t: string, id: string) =>
          t === token && id === attempt.attemptId,
      ),
    },
    store: {
      acceptAttempt: vi.fn(async () => attempt),
      readAttempt: vi.fn(async () => (existingAttempt ? attempt : null)),
    },
    sessions: {
      validateStart: vi.fn(validateAttempt),
      start: vi.fn(async () => ready),
      resume: vi.fn(async () => ready),
      checkSubmit: vi.fn(async () => ({
        state: 'session_submit_allowed' as const,
      })),
    },
    events: {
      readInternalEvidence: vi.fn(
        async (): Promise<CheckoutPaymentEvidence | null> => ({
          state: 'authorization_recorded',
          payments: [
            {
              paymentReference: 'must-not-expose-psp',
              evidence: {
                pending: false,
                authorization: 'authorized',
                capturedAmount: 29900,
                captureFailed: false,
                refundedAmount: 0,
                refundFailed: false,
                refundReversedAmount: 0,
                chargebackAmount: 0,
                chargebackReversedAmount: 0,
                canceled: false,
                expired: false,
                evidenceState: 'consistent',
                exceptions: [],
                settlement: 'unproven',
                fulfillment: 'not_evaluated',
              },
            },
          ],
          exceptions: ['must-not-expose-reason'],
          settlement: 'unproven',
          fulfillment: 'not_evaluated',
        }),
      ),
      readConfirmationSummary: vi.fn(async () => ({
        schemaVersion: 1 as const,
        offerKey: 'mcq-program-a-foundations',
        amount: 29900,
        currency: 'USD',
        paymentStatus: 'authorized' as const,
        paymentRecordedAt: '2026-09-12T04:00:00.000Z',
        paymentReference: 'TCA-1234567890AB',
      })),
    },
    reconciliation: {
      readState: vi.fn(
        async (): Promise<
          'not_started' | 'pending' | 'verified' | 'needs_review'
        > => 'verified',
      ),
      verify: vi.fn(async () => ({
        state: 'verified' as const,
        binding: {
          attemptId: attempt.attemptId,
          paymentReference: 'must-not-expose-psp',
          paymentMethod: 'card' as const,
          evidenceSha256: 'a'.repeat(64),
        },
      })),
    },
  };
  const controller = new PaymentApiController(
    'wordpress-test',
    (caller, a) =>
      caller === 'wordpress-test' &&
      a.quote.authority === 'wordpress:test' &&
      JSON.stringify(a.scope) === JSON.stringify(scope),
    limiter,
    deps,
  );
  function signed(
    path: PaymentRequestEnvelope['path'],
    command: Record<string, unknown>,
    options: { operationId?: string; caller?: string } = {},
  ) {
    const body = Buffer.from(JSON.stringify(command));
    const caller = options.caller ?? 'wordpress-test';
    const envelope = auth.sign(
      {
        version: 1,
        keyId: caller === 'other' ? 'other' : 'test',
        caller,
        method: 'POST',
        path,
        timestamp: Date.now(),
        nonce: randomUUID(),
        operationId: options.operationId ?? String(command.requestId),
      },
      body,
    );
    return Buffer.from(
      JSON.stringify({
        auth: envelope,
        payloadBase64: body.toString('base64'),
      }),
    );
  }
  return { attempt, controller, deps, signed, token, ready };
}

describe('unwired signed payment HTTP controller', () => {
  it('binds a signed command to its operation and creates the capability before provider dispatch', async () => {
    const s = setup();
    const result = await s.controller.handle(
      'POST',
      '/internal/payments/sessions',
      s.signed('/internal/payments/sessions', {
        requestId: randomUUID(),
        attempt: s.attempt,
      }),
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ...s.ready,
      attemptId: s.attempt.attemptId,
      capability: s.token,
    });
    expect(
      s.deps.admission.issueStatusCapability.mock.invocationCallOrder[0],
    ).toBeLessThan(s.deps.sessions.start.mock.invocationCallOrder[0]);
    expect(result.headers['Cache-Control']).toBe('no-store');
  });
  it('replays no effect after a duplicate signed nonce', async () => {
    const s = setup(),
      wire = s.signed('/internal/payments/sessions', {
        requestId: randomUUID(),
        attempt: s.attempt,
      });
    expect(
      (await s.controller.handle('POST', '/internal/payments/sessions', wire))
        .status,
    ).toBe(200);
    expect(
      (await s.controller.handle('POST', '/internal/payments/sessions', wire))
        .status,
    ).toBe(409);
    expect(s.deps.sessions.start).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost first response from the exact persisted attempt despite new-start disablement', async () => {
    const s = setup(undefined, true);
    s.deps.sessions.validateStart.mockImplementation(() => {
      throw new PaymentDomainError('offer_not_enabled');
    });
    const requestId = randomUUID();
    const response = await s.controller.handle(
      'POST',
      '/internal/payments/sessions',
      s.signed('/internal/payments/sessions', {
        requestId,
        attempt: s.attempt,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      state: 'checkout_ready',
      capability: s.token,
    });
    expect(s.deps.sessions.validateStart).not.toHaveBeenCalled();
    expect(s.deps.store.acceptAttempt).not.toHaveBeenCalled();
    expect(s.deps.sessions.start).not.toHaveBeenCalled();
    expect(s.deps.sessions.resume).toHaveBeenCalledWith(s.attempt.attemptId);
    const changed = {
      ...s.attempt,
      paymentMethodCapabilities: ['card', 'ach_direct_debit'],
    };
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          s.signed('/internal/payments/sessions', {
            requestId: randomUUID(),
            attempt: changed,
          }),
        )
      ).status,
    ).toBe(409);
  });
  it('rejects header/body operation mismatch and unknown actions before payment effects', async () => {
    const s = setup();
    for (const command of [
      { requestId: randomUUID(), attempt: s.attempt },
      { requestId: randomUUID(), attempt: s.attempt, action: 'refund' },
    ]) {
      const wire = s.signed('/internal/payments/sessions', command, {
        operationId: 'action' in command ? command.requestId : randomUUID(),
      });
      expect(
        (await s.controller.handle('POST', '/internal/payments/sessions', wire))
          .status,
      ).toBe(400);
    }
    expect(s.deps.store.acceptAttempt).not.toHaveBeenCalled();
    expect(s.deps.sessions.start).not.toHaveBeenCalled();
  });
  it('rejects caller, path and payload tampering', async () => {
    const s = setup(),
      command = { requestId: randomUUID(), attempt: s.attempt };
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          s.signed('/internal/payments/sessions', command, { caller: 'other' }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/status',
          s.signed('/internal/payments/sessions', command),
        )
      ).status,
    ).toBe(401);
    const outer = JSON.parse(
      s.signed('/internal/payments/sessions', command).toString(),
    );
    outer.payloadBase64 = Buffer.from(
      JSON.stringify({ ...command, attempt: {} }),
    ).toString('base64');
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          Buffer.from(JSON.stringify(outer)),
        )
      ).status,
    ).toBe(401);
    expect(s.deps.sessions.start).not.toHaveBeenCalled();
  });
  it('preserves signed bytes through outer JSON reserialization', async () => {
    const s = setup(),
      wire = s.signed('/internal/payments/sessions', {
        requestId: randomUUID(),
        attempt: s.attempt,
      });
    const reencoded = Buffer.from(
      JSON.stringify(JSON.parse(wire.toString()), null, 4),
    );
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          reencoded,
        )
      ).status,
    ).toBe(200);
  });
  it('validates exact scope and disabled offers before issuing a capability', async () => {
    const s = setup();
    const foreign = {
      ...s.attempt,
      scope: { ...s.attempt.scope, environment: 'live' },
    };
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          s.signed('/internal/payments/sessions', {
            requestId: randomUUID(),
            attempt: foreign,
          }),
        )
      ).status,
    ).toBe(403);
    s.deps.sessions.validateStart.mockImplementation(() => {
      throw new PaymentDomainError('offer_not_enabled');
    });
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          s.signed('/internal/payments/sessions', {
            requestId: randomUUID(),
            attempt: s.attempt,
          }),
        )
      ).status,
    ).toBe(403);
    expect(s.deps.admission.issueStatusCapability).not.toHaveBeenCalled();
  });
  it('requires an exact capability before resume or any internal evidence read', async () => {
    const s = setup();
    for (const path of [
      '/internal/payments/attempts',
      '/internal/payments/status',
    ] as const) {
      const result = await s.controller.handle(
        'POST',
        path,
        s.signed(path, {
          requestId: randomUUID(),
          attemptId: s.attempt.attemptId,
          capability: 'wrong',
        }),
      );
      expect(result.status).toBe(401);
    }
    expect(s.deps.store.readAttempt).not.toHaveBeenCalled();
    expect(s.deps.events.readInternalEvidence).not.toHaveBeenCalled();
    expect(s.deps.sessions.resume).not.toHaveBeenCalled();
  });
  it('admits a signed read-only submit check with no card or operation fields', async () => {
    const s = setup(undefined, true);
    const command = {
      requestId: randomUUID(),
      attemptId: s.attempt.attemptId,
      capability: s.token,
      returnBinding: 'private-exact-binding',
    };
    const checked = await s.controller.handle(
      'POST',
      '/internal/payments/session-submit-checks',
      s.signed('/internal/payments/session-submit-checks', command),
    );
    expect(checked).toMatchObject({
      status: 200,
      body: {
        attemptId: s.attempt.attemptId,
        state: 'session_submit_allowed',
      },
    });
    expect(s.deps.sessions.checkSubmit).toHaveBeenCalledWith({
      attemptId: s.attempt.attemptId,
      returnBinding: command.returnBinding,
    });
    const withCardData = { ...command, requestId: randomUUID(), card: '4111' };
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/session-submit-checks',
          s.signed('/internal/payments/session-submit-checks', withCardData),
        )
      ).status,
    ).toBe(400);
  });
  it('authenticates a returned Session result and exposes no method/provider detail', async () => {
    const s = setup(undefined, true);
    const command = {
      requestId: randomUUID(),
      attemptId: s.attempt.attemptId,
      capability: s.token,
      sessionResult: 'private-browser-result',
    };
    const response = await s.controller.handle(
      'POST',
      '/internal/payments/returns',
      s.signed('/internal/payments/returns', command),
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      attemptId: s.attempt.attemptId,
      state: 'confirming_payment',
      confirmation: {
        schemaVersion: 1,
        offerKey: 'mcq-program-a-foundations',
        amount: 29900,
        currency: 'USD',
        paymentStatus: 'authorized',
        paymentRecordedAt: '2026-09-12T04:00:00.000Z',
        paymentReference: 'TCA-1234567890AB',
      },
    });
    expect(s.deps.events.readConfirmationSummary).toHaveBeenCalledWith(
      s.attempt.attemptId,
    );
    expect(s.deps.reconciliation.verify).toHaveBeenCalledWith({
      operationId: command.requestId,
      attemptId: s.attempt.attemptId,
      sessionResult: command.sessionResult,
    });
    expect(JSON.stringify(response)).not.toContain(command.sessionResult);
  });
  it('loads the immutable original attempt for a permitted resume', async () => {
    const s = setup(undefined, true),
      path = '/internal/payments/attempts';
    const response = await s.controller.handle(
      'POST',
      path,
      s.signed(path, {
        requestId: randomUUID(),
        attemptId: s.attempt.attemptId,
        capability: s.token,
      }),
    );
    expect(response.status).toBe(200);
    expect(s.deps.sessions.resume).toHaveBeenCalledWith(s.attempt.attemptId);
  });
  it('minimizes status and never claims paid or fulfillment from authorization', async () => {
    const s = setup(undefined, true),
      path = '/internal/payments/status';
    const response = await s.controller.handle(
      'POST',
      path,
      s.signed(path, {
        requestId: randomUUID(),
        attemptId: s.attempt.attemptId,
        capability: s.token,
      }),
    );
    expect(response.body).toEqual({
      attemptId: s.attempt.attemptId,
      state: 'confirming_payment',
      confirmation: {
        schemaVersion: 1,
        offerKey: 'mcq-program-a-foundations',
        amount: 29900,
        currency: 'USD',
        paymentStatus: 'authorized',
        paymentRecordedAt: '2026-09-12T04:00:00.000Z',
        paymentReference: 'TCA-1234567890AB',
      },
    });
    expect(JSON.stringify(response)).not.toContain('must-not-expose');
    expect(JSON.stringify(response)).not.toContain('private-session');
  });
  it('keeps a durable reconciliation conflict sticky in later status reads', async () => {
    const s = setup(undefined, true);
    s.deps.reconciliation.readState.mockResolvedValue('needs_review');
    const command = {
      requestId: randomUUID(),
      attemptId: s.attempt.attemptId,
      capability: s.token,
    };
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/status',
          s.signed('/internal/payments/status', command),
        )
      ).body,
    ).toEqual({ attemptId: s.attempt.attemptId, state: 'needs_review' });
    expect(s.deps.events.readInternalEvidence).not.toHaveBeenCalled();
  });
  it.each([
    ['payment_pending', 'payment_pending'],
    ['payment_failed', 'payment_failed'],
    ['payment_reversed', 'payment_reversed'],
    ['refund_pending', 'refund_pending'],
  ] as const)('maps internal %s to minimized %s', async (internal, exposed) => {
    const s = setup(undefined, true);
    const current = await s.deps.events.readInternalEvidence();
    s.deps.events.readInternalEvidence.mockResolvedValue({
      ...current!,
      state: internal,
    });
    const command = {
      requestId: randomUUID(),
      attemptId: s.attempt.attemptId,
      capability: s.token,
    };
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/status',
          s.signed('/internal/payments/status', command),
        )
      ).body,
    ).toEqual({ attemptId: s.attempt.attemptId, state: exposed });
  });
  it('sanitizes dependency and PostgreSQL errors without losing concurrency permits', async () => {
    const s = setup(new PaymentRequestLimiter(10, 1, 60000));
    for (const error of [
      new Error('private server detail'),
      Object.assign(new Error('private SQL value'), { code: '23505' }),
    ]) {
      s.deps.sessions.start.mockRejectedValueOnce(error);
      const response = await s.controller.handle(
        'POST',
        '/internal/payments/sessions',
        s.signed('/internal/payments/sessions', {
          requestId: randomUUID(),
          attempt: s.attempt,
        }),
      );
      expect([503, 409]).toContain(response.status);
      expect(JSON.stringify(response)).not.toContain('private');
      expect(response.headers['Cache-Control']).toBe('no-store');
    }
  });
  it('treats missing scoped evidence as unavailable, not a false awaiting-payment state', async () => {
    const s = setup(undefined, true),
      path = '/internal/payments/status';
    s.deps.events.readInternalEvidence.mockResolvedValueOnce(null);
    const result = await s.controller.handle(
      'POST',
      path,
      s.signed(path, {
        requestId: randomUUID(),
        attemptId: s.attempt.attemptId,
        capability: s.token,
      }),
    );
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'payment_service_unavailable' });
  });
  it('bounds method, path, wire size and noncanonical base64 before effects', async () => {
    const s = setup();
    expect(
      (
        await s.controller.handle(
          'GET',
          '/internal/payments/sessions',
          Buffer.alloc(0),
        )
      ).status,
    ).toBe(405);
    expect(
      (await s.controller.handle('POST', '/other', Buffer.alloc(0))).status,
    ).toBe(404);
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          Buffer.alloc(100001),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          Buffer.from('{"auth":{},"payloadBase64":"@@"}'),
        )
      ).status,
    ).toBe(400);
    expect(s.deps.admission.admit).not.toHaveBeenCalled();
  });
  it('rate limits before nonce/database work and releases leases only once', async () => {
    let now = 1000;
    const limiter = new PaymentRequestLimiter(1, 1, 100, () => now);
    const release = limiter.acquire()!;
    expect(limiter.acquire()).toBeNull();
    release();
    release();
    expect(limiter.acquire()).toBeNull();
    now += 101;
    expect(limiter.acquire()).not.toBeNull();
    const s = setup(new PaymentRequestLimiter(1, 1, 60000));
    const response = await s.controller.handle(
      'POST',
      '/internal/payments/sessions',
      Buffer.from('invalid'),
    );
    expect(response.status).toBe(400);
    expect(s.deps.admission.admit).not.toHaveBeenCalled();
    const wrong = JSON.parse(
      s
        .signed('/internal/payments/sessions', {
          requestId: randomUUID(),
          attempt: s.attempt,
        })
        .toString(),
    );
    wrong.auth.signature = '0'.repeat(64);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await s.controller.handle(
            'POST',
            '/internal/payments/sessions',
            Buffer.from(JSON.stringify(wrong)),
          )
        ).status,
      ).toBe(401);
    expect(s.deps.admission.admit).not.toHaveBeenCalled();
    const valid = () =>
      s.signed('/internal/payments/sessions', {
        requestId: randomUUID(),
        attempt: s.attempt,
      });
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          valid(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await s.controller.handle(
          'POST',
          '/internal/payments/sessions',
          valid(),
        )
      ).status,
    ).toBe(429);
    expect(s.deps.admission.admit).toHaveBeenCalledTimes(1);
  });
});
