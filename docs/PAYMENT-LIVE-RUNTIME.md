# English MCS card LIVE runtime source contract

Status: dedicated English MCS LIVE runtime is active under NC-20260909-003;
ordinary MCS product traffic remains on Stripe.

## Boundary

createPaymentRuntimeCore composes the existing signed internal payment API,
durable attempt/session stores, static Session-result reconciliation and one
canonical webhook/event store from injected configuration and an injected
transaction boundary. It does not read environment files, open a database,
create a listener, register a daemon, discover credentials or call Adyen during
composition. createPaymentTestRuntime is the compatibility wrapper for the
existing TEST contract.

createPaymentLiveRuntime is the only LIVE composition in this slice. It is
fixed to caller tandem-wordpress-live, offer/locale
mcq-program-a-foundations:en-US, method card, provider adyen, environment live
and endpoint region eu. Merchant, store, company, quote authority, production
origin and key material must be supplied explicitly. It exposes the same signed
/sessions, /attempts, /returns and /status contract already documented in
PAYMENT-API-CONTRACT.md; it does not add a public endpoint.

## Activation and rollback gates

All three activation fields are mandatory. The published default has all three
off.

| enabled | recoverExisting | newAttemptsEnabled | Result                                                                                                                                                           |
| ------- | --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| false   | any             | any                | factory refuses to compose; no listener, database, provider or webhook acknowledgement                                                                           |
| true    | false           | any                | invalid configuration; recovery/status/return protection may not be removed from an active runtime                                                               |
| true    | true            | false              | recovery-only rollback: existing attempts retain status, return reconciliation, provider-pinned recovery and owned webhook intake; new Session starts are denied |
| true    | true            | true               | source permits a new attempt only for the exact English/card route; host/public activation is still separately required                                          |

Turning off new attempts never changes an accepted attempt's scope, provider,
stored request, operation, capability or idempotency key. reconcile_only may
additionally stop provider dispatch while keeping durable status/return
reconciliation. Invalid or disabled configuration cannot acknowledge or discard
an owned webhook because no event handler is returned.

## Provider and credential separation

TEST uses exactly https://checkout-test.adyen.com/v72/sessions. LIVE accepts
only an ASCII DNS-label Adyen endpoint prefix, normalizes provider-issued case,
and constructs exactly
https://{prefix}-checkout-live.adyenpayments.com/checkout/v72/sessions.
Neither a URL nor a hostname is accepted as the prefix, and each low-level
adapter revalidates the resolved profile before transport. The prefix length
also reserves the appended -checkout-live bytes so the complete first DNS
label remains valid.

The runtime requires matching environment labels on payment scope, endpoint,
Adyen API credential bundle and webhook HMAC configuration. LIVE request and
response keys must name the LIVE caller. Scope fingerprinting continues to bind
company, merchant, store and endpoint region. TEST and LIVE references use
disjoint namespaces: tandem-poc-tsv1- and tandem-live-card-lv1-.
The LIVE return origin must be canonical HTTPS, and quote authority is pinned
to tandem-wordpress-commerce-v1.

## Card webhook lifecycle

The LIVE composition requires HMAC admission for the complete existing card
reducer set: PENDING, AUTHORISATION, CAPTURE, CAPTURE_FAILED, CANCELLATION,
EXPIRE, REFUND, REFUND_FAILED, REFUNDED_REVERSED, CHARGEBACK and
CHARGEBACK_REVERSED. Every admitted supported fact writes through
PaymentEventStore; there is no parallel LIVE ledger. Duplicate, reordered,
amount/currency, scope, reference and evidence-limit behavior remains the
existing canonical behavior.

Verified owned event codes outside that set are retained only as a hash-only
payment_owned_event_exceptions record for operator review. LIVE composition
forbids the TEST shared-feed foreign-reference discard option. Authorization or
capture still does not prove settlement; chargebacks remain held operator facts,
and this source does not revoke access or dispatch fulfillment.

The exact LIVE MCS Session request now adds a bounded PII-free metadata subset,
one quote-derived line item, truthful zero-tax Level 3 enhanced scheme data,
and checkout-scoped 3DS authentication with no-challenge preference. A genuine
unused TEST Session returned HTTP 201 for the same v72 request shape. Adyen ESD
and 3DS `additionalData` is not part of the Standard-webhook HMAC fields, so it
is stored only in the append-only admin table introduced by migration162. It is
never part of a canonical payment fact, authorization projection, fulfillment
decision or Confirmation claim.

## Managed service composition

`docs/WEBSITE-CHECKOUT-LIVE-SERVICE.md` now defines the full signed host
composition, loopback-only listener, private configuration, health/readiness,
graceful restart, English publication activation receipt and default-off
Heartbeat delivery. That source remains unconfigured and undeployed. Exact host
values, migrations/config installation, receipt/welcome ownership, provider
setup, accepted activation receipts and the LIVE canary remain unresolved.
