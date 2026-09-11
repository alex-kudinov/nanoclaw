import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  ADYEN_LIVE_REFERENCE_PREFIX,
  assertCanonicalAdyenEnvironmentProfile,
  resolveAdyenEnvironment,
} from './adyen-environment.js';
import {
  AdyenSessionAdapter,
  buildAdyenSessionRequest,
} from './adyen-session-adapter.js';
import { AdyenSessionResultAdapter } from './adyen-session-result-adapter.js';
import {
  adyenAttemptReference,
  ADYEN_TEST_REFERENCE_PREFIX,
} from './adyen-payment-identifiers.js';
import { createPaymentAttempt, type PaymentScope } from './payment-domain.js';

const liveProfile = () =>
  resolveAdyenEnvironment({
    environment: 'live',
    liveEndpointPrefix: 'abc123-tandem',
  });

function attempt(environment: 'test' | 'live') {
  const now = Date.now() - 1000;
  const scope: PaymentScope = {
    provider: 'adyen',
    environment,
    company: 'tandem',
    merchant: `${environment}-merchant`,
    store: `${environment}-store`,
    endpointRegion: 'eu',
  };
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope,
    paymentMethodCapabilities: ['card'],
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: `wordpress:${environment}`,
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture',
      bundleVersion: 'fixture',
      deliveryVersion: 'fixture',
      locale: 'en-US',
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
      expiresAt: now + 300000,
    },
  });
}

describe('environment-explicit Adyen provider profile', () => {
  it('pins exact TEST and prefix-constructed LIVE v72 endpoints', () => {
    const test = resolveAdyenEnvironment({
      environment: 'test',
      liveEndpointPrefix: null,
    });
    expect(test).toEqual({
      environment: 'test',
      sessionsUrl: 'https://checkout-test.adyen.com/v72/sessions',
      sessionsOrigin: 'https://checkout-test.adyen.com',
      sessionsPath: '/v72/sessions/',
      referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
    });
    expect(liveProfile()).toEqual({
      environment: 'live',
      sessionsUrl:
        'https://abc123-tandem-checkout-live.adyenpayments.com/checkout/v72/sessions',
      sessionsOrigin: 'https://abc123-tandem-checkout-live.adyenpayments.com',
      sessionsPath: '/checkout/v72/sessions/',
      referencePrefix: ADYEN_LIVE_REFERENCE_PREFIX,
    });
    expect(
      resolveAdyenEnvironment({
        environment: 'live',
        liveEndpointPrefix: 'AbC123-TANDEM',
      }),
    ).toEqual(liveProfile());
  });

  it.each([
    'https://evil.example',
    'evil.example/path',
    '-leading',
    'trailing-',
    `${'a'.repeat(50)}`,
  ])('rejects non-prefix LIVE endpoint input %s', (liveEndpointPrefix) => {
    expect(() =>
      resolveAdyenEnvironment({ environment: 'live', liveEndpointPrefix }),
    ).toThrow('invalid_adyen_endpoint_configuration');
  });

  it('fails closed on poisoned environment discriminators and profile labels', () => {
    expect(() =>
      resolveAdyenEnvironment({
        environment: 'preview',
        liveEndpointPrefix: 'abc123-tandem',
      } as never),
    ).toThrow('invalid_adyen_endpoint_configuration');
    expect(() =>
      assertCanonicalAdyenEnvironmentProfile({
        ...liveProfile(),
        environment: 'test',
      }),
    ).toThrow('invalid_adyen_endpoint_configuration');
  });

  it('uses disjoint correlation namespaces and rejects cross-environment attempts', () => {
    const live = liveProfile();
    const test = resolveAdyenEnvironment({
      environment: 'test',
      liveEndpointPrefix: null,
    });
    const liveAttempt = attempt('live');
    expect(adyenAttemptReference(liveAttempt.attemptId, live)).toBe(
      `${ADYEN_LIVE_REFERENCE_PREFIX}${liveAttempt.attemptId}`,
    );
    expect(ADYEN_LIVE_REFERENCE_PREFIX).not.toBe(ADYEN_TEST_REFERENCE_PREFIX);
    expect(() =>
      buildAdyenSessionRequest(
        liveAttempt,
        {
          scope: liveAttempt.scope,
          allowedOrigin: 'https://tandemcoach.co',
          returnPath: '/checkout/return',
        },
        test,
      ),
    ).toThrow('adyen_scope_mismatch');
  });

  it('dispatches only to the resolved LIVE hostname and rejects TEST credentials', async () => {
    const profile = liveProfile();
    const transportMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'session',
            sessionData: 'opaque',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          }),
          { status: 201 },
        ),
    );
    const transport = transportMock as unknown as typeof fetch;
    const adapter = new AdyenSessionAdapter(
      { environment: 'live', apiKey: 'fixture-live-key' },
      profile,
      transport,
    );
    await adapter.create('{}', randomUUID());
    expect(transport).toHaveBeenCalledWith(
      profile.sessionsUrl,
      expect.anything(),
    );
    expect(
      () =>
        new AdyenSessionAdapter(
          { environment: 'test', apiKey: 'fixture-test-key' },
          profile,
          transport,
        ),
    ).toThrow('adyen_key_unavailable');
    expect(
      () =>
        new AdyenSessionAdapter(
          { environment: 'live', apiKey: 'fixture-live-key' },
          {
            ...profile,
            sessionsUrl: 'https://evil.example/checkout/v72/sessions',
          },
          transport,
        ),
    ).toThrow('invalid_adyen_endpoint_configuration');
  });

  it('reads a LIVE Session result only from the matching v72 endpoint and namespace', async () => {
    const profile = liveProfile();
    const liveAttempt = attempt('live');
    const sessionId = 'live-session';
    const transportMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: sessionId,
            status: 'completed',
            reference: adyenAttemptReference(liveAttempt.attemptId, profile),
            payments: [
              {
                pspReference: 'livepsp123',
                resultCode: 'Authorised',
                amount: { value: 29900, currency: 'USD' },
                paymentMethod: { type: 'scheme' },
              },
            ],
          }),
        ),
    );
    const transport = transportMock as unknown as typeof fetch;
    const adapter = new AdyenSessionResultAdapter(
      { environment: 'live', apiKey: 'fixture-live-key' },
      liveAttempt.scope,
      profile,
      transport,
    );
    await expect(
      adapter.verify({
        attempt: liveAttempt,
        sessionId,
        sessionResult: 'opaque-result',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        attemptId: liveAttempt.attemptId,
        paymentReference: 'livepsp123',
        paymentMethod: 'card',
      }),
    );
    const requested = transportMock.mock.calls[0][0] as URL;
    expect(requested.origin).toBe(profile.sessionsOrigin);
    expect(requested.pathname).toBe(`/checkout/v72/sessions/${sessionId}`);
    expect(requested.searchParams.get('sessionResult')).toBe('opaque-result');
  });
});
