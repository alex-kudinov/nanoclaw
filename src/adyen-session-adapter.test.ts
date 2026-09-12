import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AdyenTestSessionAdapter,
  buildAdyenSessionRequest,
  buildAdyenSessionOptimization,
  buildAdyenTestSessionRequest,
  resolveAdyenTestPaymentMethodCapabilities,
} from './adyen-session-adapter.js';
import { resolveAdyenEnvironment } from './adyen-environment.js';
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
function attempt(
  changes: {
    country?: string;
    currency?: string;
    locale?: string;
    paymentMethodCapabilities?: unknown;
  } = {},
) {
  const now = Date.now();
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    ...(changes.paymentMethodCapabilities === undefined
      ? {}
      : { paymentMethodCapabilities: changes.paymentMethodCapabilities }),
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture',
      bundleVersion: 'fixture',
      deliveryVersion: 'fixture',
      locale: changes.locale ?? 'en',
      country: changes.country ?? 'US',
      payerReference: null,
      participantReference: null,
      currency: changes.currency ?? 'USD',
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
  it('projects the exact MCS quote into bounded metadata, L3 data, line items, and frictionless-preferred 3DS', () => {
    const a = attempt({ locale: 'en-US' });
    const policy = {
      profile: 'mcs-foundations-us-l3-v1',
      productCode: 'MCSFOUND',
      description: 'Mentor Coaching Foundations',
      unitOfMeasure: 'EA',
    } as const;
    const optimization = buildAdyenSessionOptimization(a, policy);
    expect(optimization).toEqual({
      metadata: {
        checkout_attempt: a.attemptId,
        quote_id: a.quote.quoteId,
        offer_key: 'mcq-program-a-foundations',
        schema: 'mcs-foundations-us-l3-v1',
      },
      lineItems: [
        {
          id: 'mcq-program-a-foundations',
          description: 'Mentor Coaching Foundations',
          quantity: 1,
          amountExcludingTax: 29900,
          taxAmount: 0,
          taxPercentage: 0,
          amountIncludingTax: 29900,
          sku: 'MCSFOUND',
        },
      ],
      additionalData: expect.objectContaining({
        'enhancedSchemeData.totalTaxAmount': '0',
        'enhancedSchemeData.itemDetailLine1.unitPrice': '29900',
        'enhancedSchemeData.itemDetailLine1.discountAmount': '0',
        'enhancedSchemeData.itemDetailLine1.totalAmount': '29900',
      }),
      authenticationData: { attemptAuthentication: 'always' },
      threeDS2RequestData: { threeDSRequestorChallengeInd: '02' },
    });
    const request = JSON.parse(
      buildAdyenSessionRequest(
        a,
        routing,
        resolveAdyenEnvironment({
          environment: 'test',
          liveEndpointPrefix: null,
        }),
        ['card'],
        1,
        policy,
      ),
    );
    expect(request).toMatchObject(optimization);
    expect(JSON.stringify(request)).not.toMatch(
      /email|firstName|lastName|gclid|utm_/i,
    );
  });

  it('fails closed when the provider optimization policy is used outside the exact US MCS quote', () => {
    expect(() =>
      buildAdyenSessionOptimization(attempt(), {
        profile: 'mcs-foundations-us-l3-v1',
        productCode: 'MCSFOUND',
        description: 'Mentor Coaching Foundations',
        unitOfMeasure: 'EA',
      }),
    ).toThrow('invalid_provider_optimization_policy');
  });

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
      captureDelayHours: 0,
      expiresAt: new Date(a.quote.expiresAt).toISOString(),
    });
    expect(request).not.toContain('apiKey');
    expect(JSON.parse(request).returnUrl).toBe(
      `http://localhost:3000/?attempt=${a.attemptId}`,
    );
  });
  it('maps only the immutable public card and ACH capabilities to provider codes', () => {
    const a = attempt({
      paymentMethodCapabilities: ['card', 'ach_direct_debit'],
    });
    expect(
      JSON.parse(
        buildAdyenTestSessionRequest(a, routing, ['card', 'ach_direct_debit']),
      ).allowedPaymentMethods,
    ).toEqual(['scheme', 'ach']);
    expect(
      resolveAdyenTestPaymentMethodCapabilities(a, [
        'card',
        'ach_direct_debit',
      ]),
    ).toEqual(['card', 'ach_direct_debit']);
  });
  it.each([
    { country: 'CA', currency: 'USD' },
    { country: 'US', currency: 'CAD' },
  ])(
    'rejects ACH outside its supported country/currency scope %o',
    (change) => {
      expect(() =>
        buildAdyenTestSessionRequest(
          attempt({
            ...change,
            paymentMethodCapabilities: ['ach_direct_debit'],
          }),
          routing,
          ['card', 'ach_direct_debit'],
        ),
      ).toThrow('payment_method_scope_mismatch');
    },
  );
  it('accepts ACH for the supported PR/USD scope', () => {
    expect(
      JSON.parse(
        buildAdyenTestSessionRequest(
          attempt({
            country: 'PR',
            paymentMethodCapabilities: ['ach_direct_debit'],
          }),
          routing,
          ['card', 'ach_direct_debit'],
        ),
      ).allowedPaymentMethods,
    ).toEqual(['ach']);
  });
  it('rejects a durable capability that is disabled in runtime configuration', () => {
    expect(() =>
      buildAdyenTestSessionRequest(
        attempt({ paymentMethodCapabilities: ['ach_direct_debit'] }),
        routing,
        ['card'],
      ),
    ).toThrow('payment_method_not_enabled');
  });
  it('preserves es-419 quote identity while requiring an explicit provider locale mapping', () => {
    const a = attempt({ locale: 'es-419' });
    expect(a.quote.locale).toBe('es-419');
    expect(() => buildAdyenTestSessionRequest(a, routing)).toThrow(
      'provider_locale_mapping_required',
    );
    const request = JSON.parse(
      buildAdyenTestSessionRequest(a, {
        ...routing,
        providerLocaleByQuoteLocale: { 'es-419': 'es-MX' },
      }),
    );
    expect(request.shopperLocale).toBe('es-MX');
    expect(a.quote.locale).toBe('es-419');
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
