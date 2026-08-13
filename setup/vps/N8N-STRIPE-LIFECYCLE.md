# Live n8n Stripe lifecycle contract

Authoritative live workflow: `stripe-payment` / `Stripe Payment → El Contador`.

The workflow has separate Stripe Trigger nodes for the Heartbeat and Tandem
accounts. Each trigger is bound to that account's n8n Stripe credential and
feeds a separate Code node. This credential binding is the authority for the
fixed `account` label; no payload field may select an account.

The legacy `AliasHeartbeatSpaced` generic Webhook node must be disconnected and
removed. It bypasses the Stripe Trigger credential/signature boundary and had
zero execution mentions in the 90-day aggregate preflight on 2026-08-12.

Use `n8n-stripe-lifecycle-extractor.js` as the Code-node source, replacing
`__ACCOUNT__` with `heartbeat` in `Extract Heartbeat` and `tandem` in
`Extract Tandem`.

The `POST to El Contador` JSON body must preserve the complete minimized
envelope:

```javascript
={{ JSON.stringify({
  stripe_id: $json.stripe_id,
  payment_intent_id: $json.payment_intent_id || null,
  event_type: $json.event_type,
  event_id: $json.event_id,
  event_created: $json.event_created,
  refund_id: $json.refund_id || null,
  account: $json.account
}) }}
```

Do not store webhook or NanoClaw secrets in this repository. The HTTP Request
node's `X-Webhook-Secret` remains live configuration. Before changing the live
workflow, export a private backup; after activation, verify both account
triggers, one sanitized payment-shaped canary, refund fan-out, and NanoClaw's
webhook-inbox receipt without creating a customer, payment, or refund.
