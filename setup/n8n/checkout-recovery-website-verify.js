// Verify the exact WordPress request bytes before parsing and normalizing.
const crypto = require('crypto');
const wrapped = $input.first().json || {};
const headers =
  wrapped.headers && typeof wrapped.headers === 'object' ? wrapped.headers : {};
// n8n 2.1.4 does not expose `rawBody` for the live Webhook node despite the
// enabled raw-body option. WordPress therefore sends signed JSON bytes as
// text/plain, which n8n preserves exactly in `body`. Never stringify a parsed
// object here: the HMAC authority is the exact request bytes.
const rawBody =
  typeof wrapped.rawBody === 'string'
    ? wrapped.rawBody
    : typeof wrapped.body === 'string'
      ? wrapped.body
      : '';
if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > 32768) {
  throw new Error('invalid_checkout_raw_body');
}
const ingressSecret = String($env.CHECKOUT_RECOVERY_INGRESS_SECRET || '');
const relaySecret = String($env.CHECKOUT_RECOVERY_RELAY_SECRET || '');
const hostUrl = String($env.CHECKOUT_RECOVERY_HOST_URL || '');
if (ingressSecret.length < 32) throw new Error('ingress_secret_unconfigured');
if (relaySecret.length < 32 || relaySecret === ingressSecret) {
  throw new Error('relay_secret_unconfigured');
}
if (!/^https?:\/\//.test(hostUrl)) throw new Error('host_url_unconfigured');
const incomingTimestamp = String(
  headers['x-checkout-timestamp'] || headers['X-Checkout-Timestamp'] || '',
);
const incomingSignature = String(
  headers['x-checkout-signature'] || headers['X-Checkout-Signature'] || '',
).replace(/^sha256=/, '');
if (!/^\d{10}$/.test(incomingTimestamp) || !/^[0-9a-f]{64}$/.test(incomingSignature)) {
  throw new Error('ingress_signature_missing');
}
if (Math.abs(Math.floor(Date.now() / 1000) - Number(incomingTimestamp)) > 300) {
  throw new Error('ingress_signature_stale');
}
const expected = crypto
  .createHmac('sha256', ingressSecret)
  .update(`${incomingTimestamp}.${rawBody}`, 'utf8')
  .digest('hex');
if (
  !crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(incomingSignature, 'hex'),
  )
) {
  throw new Error('ingress_signature_invalid');
}
let source;
try {
  source = JSON.parse(rawBody);
} catch {
  throw new Error('invalid_checkout_json');
}
if (!source || typeof source !== 'object' || Array.isArray(source)) {
  throw new Error('invalid_checkout_body');
}
if (source.schema_version !== 1) throw new Error('unsupported_checkout_schema');
const allowedEvents = new Set([
  'checkout.captured',
  'payment.created',
  'checkout.client_abandoned',
  'payment.failed',
  'payment.succeeded',
]);
const allowedIdentityRequests = new Set([
  'checkout.identity.resolve',
  'checkout.identity.bind',
]);
let fields;
if (allowedIdentityRequests.has(source.request_kind)) {
  fields = source.request_kind === 'checkout.identity.resolve'
    ? [
        'schema_version',
        'request_kind',
        'source_request_key',
        'observed_at',
        'checkout_token',
        'email',
        'first_name',
        'last_name',
        'product_slug',
      ]
    : [
        'schema_version',
        'request_kind',
        'source_request_key',
        'observed_at',
        'stripe_customer_id',
        'binding_token',
      ];
} else if (allowedEvents.has(source.event_type)) {
  fields = [
    'schema_version',
    'source_event_key',
    'event_type',
    'observed_at',
    'checkout_token',
    'email',
    'program_slug',
    'product_slug',
    'product_name',
    'amount_cents',
    'currency',
    'consent_state',
    'consent_policy_version',
    'locale',
    'return_url',
    'payment_intent_id',
    'checkout_session_id',
  ];
} else {
  throw new Error('unsupported_checkout_request');
}
const normalized = {};
for (const field of fields) {
  if (source[field] !== undefined) normalized[field] = source[field];
}
const bodyText = JSON.stringify(normalized);
if (Buffer.byteLength(bodyText, 'utf8') > 32768) {
  throw new Error('payload_too_large');
}
const timestamp = String(Math.floor(Date.now() / 1000));
const signature =
  'sha256=' +
  crypto
    .createHmac('sha256', relaySecret)
    .update(`${timestamp}.${bodyText}`, 'utf8')
    .digest('hex');
return [
  {
    json: {
      host_url: hostUrl,
      timestamp,
      signature,
      body_text: bodyText,
    },
  },
];
