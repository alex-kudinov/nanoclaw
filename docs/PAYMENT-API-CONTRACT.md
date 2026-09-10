# Internal TEST payment API contract — unwired

NC-20260909-003. `PaymentApiController` composes the reviewed store, Sessions,
request-admission and event-ledger helpers. It does not listen on a port, load
credentials, create production connections or register a daemon/WordPress route.

## Transport and authority

The caller sends a bounded JSON transport `{auth,payloadBase64}`. Base64 preserves
the exact signed command bytes across a relay's outer JSON reserialization.
Canonical base64 and decoded/outer byte limits are enforced. The signed envelope
must match the server-routed method/path and configured caller; never derive the
handler route or expected caller from `auth`. Only POST and three exact internal
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
- POST `/internal/payments/attempts`: `{requestId,attemptId,capability}`. Verifies
  the bearer, reloads the ORIGINAL immutable attempt from PostgreSQL, rechecks
  caller policy, and resumes it without inventing a new provider/key or quote.
- POST `/internal/payments/status`: same read command. Verifies the bearer and
  policy before reading evidence; returns only attemptId and a minimal state.
  Authorization maps to `confirming_payment`, never paid/access eligibility.
  Refused/no-evidence remains `awaiting_payment` because a Session can retry;
  conflicts map to `needs_review`. SDK attempt-level decline UX remains separate.

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
payload retention and expose only intended TEST routes. Migrations149-151, secret
installation, actual provider/HMAC proof and scoped activation remain required.

No first-customer launch, coupon parity, fulfillment or revenue migration is
claimed by this controller. Financial/source/identity/readiness gates from the
accepted MCS plan remain intact.
