import crypto from 'crypto';

export interface AdyenTestWebhookConfig {
  hmacKeys: string[];
  merchantAccount: string;
  storeReference: string;
  referencePrefix: string;
  allowedEventCodes: string[];
}

interface AdyenAmount {
  value: number;
  currency: string;
}

interface AdyenNotificationItem {
  additionalData: Record<string, unknown>;
  amount: AdyenAmount;
  pspReference: string;
  originalReference: string;
  merchantAccountCode: string;
  merchantReference: string;
  eventCode: string;
  eventDate: string;
  success: string;
  paymentMethod?: string;
  reason?: string;
}

export interface AdyenAdmittedNotification {
  eventId: string;
  eventType: string;
  rawBody: Record<string, unknown>;
  relatedEntity: Record<string, unknown>;
}

export class AdyenWebhookAdmissionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 503,
  ) {
    super(message);
    this.name = 'AdyenWebhookAdmissionError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(
  source: Record<string, unknown>,
  key: string,
  maxLength = 256,
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new AdyenWebhookAdmissionError(`Invalid ${key}`, 400);
  }
  return value;
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  maxLength = 512,
): string | undefined {
  const value = source[key];
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new AdyenWebhookAdmissionError(`Invalid ${key}`, 400);
  }
  return value;
}

function normalizeSuccess(value: unknown): string {
  if (value === true || value === 'true') return 'true';
  if (value === false || value === 'false') return 'false';
  throw new AdyenWebhookAdmissionError('Invalid success', 400);
}

function parseAmount(value: unknown): AdyenAmount {
  const amount = record(value);
  if (!amount || !Number.isSafeInteger(amount.value) || Number(amount.value) < 0) {
    throw new AdyenWebhookAdmissionError('Invalid amount', 400);
  }
  const currency = requiredString(amount, 'currency', 3);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AdyenWebhookAdmissionError('Invalid currency', 400);
  }
  return { value: Number(amount.value), currency };
}

function parseItem(value: unknown): AdyenNotificationItem {
  const wrapper = record(value);
  const item = wrapper && record(wrapper.NotificationRequestItem);
  if (!item) {
    throw new AdyenWebhookAdmissionError('Invalid notification item', 400);
  }
  const additionalData = record(item.additionalData);
  if (!additionalData) {
    throw new AdyenWebhookAdmissionError('Missing additionalData', 400);
  }
  const eventCode = requiredString(item, 'eventCode', 80);
  if (!/^[A-Z0-9_]+$/.test(eventCode)) {
    throw new AdyenWebhookAdmissionError('Invalid eventCode', 400);
  }
  const eventDate = requiredString(item, 'eventDate', 80);
  if (Number.isNaN(Date.parse(eventDate))) {
    throw new AdyenWebhookAdmissionError('Invalid eventDate', 400);
  }
  return {
    additionalData,
    amount: parseAmount(item.amount),
    pspReference: requiredString(item, 'pspReference', 128),
    originalReference: optionalString(item, 'originalReference', 128) || '',
    merchantAccountCode: requiredString(item, 'merchantAccountCode', 128),
    merchantReference: requiredString(item, 'merchantReference', 128),
    eventCode,
    eventDate,
    success: normalizeSuccess(item.success),
    paymentMethod: optionalString(item, 'paymentMethod', 80),
    reason: optionalString(item, 'reason', 512),
  };
}

export function standardWebhookSigningPayload(item: AdyenNotificationItem): string {
  return [
    item.pspReference,
    item.originalReference,
    item.merchantAccountCode,
    item.merchantReference,
    String(item.amount.value),
    item.amount.currency,
    item.eventCode,
    item.success,
  ].join(':');
}

function validHexKey(value: string): boolean {
  return value.length >= 64 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function validBase64Signature(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 40 || value.length > 128) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch {
    return false;
  }
}

export function verifyStandardWebhookHmac(
  item: AdyenNotificationItem,
  hmacKeys: string[],
): boolean {
  const received = item.additionalData.hmacSignature;
  if (!validBase64Signature(received)) return false;
  const receivedBytes = Buffer.from(received, 'base64');
  return hmacKeys.some((key) => {
    if (!validHexKey(key)) return false;
    const expected = crypto
      .createHmac('sha256', Buffer.from(key, 'hex'))
      .update(standardWebhookSigningPayload(item), 'utf8')
      .digest();
    return (
      expected.length === receivedBytes.length &&
      crypto.timingSafeEqual(expected, receivedBytes)
    );
  });
}

export function isAdyenTestWebhookConfigured(
  config: AdyenTestWebhookConfig | undefined,
): boolean {
  return Boolean(
    config &&
      config.hmacKeys.some(validHexKey) &&
      config.merchantAccount &&
      config.storeReference &&
      config.referencePrefix &&
      config.allowedEventCodes.length > 0,
  );
}

export function admitAdyenTestWebhook(
  payload: unknown,
  config: AdyenTestWebhookConfig,
): AdyenAdmittedNotification[] {
  if (!isAdyenTestWebhookConfigured(config)) {
    throw new AdyenWebhookAdmissionError('Adyen TEST webhook is not configured', 503);
  }
  const envelope = record(payload);
  if (!envelope || (envelope.live !== false && envelope.live !== 'false')) {
    throw new AdyenWebhookAdmissionError('Live Adyen events are not admitted here', 403);
  }
  if (!Array.isArray(envelope.notificationItems) || envelope.notificationItems.length === 0) {
    throw new AdyenWebhookAdmissionError('Missing notificationItems', 400);
  }
  if (envelope.notificationItems.length > 20) {
    throw new AdyenWebhookAdmissionError('Too many notificationItems', 400);
  }

  const items = envelope.notificationItems.map(parseItem);
  for (const item of items) {
    if (!verifyStandardWebhookHmac(item, config.hmacKeys)) {
      throw new AdyenWebhookAdmissionError('Invalid HMAC signature', 401);
    }
    if (item.merchantAccountCode !== config.merchantAccount) {
      throw new AdyenWebhookAdmissionError('Merchant is not allowlisted', 403);
    }
    if (item.additionalData.store !== config.storeReference) {
      throw new AdyenWebhookAdmissionError('Store is not allowlisted', 403);
    }
    if (!item.merchantReference.startsWith(config.referencePrefix)) {
      throw new AdyenWebhookAdmissionError('Reference is not allowlisted', 403);
    }
    if (!config.allowedEventCodes.includes(item.eventCode)) {
      throw new AdyenWebhookAdmissionError('Event code is not allowlisted', 403);
    }
  }

  return items.map((item) => {
    const eventId = `${item.pspReference}:${item.eventCode}:${item.success}`;
    const minimized = {
      live: false,
      notification: {
        pspReference: item.pspReference,
        originalReference: item.originalReference || undefined,
        merchantAccountCode: item.merchantAccountCode,
        merchantReference: item.merchantReference,
        eventCode: item.eventCode,
        eventDate: item.eventDate,
        success: item.success,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        reason: item.reason,
        additionalData: { store: item.additionalData.store },
      },
    };
    return {
      eventId,
      eventType: item.eventCode,
      rawBody: minimized,
      relatedEntity: {
        provider: 'adyen',
        environment: 'test',
        psp_reference: item.pspReference,
        original_reference: item.originalReference || null,
        merchant_reference: item.merchantReference,
        event_code: item.eventCode,
        success: item.success === 'true',
        amount: item.amount,
        reported_store: item.additionalData.store,
      },
    };
  });
}
