import crypto from 'crypto';

export const CHECKOUT_RECOVERY_SCHEMA_VERSION = 1 as const;
export const CHECKOUT_RECOVERY_MAX_BODY_BYTES = 32 * 1024;
export const CHECKOUT_RECOVERY_MAX_SKEW_SECONDS = 300;

export type CheckoutRecoveryAccount = 'tandem' | 'heartbeat';
export type CheckoutRecoverySource = 'tandemweb' | 'stripe' | 'host_timeout';
export type CheckoutRecoveryState =
  | 'captured'
  | 'payment_created'
  | 'payment_failed'
  | 'client_abandoned'
  | 'shadow_ready'
  | 'purchased'
  | 'recovered'
  | 'suppressed'
  | 'expired'
  | 'held'
  | 'closed';
export type CheckoutRecoveryConsent = 'unknown' | 'denied' | 'granted';
export type CheckoutRecoveryEligibility = 'unknown' | 'ineligible' | 'eligible';
export type CheckoutRecoveryLocale = 'en' | 'es' | 'ja' | 'fr';
export type CheckoutFailureGuidanceKey =
  | 'verify_card_details'
  | 'authenticate_payment'
  | 'use_different_method'
  | 'contact_issuer_or_change_method'
  | 'retry_later_or_change_method'
  | 'generic_decline';
export type CheckoutPaymentMethodBrand =
  | 'amex'
  | 'cartes_bancaires'
  | 'diners'
  | 'discover'
  | 'eftpos_au'
  | 'interac'
  | 'jcb'
  | 'link'
  | 'mastercard'
  | 'unionpay'
  | 'visa'
  | 'unknown';
export type CheckoutRecoveryAliasKind =
  | 'checkout_token'
  | 'payment_intent'
  | 'checkout_session'
  | 'charge'
  | 'event'
  | 'recovered_from';

export interface CheckoutRecoveryAlias {
  kind: CheckoutRecoveryAliasKind;
  id: string;
}

export type CheckoutRecoveryEventType =
  | 'checkout.captured'
  | 'payment.created'
  | 'checkout.client_abandoned'
  | 'payment.failed'
  | 'payment.succeeded'
  | 'checkout.session_completed'
  | 'checkout.session_expired'
  | 'checkout.shadow_timeout';

export interface PreparedCheckoutRecoveryEvent {
  schema_version: 1;
  source_system: CheckoutRecoverySource;
  stripe_account: CheckoutRecoveryAccount;
  source_event_key: string;
  source_case_key: string;
  event_type: CheckoutRecoveryEventType;
  observed_at: string;
  payload_sha256: string;
  email_sha256: string | null;
  program_slug: string | null;
  product_slug: string | null;
  amount_cents: number | null;
  currency: string | null;
  consent_state: CheckoutRecoveryConsent;
  consent_policy_version: string | null;
  checkout_locale: CheckoutRecoveryLocale | null;
  return_url: string | null;
  product_name: string | null;
  stripe_customer_id: string | null;
  failure_code: string | null;
  decline_code: string | null;
  advice_code: string | null;
  customer_guidance_key: CheckoutFailureGuidanceKey | null;
  payment_method_brand: CheckoutPaymentMethodBrand | null;
  payment_method_last4: string | null;
  aliases: CheckoutRecoveryAlias[];
  recovered_from: string | null;
}

export interface PreparedCheckoutRecoveryResult {
  prepared: PreparedCheckoutRecoveryEvent;
  transient_email: string | null;
}

export interface CheckoutRecoveryArchiveEnvelope {
  eventId: string;
  body: {
    schema_version: 1;
    source_system: CheckoutRecoverySource;
    stripe_account: CheckoutRecoveryAccount;
    source_event_sha256: string;
    source_case_sha256: string;
    event_type: CheckoutRecoveryEventType;
    observed_at: string;
    payload_sha256: string;
    email_sha256: string | null;
    program_slug: string | null;
    product_slug: string | null;
    amount_cents: number | null;
    currency: string | null;
    consent_state: CheckoutRecoveryConsent;
    consent_policy_version: string | null;
    checkout_locale: CheckoutRecoveryLocale | null;
    product_name: string | null;
    stripe_customer_present: boolean;
    failure_code: string | null;
    decline_code: string | null;
    advice_code: string | null;
    customer_guidance_key: CheckoutFailureGuidanceKey | null;
    payment_method_brand: CheckoutPaymentMethodBrand | null;
    payment_method_last4_present: boolean;
    alias_kinds: CheckoutRecoveryAliasKind[];
    recovered_from_present: boolean;
  };
}

export class CheckoutRecoveryPayloadError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'CheckoutRecoveryPayloadError';
    this.statusCode = statusCode;
  }
}

export class CheckoutRecoverySignatureError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'CheckoutRecoverySignatureError';
    this.statusCode = statusCode;
  }
}

const SOURCE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/;
const TOKEN_RE = /^[A-Za-z0-9]{32}$/;
const PI_RE = /^pi_[A-Za-z0-9_]+$/;
const CS_RE = /^cs_[A-Za-z0-9_]+$/;
const CH_RE = /^ch_[A-Za-z0-9_]+$/;
const EVT_RE = /^evt_[A-Za-z0-9_]+$/;
const CUSTOMER_RE = /^cus_[A-Za-z0-9_]{10,200}$/;
const SAFE_CODE_RE = /^[a-z][a-z0-9_]{0,99}$/;
const PAYMENT_METHOD_BRANDS = new Set<CheckoutPaymentMethodBrand>([
  'amex',
  'cartes_bancaires',
  'diners',
  'discover',
  'eftpos_au',
  'interac',
  'jcb',
  'link',
  'mastercard',
  'unionpay',
  'visa',
  'unknown',
]);

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CheckoutRecoveryPayloadError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  field: string,
  maxLength: number,
  required = false,
): string | null {
  if (value === null || value === undefined || value === '') {
    if (required)
      throw new CheckoutRecoveryPayloadError(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new CheckoutRecoveryPayloadError(`${field} must be text`);
  }
  const parsed = value.trim();
  if (parsed.length > maxLength) {
    throw new CheckoutRecoveryPayloadError(`${field} exceeds ${maxLength}`);
  }
  return parsed;
}

function sourceKey(value: unknown, field: string): string {
  const parsed = text(value, field, 500, true)!;
  if (!SOURCE_KEY_RE.test(parsed)) {
    throw new CheckoutRecoveryPayloadError(`${field} is invalid`);
  }
  return parsed;
}

function slug(value: unknown, field: string): string | null {
  const parsed = text(value, field, 300);
  if (parsed !== null && !SLUG_RE.test(parsed)) {
    throw new CheckoutRecoveryPayloadError(`${field} is invalid`);
  }
  return parsed;
}

function iso(value: unknown, field: string): string {
  const parsed = text(value, field, 80, true)!;
  const ms = Date.parse(parsed);
  if (!Number.isFinite(ms)) {
    throw new CheckoutRecoveryPayloadError(`${field} must be ISO-8601`);
  }
  return new Date(ms).toISOString();
}

function normalizedEmail(value: unknown): string | null {
  const parsed = text(value, 'email', 320)?.toLowerCase() ?? null;
  if (parsed !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed)) {
    throw new CheckoutRecoveryPayloadError('email is invalid');
  }
  return parsed;
}

function emailDigest(email: string | null, secret: string): string | null {
  if (email === null) return null;
  if (secret.length < 32) {
    throw new CheckoutRecoveryPayloadError(
      'checkout recovery identity secret unavailable',
      503,
    );
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`checkout-recovery-email-v1\0${email}`, 'utf8')
    .digest('hex');
}

function sha(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

function shaText(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeCode(value: unknown, field: string): string | null {
  const parsed = text(value, field, 100)?.toLowerCase() ?? null;
  if (parsed !== null && !SAFE_CODE_RE.test(parsed)) {
    throw new CheckoutRecoveryPayloadError(`${field} is invalid`);
  }
  return parsed;
}

function stripeCustomerId(value: unknown): string | null {
  const parsed = text(value, 'customer_id', 204);
  if (parsed !== null && !CUSTOMER_RE.test(parsed)) {
    throw new CheckoutRecoveryPayloadError('customer_id is invalid');
  }
  return parsed;
}

function paymentMethodBrand(value: unknown): CheckoutPaymentMethodBrand | null {
  const parsed = text(value, 'payment_method_brand', 40)?.toLowerCase() ?? null;
  if (
    parsed !== null &&
    !PAYMENT_METHOD_BRANDS.has(parsed as CheckoutPaymentMethodBrand)
  ) {
    throw new CheckoutRecoveryPayloadError('payment_method_brand is invalid');
  }
  return parsed as CheckoutPaymentMethodBrand | null;
}

function paymentMethodLast4(value: unknown): string | null {
  const parsed = text(value, 'payment_method_last4', 4);
  if (parsed !== null && !/^[0-9]{4}$/.test(parsed)) {
    throw new CheckoutRecoveryPayloadError('payment_method_last4 is invalid');
  }
  return parsed;
}

const VERIFY_CARD_CODES = new Set([
  'incorrect_address',
  'incorrect_cvc',
  'incorrect_number',
  'invalid_cvc',
  'invalid_expiry_month',
  'invalid_expiry_year',
  'invalid_number',
]);
const AUTHENTICATE_CODES = new Set([
  'authentication_required',
  'mobile_device_authentication_required',
]);
const DIFFERENT_METHOD_CODES = new Set([
  'card_velocity_exceeded',
  'expired_card',
  'insufficient_funds',
  'pin_try_exceeded',
  'withdrawal_count_limit_exceeded',
]);
const RETRY_LATER_CODES = new Set([
  'issuer_not_available',
  'processing_error',
  'reenter_transaction',
  'try_again_later',
]);
const CONTACT_ISSUER_CODES = new Set([
  'do_not_honor',
  'do_not_try_again',
  'generic_decline',
  'new_account_information_available',
  'no_action_taken',
  'not_permitted',
  'stop_payment_order',
  'transaction_not_allowed',
]);
const SENSITIVE_CODES = new Set([
  'fraudulent',
  'lost_card',
  'merchant_blacklist',
  'pickup_card',
  'restricted_card',
  'revocation_of_all_authorizations',
  'revocation_of_authorization',
  'security_violation',
  'stolen_card',
]);

export function checkoutFailureGuidance(input: {
  declineCode?: string | null;
  failureCode?: string | null;
  adviceCode?: string | null;
}): CheckoutFailureGuidanceKey {
  const code = (input.declineCode ?? input.failureCode ?? '').toLowerCase();
  if (SENSITIVE_CODES.has(code)) return 'generic_decline';
  if (VERIFY_CARD_CODES.has(code) || input.adviceCode === 'confirm_card_data') {
    return 'verify_card_details';
  }
  if (AUTHENTICATE_CODES.has(code)) return 'authenticate_payment';
  if (DIFFERENT_METHOD_CODES.has(code)) return 'use_different_method';
  if (RETRY_LATER_CODES.has(code) || input.adviceCode === 'try_again_later') {
    return 'retry_later_or_change_method';
  }
  if (
    CONTACT_ISSUER_CODES.has(code) ||
    input.adviceCode === 'do_not_try_again'
  ) {
    return 'contact_issuer_or_change_method';
  }
  return 'generic_decline';
}

/**
 * Content-minimized envelope for the shared webhook archive. Exact source keys,
 * checkout tokens, and provider alias ids remain only in the admin-only
 * checkout recovery tables.
 */
export function checkoutRecoveryArchiveEnvelope(
  event: PreparedCheckoutRecoveryEvent,
): CheckoutRecoveryArchiveEnvelope {
  const sourceEventSha256 = shaText(event.source_event_key);
  return {
    eventId: `checkout-recovery:${sourceEventSha256}`,
    body: {
      schema_version: 1,
      source_system: event.source_system,
      stripe_account: event.stripe_account,
      source_event_sha256: sourceEventSha256,
      source_case_sha256: shaText(event.source_case_key),
      event_type: event.event_type,
      observed_at: event.observed_at,
      payload_sha256: event.payload_sha256,
      email_sha256: event.email_sha256,
      program_slug: event.program_slug,
      product_slug: event.product_slug,
      amount_cents: event.amount_cents,
      currency: event.currency,
      consent_state: event.consent_state,
      consent_policy_version: event.consent_policy_version,
      checkout_locale: event.checkout_locale,
      product_name: event.product_name,
      stripe_customer_present: event.stripe_customer_id !== null,
      failure_code: event.failure_code,
      decline_code: event.decline_code,
      advice_code: event.advice_code,
      customer_guidance_key: event.customer_guidance_key,
      payment_method_brand: event.payment_method_brand,
      payment_method_last4_present: event.payment_method_last4 !== null,
      alias_kinds: [
        ...new Set(event.aliases.map((entry) => entry.kind)),
      ].sort(),
      recovered_from_present: event.recovered_from !== null,
    },
  };
}

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new CheckoutRecoveryPayloadError('amount_cents is invalid');
  }
  return Number(value);
}

function currency(value: unknown): string | null {
  const parsed = text(value, 'currency', 3)?.toLowerCase() ?? null;
  if (parsed !== null && !/^[a-z]{3}$/.test(parsed)) {
    throw new CheckoutRecoveryPayloadError('currency is invalid');
  }
  return parsed;
}

function checkoutLocale(value: unknown): CheckoutRecoveryLocale | null {
  const parsed = text(value, 'locale', 5)?.toLowerCase() ?? null;
  if (parsed !== null && !['en', 'es', 'ja', 'fr'].includes(parsed)) {
    throw new CheckoutRecoveryPayloadError('locale is invalid');
  }
  return parsed as CheckoutRecoveryLocale | null;
}

function safeReturnUrl(value: unknown): string | null {
  const parsed = text(value, 'return_url', 1000);
  if (parsed === null) return null;
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    throw new CheckoutRecoveryPayloadError('return_url is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    !['tandemcoach.co', 'www.tandemcoach.co'].includes(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    throw new CheckoutRecoveryPayloadError('return_url is not allowed');
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

function consent(value: unknown): CheckoutRecoveryConsent {
  if (value === true || value === 'granted') return 'granted';
  if (value === false || value === 'denied') return 'denied';
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'unknown'
  ) {
    return 'unknown';
  }
  throw new CheckoutRecoveryPayloadError('consent_state is invalid');
}

function alias(
  kind: CheckoutRecoveryAliasKind,
  id: string,
): CheckoutRecoveryAlias {
  const patterns: Record<CheckoutRecoveryAliasKind, RegExp> = {
    checkout_token: TOKEN_RE,
    payment_intent: PI_RE,
    checkout_session: CS_RE,
    charge: CH_RE,
    event: EVT_RE,
    recovered_from: CS_RE,
  };
  if (!patterns[kind].test(id)) {
    throw new CheckoutRecoveryPayloadError(`invalid ${kind} alias`);
  }
  return { kind, id };
}

function uniqueAliases(
  aliases: CheckoutRecoveryAlias[],
): CheckoutRecoveryAlias[] {
  return [
    ...new Map(
      aliases.map((entry) => [`${entry.kind}:${entry.id}`, entry]),
    ).values(),
  ];
}

const WEBSITE_EVENTS = new Set<CheckoutRecoveryEventType>([
  'checkout.captured',
  'payment.created',
  'checkout.client_abandoned',
  'payment.failed',
  'payment.succeeded',
]);

export function prepareWebsiteCheckoutRecoveryEnvelope(
  payload: unknown,
  identitySecret: string,
): PreparedCheckoutRecoveryResult {
  const p = object(payload, 'payload');
  if (p.schema_version !== 1) {
    throw new CheckoutRecoveryPayloadError('schema_version must be 1');
  }
  const eventType = text(
    p.event_type,
    'event_type',
    100,
    true,
  )! as CheckoutRecoveryEventType;
  if (!WEBSITE_EVENTS.has(eventType)) {
    throw new CheckoutRecoveryPayloadError('unsupported website event_type');
  }
  const checkoutToken = text(p.checkout_token, 'checkout_token', 32, true)!;
  if (!TOKEN_RE.test(checkoutToken)) {
    throw new CheckoutRecoveryPayloadError('checkout_token is invalid');
  }
  const eventKey = sourceKey(p.source_event_key, 'source_event_key');
  const observedAt = iso(p.observed_at, 'observed_at');
  const email = normalizedEmail(p.email);
  const pi = text(p.payment_intent_id, 'payment_intent_id', 200);
  const cs = text(p.checkout_session_id, 'checkout_session_id', 200);
  const aliases: CheckoutRecoveryAlias[] = [
    alias('checkout_token', checkoutToken),
  ];
  if (pi) aliases.push(alias('payment_intent', pi));
  if (cs) aliases.push(alias('checkout_session', cs));
  const policy = slug(p.consent_policy_version, 'consent_policy_version');
  const normalized = {
    schema_version: 1 as const,
    source_system: 'tandemweb' as const,
    stripe_account: 'tandem' as const,
    source_event_key: eventKey,
    source_case_key: `tandemweb:${checkoutToken}`,
    event_type: eventType,
    observed_at: observedAt,
    email_sha256: emailDigest(email, identitySecret),
    program_slug: slug(p.program_slug, 'program_slug')?.toLowerCase() ?? null,
    product_slug: slug(p.product_slug, 'product_slug'),
    amount_cents: amount(p.amount_cents),
    currency: currency(p.currency),
    consent_state: consent(p.consent_state),
    consent_policy_version: policy?.toLowerCase() ?? null,
    checkout_locale: checkoutLocale(p.locale),
    return_url: safeReturnUrl(p.return_url),
    product_name: text(p.product_name, 'product_name', 300),
    stripe_customer_id: null,
    failure_code: null,
    decline_code: null,
    advice_code: null,
    customer_guidance_key: null,
    payment_method_brand: null,
    payment_method_last4: null,
    aliases: uniqueAliases(aliases),
    recovered_from: null,
  };
  return {
    prepared: { ...normalized, payload_sha256: sha(normalized) },
    transient_email: email,
  };
}

const STRIPE_EVENT_MAP: Record<string, CheckoutRecoveryEventType> = {
  'payment_intent.payment_failed': 'payment.failed',
  'payment_intent.succeeded': 'payment.succeeded',
  'checkout.session.completed': 'checkout.session_completed',
  'checkout.session.expired': 'checkout.session_expired',
};

export function prepareStripeCheckoutRecoveryEnvelope(
  payload: unknown,
  fixedAccount: CheckoutRecoveryAccount,
  identitySecret: string,
): PreparedCheckoutRecoveryResult {
  const p = object(payload, 'payload');
  if (p.account !== fixedAccount) {
    throw new CheckoutRecoveryPayloadError(
      'Stripe account/perimeter mismatch',
      403,
    );
  }
  const rawType = text(p.event_type, 'event_type', 100, true)!;
  const eventType = STRIPE_EVENT_MAP[rawType];
  if (!eventType) {
    throw new CheckoutRecoveryPayloadError('unsupported Stripe event_type');
  }
  const eventId = text(p.event_id, 'event_id', 200, true)!;
  alias('event', eventId);
  const observedAt =
    p.event_created === null || p.event_created === undefined
      ? iso(p.observed_at, 'observed_at')
      : new Date(Number(p.event_created) * 1000).toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new CheckoutRecoveryPayloadError('event_created is invalid');
  }
  const stripeId = text(p.stripe_id, 'stripe_id', 200, true)!;
  const pi = text(p.payment_intent_id, 'payment_intent_id', 200);
  const cs = text(p.checkout_session_id, 'checkout_session_id', 200);
  const charge = text(p.charge_id, 'charge_id', 200);
  const recoveredFrom = text(p.recovered_from, 'recovered_from', 200);
  const aliases: CheckoutRecoveryAlias[] = [alias('event', eventId)];
  if (PI_RE.test(stripeId)) aliases.push(alias('payment_intent', stripeId));
  else if (CS_RE.test(stripeId))
    aliases.push(alias('checkout_session', stripeId));
  else throw new CheckoutRecoveryPayloadError('stripe_id is invalid');
  if (pi) aliases.push(alias('payment_intent', pi));
  if (cs) aliases.push(alias('checkout_session', cs));
  if (charge) aliases.push(alias('charge', charge));
  if (recoveredFrom) aliases.push(alias('recovered_from', recoveredFrom));
  const email = normalizedEmail(p.email);
  const failureCode = safeCode(p.failure_code, 'failure_code');
  const declineCode = safeCode(p.decline_code, 'decline_code');
  const adviceCode = safeCode(p.advice_code, 'advice_code');
  const guidance =
    eventType === 'payment.failed'
      ? checkoutFailureGuidance({ declineCode, failureCode, adviceCode })
      : null;
  const canonical = pi ?? cs ?? stripeId;
  const normalized = {
    schema_version: 1 as const,
    source_system: 'stripe' as const,
    stripe_account: fixedAccount,
    source_event_key: `stripe:${fixedAccount}:${eventId}`,
    source_case_key: `stripe:${fixedAccount}:${canonical}`,
    event_type: eventType,
    observed_at: observedAt,
    email_sha256: emailDigest(email, identitySecret),
    program_slug: slug(p.program_slug, 'program_slug')?.toLowerCase() ?? null,
    product_slug: slug(p.product_slug, 'product_slug'),
    amount_cents: amount(p.amount_cents),
    currency: currency(p.currency),
    consent_state: consent(p.consent_state),
    consent_policy_version:
      slug(p.consent_policy_version, 'consent_policy_version')?.toLowerCase() ??
      null,
    checkout_locale: checkoutLocale(p.locale),
    return_url: safeReturnUrl(p.return_url),
    product_name: text(p.product_name, 'product_name', 300),
    stripe_customer_id: stripeCustomerId(p.customer_id),
    failure_code: failureCode,
    decline_code: declineCode,
    advice_code: adviceCode,
    customer_guidance_key: guidance,
    payment_method_brand: paymentMethodBrand(p.payment_method_brand),
    payment_method_last4: paymentMethodLast4(p.payment_method_last4),
    aliases: uniqueAliases(aliases),
    recovered_from: recoveredFrom,
  };
  return {
    prepared: { ...normalized, payload_sha256: sha(normalized) },
    transient_email: email,
  };
}

export function verifyCheckoutRecoverySignature(input: {
  rawBody: Buffer;
  timestampHeader: string | string[] | undefined;
  signatureHeader: string | string[] | undefined;
  secret: string;
  nowMs?: number;
}): void {
  if (input.secret.length < 32) {
    throw new CheckoutRecoverySignatureError('relay secret unavailable', 503);
  }
  const timestamp = Array.isArray(input.timestampHeader)
    ? input.timestampHeader[0]
    : input.timestampHeader;
  const signature = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !signature) {
    throw new CheckoutRecoverySignatureError('signature headers missing');
  }
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (
    Math.abs(nowSeconds - Number(timestamp)) >
    CHECKOUT_RECOVERY_MAX_SKEW_SECONDS
  ) {
    throw new CheckoutRecoverySignatureError(
      'signature timestamp outside tolerance',
    );
  }
  const supplied = signature.replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/.test(supplied)) {
    throw new CheckoutRecoverySignatureError('signature is invalid');
  }
  const expected = crypto
    .createHmac('sha256', input.secret)
    .update(`${timestamp}.`)
    .update(input.rawBody)
    .digest('hex');
  if (
    !crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(supplied, 'hex'),
    )
  ) {
    throw new CheckoutRecoverySignatureError('signature mismatch');
  }
}

export function nextCheckoutRecoveryState(
  current: CheckoutRecoveryState | null,
  event: PreparedCheckoutRecoveryEvent,
): { state: CheckoutRecoveryState; resultCode: string } {
  if (
    current === 'purchased' ||
    current === 'recovered' ||
    current === 'closed'
  ) {
    return { state: current, resultCode: 'terminal_precedence' };
  }
  if (
    event.event_type === 'payment.succeeded' ||
    event.event_type === 'checkout.session_completed'
  ) {
    return event.recovered_from
      ? { state: 'recovered', resultCode: 'provider_recovered_purchase' }
      : { state: 'purchased', resultCode: 'exact_purchase' };
  }
  switch (event.event_type) {
    case 'checkout.captured':
      return {
        state: current ?? 'captured',
        resultCode: current ? 'late_capture' : 'captured',
      };
    case 'payment.created':
      return current === 'payment_failed'
        ? { state: current, resultCode: 'late_payment_created' }
        : { state: 'payment_created', resultCode: 'payment_created' };
    case 'checkout.client_abandoned':
      return current === 'payment_failed'
        ? { state: current, resultCode: 'abandon_after_failure' }
        : { state: 'client_abandoned', resultCode: 'client_abandoned' };
    case 'payment.failed':
      return { state: 'payment_failed', resultCode: 'payment_failed' };
    case 'checkout.session_expired':
      return { state: 'expired', resultCode: 'provider_expired' };
    case 'checkout.shadow_timeout':
      return current === 'suppressed' || current === 'held'
        ? { state: current, resultCode: 'timeout_not_ready' }
        : { state: 'shadow_ready', resultCode: 'shadow_timeout_ready' };
    default:
      return { state: current ?? 'held', resultCode: 'unsupported_transition' };
  }
}

export function checkoutEligibility(
  consentState: CheckoutRecoveryConsent,
  suppressionCode: string | null,
): CheckoutRecoveryEligibility {
  if (suppressionCode !== null || consentState === 'denied')
    return 'ineligible';
  if (consentState === 'granted') return 'eligible';
  return 'unknown';
}
