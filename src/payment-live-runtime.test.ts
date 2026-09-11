import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  ADYEN_CARD_EVENT_CODES,
  ADYEN_LIVE_REFERENCE_PREFIX,
} from './adyen-environment.js';
import { type PaymentScope } from './payment-domain.js';
import { adyenAttemptReference } from './adyen-payment-identifiers.js';
import { standardWebhookSigningPayload } from './adyen-webhook.js';
import {
  createPaymentLiveRuntime,
  DEFAULT_LIVE_MCS_CARD_ACTIVATION,
  LIVE_MCS_CARD_CALLER,
  LIVE_MCS_CARD_QUOTE_AUTHORITY,
  type PaymentLiveRuntimeConfig,
} from './payment-live-runtime.js';
import type { PaymentTransaction } from './payment-store.js';

const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'live',
  company: 'tandem',
  merchant: 'live-merchant',
  store: 'live-store',
  endpointRegion: 'eu',
};

function config(): PaymentLiveRuntimeConfig {
  return {
    mode: 'live',
    activation: {
      enabled: true,
      recoverExisting: true,
      newAttemptsEnabled: false,
    },
    caller: LIVE_MCS_CARD_CALLER,
    scope,
    liveEndpointPrefix: 'abc123-tandem',
    quoteAuthority: LIVE_MCS_CARD_QUOTE_AUTHORITY,
    recoveryMode: 'dispatch',
    credentials: {
      environment: 'live',
      requestKeys: new Map([
        [
          'live-request-v1',
          { caller: LIVE_MCS_CARD_CALLER, secret: randomBytes(32) },
        ],
      ]),
      signedResponses: {
        keyId: 'live-response-v1',
        key: { caller: LIVE_MCS_CARD_CALLER, secret: randomBytes(32) },
      },
      payloadKeyId: 'live-payload-v1',
      payloadKeys: new Map([['live-payload-v1', randomBytes(32)]]),
      returnBindingKey: randomBytes(32),
      adyenApiKey: 'fixture-live-api-key',
    },
    sessionRouting: {
      allowedOrigin: 'https://tandemcoach.co',
      returnPath: '/checkout/return',
    },
    webhook: {
      environment: 'live',
      hmacKeys: [randomBytes(32).toString('hex')],
      merchantAccount: scope.merchant,
      storeReference: scope.store!,
      referencePrefix: ADYEN_LIVE_REFERENCE_PREFIX,
      allowedEventCodes: [...ADYEN_CARD_EVENT_CODES],
      retainVerifiedOwnedUnsupported: true,
    },
    limits: {
      requestsPerWindow: 100,
      maxActive: 8,
      windowMs: 60000,
      maxBodyBytes: 100000,
      bodyReadTimeoutMs: 5000,
    },
  };
}

const transaction = vi.fn(async () => {
  throw new Error('fixture transaction must not open during composition');
}) as unknown as PaymentTransaction;

describe('disabled-by-default English MCS LIVE card composition', () => {
  it('exports all gates off and opens no provider or database on disabled composition', () => {
    expect(DEFAULT_LIVE_MCS_CARD_ACTIVATION).toEqual({
      enabled: false,
      recoverExisting: false,
      newAttemptsEnabled: false,
    });
    const providerTransport = vi.fn();
    expect(() =>
      createPaymentLiveRuntime(
        {
          ...config(),
          activation: DEFAULT_LIVE_MCS_CARD_ACTIVATION,
        },
        { transaction, providerTransport: providerTransport as typeof fetch },
      ),
    ).toThrow('payment_live_runtime_disabled');
    expect(transaction).not.toHaveBeenCalled();
    expect(providerTransport).not.toHaveBeenCalled();
  });

  it('requires enabled recovery before new attempts and supports recovery-only rollback', () => {
    const invalid = config();
    invalid.activation = {
      enabled: true,
      recoverExisting: false,
      newAttemptsEnabled: true,
    };
    expect(() => createPaymentLiveRuntime(invalid, { transaction })).toThrow(
      'invalid_payment_live_configuration',
    );

    const recoveryOnly = createPaymentLiveRuntime(config(), { transaction });
    expect(recoveryOnly.environment).toBe('live');
    expect(transaction).not.toHaveBeenCalled();
    const enabled = config();
    enabled.activation.newAttemptsEnabled = true;
    expect(createPaymentLiveRuntime(enabled, { transaction }).environment).toBe(
      'live',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'TEST credential bundle',
      (value: PaymentLiveRuntimeConfig) => {
        (value.credentials as { environment: string }).environment = 'test';
      },
    ],
    [
      'TEST caller key',
      (value: PaymentLiveRuntimeConfig) => {
        value.credentials.requestKeys = new Map([
          [
            'wrong',
            { caller: 'tandem-wordpress-test', secret: randomBytes(32) },
          ],
        ]);
      },
    ],
    [
      'TEST webhook',
      (value: PaymentLiveRuntimeConfig) => {
        value.webhook.environment = 'test';
      },
    ],
    [
      'TEST reference namespace',
      (value: PaymentLiveRuntimeConfig) => {
        value.webhook.referencePrefix = 'tandem-poc-tsv1-';
      },
    ],
    [
      'partial lifecycle',
      (value: PaymentLiveRuntimeConfig) => {
        value.webhook.allowedEventCodes = ['AUTHORISATION'];
      },
    ],
    [
      'foreign discard',
      (value: PaymentLiveRuntimeConfig) => {
        value.webhook.discardVerifiedForeignReferences = true;
      },
    ],
    [
      'localhost LIVE origin',
      (value: PaymentLiveRuntimeConfig) => {
        value.sessionRouting.allowedOrigin = 'http://localhost:3000';
      },
    ],
  ] as const)(
    'rejects cross-environment or incomplete %s configuration',
    (_name, mutate) => {
      const value = config();
      mutate(value);
      expect(() => createPaymentLiveRuntime(value, { transaction })).toThrow(
        'invalid_payment_live_configuration',
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects wrong-environment webhook payloads before acknowledging or opening storage', async () => {
    const runtime = createPaymentLiveRuntime(config(), { transaction });
    await expect(
      runtime.recordWebhook({ live: false, notificationItems: [] }),
    ).rejects.toThrow('Adyen webhook environment is not admitted here');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a LIVE envelope signed with an independent TEST HMAC key before storage', async () => {
    const value = config();
    const runtime = createPaymentLiveRuntime(value, { transaction });
    const item = {
      pspReference: 'livepsp123',
      originalReference: '',
      merchantAccountCode: scope.merchant,
      merchantReference: adyenAttemptReference(randomUUID(), {
        referencePrefix: ADYEN_LIVE_REFERENCE_PREFIX,
      }),
      eventCode: 'AUTHORISATION',
      eventDate: new Date().toISOString(),
      success: 'true',
      amount: { value: 29900, currency: 'USD' },
      paymentMethod: 'visa',
      additionalData: { store: scope.store },
    };
    const testHmacKey = randomBytes(32).toString('hex');
    const hmacSignature = createHmac('sha256', Buffer.from(testHmacKey, 'hex'))
      .update(standardWebhookSigningPayload(item))
      .digest('base64');
    await expect(
      runtime.recordWebhook({
        live: true,
        notificationItems: [
          {
            NotificationRequestItem: {
              ...item,
              additionalData: { ...item.additionalData, hmacSignature },
            },
          },
        ],
      }),
    ).rejects.toThrow('Invalid HMAC signature');
    expect(transaction).not.toHaveBeenCalled();
  });
});
