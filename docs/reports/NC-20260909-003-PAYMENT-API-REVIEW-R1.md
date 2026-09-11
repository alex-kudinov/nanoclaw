# Bounded review — composed internal payment controller — R1

**Scope:** `payment-api-controller.ts` (+ its test file) as composed with the
already-accepted `payment-session-service.ts`, against `PAYMENT-API-CONTRACT.md`
and the `INTEGRATION-EXCERPT.md` composed DB test. No other files read.

## Verdict: ACCEPTED

No material issues found in the new controller within this bounded, unwired
scope. Every claim in the request description and contract that is checkable
from these five files is backed by a passing test that actually exercises the
claimed behavior (not just asserted in prose). Detail below.

## Checks performed and confirmed

- **Byte preservation across relay reserialization:** HMAC is computed over
  the decoded `payloadBase64` bytes, not the outer JSON. Confirmed by the
  "preserves signed bytes through outer JSON reserialization" test (re-encodes
  outer JSON with different whitespace, still 200).
- **Canonical base64 enforced correctly:** `body.toString('base64') !==
  parsed.data.payloadBase64` rejects non-canonical encodings, including
  base64url variants (Node's base64 decoder accepts `-_`, but re-encoding
  always emits `+/`, so a base64url input necessarily fails the equality
  check rather than silently passing).
- **requestId ⇄ operationId binding:** both `startSchema` and `readSchema`
  paths reject when `requestId !== receipt.operationId`, before any mutation
  or capability issuance. Covered by the "header/body operation mismatch"
  and unknown-action test.
- **Caller/method/path never taken from the envelope:** `admit()` is called
  with `this.caller` and the routed `path`/`'POST'`, never values parsed out
  of `command` or `auth`. `paths` is a fixed 3-entry set; only `POST` is
  accepted.
- **Ordering — start route:** `validateStart` (offer-enabled + structural
  check) → `permits` (caller/scope policy) → `store.acceptAttempt` (durable
  commit) → `issueStatusCapability` → `sessions.start` (provider dispatch).
  Matches "caller policy/offer validation precede acceptance" and "capability
  exists before a provider call." Confirmed by
  `issueStatusCapability.invocationCallOrder < sessions.start.invocationCallOrder`
  assertion and by the disabled-offer/foreign-scope test showing
  `issueStatusCapability` is never called when either check fails.
- **Ordering — read routes:** `permitsStatus` (capability check) strictly
  precedes `store.readAttempt` and `sessions.resume`/`readInternalEvidence`.
  Confirmed by the "requires an exact capability before resume or any
  internal evidence read" test, which asserts `readAttempt`,
  `readInternalEvidence`, and `resume` are all uncalled on a bad capability.
- **No attacker-supplied attempt on resume/status:** `readSchema` carries only
  `attemptId`, never an attempt body. The object passed to `sessions.resume`
  is exactly the store's loaded attempt (`resume` asserted
  `toHaveBeenCalledWith(s.attempt)`), so a caller cannot substitute a
  different quote/scope on reload — closes the tamper vector the contract
  calls out ("reloads the ORIGINAL immutable attempt").
- **Capability is attempt-bound, not just caller-bound:** the composed test's
  "wrong-attempt token rejection" case presents a valid capability with a
  *different* `attemptId` and gets 401, proving `permitsStatus` binds the
  token to one specific attempt rather than just the bearer/caller.
- **Idempotent retry, single provider call:** the composed DB test signs the
  same logical `requestId` twice with two different nonces; second call
  returns the same `capability` and `providerCalls` stays at 1, and a
  same-nonce replay returns 409 with `sessions.start` called only once. This
  is the strongest evidence in-scope — it runs the real controller against
  real Postgres, not mocks.
- **Status minimization / no false paid claims:** the controller reads only
  `evidence.state` and maps to a 3-value enum; it never inspects or forwards
  `settlement`, `fulfillment`, `paymentReference`, or session data on the
  `/status` route. Both the unit test and the composed test assert the
  serialized response excludes `must-not-expose*`/`paymentReference`/session
  fixtures. Unknown/unhandled evidence states fall through to
  `awaiting_payment`, a fail-safe default rather than an implicit "paid".
- **Transport bounds:** outer buffer capped at 100000 bytes *before* parsing
  (bounds `auth` size too, since it isn't separately capped); decoded body
  capped at 65536; `payloadBase64` schema max (87384) is consistent with the
  65536-byte cap at base64 inflation (~4/3). Order is: size → JSON.parse →
  strict schema → decode/canonical check → admit — no attacker-controlled
  parsing happens before the cheapest checks.
- **Error sanitization:** the catch-all maps known `PaymentDomainError` codes
  to specific statuses (400/401/403/409), uses a `code.includes('conflict')`
  substring match plus explicit Postgres `23505` handling for 409 (so newly
  named conflict errors from the session/store layer, e.g.
  `stored_session_request_conflict`, are caught without needing an
  allowlist edit), and defaults everything else — including raw
  `Error('private ...')` — to a bare 503. Confirmed no leakage of error
  messages in the sanitization test.
- **Rate/concurrency limiter:** window reset, active-slot ceiling, and
  double-release guard (`released` flag) are all exercised directly; the
  429 branch returns before the `try/finally`, so `release()` is never
  double-invoked for a rejected acquire.
- **`no-store` on every response path**, including 404/405/413/429/503,
  since `response()` sets it unconditionally and the manual 429 branch
  copies it forward.

## Non-blocking observations (do not need action for this scope)

- The controller calls `store.acceptAttempt(attempt)` directly before
  `issueStatusCapability`, and `sessions.start()` calls `acceptAttempt` again
  internally. This looks redundant but is actually required: the capability
  must reference an already-durably-committed attempt, and capability
  issuance must precede the provider dispatch inside `start()`. The composed
  Postgres test exercises this exact double-call path successfully, so it's
  confirmed correct, just worth knowing it's intentional rather than an
  oversight if it's ever "cleaned up."
- The 429 branch constructs two `this.response(429, …)` objects to merge
  headers. Harmless (no double side effects), just slightly wasteful; a
  one-line simplification if anyone is in that code for other reasons.

## Not reopened (per accepted dependencies / explicit out-of-scope)

Admission/Store/Sessions internals, quote-issuance trust boundary, real
HTTP listener/TLS/streaming limits, WordPress-side guest ownership and nonce
freshness on retry, and gateway-level header/body preservation are unchanged
here and were not re-audited, consistent with the request's scope boundary.
