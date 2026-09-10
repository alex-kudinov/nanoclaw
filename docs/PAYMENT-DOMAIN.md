# Reusable payment domain — MCS Foundations reference

Status: unwired source implementation; NC-20260909-003. No production payment
capability is enabled by this module. Plan accepted after independent Sonnet/high
review in Peri `docs/MCS-FOUNDATIONS-IMPLEMENTATION-PLAN.md`.

## Ownership and first slice

`src/payment-domain.ts` is a pure contract/decision module. WordPress remains
quote/coupon authority. NanoClaw will own durable attempts and admitted financial
evidence, using existing enrollment orders/agreements/obligations rather than
creating a second order master. No runtime imports this module yet.

- Strict versioned quotes use safe integer minor units and exact subtraction.
  Their fingerprint includes offer, locale, country, mapping versions, identity
  references, discounts, redemption reference, terms/consent and timestamps.
  Validation does not establish coupon eligibility or caller authentication.
- One-time paid attempts pin an immutable quote and complete provider scope
  (provider, environment, company, merchant, store and endpoint region). A free
  quote is valid but requires a separate commercial admission path, not a fake
  paid event. Recurring quotes are rejected until an explicit versioned contract
  exists; their future schedule and obligations must not be hidden in metadata.
- Session operations record a stable key and exact outbound-request fingerprint
  before dispatch. Ambiguous results reuse that operation within a configured
  horizon strictly below seven days; the adapter must choose a shorter horizon
  where required. Expired/unknown outcomes require reconciliation, not key
  replacement or switching to Stripe. Available sessions are reused only before
  their provider-reported expiry. Failed operations stop. Contradictory terminal
  results require an exception.
- Projection rebuilds from all admitted facts, never event arrival order.
  Authorization must match the complete payment amount. Distinct partial capture
  and refund operations carry amounts; repeated deliveries/operations deduplicate.
  Conflicting payloads or aggregate overages suppress usable totals and produce
  stable exception codes. Missing earlier evidence remains pending, and a refusal
  plus successful capture or refund conflicts. Authorization/capture never asserts settlement
  or grants access. Returns, disputes and cancellations are not yet modeled and
  are rejected, not silently ignored.

## Mandatory caller boundaries before wiring

These helpers are **not** an authentication, concurrency, persistence, refund
authorization or fulfillment boundary. Their inputs must come from the admitted
commerce/provider services, never directly from a browser.

The next store slice must enforce unique attempt/operation/idempotency/event keys,
CAS/leases, append-only evidence, immutable request/scope binding and commit-before-
dispatch. Only one worker can own dispatch; `retry_same_operation` is permission
to recover the same request, not a lock. Persist the original retry deadline and
request without extending either. Never trust a caller-supplied hash as evidence
that an outbound payload was checked. The adapter must derive the hash from the
exact stored request and keep credentials/tokens out of logs and URLs.

Provider ingress must verify signatures and scope, bind the payment reference to
the persisted attempt, derive stable delivery/child-operation identities and
persist invalid/conflicting evidence as owned exceptions. The pure reducer throws
on malformed/out-of-scope facts; its caller must retain a safe rejection receipt.
Do not filter failures out of the complete evidence set to obtain a clean result.

Standalone Foundations publication, Adyen source admission, scoped runtime policy,
financial agreement/obligation classification and method-specific access readiness
remain launch gates. The module writes none of these records and emits no effects.
Unknown parent evidence must not trigger fulfillment. A capture is not settlement.

## Verification and remaining work

### Durable attempt store (migration 149; source/disposable only)

`payment-store.ts` now accepts an injected host transaction function (the existing
`withTransaction` at integration) and a `PaymentPayloadVault`. It does not load
credentials or construct a production pool. The private vault key ring supports
explicit key rotation; old keys must remain available while their retained
encrypted requests/responses still require recovery. Never expose vault methods
or key-ring configuration to the browser or an agent.

The store serializes quote acceptance and operation preparation, commits the
exact request before returning dispatch permission, pins one session operation
per attempt, and uses DB-clock leases plus version/token fences. Duplicate
prepare calls cannot extend the original retry deadline. Session retryUntil is
clamped to the absolute quote expiry at preparation using the database clock,
so an unknown, expired checkout enters reconciliation instead of retrying a
dead Session for the rest of a longer provider idempotency window. Every accepted state
version has an append-only receipt in the same transaction. An expired lease
recovers the same operation, never a replacement charge. The browser must reuse
its persisted attempt/operation identity; generating another UUID for the same
quote conflicts deliberately. Different quote identities still require an
authenticated caller's order-level admission rules, not this database alone.

Raw card/bank credentials are forbidden. Session request/response payloads are
AES-256-GCM encrypted with key ID and operation/request-or-response binding as
authenticated data. Only exact stored bytes are recoverable; changed bytes/key/
operation identity fail closed. Provider credentials are attached transiently by
the adapter, never included in the stored payload. Response expiry comes from the
validated provider adapter; expired sessions reconcile rather than creating a
second operation. Lease loss prevents a stale worker from recording its result.

149 is independent of the separately reserved enrollment migrations 146-148.
It creates three admin-only tables, immutability/version triggers and no agent
or public grants. Its rollback locks all three tables and refuses any retained
evidence. Production application remains gated. The disposable test uses only
generated `nc_payment_disposable_*` databases on `/tmp:5432`, explicitly configured
without production environment values, and removes its own database afterward.

Event delivery/reference uniqueness, durable rejected-event exceptions and
payment-evidence projection are the event-store part of this implementation,
not falsely supplied by the three operation tables. Durable internal request
authentication, public status capabilities and provider dispatch are subsequent
integration boundaries. No daemon/browser route imports this store yet.

### TEST Sessions integration

`adyen-session-adapter.ts` builds a card-only request from the immutable quote,
pins TEST/eu/company/merchant/store and the v72 TEST endpoint, rejects unsafe
origin/return URLs, prevents redirects, bounds response bytes and time, and
minimizes the session response. It never stores the API key with the request.
`payment-session-service.ts` requires exact durable attempt readback, prepares
the stable operation before dispatch, and commits its encrypted result before
returning `checkout_ready` (not paid). Lost responses retain the same operation;
no catch block switches providers or invents a replacement key. Existing
attempts may resume when the offer is disabled for new starts.

Only host-authenticated callers may use this service. It is NOT a public API:
nonce/HMAC admission and browser status capabilities are still required before
exposing it. Unknown results are returned to that caller; rate-limited scheduling
and reconciliation must precede unattended/public retries.

`scripts/verify-adyen-test-session-store.ts` requires explicit TEST confirmation,
exact existing merchant/store/origin, the reviewed Foundations catalog and terms,
and explicit generated local Postgres. It creates one unused TEST Session (no
payment), reopens its DB pool, proves encrypted reuse with no second provider
call, and removes its own synthetic database. Output contains counts/status/hash
only, never API keys or session data. It does not authorize production migration
or storefront activation. Provider API reference:
https://docs.adyen.com/api-explorer/Checkout/72/post/sessions

The behavioral suite covers quote tampering/expiry/zero values, scope pinning,
ambiguous/repeated/expired recovery, expired sessions, duplicates, conflicting and
reordered events, missing predecessors, partial amounts and safe-integer overflow.
English Foundations, French and a second product fixture use identical functions;
fixtures do not authorize those routes. See the engineering changelog for exact
test/review receipts. Database race/crash proof, live methods, shared UI, coupons
and fulfillment are subsequent slices, not claimed by these pure tests.
