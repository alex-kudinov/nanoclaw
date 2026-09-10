import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { AdyenTestSessionResultAdapter } from './adyen-session-result-adapter.js';
import { createPaymentAttempt } from './payment-domain.js';

const scope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'fixture-merchant',
  store: 'fixture-store',
  endpointRegion: 'eu',
} as const;

function attempt(
  capabilities: readonly ('card' | 'ach_direct_debit')[] = [
    'card',
    'ach_direct_debit',
  ],
) {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: capabilities,
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
}

function providerResult(
  sessionId: string,
  attemptId = '00000000-0000-4000-8000-000000000000',
  changes: Record<string, unknown> = {},
) {
  return {
    id: sessionId,
    status: 'completed',
    reference: `tandem-poc-tsv1-${attemptId}`,
    payments: [
      {
        pspReference: 'ABCDEFGHIJKLMNOP',
        resultCode: 'Authorised',
        amount: { value: 29900, currency: 'USD' },
        paymentMethod: { type: 'scheme', brand: 'visa' },
        ...changes,
      },
    ],
  };
}

describe('Adyen TEST Session-result verifier', () => {
  it.each([
    { providerMethod: 'scheme', publicMethod: 'card' },
    { providerMethod: 'ach', publicMethod: 'ach_direct_debit' },
  ])(
    'binds an authenticated $providerMethod result to $publicMethod',
    async ({ providerMethod, publicMethod }) => {
      const sessionId = 'fixture-session/id';
      const sessionResult = 'untrusted+browser/result=';
      const a = attempt();
      const transport = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) =>
          new Response(
            JSON.stringify(
              providerResult(sessionId, a.attemptId, {
                paymentMethod: { type: providerMethod },
              }),
            ),
            { status: 200 },
          ),
      );
      const adapter = new AdyenTestSessionResultAdapter(
        'fixture-api-key',
        scope,
        transport as typeof fetch,
      );
      expect(
        await adapter.verify({ attempt: a, sessionId, sessionResult }),
      ).toEqual({
        attemptId: a.attemptId,
        sessionId,
        paymentReference: 'ABCDEFGHIJKLMNOP',
        paymentMethod: publicMethod,
        amount: 29900,
        currency: 'USD',
      });
      const [url, init] = transport.mock.calls[0];
      expect(url).toBeInstanceOf(URL);
      expect((url as URL).origin).toBe('https://checkout-test.adyen.com');
      expect((url as URL).pathname).toBe('/v72/sessions/fixture-session%2Fid');
      expect((url as URL).searchParams.get('sessionResult')).toBe(
        sessionResult,
      );
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'error',
        headers: { 'X-API-Key': 'fixture-api-key' },
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.stringify(adapter)).not.toContain('fixture-api-key');
      expect(
        JSON.stringify(
          await adapter.verify({
            attempt: a,
            sessionId,
            sessionResult,
          }),
        ),
      ).not.toContain(sessionResult);
    },
  );

  it.each([
    { name: 'different Session', top: { id: 'other-session' } },
    { name: 'missing Session status', top: { status: undefined } },
    { name: 'incomplete Session', top: { status: 'active' } },
    { name: 'expired Session', top: { status: 'expired' } },
    { name: 'empty authorised payments', top: { payments: [] } },
    { name: 'multiple authorised payments', multiple: true },
    {
      name: 'unknown payment method',
      payment: { paymentMethod: { type: 'plaid' } },
    },
    {
      name: 'invalid PSP reference',
      payment: { pspReference: 'bad reference' },
    },
    { name: 'missing attempt reference', top: { reference: undefined } },
    { name: 'missing result code', payment: { resultCode: undefined } },
    {
      name: 'another attempts reference',
      top: { reference: `tandem-poc-tsv1-${randomUUID()}` },
    },
    { name: 'pending result', payment: { resultCode: 'Pending' } },
    { name: 'refused result', payment: { resultCode: 'Refused' } },
    { name: 'cancelled result', payment: { resultCode: 'Cancelled' } },
    {
      name: 'changed amount',
      payment: { amount: { value: 1, currency: 'USD' } },
    },
    {
      name: 'changed currency',
      payment: { amount: { value: 29900, currency: 'CAD' } },
    },
  ])('fails closed on $name', async ({ top, multiple, payment }) => {
    const a = attempt();
    const base = providerResult('fixture-session', a.attemptId, payment);
    const result = {
      ...base,
      ...top,
      ...(multiple ? { payments: [...base.payments, ...base.payments] } : {}),
    };
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      (async () => new Response(JSON.stringify(result))) as typeof fetch,
    );
    await expect(
      adapter.verify({
        attempt: a,
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow('provider_session_result_conflict');
  });

  it('rejects a provider method outside the immutable attempt capabilities', async () => {
    const a = attempt(['card']);
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      (async () =>
        new Response(
          JSON.stringify(
            providerResult('fixture-session', a.attemptId, {
              paymentMethod: { type: 'ach' },
            }),
          ),
        )) as typeof fetch,
    );
    await expect(
      adapter.verify({
        attempt: a,
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow('provider_session_result_conflict');
  });

  it.each([
    { sessionId: '', sessionResult: 'x' },
    { sessionId: 'x', sessionResult: '' },
    { sessionId: 'x\r\ny', sessionResult: 'x' },
    { sessionId: 'x', sessionResult: 'x\r\ny' },
    { sessionId: 'x'.repeat(201), sessionResult: 'x' },
    { sessionId: 'x', sessionResult: 'x'.repeat(65537) },
  ])('rejects invalid browser/provider lookup input %o', async (input) => {
    const transport = vi.fn();
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      transport as typeof fetch,
    );
    await expect(
      adapter.verify({ attempt: attempt(), ...input }),
    ).rejects.toThrow('invalid_session_result_request');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 409, 429, 500, 503])(
    'sanitizes HTTP %s without reading its body',
    async (status) => {
      const adapter = new AdyenTestSessionResultAdapter(
        'fixture',
        scope,
        (async () =>
          new Response('private provider detail', { status })) as typeof fetch,
      );
      await expect(
        adapter.verify({
          attempt: attempt(),
          sessionId: 'fixture-session',
          sessionResult: 'fixture-result',
        }),
      ).rejects.toThrow('provider_outcome_unknown');
    },
  );

  it.each([
    'not-json',
    JSON.stringify({ id: 'fixture-session' }),
    'x'.repeat(131073),
  ])('rejects malformed or excessive provider response', async (body) => {
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      (async () => new Response(body)) as typeof fetch,
    );
    await expect(
      adapter.verify({
        attempt: attempt(),
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow(
      body.startsWith('{')
        ? 'provider_session_result_conflict'
        : 'provider_outcome_unknown',
    );
  });

  it('enforces the deadline even when an injected transport ignores its signal', async () => {
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      (() => new Promise<Response>(() => undefined)) as typeof fetch,
      20,
    );
    const started = Date.now();
    await expect(
      adapter.verify({
        attempt: attempt(),
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow('provider_outcome_unknown');
    expect(Date.now() - started).toBeLessThan(250);
  });

  it('uses the same deadline for the complete streamed response body', async () => {
    let late: ReturnType<typeof setTimeout> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('{"id":"fixture-session",'));
        late = setTimeout(() => {
          controller.enqueue(
            Buffer.from('"status":"completed","payments":[]}'),
          );
          controller.close();
        }, 200);
      },
      cancel() {
        if (late) clearTimeout(late);
      },
    });
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      (async () => new Response(stream)) as typeof fetch,
      20,
    );
    const started = Date.now();
    await expect(
      adapter.verify({
        attempt: attempt(),
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow('provider_outcome_unknown');
    expect(Date.now() - started).toBeLessThan(250);
  });

  it('sanitizes transport failure and rejects non-TEST scope before fetch', async () => {
    const transport = vi.fn(async () => {
      throw new Error('private transport detail');
    });
    const adapter = new AdyenTestSessionResultAdapter(
      'fixture',
      scope,
      transport as typeof fetch,
    );
    await expect(
      adapter.verify({
        attempt: attempt(),
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow('provider_outcome_unknown');
    transport.mockClear();
    await expect(
      adapter.verify({
        attempt: {
          ...attempt(),
          scope: { ...scope, environment: 'live' },
        },
        sessionId: 'fixture-session',
        sessionResult: 'fixture-result',
      }),
    ).rejects.toThrow('adyen_test_scope_mismatch');
    expect(transport).not.toHaveBeenCalled();
    expect(
      () =>
        new AdyenTestSessionResultAdapter('fixture', {
          ...scope,
          environment: 'live',
        }),
    ).toThrow('adyen_test_scope_mismatch');
  });
});
