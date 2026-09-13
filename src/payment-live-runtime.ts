import {
  ADYEN_CARD_EVENT_CODES,
  ADYEN_LIVE_REFERENCE_PREFIX,
} from './adyen-environment.js';
import type { AdyenWebhookConfig } from './adyen-webhook.js';
import type { AdyenSessionRouting } from './adyen-session-adapter.js';
import { PaymentDomainError, type PaymentScope } from './payment-domain.js';
import type { PaymentRequestKey } from './payment-request-auth.js';
import {
  createPaymentRuntimeCore,
  type PaymentRuntimeCoreDependencies,
} from './payment-runtime-core.js';
import type { PaymentResponseKey } from './payment-signed-response-controller.js';

export const LIVE_MCS_CARD_CALLER = 'tandem-wordpress-live';
export const LIVE_MCS_CARD_OFFER_LOCALE = 'mcq-program-a-foundations:en-US';
export const LIVE_MCS_CARD_QUOTE_AUTHORITY = 'tandem-wordpress-commerce-v1';
/**
 * The exact server-owned Level 3 projection for the US MCS digital course.
 * Tax is always zero and the one known invoice line reconciles exactly to the
 * immutable quote. Authentication preferences are intentionally separate:
 * their earlier combination with ESD caused the failed LIVE canary.
 */
export function liveMcsProviderOptimization() {
  return Object.freeze({
    profile: 'mcs-foundations-us-l3-v1',
    checkoutApiVersion: 69,
    productCode: 'MCSFOUND',
    description: 'MCS Foundations',
    unitOfMeasure: 'EA',
    commodityCode: '86132000',
  } as const);
}

export const DEFAULT_LIVE_MCS_CARD_ACTIVATION = Object.freeze({
  enabled: false,
  recoverExisting: false,
  newAttemptsEnabled: false,
});

export interface PaymentLiveRuntimeConfig {
  mode: 'live';
  activation: {
    enabled: boolean;
    recoverExisting: boolean;
    newAttemptsEnabled: boolean;
  };
  caller: typeof LIVE_MCS_CARD_CALLER;
  scope: PaymentScope;
  /** Adyen-assigned live endpoint prefix only, never a URL or hostname. */
  liveEndpointPrefix: string;
  quoteAuthority: typeof LIVE_MCS_CARD_QUOTE_AUTHORITY;
  recoveryMode: 'dispatch' | 'reconcile_only';
  credentials: {
    environment: 'live';
    requestKeys: ReadonlyMap<string, PaymentRequestKey>;
    signedResponses: {
      keyId: string;
      key: PaymentResponseKey;
    };
    payloadKeyId: string;
    payloadKeys: ReadonlyMap<string, Buffer>;
    returnBindingKey: Buffer;
    adyenApiKey: string;
  };
  sessionRouting: Omit<AdyenSessionRouting, 'scope'>;
  webhook: AdyenWebhookConfig;
  limits: {
    requestsPerWindow: number;
    maxActive: number;
    windowMs: number;
    maxBodyBytes: number;
    bodyReadTimeoutMs: number;
  };
}

export type PaymentLiveRuntimeDependencies = PaymentRuntimeCoreDependencies;

function sameCardEventSet(values: readonly string[]): boolean {
  return (
    values.length === ADYEN_CARD_EVENT_CODES.length &&
    new Set(values).size === values.length &&
    ADYEN_CARD_EVENT_CODES.every((value) => values.includes(value))
  );
}

/**
 * Disabled-by-default LIVE composition for the one English Foundations/card
 * slice. It returns the stable signed internal HTTP adapter; it does not mount a
 * listener or read host configuration. Rollback disables only new attempts
 * while leaving status, return reconciliation and owned webhook intake active.
 */
export function createPaymentLiveRuntime(
  config: PaymentLiveRuntimeConfig,
  dependencies: PaymentLiveRuntimeDependencies,
) {
  if (!config.activation.enabled)
    throw new PaymentDomainError('payment_live_runtime_disabled');
  let liveOrigin = false;
  try {
    const origin = new URL(config.sessionRouting.allowedOrigin);
    liveOrigin =
      origin.protocol === 'https:' &&
      origin.origin === config.sessionRouting.allowedOrigin &&
      !origin.username &&
      !origin.password;
  } catch {
    liveOrigin = false;
  }
  if (
    config.mode !== 'live' ||
    !config.activation.recoverExisting ||
    (config.activation.newAttemptsEnabled &&
      (!config.activation.enabled || !config.activation.recoverExisting)) ||
    config.caller !== LIVE_MCS_CARD_CALLER ||
    config.quoteAuthority !== LIVE_MCS_CARD_QUOTE_AUTHORITY ||
    !liveOrigin ||
    config.scope.environment !== 'live' ||
    config.credentials.environment !== 'live' ||
    config.credentials.requestKeys.size < 1 ||
    [...config.credentials.requestKeys.values()].some(
      (key) => key.caller !== LIVE_MCS_CARD_CALLER,
    ) ||
    config.credentials.signedResponses.key.caller !== LIVE_MCS_CARD_CALLER ||
    config.webhook.environment !== 'live' ||
    config.webhook.merchantAccount !== config.scope.merchant ||
    config.webhook.storeReference !== config.scope.store ||
    config.webhook.referencePrefix !== ADYEN_LIVE_REFERENCE_PREFIX ||
    config.webhook.discardVerifiedForeignReferences !== true ||
    config.webhook.retainVerifiedOwnedUnsupported !== true ||
    !sameCardEventSet(config.webhook.allowedEventCodes)
  )
    throw new PaymentDomainError('invalid_payment_live_configuration');

  return createPaymentRuntimeCore(
    {
      caller: config.caller,
      scope: config.scope,
      endpoint: {
        environment: 'live',
        liveEndpointPrefix: config.liveEndpointPrefix,
      },
      quoteAuthorities: [config.quoteAuthority],
      recoveryOfferLocales: [LIVE_MCS_CARD_OFFER_LOCALE],
      newAttemptOfferLocales: config.activation.newAttemptsEnabled
        ? [LIVE_MCS_CARD_OFFER_LOCALE]
        : [],
      paymentMethodCapabilities: ['card'],
      recoveryMode: config.recoveryMode,
      credentials: config.credentials,
      sessionRouting: config.sessionRouting,
      providerOptimization: liveMcsProviderOptimization(),
      webhook: config.webhook,
      webhookMethodEvidence: 'card_scope_webhook',
      limits: config.limits,
    },
    dependencies,
  );
}
