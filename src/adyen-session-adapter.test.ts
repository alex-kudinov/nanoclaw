import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AdyenTestSessionAdapter,
  buildAdyenTestSessionRequest,
} from './adyen-session-adapter.js';
import { createPaymentAttempt } from './payment-domain.js';

const scope = {
  provider: 'adyen',
  environment: 'test',
  company: 'fixture',
  merchant: 'merchant-fixture',
  store: 'store-fixture',
  endpointRegion: 'eu',
} as const;
const routing = {
  scope,
  allowedOrigin: 'http://localhost:3000',
  returnPath: '/',
};
function attempt() {
  const now = Date.now();
  return createPaymentAttempt({
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
      expiresAt: now + 1800000,
    },
  });
}
const response = () => ({
  id: 'test-session',
  sessionData: 'test-session-data',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});

describe('Adyen TEST Sessions adapter', () => {
  it('builds a repeatable card-only request from the authoritative quote', () => {
    const a = attempt();
    const request = buildAdyenTestSessionRequest(a, routing);
    expect(request).toBe(buildAdyenTestSessionRequest(a, routing));
    expect(JSON.parse(request)).toMatchObject({
      amount: { value: 29900, currency: 'USD' },
      merchantAccount: scope.merchant,
      store: scope.store,
      reference: `tandem-poc-tsv1-${a.attemptId}`,
      allowedPaymentMethods: ['scheme'],
      expiresAt: new Date(a.quote.expiresAt).toISOString(),
    });
    expect(request).not.toContain('apiKey');
    expect(JSON.parse(request).returnUrl).toBe(
      `http://localhost:3000/?attempt=${a.attemptId}`,
    );
  });
  it.each([
    { environment: 'live' },
    { merchant: 'other' },
    { company: 'other' },
    { store: null },
    { endpointRegion: 'us' },
    { provider: 'stripe' },
  ])('rejects scope drift %o', (change) => {
    expect(() =>
      buildAdyenTestSessionRequest(
        { ...attempt(), scope: { ...scope, ...change } },
        routing,
      ),
    ).toThrow('adyen_test_scope_mismatch');
  });
  it.each([
    'http://example.com',
    'https://example.com/path',
    'https://user:password@example.com',
  ])('rejects unsafe origin %s', (allowedOrigin) => {
    expect(() =>
      buildAdyenTestSessionRequest(attempt(), { ...routing, allowedOrigin }),
    ).toThrow('invalid_checkout_origin');
  });
  it.each([
    '//evil.example/',
    '/?token=fixture',
    '/#fixture',
    'https://evil.example/',
  ])('rejects unsafe return %s', (returnPath) => {
    expect(() =>
      buildAdyenTestSessionRequest(attempt(), { ...routing, returnPath }),
    ).toThrow('invalid_checkout_return');
  });
  it('pins the endpoint, prevents redirects, and sends the original idempotency key', async () => {
    const expected = response();
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...expected,
            shopperEmail: 'discard-fixture@example.test',
          }),
          { status: 201 },
        ),
    );
    const adapter = new AdyenTestSessionAdapter(
      'fixture-api-key',
      fetcher as typeof fetch,
    );
    expect(await adapter.create('{}', 'same-key')).toEqual(expected);
    expect(fetcher).toHaveBeenCalledWith(
      'https://checkout-test.adyen.com/v72/sessions',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: '{}',
        headers: expect.objectContaining({
          'Idempotency-Key': 'same-key',
          'X-API-Key': 'fixture-api-key',
        }),
      }),
    );
    expect(JSON.stringify(adapter)).not.toContain('fixture-api-key');
  });
  it.each([400, 401, 403, 409, 422, 429, 500, 503])(
    'treats HTTP %s as unknown without exposing its response body',
    async (status) => {
      const adapter = new AdyenTestSessionAdapter(
        'fixture',
        (async () =>
          new Response('secret error fixture', { status })) as typeof fetch,
      );
      await expect(adapter.create('{}', 'same-key')).rejects.toThrow(
        'provider_outcome_unknown',
      );
    },
  );
  it.each(['not json', JSON.stringify({ id: 'only-id' }), 'x'.repeat(131073)])(
    'fails closed on malformed or excessive provider responses',
    async (body) => {
      const adapter = new AdyenTestSessionAdapter(
        'fixture',
        (async () => new Response(body)) as typeof fetch,
      );
      await expect(adapter.create('{}', 'same-key')).rejects.toThrow(
        'provider_outcome_unknown',
      );
    },
  );
  it('sanitizes timeout/transport errors and rejects expired sessions', async () => {
    const timeout = new AdyenTestSessionAdapter('fixture', (async () => {
      throw new Error('secret transport detail');
    }) as typeof fetch);
    await expect(timeout.create('{}', 'same-key')).rejects.toThrow(
      'provider_outcome_unknown',
    );
    const expired = new AdyenTestSessionAdapter(
      'fixture',
      (async () =>
        new Response(
          JSON.stringify({ ...response(), expiresAt: '2020-01-01T00:00:00Z' }),
        )) as typeof fetch,
    );
    await expect(expired.create('{}', 'same-key')).rejects.toThrow(
      'provider_outcome_unknown',
    );
  });
});
