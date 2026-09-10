import crypto from 'crypto';
import { describe, expect, it } from 'vitest';

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

function envelope(notification = sign(item())) {
  return {
    live: 'false',
    notificationItems: [{ NotificationRequestItem: notification }],
  };
}

const config = {
  hmacKeys: [OFFICIAL_KEY],
  merchantAccount: 'TestMerchant',
  storeReference: 'tandem_test_ecom_v1',
  referencePrefix: 'tandem-poc-tsv1-',
  allowedEventCodes: ['AUTHORISATION'],
};

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
