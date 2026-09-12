import { z } from 'zod';
import {
  assertCanonicalAdyenEnvironmentProfile,
  assertAdyenScopeForEnvironment,
  resolveAdyenEnvironment,
  type AdyenEnvironmentProfile,
} from './adyen-environment.js';
import { adyenAttemptReference } from './adyen-payment-identifiers.js';

import {
  paymentMethodCapabilitiesForAttempt,
  PaymentDomainError,
  validatePaymentMethodCapabilities,
  validateAttempt,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';

const responseSchema = z.object({
  id: z.string().min(1).max(200),
  sessionData: z.string().min(1).max(60000),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type AdyenSession = z.infer<typeof responseSchema>;
export interface AdyenSessionRouting {
  scope: PaymentScope;
  allowedOrigin: string;
  returnPath: string;
  /** Explicit presentation-only mapping; never changes quote/product identity. */
  providerLocaleByQuoteLocale?: Readonly<Record<string, string>>;
}

export interface AdyenApiCredential {
  readonly environment: 'test' | 'live';
  readonly apiKey: string;
}

export interface AdyenSessionOptimizationPolicy {
  readonly profile: 'mcs-foundations-us-l3-v1';
  readonly productCode: string;
  readonly description: string;
  readonly unitOfMeasure: string;
}

const ADYEN_METHOD_TYPES: Readonly<
  Record<PaymentMethodCapability, 'scheme' | 'ach'>
> = Object.freeze({
  card: 'scheme',
  ach_direct_debit: 'ach',
});

export function resolveAdyenTestPaymentMethodCapabilities(
  input: unknown,
  configured: unknown = ['card'],
): readonly PaymentMethodCapability[] {
  const attempt = validateAttempt(input);
  const requested = paymentMethodCapabilitiesForAttempt(attempt);
  const enabled = new Set(validatePaymentMethodCapabilities(configured));
  if (requested.some((capability) => !enabled.has(capability)))
    throw new PaymentDomainError('payment_method_not_enabled');
  if (
    requested.includes('ach_direct_debit') &&
    (attempt.quote.currency !== 'USD' ||
      !['US', 'PR'].includes(attempt.quote.country))
  )
    throw new PaymentDomainError('payment_method_scope_mismatch');
  return requested;
}

function resolveProviderShopperLocale(
  quoteLocale: string,
  configured: AdyenSessionRouting['providerLocaleByQuoteLocale'],
): string {
  const mapped = configured?.[quoteLocale];
  if (/^[a-z]{2}-[0-9]{3}$/.test(quoteLocale) && mapped === undefined)
    throw new PaymentDomainError('provider_locale_mapping_required');
  const providerLocale = mapped ?? quoteLocale;
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(providerLocale))
    throw new PaymentDomainError('invalid_provider_locale');
  return providerLocale;
}

/** The request contains no API key or raw card/bank data. All money is authoritative. */
export function buildAdyenSessionRequest(
  input: unknown,
  routing: AdyenSessionRouting,
  profile: AdyenEnvironmentProfile,
  configuredPaymentMethods: unknown = ['card'],
  sessionSequence = 1,
  optimization?: AdyenSessionOptimizationPolicy,
): string {
  const attempt = validateAttempt(input);
  const scope = attempt.scope;
  assertAdyenScopeForEnvironment(scope, profile);
  if (
    JSON.stringify(scope) !==
    JSON.stringify(validateAttempt({ ...attempt, scope: routing.scope }).scope)
  ) {
    throw new PaymentDomainError('adyen_scope_mismatch');
  }
  const origin = new URL(routing.allowedOrigin);
  if (
    origin.origin !== routing.allowedOrigin ||
    origin.username ||
    origin.password ||
    !(
      origin.protocol === 'https:' ||
      (origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    )
  ) {
    throw new PaymentDomainError('invalid_checkout_origin');
  }
  const returnUrl = new URL(routing.returnPath, origin);
  if (
    !routing.returnPath.startsWith('/') ||
    returnUrl.origin !== origin.origin ||
    returnUrl.search ||
    returnUrl.hash ||
    returnUrl.username ||
    returnUrl.password
  ) {
    throw new PaymentDomainError('invalid_checkout_return');
  }
  if (attempt.quote.expiresAt - attempt.createdAt > 24 * 60 * 60 * 1000)
    throw new PaymentDomainError('invalid_provider_session_expiry');
  const capabilities = resolveAdyenTestPaymentMethodCapabilities(
    attempt,
    configuredPaymentMethods,
  );
  const shopperLocale = resolveProviderShopperLocale(
    attempt.quote.locale,
    routing.providerLocaleByQuoteLocale,
  );
  returnUrl.searchParams.set('attempt', attempt.attemptId); // Identifier, not a status capability.
  const providerOptimization = optimization
    ? buildAdyenSessionOptimization(attempt, optimization)
    : {};
  return JSON.stringify({
    merchantAccount: scope.merchant,
    store: scope.store,
    reference: adyenAttemptReference(
      attempt.attemptId,
      profile,
      sessionSequence,
    ),
    amount: {
      value: attempt.quote.finalAmount,
      currency: attempt.quote.currency,
    },
    returnUrl: returnUrl.href,
    countryCode: attempt.quote.country,
    shopperLocale,
    channel: 'Web',
    shopperInteraction: 'Ecommerce',
    // Pin new one-time Sessions; never infer mutable merchant-default capture.
    // This requests immediate capture but does not prove capture or settlement.
    captureDelayHours: 0,
    shopperReference: `tandem-${profile.environment}-${attempt.attemptId}`,
    expiresAt: new Date(attempt.quote.expiresAt).toISOString(),
    allowedPaymentMethods: capabilities.map(
      (capability) => ADYEN_METHOD_TYPES[capability],
    ),
    ...providerOptimization,
  });
}

/**
 * PII-free provider projection for the exact US MCS one-time offer. The full
 * attribution snapshot remains internal. All arithmetic is derived from the
 * immutable quote; zero tax is reported truthfully and never inflated for L2.
 */
export function buildAdyenSessionOptimization(
  input: unknown,
  policy: AdyenSessionOptimizationPolicy,
): Record<string, unknown> {
  const attempt = validateAttempt(input);
  if (
    policy.profile !== 'mcs-foundations-us-l3-v1' ||
    attempt.quote.offerKey !== 'mcq-program-a-foundations' ||
    attempt.quote.locale !== 'en-US' ||
    attempt.quote.country !== 'US' ||
    attempt.quote.currency !== 'USD' ||
    !/^[A-Za-z0-9_.-]{1,12}$/.test(policy.productCode) ||
    !/^[\x20-\x7e]{1,80}$/.test(policy.description) ||
    !/^[A-Za-z]{1,3}$/.test(policy.unitOfMeasure)
  )
    throw new PaymentDomainError('invalid_provider_optimization_policy');

  const quote = attempt.quote;
  const customerReference = `mcs-${quote.quoteId.replaceAll('-', '').slice(0, 20)}`;
  const metadata: Record<string, string> = {
    checkout_attempt: attempt.attemptId,
    quote_id: quote.quoteId,
    offer_key: quote.offerKey,
    schema: policy.profile,
  };
  if (quote.discountPolicyReference !== null) {
    if (quote.discountPolicyReference.length > 80)
      throw new PaymentDomainError('invalid_provider_optimization_policy');
    metadata.promo_policy = quote.discountPolicyReference;
  }
  if (
    Object.keys(metadata).length > 20 ||
    Object.entries(metadata).some(
      ([key, value]) => key.length > 20 || value.length > 80,
    )
  )
    throw new PaymentDomainError('invalid_provider_optimization_policy');

  return {
    metadata,
    lineItems: [
      {
        id: quote.offerKey,
        description: policy.description,
        quantity: 1,
        amountExcludingTax: quote.finalAmount,
        taxAmount: 0,
        taxPercentage: 0,
        amountIncludingTax: quote.finalAmount,
        sku: policy.productCode,
      },
    ],
    additionalData: {
      'enhancedSchemeData.customerReference': customerReference,
      'enhancedSchemeData.totalTaxAmount': '0',
      'enhancedSchemeData.itemDetailLine1.productCode': policy.productCode,
      'enhancedSchemeData.itemDetailLine1.description': policy.description,
      'enhancedSchemeData.itemDetailLine1.quantity': '1',
      'enhancedSchemeData.itemDetailLine1.unitOfMeasure': policy.unitOfMeasure,
      'enhancedSchemeData.itemDetailLine1.unitPrice': String(
        quote.originalAmount,
      ),
      'enhancedSchemeData.itemDetailLine1.discountAmount': String(
        quote.discountAmount,
      ),
      'enhancedSchemeData.itemDetailLine1.totalAmount': String(
        quote.finalAmount,
      ),
    },
    authenticationData: { attemptAuthentication: 'always' },
    threeDS2RequestData: { threeDSRequestorChallengeInd: '02' },
  };
}

export function buildAdyenTestSessionRequest(
  input: unknown,
  routing: AdyenSessionRouting,
  configuredPaymentMethods: unknown = ['card'],
): string {
  try {
    return buildAdyenSessionRequest(
      input,
      routing,
      resolveAdyenEnvironment({
        environment: 'test',
        liveEndpointPrefix: null,
      }),
      configuredPaymentMethods,
    );
  } catch (error) {
    if (
      error instanceof PaymentDomainError &&
      error.code === 'adyen_scope_mismatch'
    )
      throw new PaymentDomainError('adyen_test_scope_mismatch');
    throw error;
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new PaymentDomainError('provider_outcome_unknown');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072)
        throw new PaymentDomainError('provider_outcome_unknown');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Unknown response/timeout is never permission for a new provider operation. */
export class AdyenSessionAdapter {
  #apiKey: string;
  constructor(
    credential: AdyenApiCredential,
    private readonly profile: AdyenEnvironmentProfile,
    private readonly transport: typeof fetch = fetch,
  ) {
    assertCanonicalAdyenEnvironmentProfile(profile);
    if (
      credential.environment !== profile.environment ||
      !credential.apiKey ||
      /[\r\n]/.test(credential.apiKey)
    )
      throw new PaymentDomainError('adyen_key_unavailable');
    this.#apiKey = credential.apiKey;
  }

  async create(request: string, idempotencyKey: string): Promise<AdyenSession> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(idempotencyKey))
      throw new PaymentDomainError('invalid_idempotency_key');
    try {
      const response = await this.transport(this.profile.sessionsUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.#apiKey,
          'Idempotency-Key': idempotencyKey,
        },
        body: request,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new PaymentDomainError('provider_outcome_unknown');
      }
      const parsed = responseSchema.safeParse(await readBoundedJson(response));
      if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now())
        throw new PaymentDomainError('provider_outcome_unknown');
      return parsed.data; // Only the session contract, not the raw provider envelope.
    } catch {
      throw new PaymentDomainError('provider_outcome_unknown');
    }
  }
}

/** Compatibility wrapper for the existing TEST-only composition. */
export class AdyenTestSessionAdapter extends AdyenSessionAdapter {
  constructor(apiKey: string, transport: typeof fetch = fetch) {
    super(
      { environment: 'test', apiKey },
      resolveAdyenEnvironment({
        environment: 'test',
        liveEndpointPrefix: null,
      }),
      transport,
    );
  }
}
