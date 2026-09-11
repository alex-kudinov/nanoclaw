# Review response — R1

Scope: the 6 files named in REQUEST-R1.md only. No store internals
(`payment-store.ts`), no `payment-domain.ts`, no shell/build run.

## Verdict

**Safe to run the TEST proof command.** One material finding below is a
service-level liveness/correctness defect, not a payment-safety, key-leak, or
false-ready defect, and it cannot trigger inside the proof script's own
single-shot 30-minute-quote run. Fix before wiring `PaymentSessionService` to
any real caller.

## Material finding: retry horizon outlives the quote it belongs to

**Where:** `payment-session-service.ts:45` (`start()`), interacting with
`adyen-session-adapter.ts:65-66` and `:82`.

**What:** `start()` always calls `prepareSession` with a hardcoded
`retryWindowMs: 24 * 60 * 60 * 1000`, independent of the attempt's actual
quote window. `buildAdyenTestSessionRequest` sends
`new Date(attempt.quote.expiresAt).toISOString()` as the Adyen session
`expiresAt`, and only checks that this is ≤24h *after `attempt.createdAt`* —
not that it's still in the future relative to when the request is actually
sent. Every fixture provided (adapter test, service excerpt, verify script)
uses a 30-minute quote window (`now + 1800000`), far shorter than the 24h
retry horizon.

`docs/PAYMENT-DOMAIN.md` states this directly: "Ambiguous results reuse that
operation within a configured horizon strictly below seven days; **the
adapter must choose a shorter horizon where required**." The service does
not do this — it always uses the maximum allowed horizon regardless of the
quote's own, much shorter, validity window.

**Reproducer:**
1. `service.start(attempt)` with `quote.expiresAt = now + 1800000`, first
   provider call fails/times out → `{ state: 'pending' }` (store persists the
   operation with `retryWindowMs = 24h`).
2. At `t = 31min` (quote already expired, well inside the 24h store
   window), caller calls `service.resume(attempt)`. `buildAdyenTestSessionRequest`
   builds a request with an `expiresAt` already in the past and sends it to
   Adyen. Either Adyen rejects it (non-2xx → `provider_outcome_unknown`) or
   returns a session whose `expiresAt` the adapter itself rejects
   (`expiry <= Date.now()` at `adyen-session-adapter.ts:139`) — both map to
   `pending` again.
3. Every subsequent `resume()` up to `t ≈ 24h` repeats step 2: the caller
   keeps seeing `pending`, which reads as "retryable," with no way to
   distinguish it from a transient provider hiccup. Only once the store's own
   24h horizon lapses does the lease flip to `reconcile`.

No false-ready, no duplicate charge, no key/session leak results from this —
it fails closed — but it is a concrete violation of the documented "adapter
must choose a shorter horizon" rule and produces a checkout attempt that is
silently dead for up to 24h instead of failing fast.

**Smallest fix:** bound the retry window by the quote's own window at
`payment-session-service.ts:45`:

```ts
retryWindowMs: Math.min(
  attempt.quote.expiresAt - attempt.createdAt,
  24 * 60 * 60 * 1000,
),
```

Optional, non-blocking follow-up: short-circuit `resume()` to `{ state: 'failed' }`
when `attempt.quote.expiresAt <= Date.now()`, so an already-dead quote
doesn't spend a network round trip against Adyen on every poll.

## Checked, no defect found

- **Request/scope/amount/return safety** — `buildAdyenTestSessionRequest`
  pins provider/environment/endpointRegion/store directly and enforces
  merchant/company equality indirectly (re-running `validateAttempt` with
  `routing.scope` substituted and comparing serialized output), rejects
  non-null-`store`, non-https/non-localhost origins, credentials-in-origin,
  non-`/`-rooted or cross-origin/search/hash return paths, and quotes with
  a >24h window from creation. Amount uses the quote's own integer minor
  units, never recomputed. Matches all rejection cases in
  `adyen-session-adapter.test.ts`.
- **Retry/idempotency correctness** — `operationId`/`idempotencyKey` are both
  pinned to `attemptId` and never regenerated; no code path invents a new key,
  drops the key, or switches provider on an unknown outcome, satisfying the
  "no false-ready on provider/DB failure" requirement in both directions:
  adapter failure or session-expiry mismatch → `finishDispatch(..., result:
  'unknown')` → `pending` (never `checkout_ready`); and if the
  `session_available` `finishDispatch` write itself throws (post-provider-
  success DB failure), the exception propagates uncaught rather than
  returning `checkout_ready` — exactly the path exercised by "does not report
  ready after a result-persistence failure" in `SERVICE-TEST-EXCERPT.md`, and
  the following `resume()` recovers with the same key (no second logical
  session).
- **Session expiry validation** — adapter rejects provider responses whose
  `expiresAt` is unparsable or already past; service additionally rejects a
  provider `expiresAt` later than the quote's own `expiresAt`
  (`payment-session-service.ts:74-80`), so the provider can't silently extend
  a session past what the quote authorized.
- **Reused sessions and config drift** — `resume()`'s `lease.request !==
  expectedRequest` guard only applies to the not-yet-dispatched path; the
  `reuse_session` branch returns an already-committed session without
  re-diffing it against the request built from current routing config. This
  matches the documented and tested intent ("existing attempts retain their
  provider even if new-offer routing is disabled") and is backstopped by
  `store.acceptAttempt`'s immutable-identity check (forged-quote rejection,
  proven in `SERVICE-TEST-EXCERPT.md`), which is out of scope here per the
  accepted store review. Not treated as a defect.
- **Key/token protection** — API key lives only in a private field and the
  `X-API-Key` header, never in the request body, never logged; idempotency
  key is regex-validated (`^[A-Za-z0-9_-]{1,64}$`) before use in a header.
  `verify-adyen-test-session-store.ts` never writes the API key, session
  data, SQL connection details, or raw provider payloads to stdout/stderr in
  either its success or failure path — only phase, call counts, statuses, and
  a `sha256` of the session id.
- **Bounded transport** — fixed TEST endpoint constant (no caller-controlled
  URL), `redirect: 'error'` (no open-redirect/SSRF via 3xx), 15s
  `AbortSignal.timeout`, and `readBoundedJson` caps the response body at
  128 KiB, always cancels the reader in `finally`. All non-2xx/malformed/
  oversized/timeout outcomes fail closed to `provider_outcome_unknown`
  without exposing the response body, matching the parameterized cases in
  `adyen-session-adapter.test.ts`.
- **TEST proof isolation and cleanup** — the script hard-requires
  `TANDEM_ADYEN_TEST_ENVIRONMENT === 'test'` plus exact known merchant/
  store/origin before doing anything; verifies the Postgres connection is
  local (`inet_server_addr() IS NULL`, i.e. Unix socket) before creating a
  disposable, regex-validated `nc_payment_disposable_<pid>_<hex>` database;
  runs all work under `SET LOCAL ROLE nanoclaw_admin`; and calls `pool.end()`
  before `DROP DATABASE ... WITH (FORCE)`, then re-queries `pg_database` to
  confirm removal. Confirms encrypted-at-rest by asserting the stored
  `encrypted_request`/`encrypted_response` do not contain the raw
  `sessionData`. `providerCalls === 1` after pool-reopen-and-resume is the
  correct proof that the second `service.resume()` reused the session rather
  than dispatching again.

## Minor, non-blocking observation

If `DROP DATABASE` "succeeds" but the post-drop existence check still finds
the row, the thrown `Error('generated database cleanup failed')` is raised
from inside the outer `finally` block, which overrides the function's normal
completion — the script exits via an unstructured uncaught exception rather
than the file's own `{ error, phase, providerCalls, providerStatuses,
paymentAttempted: false }` JSON shape used everywhere else. No secret is in
that message, so this doesn't create a leak, just an inconsistency in the
"minimized proof only" output discipline. Not worth blocking on given how
narrow the trigger condition is (a `FORCE` drop that reports success but
leaves the row behind).
