/** Resolve one host-validated Stripe envelope to its canonical payment intent. */

import https from 'https';

import type {
  ContadorProviderAlias,
  ContadorStripeAccount,
} from './contador-payment-fulfillment-store.js';
import { readEnvFile } from './env.js';

const HTTP_TIMEOUT_MS = 20_000;

export interface ResolvedStripePaymentSource {
  stripeAccount: ContadorStripeAccount;
  paymentIntentId: string;
  sourceObjectId: string;
  sourceEventId: string;
  eventType: string;
  observedAt: string;
  aliases: ContadorProviderAlias[];
}

export interface StripePaymentSourceDeps {
  getCheckoutSession?: (
    account: ContadorStripeAccount,
    checkoutSessionId: string,
  ) => Promise<{ payment_intent?: string | { id?: string } | null }>;
  now?: () => Date;
}

function stripeKey(account: ContadorStripeAccount): string {
  const env = readEnvFile(['STRIPE_RESTRICTED_KEY', 'STRIPE_SECRET_KEY_ALT']);
  const key =
    account === 'heartbeat'
      ? env.STRIPE_RESTRICTED_KEY
      : env.STRIPE_SECRET_KEY_ALT;
  if (!key) {
    throw new Error(`Stripe source resolver: ${account} key is not configured`);
  }
  return key;
}

function defaultGetCheckoutSession(
  account: ContadorStripeAccount,
  checkoutSessionId: string,
): Promise<{ payment_intent?: string | { id?: string } | null }> {
  const key = stripeKey(account);
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${key}:`).toString('base64');
    const req = https.get(
      {
        hostname: 'api.stripe.com',
        path: `/v1/checkout/sessions/${encodeURIComponent(checkoutSessionId)}`,
        headers: { Authorization: `Basic ${auth}` },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `Stripe source resolver: checkout lookup failed (${res.statusCode ?? 'unknown'})`,
              ),
            );
            return;
          }
          try {
            resolve(
              JSON.parse(data) as { payment_intent?: string | { id?: string } },
            );
          } catch {
            reject(
              new Error('Stripe source resolver: invalid checkout response'),
            );
          }
        });
      },
    );
    req.on('error', () =>
      reject(new Error('Stripe source resolver: checkout request failed')),
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () =>
      req.destroy(
        new Error('Stripe source resolver: checkout request timed out'),
      ),
    );
  });
}

function derivedSourceEventId(
  eventType: string,
  sourceObjectId: string,
  refundId: string | null,
): string {
  return `stripe:${eventType.replaceAll('.', '_')}:${sourceObjectId}:${refundId ?? 'none'}`;
}

export async function resolveStripePaymentSource(
  input: {
    stripeId: string;
    stripeAccount: ContadorStripeAccount;
    eventType: string;
    providerEventId: string | null;
    refundId: string | null;
  },
  deps: StripePaymentSourceDeps = {},
): Promise<ResolvedStripePaymentSource> {
  if (!['heartbeat', 'tandem'].includes(input.stripeAccount)) {
    throw new Error('Stripe source resolver: account is required');
  }
  if (!input.eventType) {
    throw new Error('Stripe source resolver: event type is required');
  }
  let paymentIntentId: string;
  if (/^pi_[A-Za-z0-9_]+$/.test(input.stripeId)) {
    paymentIntentId = input.stripeId;
  } else if (/^cs_[A-Za-z0-9_]+$/.test(input.stripeId)) {
    const session = await (
      deps.getCheckoutSession ?? defaultGetCheckoutSession
    )(input.stripeAccount, input.stripeId);
    const raw = session.payment_intent;
    paymentIntentId =
      typeof raw === 'string' ? raw : typeof raw?.id === 'string' ? raw.id : '';
    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      throw new Error(
        'Stripe source resolver: checkout session has no canonical payment intent',
      );
    }
  } else {
    throw new Error('Stripe source resolver: unsupported source object');
  }

  const aliases: ContadorProviderAlias[] = [
    { kind: 'payment_intent', id: paymentIntentId },
  ];
  if (input.stripeId.startsWith('cs_')) {
    aliases.push({ kind: 'checkout_session', id: input.stripeId });
  }
  if (input.providerEventId) {
    aliases.push({ kind: 'event', id: input.providerEventId });
  }
  if (input.refundId) aliases.push({ kind: 'refund', id: input.refundId });

  return {
    stripeAccount: input.stripeAccount,
    paymentIntentId,
    sourceObjectId: input.stripeId,
    sourceEventId:
      input.providerEventId ??
      derivedSourceEventId(input.eventType, input.stripeId, input.refundId),
    eventType: input.eventType,
    observedAt: (deps.now ?? (() => new Date()))().toISOString(),
    aliases,
  };
}
