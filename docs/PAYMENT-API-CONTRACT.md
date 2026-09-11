# Internal payment API contract — injectable, not mounted

NC-20260909-003. `PaymentApiController` composes the reviewed store, Sessions,
request-admission and event-ledger helpers. `PaymentHttpAdapter` adds bounded
streaming Node HTTP adaptation, and `createPaymentTestRuntime` composes the
kernels over an explicitly supplied transaction/configuration. When explicit
response-key configuration is supplied, it wraps every authenticated core result
in the reviewed signed response contract. Neither listens
on a port, reads environment files, discovers a database, permits LIVE scope or
registers a daemon/WordPress route. The exact caller contract is in
`PAYMENT-WORDPRESS-ADAPTER-CONTRACT.md`. The additive
`createPaymentRuntimeCore` keeps that contract environment-explicit;
`createPaymentLiveRuntime` limits the source-only LIVE composition to English
Foundations/card with signed responses and three mandatory activation gates.
See `PAYMENT-LIVE-RUNTIME.md`. Neither LIVE factory nor TEST wrapper mounts a
listener or discovers host configuration.

## Transport and authority

The caller sends a bounded JSON transport `{auth,payloadBase64}`. Base64 preserves
the exact signed command bytes across a relay's outer JSON reserialization.
Canonical base64 and decoded/outer byte limits are enforced. The signed envelope
must match the server-routed method/path and configured caller; never derive the
handler route or expected caller from `auth`. Only POST and exact internal
paths exist. A valid signature is atomically admitted to the nonce ledger before
dispatch. The decoded command is strictly parsed, and its requestId must equal
the signed operationId. Unknown fields/actions are rejected.

An in-memory signature preflight rejects invalid caller/path/body/time signatures
before spending authenticated checkout capacity or touching PostgreSQL. This is
not nonce admission: the durable admit step still repeats verification with DB
time before effects. Host/DB clocks must remain synchronized within the signing
window. Raw unauthenticated flood protection remains a gateway responsibility.
The process-local limiter bounds authenticated requests and in-flight work before admission;
deployment must explicitly configure limits and a trusted caller policy covering
quote authority and the complete provider scope. No unlimited default exists.
An eventual replicated deployment additionally needs a shared gateway budget.
The transport must be HTTPS/private authenticated routing and must not log bodies,
capabilities, session data or signing/vault/API keys. The real HTTP listener must
bound streaming input before allocation; this controller also checks final size.

## Routes

- POST `/internal/payments/sessions`: `{requestId,attempt}`. Validates enabled
  offer and exact scope, accepts the immutable quote, issues an attempt-scoped
  status capability, then starts/reuses the durable provider operation. The
  operation/quote/request identity stays fixed across retries. A retry uses a
  fresh signed nonce but the same logical requestId and immutable attempt. The
  response includes pending/checkout_ready/reconciliation state and the capability;
  Session data is returned only when durable response persistence succeeded.
  Every checkout-ready response also carries a private opaque `returnBinding`
  for the exact payment operation, Session sequence and Session ID hash. A
  public BFF must keep it inside its own authenticated owner/intent/preparation
  browser wrapper rather than exposing the private capability directly.
  The immutable attempt can snapshot the canonical public capabilities `card`
  and `ach_direct_debit`; legacy attempts without the field remain card-only.
  New-attempt admission requires the entire snapshot to be a subset of explicit
  runtime configuration; it never silently narrows or rewrites the attempt. The
  server maps only those names to Adyen `scheme`/`ach`. ACH additionally
  requires USD and quote country US or PR. Every preparation response echoes the immutable
  public capability list. No mutable per-request method selection is accepted.
  New one-time Sessions pin `captureDelayHours: 0`; this makes the requested
  automatic-capture behavior auditable but is not evidence of capture or settlement.
  Numeric-region product locales such as `es-419` remain unchanged in the
  persisted quote. They require an explicit runtime mapping to the verified
  Adyen presentation locale; that mapping affects only `shopperLocale`.
  If the first HTTP response is lost, an authenticated retry with the exact
  persisted attempt bypasses current new-start enablement, recovers the same
  capability, and resumes only the stored provider operation. A same-ID changed
  attempt conflicts; an accepted attempt with no prepared operation is not
  allowed to invent one on this recovery path.
- POST `/internal/payments/attempts`: `{requestId,attemptId,capability}`. Verifies
  the bearer, reloads the ORIGINAL immutable attempt from PostgreSQL, rechecks
  caller policy, and resumes it from the exact stored provider request without
  inventing a new provider/key or quote. Disabling an offer/method for new
  attempts or changing presentation-locale routing does not rewrite/orphan an
  accepted attempt. A separate explicit `reconcile_only` runtime mode blocks
  new starts and new provider dispatch while retaining durable reconciliation.
  Runtime configuration keeps the stable recovery offer registry separate from
  the reversible new-attempt offer allowlist; new entries must be a subset of
  registered recovery identities.
- POST `/internal/payments/status`: same read command. Verifies the bearer and
  policy before reading evidence; returns only attemptId and a minimal state.
  Authorization maps to `confirming_payment`, never paid/access eligibility.
  Only exact authenticated Session-result `refused|canceled|expired` proof maps
  to `terminal_nonpayment` and a server-computed retry disposition. Generic
  payment failure, local expiry and missing/ambiguous evidence do not. Conflicts
  map to `needs_review`.
- POST `/internal/payments/returns`:
  `{requestId,attemptId,capability,sessionResult,returnBinding}`.
  The capability/caller/attempt checks precede durable encrypted acceptance.
  The trusted Session ID is loaded only from the committed provider response;
  the browser supplies no Session identity. One bounded static provider GET
  verifies completed/Authorised reference, PSP, money and method. The minimized
  response never contains the opaque result, Session/PSP or method. The binding
  is mandatory after a successor; missing-binding compatibility is restricted
  to a database-proven sole legacy sequence-1 Session with no terminal/retry
  state.
- POST `/internal/payments/session-retries`:
  `{requestId,attemptId,capability,terminalReceipt}`. An explicit customer click
  may create one successor for the latest exact terminal receipt. Sequence is
  server-owned and capped at three total Sessions. Replays/concurrent commands
  reuse the stored successor. Expired immutable quote/reservation returns
  `reconfirmation_required` with zero provider call; limit and unsafe evidence
  return `limit_reached` or `retry_not_allowed`. No automatic submit, reprice,
  promotion transfer, Stripe fallback or generic-failure retry exists.
- POST `/internal/payments/session-submit-checks`:
  `{requestId,attemptId,capability,returnBinding}`. This signed private
  business-state-read accepts no card/provider fields and returns only
  `session_submit_allowed` or `session_submit_blocked` with minimized reason
  `stale_session|needs_review|not_payable|expired|unavailable`. Allow requires
  the exact latest bound Session, current Session/quote by database time, active
  backend new-payment authority, and no positive/pending/uncertain/terminal/
  review/method/enrollment evidence. Failed authorization alone remains
  retryable in the same current Session. Signed admission still records its
  nonce/operation replay-audit receipt; the payment-state decision performs
  locked reads only and makes no provider call.

Sequence 1 preserves the legacy Adyen merchant reference. Successors use only
strict signed suffix `-s2` or `-s3`. Webhooks resolve the exact stored operation.
A late successful authorization for a terminalized predecessor is durably
diverted to owned review before method binding or fulfillment, whether or not a
successor exists.

The pre-submit check narrows only known-before-submit exposure. It cannot revoke
an issued Adyen client capability or make the distributed check-to-SDK-submit
race atomic.

Missing scoped evidence is service-unavailable, not a misleading awaiting-payment
state. All replies, including errors, are no-store. Database/provider exceptions are
sanitized. UUID knowledge alone grants no read/resume, and no refunds, saved-method
charges, recurring creation or enrollment action are accepted by these routes.

## Still gated before actual service exposure

WordPress must issue/recover immutable server-authoritative quotes and identity,
preserve request IDs, sign fresh nonces on transport retry, enforce guest ownership
and public abuse controls, and never switch to Stripe after an ambiguous Adyen
outcome. Provider/session/status capabilities stay out of URLs and logs. The
gateway must preserve payloadBase64, propagate no-store headers, disable execution
payload retention and expose only intended routes. The source HTTP adapter
requires JSON, bounds streaming bytes before allocation and sanitizes failures;
its explicit body-read deadline returns a no-store 408 and closes keep-alive.
It still must be explicitly mounted behind the protected route, whose listener
must set connection/header/request/keep-alive limits. Migrations 148 and 149-159,
secret installation, actual provider/HMAC proof and scoped activation remain
required.

No first-customer launch, coupon parity, fulfillment or revenue migration is
claimed by this controller. The canonical event store supports the existing
card reducer lifecycle in the LIVE composition but is not settlement proof or
ACH lifecycle/readiness support. Financial/source/identity/readiness gates
from the accepted MCS plan remain intact.

The later `createWebsiteCheckoutTestService` composition is documented in
`MCS-WEBSITE-CHECKOUT-TEST-SERVICE.md`. It keeps this core API intact and adds
the already-defined identity and same-route checkout/enrollment admission
controllers behind one disposable TEST handler.
The protected English composition also has a default-off exact-QA Heartbeat
membership consumer documented in
`MCS-WEBSITE-CHECKOUT-HEARTBEAT-TEST-DELIVERY.md`. It runs only after canonical
card admission, reuses the versioned projection outbox and reports
`not_requested|queued|held|membership_verified` without claiming learner login,
course visit/progress, group-to-course attachment or general fulfillment.
