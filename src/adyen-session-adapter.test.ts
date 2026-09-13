import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AdyenSessionAdapter,
  AdyenTestSessionAdapter,
  buildAdyenSessionRequest,
  buildAdyenSessionOptimization,
  buildAdyenTestSessionRequest,
  resolveAdyenTestPaymentMethodCapabilities,
} from './adyen-session-adapter.js';
import { resolveAdyenEnvironment } from './adyen-environment.js';
import { createPaymentAttempt } from './payment-domain.js';
import { liveMcsProviderOptimization } from './payment-live-runtime.js';

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
    originalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    discountPolicyReference?: string | null;
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
      originalAmount: changes.originalAmount ?? 29900,
      discountAmount: changes.discountAmount ?? 0,
      finalAmount: changes.finalAmount ?? 29900,
      discountPolicyReference: changes.discountPolicyReference ?? null,
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
  it('projects the exact MCS quote into bounded metadata, L3 data, and invoice line items', () => {
    const a = attempt({ locale: 'en-US' });
    const policy = {
      profile: 'mcs-foundations-us-l3-v1',
      checkoutApiVersion: 69,
      productCode: 'MCSFOUND',
      description: 'MCS Foundations',
      unitOfMeasure: 'EA',
      commodityCode: '86132000',
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
          description: 'MCS Foundations',
          quantity: 1,
          amountExcludingTax: 29900,
          taxAmount: 0,
          taxPercentage: 0,
          amountIncludingTax: 29900,
        },
      ],
      additionalData: {
        'enhancedSchemeData.customerReference':
          expect.stringMatching(/^mcs-[a-f0-9]{20}$/),
        'enhancedSchemeData.totalTaxAmount': '0',
        'enhancedSchemeData.itemDetailLine1.productCode': 'MCSFOUND',
        'enhancedSchemeData.itemDetailLine1.description': 'MCS Foundations',
        'enhancedSchemeData.itemDetailLine1.quantity': '1',
        'enhancedSchemeData.itemDetailLine1.unitOfMeasure': 'EA',
        'enhancedSchemeData.itemDetailLine1.commodityCode': '86132000',
        'enhancedSchemeData.itemDetailLine1.unitPrice': '29900',
        'enhancedSchemeData.itemDetailLine1.discountAmount': '0',
        'enhancedSchemeData.itemDetailLine1.totalAmount': '29900',
        'enhancedSchemeData.orderDate': expect.stringMatching(/^\d{6}$/),
      },
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
        checkoutApiVersion: 69,
        productCode: 'MCSFOUND',
        description: 'MCS Foundations',
        unitOfMeasure: 'EA',
        commodityCode: '86132000',
      }),
    ).toThrow('invalid_provider_optimization_policy');
  });

  it.each([
    { checkoutApiVersion: 72 },
    { commodityCode: '00000000' },
    { commodityCode: '8613200' },
    { commodityCode: '8613200A' },
    { description: 'Mentor Coaching Foundations' },
    { unitOfMeasure: 'EACH' },
    { productCode: 'MCS-FOUND-2026' },
  ])('rejects malformed required Level 3 policy data %o', (change) => {
    expect(() =>
      buildAdyenSessionOptimization(attempt({ locale: 'en-US' }), {
        ...liveMcsProviderOptimization(),
        ...change,
      } as never),
    ).toThrow('invalid_provider_optimization_policy');
  });

  it('reconciles a discount to the authoritative invoice line with zero tax', () => {
    const optimization = buildAdyenSessionOptimization(
      attempt({
        locale: 'en-US',
        originalAmount: 29900,
        discountAmount: 5000,
        finalAmount: 24900,
        discountPolicyReference: 'promotion:fixture-5000',
      }),
      liveMcsProviderOptimization(),
    );
    expect(optimization).toMatchObject({
      lineItems: [
        {
          quantity: 1,
          amountExcludingTax: 24900,
          taxAmount: 0,
          taxPercentage: 0,
          amountIncludingTax: 24900,
        },
      ],
      additionalData: {
        'enhancedSchemeData.totalTaxAmount': '0',
        'enhancedSchemeData.itemDetailLine1.unitPrice': '29900',
        'enhancedSchemeData.itemDetailLine1.discountAmount': '5000',
        'enhancedSchemeData.itemDetailLine1.totalAmount': '24900',
      },
    });
  });

  it('builds a repeatable card-only request from the authoritative quote', () => {
    const a = attempt({ locale: 'en-US' });
    const profile = resolveAdyenEnvironment({
      environment: 'test',
      liveEndpointPrefix: null,
    });
    const build = () =>
      buildAdyenSessionRequest(
        a,
        routing,
        profile,
        ['card'],
        1,
        liveMcsProviderOptimization(),
      );
    const request = build();
    expect(request).toBe(build());
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
    expect(JSON.parse(request)).toMatchObject({
      lineItems: [
        {
          id: 'mcq-program-a-foundations',
          amountExcludingTax: 29900,
          amountIncludingTax: 29900,
          taxAmount: 0,
          taxPercentage: 0,
        },
      ],
      additionalData: {
        'enhancedSchemeData.totalTaxAmount': '0',
        'enhancedSchemeData.itemDetailLine1.unitPrice': '29900',
        'enhancedSchemeData.itemDetailLine1.discountAmount': '0',
        'enhancedSchemeData.itemDetailLine1.totalAmount': '29900',
        'enhancedSchemeData.itemDetailLine1.commodityCode': '86132000',
      },
    });
    expect(JSON.parse(request)).not.toHaveProperty('authenticationData');
    expect(JSON.parse(request)).not.toHaveProperty('threeDS2RequestData');
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

  it('pins the Level 3 Session to Checkout v69 without changing ordinary v72 Sessions', async () => {
    const urls: string[] = [];
    const transport = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return Response.json(response(), { status: 201 });
    });
    await new AdyenTestSessionAdapter(
      'fixture',
      transport as typeof fetch,
    ).create('{}', 'ordinary-v72');
    await new AdyenTestSessionAdapter(
      'fixture',
      transport as typeof fetch,
      69,
    ).create('{}', 'mcs-l3-v69');
    expect(urls).toEqual([
      'https://checkout-test.adyen.com/v72/sessions',
      'https://checkout-test.adyen.com/v69/sessions',
    ]);
  });

  it('preserves the assigned LIVE endpoint prefix while pinning Level 3 to v69', async () => {
    const urls: string[] = [];
    const profile = resolveAdyenEnvironment({
      environment: 'live',
      liveEndpointPrefix: 'tandem-live',
    });
    const adapter = new AdyenSessionAdapter(
      { environment: 'live', apiKey: 'fixture' },
      profile,
      (async (url: string | URL | Request) => {
        urls.push(String(url));
        return Response.json(response(), { status: 201 });
      }) as typeof fetch,
      69,
    );
    await adapter.create('{}', 'live-mcs-l3-v69');
    expect(urls).toEqual([
      'https://tandem-live-checkout-live.adyenpayments.com/checkout/v69/sessions',
    ]);
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
