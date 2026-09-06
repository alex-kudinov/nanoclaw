# NC-20260906-005 — bounded implementation review response R3

## Verdict

**MATERIAL FINDINGS.**

## Finding 1 (blocking) — no server-side sold-out rejection at checkout; `reserve_session_capacity` is neutralized without a replacement gate

`NC-20260906-005-TANDEMWEB-IMPLEMENTATION-R3.patch`, `class-stripe-checkout.php`
hunk `@@ -339,4 +339,14 @@`:

```php
private function reserve_session_capacity(...): ?WP_REST_Response {
    $simple_sync = ...;
    if ($simple_sync) {
        return null;
    }
    if (empty($product['capacity_managed']) || ...) {
        return null;
    }
```

Before this patch, `reserve_session_capacity` both validated and reserved: it
was the single call site checkout relied on to reject a sold-out cohort. With
simple sync enabled, the function now unconditionally returns `null` —
"proceed, no hold" — for every `capacity_managed` product, with no
replacement check of any kind. Nothing else in the diff calls
`Tandem_Cohort_Capacity::status()`/`validate()`/`is_unavailable()` from the
checkout path. The live-option read added in `class-cohort-capacity.php`
(`live_status()`, lines 264-278) is fully wired for the *display* side
(`status()` at lines 52-89) but has no caller on the *checkout* side.

This contradicts the converged R2 contract directly:

- `NC-20260906-005-CLAUDE-PLAN-CORRECTION-RESPONSE-R2.md:108-110`: "remove the
  reservation call sites ... replacing the pre-checkout gate with a
  `status()`/`validate()` check only" — a check was required to replace the
  removed reservation, not a bare `return null`.
- `NC-20260906-005-CLAUDE-PLAN-CORRECTION-RESPONSE-R2.md:132-134` (acceptance
  test): "Checkout on a live-option `sold_out` pool is rejected server-side
  with the old reservation/hold code paths fully removed."

As shipped, once `tandem_capacity_simple_sync_enabled` is turned on, checkout
accepts payment for a cohort already showing `sold_out` on the page — for any
number of buyers, not just a narrow race. This is the exact regression the
task's non-objective list guards against implicitly by requiring "ACC
September 7 and MCS Friday sold out" to be preserved: turning the flag on
breaks that guarantee at the point of sale, even though the display side
still correctly shows `sold_out`.

**Smallest correction:** in `reserve_session_capacity`, when `$simple_sync` is
true, call `Tandem_Cohort_Capacity::status($session['cohort_program'],
$session['cohort_start'])` (or `is_unavailable()`) and return a rejecting
`WP_REST_Response` (e.g. 409, `capacity_sold_out`) when the live status is
unavailable; only fall through to `return null` (no hold, proceed) when it is
`open`/`available`.

## Finding 2 — automated `commit_seat` has no retry on version conflict; a paid seat's commitment can be permanently denied

`src/academy-capacity-sale-ingress.ts:41-52` reads `pool_version` in a plain
`SELECT` outside any transaction, then calls
`executeAcademyCapacityOperatorCommand` once with that value as
`expectedPoolVersion`. Inside the operator store,
`lockForCommand`'s default branch (`src/academy-capacity-operator-store.ts:497`,
used for `commit_seat`) takes `FOR UPDATE` on the pool row *after* that stale
read, then `reserveCapacity` calls `assertVersion` against the
already-captured value. A second concurrent sale on the same pool that
acquires the row lock second will see a pool version incremented by the
first, so its stale `expectedPoolVersion` mismatches and raises
`stale_version` — which is in `REVIEW_CODES`
(`academy-capacity-operator-store.ts:222`), so the case is recorded as a
terminal `denied` result, not retried.

Because the operator case is keyed by a deterministic `caseKey` derived from
the PaymentIntent id (`website-sale:${identity}`,
`academy-capacity-sale-ingress.ts:81`), that denial is permanent for this
payment: the case-lookup path in
`executeAcademyCapacityOperatorCommand` (the `existing.rows[0]` replay branch)
returns the same recorded `denied` result on any future call with the same
case key, so nothing will ever retry it automatically. The only caller,
`stripe-payment-host.ts:596-614`, invokes `recordAcademyCapacityWebsiteSale`
exactly once per successful charge and, on any non-`'applied'` result, only
logs `needs_review` — confirmed by
`src/academy-capacity-sale-ingress.test.ts`, which asserts `execute` is
called exactly once and has no version-conflict/retry case.

Net effect: two Stripe payments settling for the same pool at nearly the same
moment (most likely exactly when a cohort nears its capacity threshold, the
highest-stakes case for this feature) can leave one fully-paid sale with no
committed-seat record at all, requiring silent manual reconciliation. This
violates the stated guarantee "one successful mapped website sale ...
creates one durable committed seat" and undermines "over-capacity sale
truth" — the ledger under-reports a seat that was actually sold, rather than
truthfully reflecting an oversell.

**Smallest correction:** in `recordAcademyCapacityWebsiteSale`, on a `denied`
result with code `stale_version`, re-run the pool lookup query and retry
`execute` a small bounded number of times (e.g. 3) before surfacing
`needs_review`.

## Other R2/R3 items checked — no correction needed

- Migration 145's third CHECK disjunct (`channel = 'commitment' AND
  expires_at <= created_at + interval '3 years'`,
  `145_academy_capacity_simple_sync.sql:194-200`) resolves the R2 load-bearing
  issue; the engine enforces the exact delivery-block-end rule via the
  `input.expiresAt !== block.endsAt` check in `reserveCapacity`
  (`src/academy-capacity.ts:801-805`), matching R2's accepted option (a).
- Rollback correctly refuses to run while `commitment` reservations,
  publication rows, or simple-sync operator cases exist
  (`rollback_145_academy_capacity_simple_sync.sql:307-329`).
- One-seat idempotency for `commit_seat`: the `${channel}:${idempotencyKey}`
  replay key (`src/academy-capacity.ts:853-875`) correctly returns the same
  commitment on a duplicate PaymentIntent, and the outer operator-case
  idempotency (`caseKey`/`requestSha256`) is a second, consistent layer.
- Pool/commitment/assignment locking for `transfer_commitment` and
  `reconcile_commitment` correctly takes `FOR UPDATE` on both pools and the
  commitment row (and the assignment row for reconcile) before validating
  versions (`academy-capacity-operator-store.ts:367-404, 474-487`).
- `persistDelta`'s reservation UPDATE (parameterized `pool_id` move on
  transfer) and seat-pool UPDATE have correct `$n`-to-array parameter mapping
  — verified by direct read of the current file, not just the diff context.
- Publication revision/hash/retry: WordPress `handle_status` correctly
  rejects a lower revision (409 `stale_capacity_status`) and only acks on
  accept; the host batch worker recomputes and compares `payload_sha256`
  before sending, and retries with exponential backoff capped at 6h
  (`academy-capacity-publication.ts:1474-1591`).
- Targeted purge/prewarm: `SITE_PATHS` in
  `academy-capacity-publication.ts:1217-1224` and `PAGE_MAP` in
  `class-capacity-status-sync.php:42-52` list the identical fixed URLs.
- HMAC verification (`verify_request`) checks both static key equality and an
  HMAC-SHA256 of the body; it has no timestamp/nonce, so a captured payload
  could be replayed, but the monotonic revision check makes any replay a
  no-op or a rejected stale write — not material given the payload carries no
  customer data and no destructive action.
- `scripts/set-academy-capacity-publication.mjs`: release-pin, host-confirm,
  mode-0600 source file, and atomic write-then-rename are all present.

## Scope note

Both findings are limited to the three named artifacts. I did not open
`class-cohort-capacity.php`'s pre-existing (unmodified) checkout call sites
outside the shown hunks, or any other Tandemweb file, per the review's
non-objectives.
