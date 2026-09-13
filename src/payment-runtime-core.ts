import {
  resolveAdyenEnvironment,
  type AdyenEndpointSelection,
} from './adyen-environment.js';
import type { AdyenWebhookConfig } from './adyen-webhook.js';
import { AdyenSessionResultAdapter } from './adyen-session-result-adapter.js';
import {
  AdyenSessionAdapter,
  type AdyenSessionOptimizationPolicy,
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
  validateAttempt,
  validatePaymentMethodCapabilities,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentEventStore } from './payment-event-store.js';
import {
  projectCheckoutPaymentEvidence,
  type CheckoutPaymentEvidence,
} from './payment-checkout-evidence.js';
import { PaymentHttpAdapter } from './payment-http-adapter.js';
import { PaymentMethodReconciliationStore } from './payment-method-reconciliation-store.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import {
  PaymentRequestAuthenticator,
  type PaymentRequestKey,
} from './payment-request-auth.js';
import { PaymentSessionService } from './payment-session-service.js';
import { PaymentSessionReturnBindingIssuer } from './payment-session-return-binding.js';
import {
  PaymentAttemptAcceptanceReceiptReader,
  PaymentResponseSigner,
  PaymentSignedResponseController,
  type PaymentResponseKey,
} from './payment-signed-response-controller.js';
import { PaymentStore, type PaymentTransaction } from './payment-store.js';

export interface PaymentRuntimeCredentialBundle {
  /** Purpose label; a TEST bundle cannot be composed into a LIVE runtime. */
  environment: 'test' | 'live';
  requestKeys: ReadonlyMap<string, PaymentRequestKey>;
  signedResponses?: {
    keyId: string;
    key: PaymentResponseKey;
  };
  payloadKeyId: string;
  payloadKeys: ReadonlyMap<string, Buffer>;
  /** Separate purpose key for exact Session-operation return binding. */
  returnBindingKey: Buffer;
  adyenApiKey: string;
}

export interface PaymentRuntimeCoreConfig {
  caller: string;
  scope: PaymentScope;
  endpoint: AdyenEndpointSelection;
  quoteAuthorities: readonly string[];
  /** Stable identities permitted for authenticated recovery/status. */
  recoveryOfferLocales: readonly string[];
  /** Reversible new-attempt enablement; every entry must be recoverable. */
  newAttemptOfferLocales: readonly string[];
  paymentMethodCapabilities: readonly PaymentMethodCapability[];
  recoveryMode: 'dispatch' | 'reconcile_only';
  credentials: PaymentRuntimeCredentialBundle;
  sessionRouting: Omit<AdyenSessionRouting, 'scope'>;
  providerOptimization?: AdyenSessionOptimizationPolicy;
  /** Null retains Session/return/status while native ingress fails closed. */
  webhook: AdyenWebhookConfig | null;
  webhookMethodEvidence?: 'session_result_only' | 'card_scope_webhook';
  limits: {
    requestsPerWindow: number;
    maxActive: number;
    windowMs: number;
    maxBodyBytes: number;
    bodyReadTimeoutMs: number;
  };
}

export interface PaymentRuntimeCoreDependencies {
  /** Explicit 149-152-capable transaction boundary; no default pool is opened. */
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
 * Environment-explicit reusable provider core. It never discovers a listener,
 * database, credential, environment file, merchant, store or endpoint.
 */
export function createPaymentRuntimeCore(
  config: PaymentRuntimeCoreConfig,
  dependencies: PaymentRuntimeCoreDependencies,
) {
  const profile = resolveAdyenEnvironment(config.endpoint);
  if (
    typeof dependencies?.transaction !== 'function' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.caller) ||
    config.scope.provider !== 'adyen' ||
    config.scope.environment !== profile.environment ||
    config.scope.endpointRegion !== 'eu' ||
    config.scope.store === null ||
    config.credentials.environment !== profile.environment ||
    (config.webhook !== null &&
      config.webhook.environment !== profile.environment)
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
    config.credentials.payloadKeyId,
    config.credentials.payloadKeys,
  );
  const authenticator = new PaymentRequestAuthenticator(
    config.credentials.requestKeys,
  );
  const store = new PaymentStore(dependencies.transaction, vault);
  const returnBindings = new PaymentSessionReturnBindingIssuer(
    config.credentials.returnBindingKey,
  );
  const admission = new PaymentAdmissionStore(
    dependencies.transaction,
    authenticator,
    vault,
    permits,
  );
  const providerCredential = {
    environment: config.credentials.environment,
    apiKey: config.credentials.adyenApiKey,
  } as const;
  const sessions = new PaymentSessionService(
    store,
    new AdyenSessionAdapter(
      providerCredential,
      profile,
      dependencies.providerTransport,
      config.providerOptimization?.checkoutApiVersion,
    ),
    { scope: config.scope, ...config.sessionRouting },
    newAttemptOfferLocales,
    paymentMethodCapabilities,
    config.recoveryMode,
    profile,
    returnBindings,
    config.providerOptimization,
  );
  const eventStore = config.webhook
    ? new PaymentEventStore(
        dependencies.transaction,
        config.scope,
        config.webhook,
        config.webhookMethodEvidence ?? 'session_result_only',
      )
    : null;
  const events = eventStore ?? {
    readInternalEvidence: (attemptId: string) =>
      dependencies.transaction(async (client) => {
        const result = await client.query<{
          contract: unknown;
          projection: CheckoutPaymentEvidence | null;
        }>(
          `SELECT a.contract,e.projection
           FROM business_v2.payment_attempts a
           LEFT JOIN business_v2.payment_checkout_evidence e
             ON e.attempt_id=a.attempt_id
           WHERE a.attempt_id=$1`,
          [attemptId],
        );
        if (result.rowCount !== 1) return null;
        const attempt = validateAttempt(result.rows[0].contract);
        if (paymentScopeFingerprint(attempt.scope) !== scopeHash) return null;
        return (
          result.rows[0].projection ??
          projectCheckoutPaymentEvidence({ attempt, facts: [] })
        );
      }),
    readConfirmationSummary: async () => null,
  };
  const reconciliation = new PaymentMethodReconciliationStore(
    dependencies.transaction,
    vault,
    store,
    new AdyenSessionResultAdapter(
      providerCredential,
      config.scope,
      profile,
      dependencies.providerTransport,
    ),
    config.scope,
    returnBindings,
  );
  const controller = new PaymentApiController(
    config.caller,
    permits,
    new PaymentRequestLimiter(
      config.limits.requestsPerWindow,
      config.limits.maxActive,
      config.limits.windowMs,
    ),
    { admission, store, sessions, events, reconciliation },
  );
  const signed = config.credentials.signedResponses;
  if (signed && signed.key.caller !== config.caller)
    throw new PaymentDomainError('invalid_payment_runtime_configuration');
  const responseController = signed
    ? new PaymentSignedResponseController(
        config.caller,
        authenticator,
        controller,
        new PaymentResponseSigner(
          signed.keyId,
          signed.key,
          [...config.credentials.requestKeys.values()].map(
            (value) => value.secret,
          ),
        ),
        new PaymentAttemptAcceptanceReceiptReader(
          dependencies.transaction,
          config.caller,
          config.scope,
        ),
      )
    : controller;
  const http = new PaymentHttpAdapter(
    responseController,
    config.limits.maxBodyBytes,
    config.limits.bodyReadTimeoutMs,
  );
  return Object.freeze({
    environment: profile.environment,
    http,
    recordWebhook: (payload: unknown) => {
      if (!eventStore)
        throw new PaymentDomainError('payment_webhook_unconfigured');
      return eventStore.recordWebhook(payload);
    },
  });
}
