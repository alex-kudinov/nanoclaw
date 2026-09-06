# NC-20260906-005 — Claude architecture correction response R2

## Verdict

**AGREE WITH MATERIAL CORRECTION.**

## Load-bearing issue

Migration 143 gates `channel` with two separate CHECK constraints, not one:

1. `channel CHECK (channel IN ('checkout', 'manual', 'waitlist_offer'))`
   (`143_academy_capacity_dark.sql:88`).
2. A compound two-way OR binding `expires_at` to `channel`
   (`143_academy_capacity_dark.sql:116-120`): `checkout` → `expires_at <=
   created_at + 30 minutes`; `manual`/`waitlist_offer` → `expires_at <=
   created_at + 7 days`.

R2's "Fixed owner choices" says only "migration adds the checked `commitment`
value" — that covers constraint 1 but not 2. A `channel='commitment'` row
matches neither disjunct of constraint 2, so it is rejected by Postgres
unconditionally: the first `commit_seats`/`reserveCapacity({channel:
'commitment'})` call fails with a CHECK violation regardless of engine-level
correctness. The bound R2 specifies for commitments — delivery-block end (a
value on `academy_delivery_blocks.ends_at`, a different table reached through
`pool_id`) — also cannot be expressed as a same-table CHECK the way the
existing two branches are.

Required correction: the migration must also add a third disjunct to
constraint 2. Either (a) a generous fixed ceiling (e.g. `interval '2 years'`)
as a DB-level sanity backstop, with the TS engine enforcing the exact
delivery-block-end rule (`assertReservationTtl`, `src/academy-capacity.ts:706-724`,
extended with a `commitment` branch — the function already has the block
object available via `state.deliveryBlocks[pool.deliveryBlockKey]` at line
826), or (b) a constraint trigger joining to `academy_delivery_blocks`. Either
is acceptable; the plan as written under-specifies this and a literal
implementation of "add the checked value" alone breaks on the first insert.

## Other R2 claims verified against source — no correction needed

- `commit_class_assignment` is confirmed absent from `CapacityOperatorCommand`
  (`src/academy-capacity-operator-store.ts:25-105`) and exists only as the
  engine function `commitClassAssignment` (`src/academy-capacity.ts:997`). R2
  correction #2 is accurate.
- Migration 143's channel CHECK is exactly `checkout|manual|waitlist_offer`
  and the 7-day cap applies to `manual`/`waitlist_offer`
  (`143_academy_capacity_dark.sql:88,116-120`). R2 correction #3 is accurate.
- `class-cohort-capacity.php`'s `status()`/`validate()`/`reserve()` (lines
  52-217) are self-contained today — they read only `cohorts.json`, with no
  external hook. R2's plan to make `status()`/`validate()` read a live option
  first, falling back to `cohorts.json`, is a genuine code change to a file R1
  said would stay untouched — correctly reversing R1 §4.5.
- `releaseReservation` (`src/academy-capacity.ts:915-994`) is channel-agnostic
  — aliasing `release_commitment` to it is safe.
- `commitClassAssignment` (`src/academy-capacity.ts:997-1219`) atomically
  creates the assignment and consumes the reservation in one call; there is no
  existing "consume an already-created assignment" primitive. `reconcile_commitment`
  as R2 describes it (consume only, do not create) is genuinely new engine
  code, matching R2's own framing ("a new `reconcile_commitment` command").
- `transferClassAssignment` (`src/academy-capacity.ts:1236-1442`) only
  operates on existing `class_assignment` rows — `transfer_commitment` is
  correctly scoped as new work, not a reuse.
- `TANDEM_API_KEY`/`X-Tandem-Key` today is a plain header-equality check
  (`class-program-calendar.php:2596-2605`), not an HMAC key. Reusing it as an
  HMAC key is a new but explicit, owner-approved usage; it does not conflict
  with existing code.

## Non-blocking scope note

`reconcile_commitment`'s trigger condition ("when an exact assignment later
exists") has no currently authorized creation path: `commit_class_assignment`
is explicitly out of scope for this task (R2 correction #2), and
`work:academy-capacity-minion-operator-workflow`'s hard boundary explicitly
excludes assignment/capacity-authority cutover (`docs/ACTIVE-WORK.md:216-219`).
Every `commitment` reservation will sit `held` until a separately gated
Student-Roster/Gate F task adds an assignment-creation path. This matches the
layered-gating pattern already used across this project and is not a defect —
noted only so acceptance tests do not assume `reconcile_commitment` is
end-to-end reachable within this task's release.

## Exact file and acceptance-test map

**NanoClaw**
- New migration (forward + rollback): add `commitment` to both the channel
  CHECK and the `expires_at` compound CHECK per the correction above; no other
  schema change needed — `reason`/`source_scope`/`idempotency_key`/`state`
  columns already fit a commitment row.
- `src/academy-capacity.ts`: extend `ReservationChannel`/`RESERVATION_CHANNELS`
  (lines 11, 192) with `'commitment'`; extend `assertReservationTtl` (706-724)
  with a commitment branch bound to the pool's delivery-block `endsAt` +
  grace; add `changeSeatPoolCapacity` (parallel to `closeSeatPool`); add
  `reconcileCommitment` (consume-only) and `transferCommitment` (locks
  origin+destination, atomic move, version bump on both pools).
- `src/academy-capacity-operator-store.ts`: add `commit_seats`,
  `change_capacity`, `reconcile_commitment`, `transfer_commitment` to
  `CapacityOperatorCommand` (25-105) and dispatch in `applyCommand`;
  `release_commitment` aliases `release_reservation` (R1 §4.2, unchanged).
- New host-side IPC handler (shape of `src/classify-ipc-handlers.ts`) for the
  Stripe/Contador success ingress, extending `tools/contador/process-payment.cjs`'s
  already-verified PaymentIntent/cohort-metadata path (`process-payment.cjs:509,840`)
  — needs an explicit Stripe-product → `offerKey`/`catalogRevision` → `pool_key`
  mapping step not present in that file's roster-cohort-label resolver today.
- New publication outbox table + host worker (R1 §4.3, unchanged by R2).

**Tandemweb**
- `class-cohort-capacity.php`: `status()`/`validate()` (52-89) gain a
  live-option read ahead of the `cohorts.json` fallback; `reserve()`/`release()`/`commit()`
  (98-217) become dead code once checkout stops calling them.
- `class-stripe-checkout.php`: remove the reservation call sites at 1341,
  1376, 1401, 1408, 1546, 1563, 2033, 2259 after parity tests, replacing the
  pre-checkout gate with a `status()`/`validate()` check only.
- `class-program-calendar.php`: new authenticated endpoint reusing
  `verify_api_key` (2596-2605) plus HMAC-body verification; a calendar-card
  read of the new option.
- `tools/update-calendars.sh` lives in a different repo/worktree than
  NanoClaw's host process — the publication worker must call the WordPress
  `purge-cache` REST endpoint and Cloudflare purge directly over HTTP with the
  same fixed `PAGES` list (86-95), not shell out to this script.

**Acceptance tests** (in addition to R1 §6, unchanged)
- Insert a `channel='commitment'` reservation with `expires_at` at
  delivery-block end + grace — succeeds against the corrected CHECK
  constraints (proves the load-bearing fix above).
- Duplicate `commit_seats` with the same PaymentIntent idempotency key
  produces one commitment, replayed on the second call.
- `transfer_commitment` against a full destination pool is refused
  atomically; origin reservation is untouched.
- `change_capacity` reduction below `occupied + reserved` (including live
  commitments) is refused.
- `Tandem_Cohort_Capacity::status()`/`validate()` return the live-option value
  when present and fall back to `cohorts.json` when the option is absent or
  the feature flag is off.
- Checkout on a live-option `sold_out` pool is rejected server-side with the
  old reservation/hold code paths fully removed (no `tc_cohort_*` option
  created).
- A publication payload with a stale/lower revision is rejected by
  WordPress; the ack hash is recorded only on accept.
- Purge log after a publication-triggered flip contains only the fixed
  `PAGES` list URLs, verified by calling the WordPress endpoints directly
  rather than through `update-calendars.sh`.
