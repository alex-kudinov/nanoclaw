# R2 narrow hardening review

ACCEPTED.

## Correction 1 — preflight before rate limit, rate limit before DB admission

`payment-api-controller.ts` calls `admission.preflightSignature` synchronously
(line 149) before `limiter.acquire()` (line 150), and `admission.admit` (DB)
only runs after a successful `acquire()`. `preflightSignature` in
`payment-admission-store.ts` is a plain synchronous method that only calls
`auth.verify(...)` — no DB, no nonce write, matches "cheap signature check
only, NOT admission." `admit` re-verifies with DB clock (`await this.now(client)`)
and does the nonce insert; no preflight result is treated as authoritative.

`release` starts `null` and is only assigned after a successful `acquire()`;
the `finally { release?.() }` is a no-op when `preflightSignature` throws, so
there's no leaked or double-released permit on the rejection path.

Test `rate limits before nonce/database work and releases leases only once`
confirms this end-to-end: 5 bad-signature requests against a `(1,1,...)`
limiter get 401 without touching `admit`, then the next valid request still
succeeds (proving the bad signatures didn't spend the shared budget), and the
following valid request is 429'd before `admit` is called again.

Residual note, not a gap introduced here: invalid-signature requests are no
longer bounded by the in-process limiter at all (they're rejected before
`acquire()`), so CPU cost of signature verification itself is now unbounded
by this limiter. Both REQUEST-R2.md and `PAYMENT-API-CONTRACT.md` explicitly
disclose this as a gateway/deployment responsibility, so it's not a silent
regression.

## Correction 2 — null scoped evidence → sanitized 503

In `payment-api-controller.ts`, the status route now checks `if (!evidence)
return this.response(503, { error: 'payment_service_unavailable' })` before
computing `state`, eliminating the prior fall-through where `evidence?.state`
optional-chaining defaulted a `null` read to `'awaiting_payment'`. This only
fires on the status route (reached after the `/internal/payments/attempts`
branch returns early), so `resume` behavior is untouched. No PSP/session data
is present in the 503 body, and no paid/access claim is added — matches the
contract's "Missing scoped evidence is service-unavailable, not a misleading
awaiting-payment state."

Test `treats missing scoped evidence as unavailable, not a false
awaiting-payment state` confirms the exact 503 status and minimal body.

## Scope check

Both changes are confined to ordering (correction 1) and a null-guard
(correction 2); no change to the crypto verifier, clock window, nonce/operation
binding, capability issuance, or status minimization reviewed and accepted
under R1. Tests for tampering, replay, capability scoping, and sanitized
dependency/Postgres errors are unaffected and still pass per the file as
written. No HTTP listener, route registration, production apply, or
provider/payment claim is introduced.
