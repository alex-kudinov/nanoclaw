import type { AdyenTestWebhookConfig } from './adyen-webhook.js';
import type {
  AdyenSessionOptimizationPolicy,
  AdyenSessionRouting,
} from './adyen-session-adapter.js';
import {
  PaymentDomainError,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentRequestKey } from './payment-request-auth.js';
import {
  createPaymentRuntimeCore,
  type PaymentRuntimeCoreDependencies,
} from './payment-runtime-core.js';
import type { PaymentResponseKey } from './payment-signed-response-controller.js';

export interface PaymentTestRuntimeConfig {
  mode: 'test';
  caller: string;
  scope: PaymentScope;
  quoteAuthorities: readonly string[];
  /** Stable identities permitted for authenticated recovery/status. */
  recoveryOfferLocales: readonly string[];
  /** Reversible new-attempt enablement; every entry must be recoverable. */
  newAttemptOfferLocales: readonly string[];
  paymentMethodCapabilities: readonly PaymentMethodCapability[];
  recoveryMode: 'dispatch' | 'reconcile_only';
  requestKeys: ReadonlyMap<string, PaymentRequestKey>;
  signedResponses?: {
    keyId: string;
    key: PaymentResponseKey;
  };
  payloadKeyId: string;
  payloadKeys: ReadonlyMap<string, Buffer>;
  returnBindingKey: Buffer;
  adyenApiKey: string;
  sessionRouting: Omit<AdyenSessionRouting, 'scope'>;
  providerOptimization?: AdyenSessionOptimizationPolicy;
  /** Null keeps Session/return/status available while native ingress fails closed. */
  webhook: AdyenTestWebhookConfig | null;
  webhookMethodEvidence?: 'session_result_only' | 'card_scope_webhook';
  limits: {
    requestsPerWindow: number;
    maxActive: number;
    windowMs: number;
    maxBodyBytes: number;
    bodyReadTimeoutMs: number;
  };
}

export type PaymentTestRuntimeDependencies = PaymentRuntimeCoreDependencies;

/**
 * Compatibility-preserving TEST composition over the environment-explicit
 * provider core. It still discovers no listener, database, config or secret.
 */
export function createPaymentTestRuntime(
  config: PaymentTestRuntimeConfig,
  dependencies: PaymentTestRuntimeDependencies,
) {
  if (config.mode !== 'test' || config.scope.environment !== 'test')
    throw new PaymentDomainError('invalid_payment_runtime_configuration');
  return createPaymentRuntimeCore(
    {
      caller: config.caller,
      scope: config.scope,
      endpoint: { environment: 'test', liveEndpointPrefix: null },
      quoteAuthorities: config.quoteAuthorities,
      recoveryOfferLocales: config.recoveryOfferLocales,
      newAttemptOfferLocales: config.newAttemptOfferLocales,
      paymentMethodCapabilities: config.paymentMethodCapabilities,
      recoveryMode: config.recoveryMode,
      credentials: {
        environment: 'test',
        requestKeys: config.requestKeys,
        ...(config.signedResponses
          ? { signedResponses: config.signedResponses }
          : {}),
        payloadKeyId: config.payloadKeyId,
        payloadKeys: config.payloadKeys,
        returnBindingKey: config.returnBindingKey,
        adyenApiKey: config.adyenApiKey,
      },
      sessionRouting: config.sessionRouting,
      providerOptimization: config.providerOptimization,
      webhook: config.webhook
        ? { ...config.webhook, environment: 'test' }
        : null,
      webhookMethodEvidence:
        config.webhookMethodEvidence ?? 'session_result_only',
      limits: config.limits,
    },
    dependencies,
  );
}
