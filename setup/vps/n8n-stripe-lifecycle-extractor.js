// Source for both live n8n Code nodes: "Extract Heartbeat" and
// "Extract Tandem". Replace __ACCOUNT__ with the fixed account label that is
// bound to that node's Stripe Trigger credential. Never accept account from the
// Stripe payload or another caller-controlled field.
// Each corresponding Stripe Trigger node must also declare exactly the five
// ALLOWED_EVENTS below. Updating only Stripe's current event destination is not
// durable because n8n recreates that destination from the trigger definition
// when the workflow is republished or restarted.
const ACCOUNT = '__ACCOUNT__';
if (!['heartbeat', 'tandem'].includes(ACCOUNT)) return [];

const raw = $input.first().json;
const eventType = typeof raw.type === 'string' ? raw.type : '';
const eventId = typeof raw.id === 'string' ? raw.id : '';
const eventCreated = Number.isFinite(raw.created) ? raw.created : null;
const ALLOWED_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'checkout.session.completed',
  'checkout.session.expired',
  'charge.refunded',
];
if (!ALLOWED_EVENTS.includes(eventType)) return [];
if (!eventId.match(/^evt_[A-Za-z0-9_]{10,80}$/)) return [];

const inner =
  raw.data && raw.data.object && typeof raw.data.object === 'object'
    ? raw.data.object
    : {};

if (eventType === 'charge.refunded') {
  const paymentIntent =
    typeof inner.payment_intent === 'string' ? inner.payment_intent : '';
  if (!paymentIntent.match(/^pi_[A-Za-z0-9_]{10,80}$/)) return [];
  const refunds = Array.isArray(inner.refunds && inner.refunds.data)
    ? inner.refunds.data
    : [];
  return refunds
    .filter(
      (refund) =>
        refund &&
        refund.status === 'succeeded' &&
        typeof refund.id === 'string' &&
        /^re_[A-Za-z0-9_]{10,80}$/.test(refund.id),
    )
    .map((refund) => ({
      json: {
        stripe_id: paymentIntent,
        event_type: eventType,
        event_id: eventId,
        event_created: eventCreated,
        refund_id: refund.id,
        account: ACCOUNT,
      },
    }));
}

const stripeId = typeof inner.id === 'string' ? inner.id : '';
if (!stripeId.match(/^(pi|cs)_[A-Za-z0-9_]{10,80}$/)) return [];
const paymentIntent =
  eventType === 'payment_intent.succeeded' ||
  eventType === 'payment_intent.payment_failed'
    ? stripeId
    : typeof inner.payment_intent === 'string'
      ? inner.payment_intent
      : '';
const metadata =
  inner.metadata && typeof inner.metadata === 'object' ? inner.metadata : {};
const customerDetails =
  inner.customer_details && typeof inner.customer_details === 'object'
    ? inner.customer_details
    : {};
const emailCandidates = [
  customerDetails.email,
  inner.customer_email,
  inner.receipt_email,
  metadata.email,
];
const email = emailCandidates.find(
  (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
);
const consentState =
  inner.consent && inner.consent.promotions === 'opt_in'
    ? 'granted'
    : inner.consent && inner.consent.promotions === 'opt_out'
      ? 'denied'
      : 'unknown';
const amountCents = Number.isSafeInteger(inner.amount_total)
  ? inner.amount_total
  : Number.isSafeInteger(inner.amount)
    ? inner.amount
    : null;
const recoveredFrom =
  typeof inner.recovered_from === 'string' &&
  /^cs_[A-Za-z0-9_]{10,200}$/.test(inner.recovered_from)
    ? inner.recovered_from
    : null;
const latestCharge =
  typeof inner.latest_charge === 'string' &&
  /^ch_[A-Za-z0-9_]{10,200}$/.test(inner.latest_charge)
    ? inner.latest_charge
    : null;

return [
  {
    json: {
      stripe_id: stripeId,
      payment_intent_id: paymentIntent || null,
      checkout_session_id: stripeId.startsWith('cs_') ? stripeId : null,
      charge_id: latestCharge,
      event_type: eventType,
      event_id: eventId,
      event_created: eventCreated,
      account: ACCOUNT,
      email: email || null,
      program_slug:
        typeof metadata.program === 'string' ? metadata.program : null,
      product_slug:
        typeof metadata.product === 'string'
          ? metadata.product
          : typeof metadata.product_slug === 'string'
            ? metadata.product_slug
            : null,
      amount_cents: amountCents,
      currency:
        typeof inner.currency === 'string' ? inner.currency.toLowerCase() : null,
      consent_state: consentState,
      recovered_from: recoveredFrom,
    },
  },
];
