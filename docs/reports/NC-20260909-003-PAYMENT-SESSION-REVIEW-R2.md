# Review response — R2

Scope: RESPONSE-R1.md, `payment-store.ts` (`prepareSession`, `acquireDispatch`),
`payment-store-disposable.test.ts` (retry-boundary tests), and
`payment-session-service.ts` only.

## Verdict

**ACCEPTED.**

## Verification of the R2 claim

- `prepareSession` computes `retryUntil: Math.min(now + input.retryWindowMs,
  attempt.quote.expiresAt)` (`payment-store.ts:174-177`), where `now` is the
  DB's `clock_timestamp()` fetched inside the same transaction
  (`payment-store.ts:74-79`), not a caller-supplied or `createdAt`-derived
  value. This strictly dominates the R1-proposed service-side fix
  (`Math.min(quote.expiresAt - createdAt, 24h)`): that relative calculation is
  computed once, before the DB write, so any delay between `attempt.createdAt`
  and the actual `prepareSession` transaction would still push the absolute
  `retryUntil` past `quote.expiresAt` by that delay. Clamping with live DB
  time inside the transaction closes that gap — confirmed correct.
- `payment-session-service.ts:45` still passes the hardcoded
  `retryWindowMs: 24 * 60 * 60 * 1000` unchanged; the fix lives entirely in
  the store's clamp, which is sufficient since every caller of
  `prepareSession` (only `start()` in this codebase) now gets a `retryUntil`
  that can never exceed `attempt.quote.expiresAt` regardless of what window it
  requests.
- Replay path (`payment-store.ts:154-164`) returns the stored row unchanged
  on a matching re-`prepareSession` call — no recomputation, no extension.
  Confirmed by `disposable.test.ts:454-482` ("clamps session retries..."):
  first call with `retryWindowMs: 86400000` persists `retryUntil ===
  a.quote.expiresAt`; `decidePaymentOperationRecovery` at that timestamp
  returns `reconcile`; a replay with `retryWindowMs: 2 * 86400000` still
  returns the original `retryUntil` — not extended.
- Short-window behavior is preserved: `disposable.test.ts:418-431`
  ("reconciles after the original retry deadline...") still uses
  `retryWindowMs: 1` and reconciles almost immediately, proving a
  shorter-than-quote requested window is honored, not stretched to the quote's
  full remaining lifetime.
- `acquireDispatch` (`payment-store.ts:226-244`) evaluates
  `decidePaymentOperationRecovery` and returns on `reconcile`/`stop` before
  any lease is granted — same decision path used by the new regression test,
  so the store-level fix and the dispatch gate are consistent.
- The `resume()` guard at `payment-session-service.ts:66` (`if
  (lease.decision !== 'dispatch') throw ...`) is unreachable at runtime: the
  four preceding branches (`busy`, `reconcile`, `stop`, `reuse_session`) cover
  every non-`dispatch` member of the `PaymentDispatch` union
  (`payment-store.ts:53-62`). It's a TypeScript narrowing artifact, not a
  behavior change — confirmed by inspection of the union and the branch
  order.

## No remaining material issues found

Within the files in scope, the fix eliminates the R1 defect (retry horizon
outliving its quote) without reopening any of R1's other accepted findings —
idempotency-key pinning, lease fencing, encrypted-response handling, and the
`reuse_session`/forged-quote paths in `payment-session-service.ts` and
`payment-store.ts` are untouched by this change.

Not independently re-verified in this pass (out of the allowed file set):
`payment-domain.ts` (`decidePaymentOperationRecovery`,
`preparePaymentOperation` internals) and the "root and CLI TypeScript checks
use strict mode" claim. Neither is implicated by the retry-horizon fix itself.
