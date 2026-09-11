import { PaymentDomainError, type PaymentScope } from './payment-domain.js';

export const ADYEN_CARD_EVENT_CODES = Object.freeze([
  'PENDING',
  'AUTHORISATION',
  'CAPTURE',
  'CAPTURE_FAILED',
  'CANCELLATION',
  'EXPIRE',
  'REFUND',
  'REFUND_FAILED',
  'REFUNDED_REVERSED',
  'CHARGEBACK',
  'CHARGEBACK_REVERSED',
] as const);

export type AdyenEnvironment = 'test' | 'live';

export type AdyenEndpointSelection =
  | Readonly<{ environment: 'test'; liveEndpointPrefix: null }>
  | Readonly<{ environment: 'live'; liveEndpointPrefix: string }>;

export interface AdyenEnvironmentProfile {
  readonly environment: AdyenEnvironment;
  readonly sessionsUrl: string;
  readonly sessionsOrigin: string;
  readonly sessionsPath: string;
  readonly referencePrefix: string;
}

const TEST_PROFILE: AdyenEnvironmentProfile = Object.freeze({
  environment: 'test',
  sessionsUrl: 'https://checkout-test.adyen.com/v72/sessions',
  sessionsOrigin: 'https://checkout-test.adyen.com',
  sessionsPath: '/v72/sessions/',
  referencePrefix: 'tandem-poc-tsv1-',
});

export const ADYEN_LIVE_REFERENCE_PREFIX = 'tandem-live-card-lv1-';
const LIVE_ENDPOINT_PREFIX = /^[a-z0-9](?:[a-z0-9-]{0,47}[a-z0-9])?$/;

/**
 * Resolves only Adyen-owned Checkout hosts. A configured URL or hostname is
 * never accepted, so endpoint selection cannot become an arbitrary egress path.
 */
export function resolveAdyenEnvironment(
  selection: AdyenEndpointSelection,
): AdyenEnvironmentProfile {
  if (selection.environment === 'test') {
    if (selection.liveEndpointPrefix !== null)
      throw new PaymentDomainError('invalid_adyen_endpoint_configuration');
    return TEST_PROFILE;
  }
  if (
    selection.environment !== 'live' ||
    typeof selection.liveEndpointPrefix !== 'string'
  )
    throw new PaymentDomainError('invalid_adyen_endpoint_configuration');
  const liveEndpointPrefix = selection.liveEndpointPrefix.toLowerCase();
  if (!LIVE_ENDPOINT_PREFIX.test(liveEndpointPrefix))
    throw new PaymentDomainError('invalid_adyen_endpoint_configuration');
  const sessionsOrigin = `https://${liveEndpointPrefix}-checkout-live.adyenpayments.com`;
  const sessionsPath = '/checkout/v72/sessions/';
  const sessionsUrl = `${sessionsOrigin}${sessionsPath.slice(0, -1)}`;
  const parsed = new URL(sessionsUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hostname !==
      `${liveEndpointPrefix}-checkout-live.adyenpayments.com` ||
    parsed.pathname !== '/checkout/v72/sessions' ||
    parsed.search ||
    parsed.hash
  )
    throw new PaymentDomainError('invalid_adyen_endpoint_configuration');
  return Object.freeze({
    environment: 'live',
    sessionsUrl,
    sessionsOrigin,
    sessionsPath,
    referencePrefix: ADYEN_LIVE_REFERENCE_PREFIX,
  });
}

export function assertCanonicalAdyenEnvironmentProfile(
  profile: AdyenEnvironmentProfile,
): void {
  try {
    const canonical =
      profile.environment === 'test'
        ? resolveAdyenEnvironment({
            environment: 'test',
            liveEndpointPrefix: null,
          })
        : (() => {
            const origin = new URL(profile.sessionsOrigin);
            const suffix = '-checkout-live.adyenpayments.com';
            if (!origin.hostname.endsWith(suffix)) throw new Error();
            return resolveAdyenEnvironment({
              environment: 'live',
              liveEndpointPrefix: origin.hostname.slice(0, -suffix.length),
            });
          })();
    if (
      profile.environment !== canonical.environment ||
      profile.sessionsUrl !== canonical.sessionsUrl ||
      profile.sessionsOrigin !== canonical.sessionsOrigin ||
      profile.sessionsPath !== canonical.sessionsPath ||
      profile.referencePrefix !== canonical.referencePrefix
    )
      throw new Error();
  } catch {
    throw new PaymentDomainError('invalid_adyen_endpoint_configuration');
  }
}

export function assertAdyenScopeForEnvironment(
  scope: PaymentScope,
  profile: AdyenEnvironmentProfile,
): void {
  assertCanonicalAdyenEnvironmentProfile(profile);
  if (
    scope.provider !== 'adyen' ||
    scope.environment !== profile.environment ||
    scope.endpointRegion !== 'eu' ||
    scope.store === null
  )
    throw new PaymentDomainError('adyen_scope_mismatch');
}
