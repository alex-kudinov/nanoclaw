// Source for both live n8n Code nodes: "Extract Heartbeat" and
// "Extract Tandem". Replace __ACCOUNT__ with the fixed account label that is
// bound to that node's Stripe Trigger credential. Never accept account from the
// Stripe payload or another caller-controlled field.
const ACCOUNT = '__ACCOUNT__';
if (!['heartbeat', 'tandem'].includes(ACCOUNT)) return [];

const raw = $input.first().json;
const eventType = typeof raw.type === 'string' ? raw.type : '';
const eventId = typeof raw.id === 'string' ? raw.id : '';
const eventCreated = Number.isFinite(raw.created) ? raw.created : null;
const ALLOWED_EVENTS = [
  'payment_intent.succeeded',
  'checkout.session.completed',
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
  eventType === 'payment_intent.succeeded'
    ? stripeId
    : typeof inner.payment_intent === 'string'
      ? inner.payment_intent
      : '';

return [
  {
    json: {
      stripe_id: stripeId,
      payment_intent_id: paymentIntent || null,
      event_type: eventType,
      event_id: eventId,
      event_created: eventCreated,
      account: ACCOUNT,
    },
  },
];
