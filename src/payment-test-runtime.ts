import type { AdyenTestWebhookConfig } from './adyen-webhook.js';
import {
  AdyenTestSessionAdapter,
  type AdyenSessionRouting,
} from './adyen-session-adapter.js';
import {
  PaymentAdmissionStore,
  type PaymentCallerPolicy,
} from './payment-admission-store.js';
import {
  PaymentApiController,
  PaymentRequestLimiter,
} from './payment-api-controller.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validatePaymentMethodCapabilities,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentEventStore } from './payment-event-store.js';
import { PaymentHttpAdapter } from './payment-http-adapter.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import {
  PaymentRequestAuthenticator,
  type PaymentRequestKey,
} from './payment-request-auth.js';
import { PaymentSessionService } from './payment-session-service.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';

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
  payloadKeyId: string;
  payloadKeys: ReadonlyMap<string, Buffer>;
  adyenApiKey: string;
  sessionRouting: Omit<AdyenSessionRouting, 'scope'>;
  webhook: AdyenTestWebhookConfig;
  limits: {
    requestsPerWindow: number;
    maxActive: number;
    windowMs: number;
    maxBodyBytes: number;
    bodyReadTimeoutMs: number;
  };
}

export interface PaymentTestRuntimeDependencies {
  /** Explicit 149-151-capable transaction boundary; no default pool is opened. */
  transaction: PaymentTransaction;
  providerTransport?: typeof fetch;
}

function strictReferences(
  values: readonly string[],
  allowEmpty = false,
): ReadonlySet<string> {
  if (
    !Array.isArray(values) ||
    (!allowEmpty && values.length < 1) ||
    values.length > 100 ||
    values.some(
      (value) =>
        typeof value !== 'string' || !/^[A-Za-z0-9_:.\/-]{1,200}$/.test(value),
    ) ||
    new Set(values).size !== values.length
  )
    throw new PaymentDomainError('invalid_payment_runtime_configuration');
  return new Set(values);
}

function validateRouting(routing: Omit<AdyenSessionRouting, 'scope'>): void {
  try {
    const localeMappings = routing.providerLocaleByQuoteLocale;
    if (
      localeMappings !== undefined &&
      (localeMappings === null ||
        typeof localeMappings !== 'object' ||
        Array.isArray(localeMappings) ||
        Object.entries(localeMappings).some(
          ([quoteLocale, providerLocale]) =>
            !/^[a-z]{2}(?:-(?:[A-Z]{2}|[0-9]{3}))?$/.test(quoteLocale) ||
            !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(providerLocale),
        ))
    )
      throw new Error();
    const origin = new URL(routing.allowedOrigin);
    const returned = new URL(routing.returnPath, origin);
    if (
      origin.origin !== routing.allowedOrigin ||
      origin.username ||
      origin.password ||
      !(
        origin.protocol === 'https:' ||
        (origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
      ) ||
      !routing.returnPath.startsWith('/') ||
      returned.origin !== origin.origin ||
      returned.search ||
      returned.hash
    )
      throw new Error();
  } catch {
    throw new PaymentDomainError('invalid_payment_runtime_configuration');
  }
}

/**
 * Composes the reviewed TEST kernels. Importing/calling this factory neither
 * creates a listener nor discovers a database, environment file or LIVE scope.
 */
export function createPaymentTestRuntime(
  config: PaymentTestRuntimeConfig,
  dependencies: PaymentTestRuntimeDependencies,
) {
  if (
    config.mode !== 'test' ||
    typeof dependencies?.transaction !== 'function' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.caller) ||
    config.scope.provider !== 'adyen' ||
    config.scope.environment !== 'test' ||
    config.scope.endpointRegion !== 'eu' ||
    config.scope.store === null
  )
    throw new PaymentDomainError('invalid_payment_runtime_configuration');
  const scopeHash = paymentScopeFingerprint(config.scope);
  const quoteAuthorities = strictReferences(config.quoteAuthorities);
  const recoveryOfferLocales = strictReferences(config.recoveryOfferLocales);
  const newAttemptOfferLocales = strictReferences(
    config.newAttemptOfferLocales,
    true,
  );
  if (
    [...newAttemptOfferLocales].some(
      (offerLocale) => !recoveryOfferLocales.has(offerLocale),
    )
  )
    throw new PaymentDomainError('invalid_payment_runtime_configuration');
  for (const offerLocale of recoveryOfferLocales) {
    const separator = offerLocale.lastIndexOf(':');
    const locale = offerLocale.slice(separator + 1);
    if (separator < 1 || !/^[a-z]{2}(?:-(?:[A-Z]{2}|[0-9]{3}))?$/.test(locale))
      throw new PaymentDomainError('invalid_payment_runtime_configuration');
  }
  for (const offerLocale of newAttemptOfferLocales) {
    const locale = offerLocale.slice(offerLocale.lastIndexOf(':') + 1);
    if (
      /^[a-z]{2}-[0-9]{3}$/.test(locale) &&
      config.sessionRouting.providerLocaleByQuoteLocale?.[locale] === undefined
    )
      throw new PaymentDomainError('invalid_payment_runtime_configuration');
  }
  const paymentMethodCapabilities = validatePaymentMethodCapabilities(
    config.paymentMethodCapabilities,
  );
  validateRouting(config.sessionRouting);

  const permits: PaymentCallerPolicy = (caller, attempt) =>
    caller === config.caller &&
    quoteAuthorities.has(attempt.quote.authority) &&
    recoveryOfferLocales.has(
      `${attempt.quote.offerKey}:${attempt.quote.locale}`,
    ) &&
    paymentScopeFingerprint(attempt.scope) === scopeHash;
  const vault = new PaymentPayloadVault(
    config.payloadKeyId,
    config.payloadKeys,
  );
  const authenticator = new PaymentRequestAuthenticator(config.requestKeys);
  const store = new PaymentStore(dependencies.transaction, vault);
  const admission = new PaymentAdmissionStore(
    dependencies.transaction,
    authenticator,
    vault,
    permits,
  );
  const sessions = new PaymentSessionService(
    store,
    new AdyenTestSessionAdapter(
      config.adyenApiKey,
      dependencies.providerTransport,
    ),
    { scope: config.scope, ...config.sessionRouting },
    newAttemptOfferLocales,
    paymentMethodCapabilities,
    config.recoveryMode,
  );
  const events = new PaymentEventStore(
    dependencies.transaction,
    config.scope,
    config.webhook,
  );
  const controller = new PaymentApiController(
    config.caller,
    permits,
    new PaymentRequestLimiter(
      config.limits.requestsPerWindow,
      config.limits.maxActive,
      config.limits.windowMs,
    ),
    { admission, store, sessions, events },
  );
  const http = new PaymentHttpAdapter(
    controller,
    config.limits.maxBodyBytes,
    config.limits.bodyReadTimeoutMs,
  );
  return Object.freeze({
    http,
    recordWebhook: (payload: unknown) => events.recordWebhook(payload),
  });
}
