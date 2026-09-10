import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  admitAdyenTestWebhook,
  AdyenWebhookAdmissionError,
  standardWebhookSigningPayload,
  verifyStandardWebhookHmac,
} from './adyen-webhook.js';

const OFFICIAL_KEY =
  '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';

interface TestNotification {
  additionalData: Record<string, unknown>;
  amount: { value: number; currency: string };
  pspReference: string;
  originalReference: string;
  merchantAccountCode: string;
  merchantReference: string;
  eventCode: string;
  eventDate: string;
  paymentMethod?: string;
  reason?: string;
  success: string;
}

function item(overrides: Partial<TestNotification> = {}): TestNotification {
  return {
    additionalData: {
      store: 'tandem_test_ecom_v1',
      shopperEmail: 'must-not-persist@example.com',
    },
    amount: { value: 39900, currency: 'USD' },
    pspReference: '7914073381342284',
    originalReference: '',
    merchantAccountCode: 'TestMerchant',
    merchantReference: 'tandem-poc-tsv1-attempt-1',
    eventCode: 'AUTHORISATION',
    eventDate: '2026-09-09T20:00:00Z',
    paymentMethod: 'visa',
    reason: 'Approved',
    success: 'true',
    ...overrides,
  } as TestNotification;
}

function sign(notification: ReturnType<typeof item>, key = OFFICIAL_KEY) {
  notification.additionalData = { ...notification.additionalData };
  notification.additionalData.hmacSignature = crypto
    .createHmac('sha256', Buffer.from(key, 'hex'))
    .update(standardWebhookSigningPayload(notification as never), 'utf8')
    .digest('base64');
  return notification;
}

function envelope(
  notification = sign(item()),
  ...additionalNotifications: TestNotification[]
) {
  return {
    live: 'false',
    notificationItems: [notification, ...additionalNotifications].map(
      (value) => ({ NotificationRequestItem: value }),
    ),
  };
}

const config = {
  hmacKeys: [OFFICIAL_KEY],
  merchantAccount: 'TestMerchant',
  storeReference: 'tandem_test_ecom_v1',
  referencePrefix: 'tandem-poc-tsv1-',
  allowedEventCodes: ['AUTHORISATION'],
};
const sharedFeedConfig = {
  ...config,
  discardVerifiedForeignReferences: true,
};

async function loadAdyenConfig(sharedFeedFilter?: string) {
  vi.resetModules();
  vi.doMock('./env.js', () => ({
    readEnvFile: (keys: string[]) =>
      keys.includes('TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED') &&
      sharedFeedFilter !== undefined
        ? {
            TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED: sharedFeedFilter,
          }
        : {},
  }));
  return (await import('./config.js')).ADYEN_TEST_WEBHOOK_CONFIG;
}

afterEach(() => {
  vi.doUnmock('./env.js');
  vi.resetModules();
});

describe('Adyen shared TEST feed configuration', () => {
  it('defaults foreign-reference filtering off', async () => {
    expect((await loadAdyenConfig()).discardVerifiedForeignReferences).toBe(
      false,
    );
  });

  it.each(['true', '1'])(
    'explicitly enables filtering with %s',
    async (value) => {
      expect(
        (await loadAdyenConfig(value)).discardVerifiedForeignReferences,
      ).toBe(true);
    },
  );

  it('rejects an invalid opt-in value', async () => {
    await expect(loadAdyenConfig('yes')).rejects.toThrow(
      'TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED must be true, false, 1, or 0',
    );
  });
});

describe('Adyen Standard webhook HMAC', () => {
  it('matches the official Adyen signing example', () => {
    const notification = {
      additionalData: {
        hmacSignature: 'coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0=',
      },
      amount: { value: 1130, currency: 'EUR' },
      pspReference: '7914073381342284',
      originalReference: '',
      merchantAccountCode: 'TestMerchant',
      merchantReference: 'TestPayment-1407325143704',
      eventCode: 'AUTHORISATION',
      eventDate: '2019-05-06T17:15:34.121+02:00',
      success: 'true',
    };
    expect(verifyStandardWebhookHmac(notification, [OFFICIAL_KEY])).toBe(true);
  });

  it('accepts only the TEST merchant, store and reference and minimizes storage', () => {
    const admitted = admitAdyenTestWebhook(envelope(), config);
    expect(admitted).toHaveLength(1);
    expect(admitted[0]).toMatchObject({
      eventId: '7914073381342284:AUTHORISATION:true',
      eventType: 'AUTHORISATION',
      relatedEntity: {
        provider: 'adyen',
        environment: 'test',
        reported_store: 'tandem_test_ecom_v1',
      },
    });
    const stored = JSON.stringify(admitted[0].rawBody);
    expect(stored).not.toContain('hmacSignature');
    expect(stored).not.toContain('must-not-persist@example.com');
  });

  it('discards a fully verified foreign-only TEST notification when explicitly enabled', () => {
    const foreign = item({ merchantReference: 'another-platform-attempt-1' });
    foreign.additionalData = {};
    delete (foreign as unknown as Record<string, unknown>).eventDate;
    foreign.paymentMethod = 'x'.repeat(500);
    foreign.reason = 'x'.repeat(2_000);

    expect(
      admitAdyenTestWebhook(envelope(sign(foreign)), sharedFeedConfig),
    ).toEqual([]);
  });

  it('treats an empty signed merchant reference as foreign only when filtering is enabled', () => {
    const foreign = item();
    delete (foreign as unknown as Record<string, unknown>).merchantReference;

    expect(
      admitAdyenTestWebhook(envelope(sign(foreign)), sharedFeedConfig),
    ).toEqual([]);
    expect(() =>
      admitAdyenTestWebhook(envelope(sign(foreign)), config),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('admits only Tandem items from a fully verified mixed TEST batch', () => {
    const foreign = sign(
      item({
        pspReference: 'foreign-psp-reference',
        merchantReference: 'another-platform-attempt-1',
        eventCode: 'REFUND',
      }),
    );
    const tandem = sign(item({ pspReference: 'tandem-psp-reference' }));

    const admitted = admitAdyenTestWebhook(
      envelope(foreign, tandem),
      sharedFeedConfig,
    );
    expect(admitted).toHaveLength(1);
    expect(admitted[0].eventId).toBe('tandem-psp-reference:AUTHORISATION:true');
  });

  it.each([
    [
      'invalid HMAC anywhere in the batch',
      () => {
        const invalid = sign(item({ pspReference: 'invalid-owned' }));
        invalid.additionalData.hmacSignature =
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        return envelope(
          sign(item({ merchantReference: 'another-platform-attempt-1' })),
          invalid,
        );
      },
      401,
    ],
    [
      'an invalid HMAC after a wrong-merchant item',
      () => {
        const invalid = sign(item({ pspReference: 'invalid-owned' }));
        invalid.additionalData.hmacSignature =
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        return envelope(
          sign(
            item({
              merchantAccountCode: 'OtherMerchant',
              merchantReference: 'another-platform-attempt-1',
            }),
          ),
          invalid,
        );
      },
      401,
    ],
    [
      'a signed foreign reference from another merchant',
      () =>
        envelope(
          sign(
            item({
              merchantAccountCode: 'OtherMerchant',
              merchantReference: 'another-platform-attempt-1',
            }),
          ),
        ),
      403,
    ],
    [
      'a Tandem reference with a conflicting store',
      () => {
        const owned = item();
        owned.additionalData.store = 'other_store';
        return envelope(sign(owned));
      },
      403,
    ],
    [
      'a Tandem reference with a disallowed event',
      () => envelope(sign(item({ eventCode: 'REFUND' }))),
      403,
    ],
  ])(
    'still rejects %s when shared-feed filtering is enabled',
    (_name, payload, status) => {
      expect(() =>
        admitAdyenTestWebhook(payload(), sharedFeedConfig),
      ).toThrowError(expect.objectContaining({ status }));
    },
  );

  it.each([
    ['live environment', { live: true }, 403],
    ['invalid HMAC', { signature: 'invalid' }, 401],
    ['wrong merchant', { merchantAccountCode: 'OtherMerchant' }, 403],
    ['wrong store', { store: 'other_store' }, 403],
    ['wrong reference', { merchantReference: 'unowned-1' }, 403],
    ['wrong event code', { eventCode: 'REFUND' }, 403],
    ['invalid event date', { eventDate: 'not-a-date' }, 400],
  ])('rejects %s before admission', (_name, mutation, status) => {
    let payload: Record<string, any> = envelope();
    if ('live' in mutation)
      payload = { ...payload, live: mutation.live as boolean };
    if ('signature' in mutation) {
      payload.notificationItems[0].NotificationRequestItem.additionalData.hmacSignature =
        String(mutation.signature);
    }
    if ('merchantAccountCode' in mutation) {
      payload = envelope(
        sign(item({ merchantAccountCode: mutation.merchantAccountCode })),
      );
    }
    if ('store' in mutation) {
      const notification = item();
      notification.additionalData.store = mutation.store as string;
      payload = envelope(sign(notification));
    }
    if ('merchantReference' in mutation) {
      payload = envelope(
        sign(item({ merchantReference: mutation.merchantReference })),
      );
    }
    if ('eventCode' in mutation) {
      payload = envelope(sign(item({ eventCode: mutation.eventCode })));
    }
    if ('eventDate' in mutation) {
      payload = envelope(sign(item({ eventDate: mutation.eventDate })));
    }
    try {
      admitAdyenTestWebhook(payload, config);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AdyenWebhookAdmissionError);
      expect((error as AdyenWebhookAdmissionError).status).toBe(status);
    }
  });
});
