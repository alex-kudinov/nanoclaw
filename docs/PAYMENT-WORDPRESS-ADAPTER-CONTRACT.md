# WordPress to NanoClaw TEST payment adapter contract

Status: source contract for NC-20260909-003. This is not a public endpoint,
production configuration, migration receipt or activation authorization.

## Boundary

WordPress remains the authenticated commerce authority for the quote, including
offer/locale identity, applicable regional price, coupons, terms, consent and
payer/participant references. NanoClaw validates the immutable contract and
requires its complete payment-method snapshot to be a subset of the exact TEST
runtime allowlist. It does not silently narrow or rewrite the attempt. NanoClaw
does not recalculate WordPress pricing or accept browser-supplied money.

The browser calls a protected WordPress route. WordPress calls the private
NanoClaw route over authenticated HTTPS. The browser never receives the internal
HMAC key, payload-vault key, provider API key or raw internal transport.

## Immutable attempt and method capabilities

The `attempt` is the existing PaymentAttempt v1 contract, with one optional
top-level field:

```json
{
  "schemaVersion": 1,
  "attemptId": "UUID",
  "quote": {},
  "quoteFingerprint": "64 lowercase hex",
  "scope": {
    "provider": "adyen",
    "environment": "test",
    "company": "configured company",
    "merchant": "configured merchant",
    "store": "configured store",
    "endpointRegion": "eu"
  },
  "paymentMethodCapabilities": ["card", "ach_direct_debit"],
  "createdAt": 0
}
```

`paymentMethodCapabilities` is a canonical, nonempty subset of the following
ordered list only:

1. `card`
2. `ach_direct_debit`

The supported snapshots are therefore `['card']`, `['ach_direct_debit']`, or
`['card','ach_direct_debit']`. Duplicates, reversed order, provider codes such as
`scheme`/`ach`, Plaid, wallets and every unknown value are rejected. An older v1
attempt without the field remains card-only; this preserves already-created
fixtures and attempts.

The snapshot is part of the immutable persisted attempt and the encrypted,
fingerprinted Adyen Session request. WordPress must reuse it unchanged for the
same attempt. There is deliberately no mutable per-request `paymentMethod`
field. Adyen Drop-in performs the shopper's selection inside the Session.

`quoteFingerprint` is lowercase SHA-256 hex over compact JSON of the validated
`quote`, after recursively sorting every object key in ascending English-locale
order while preserving array order. Quote data is the strict ASCII/integer/null
contract in `PAYMENT-DOMAIN.md`; do not add fields. In PHP, recursively `ksort`
object/associative-array keys and encode without whitespace or escaped slashes
before hashing. All timestamps are integer Unix milliseconds, not seconds.

Quote locale is immutable product identity and accepts the bounded forms `en`,
`en-US`, and the required numeric-region form `es-419`. Do not rewrite
`es-419` in the quote. Because the Adyen presentation locale uses a language plus
country form, the TEST runtime must separately configure an explicit mapping
such as the verified deployment choice for `es-419`; the source fixture uses
`es-MX` only as a mapping example, not as current commercial policy. The mapped
value is sent only as `shopperLocale` and never changes offer/quote identity.

NanoClaw maps the public names server-side:

| Public capability | Adyen method type | Current scope validation |
| --- | --- | --- |
| `card` | `scheme` | Exact configured Adyen TEST/eu/store scope |
| `ach_direct_debit` | `ach` | Same scope, USD, and quote country US or PR |

The ACH checks establish provider method eligibility only. They do not establish
settlement, return-risk or fulfillment readiness. The current event ledger is
AUTHORISATION-only and is not sufficient to activate ACH.

## Signed internal transport

All three routes accept `POST` with `Content-Type: application/json`. The outer
body is bounded and has exactly this shape:

```json
{
  "auth": {
    "version": 1,
    "keyId": "configured-key-id",
    "caller": "configured-caller",
    "method": "POST",
    "path": "/internal/payments/sessions",
    "timestamp": 0,
    "nonce": "fresh UUID",
    "operationId": "request UUID",
    "signature": "64 lowercase hex"
  },
  "payloadBase64": "canonical base64 of the exact inner JSON bytes"
}
```

The HMAC-SHA256 input is the following newline-delimited UTF-8 text, with the
last line equal to the lowercase SHA-256 hex digest of the exact decoded inner
bytes:

```text
tandem-payments-v1
{keyId}
{caller}
POST
{path}
{timestamp}
{nonce}
{operationId}
{sha256(innerBytes)}
```

Use a fresh nonce and timestamp for every HTTP transmission. Keep the same
`operationId`/inner `requestId`, attempt and exact immutable attempt contract
when retrying the same logical command. A duplicate nonce returns `409`; a fresh
nonce can safely recover the existing capability and durable Session operation.
Do not generate a new attempt or switch to Stripe after an ambiguous Adyen call.

## Commands and responses

### Start or reuse a Session

Path: `POST /internal/payments/sessions`

Signed inner body:

```json
{"requestId":"UUID","attempt":{}}
```

`requestId` must equal `auth.operationId`. A successful response is no-store and
contains the durable attempt ID, scoped status bearer and the Session state:

```json
{
  "state": "checkout_ready",
  "attemptId": "UUID",
  "capability": "pcap_...",
  "capabilityExpiresAt": 0,
  "paymentMethodCapabilities": ["card", "ach_direct_debit"],
  "session": {
    "id": "provider session id",
    "sessionData": "provider session data",
    "expiresAt": "ISO-8601 timestamp"
  }
}
```

Other successful preparation states are `pending`, `reconciliation_required`
and `failed`. They still echo `attemptId`, the same capability and the immutable
`paymentMethodCapabilities`; they do not contain Session data.

### Resume an existing attempt

Path: `POST /internal/payments/attempts`

Signed inner body:

```json
{"requestId":"UUID","attemptId":"UUID","capability":"pcap_..."}
```

NanoClaw reloads the original attempt from PostgreSQL, validates the bearer and
caller policy, and recovers from the exact encrypted provider request/response
that was committed for it. Current new-attempt method/offer disablement and
presentation-locale changes cannot rewrite or orphan an accepted operation. A
separate explicit `reconcile_only` emergency mode prevents both new starts and
new provider dispatch; it returns `reconciliation_required` for an unfinished
operation rather than inventing a fallback payment.

Runtime configuration separates a stable recovery-offer registry from the
reversible new-attempt offer allowlist. Every new-attempt entry must already be
registered for recovery. Removing it from new-attempt enablement stops new
Sessions without removing authenticated resume/status authority for accepted
attempts.

### Read minimized status

Path: `POST /internal/payments/status`

The signed inner body matches resume. The response contains only:

```json
{"attemptId":"UUID","state":"awaiting_payment"}
```

Current states are `awaiting_payment`, `confirming_payment`, and `needs_review`.
`confirming_payment` means admitted authorization evidence exists; it does not
mean settled, paid or access-ready. WordPress must keep the capability out of
URLs and logs and associate it with the guest's server-side checkout state.

## HTTP behavior and open gate

All responses are JSON and `Cache-Control: no-store`. Relevant failures are
`400 invalid_request`, `401 request_access_denied` or `status_access_denied`,
`403 checkout_unavailable`, `409 request_replayed` or `checkout_conflict`,
`413 request_too_large`, `415 unsupported_media_type`, `429
payment_rate_limited`, and sanitized `503 payment_service_unavailable`.

The current source provides an injectable bounded Node HTTP handler and an
explicit TEST composition over a caller-supplied PostgreSQL transaction. It
does not read environment files, discover a default database, create a listener,
mount a route or permit LIVE configuration. Before protected preview exposure,
the deployment owner must explicitly supply migrations 149-151, private keys,
exact scope/offer/authority/method allowlists, route protection and gateway
limits. Runtime configuration includes both maximum request bytes and a bounded
body-read deadline; expiry returns `408 request_timeout` and closes keep-alive.
The eventual listener must separately set bounded connections, headers timeout,
request timeout and keep-alive behavior. Before ACH can be called deploy-ready, a separate reviewed event slice
must model and test its delayed failure/return lifecycle and status semantics.
