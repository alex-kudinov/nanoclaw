# NC-20260906-005 — Claude architecture review response R1

## 1. Verdict

**AGREE WITH CORRECTIONS.**

The owner-accepted direction is implementable as a small extension of the
already-live Gate D capacity engine, not as new machinery. Most of the needed
primitives (`reserveCapacity`, `releaseReservation`, the operator-store
case-key idempotency/outbox pattern) already exist and need only narrow
generalization. Three corrections are required before implementation: the
existing manual-hold TTL cap does not fit a "committed sale" fact, the
publication design must not touch `cohorts.json`, and `commit_seats` cannot be
issued from inside the Capacity container under the current fail-closed
boundary.

## 2. Material design findings

### 2.1 Most of the required command surface already exists — no new gate needed

`src/academy-capacity.ts` already implements `reserveCapacity` (manual channel,
`src/academy-capacity.ts:726-913`) and `releaseReservation`
(`src/academy-capacity.ts:915-995`), and `academy-capacity-operator-store.ts`
already provides case-keyed idempotency, advisory locking, and a two-receipt
(`requested`/`final`) audit trail per command
(`src/academy-capacity-operator-store.ts:1330-1483`), plus a `REVIEW_CODES`
set that already routes `capacity_unavailable` and `stale_version` to
`needs_review` instead of hard failure
(`src/academy-capacity-operator-store.ts:151-175`). This is the exact
idempotency/outbox machinery design questions 3 and 6 ask for — it does not
need to be built. `commit_seats` and `release_commitment` are best implemented
as a generalization of the existing `reserve_manual`/`release_reservation`
operator commands, not as new engine primitives.

### 2.2 The existing manual-hold TTL does not fit a committed sale

`assertReservationTtl` caps every non-checkout channel (including `manual`) at
7 days (`src/academy-capacity.ts:706-724`). `ACADEMY-CAPACITY-CONTROL-PLANE.md:167-170`
describes manual holds as covering "invoices, checks, sponsor lists, and other
legitimate commitments before participant materialization is complete" — but
`docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:36-37` states Gate D authorizes no
Student Roster/roster-projection cutover, and `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:110-111`
confirms roster-row count does not substitute for occupancy. Given Student
Roster remains the assignment authority and its update cadence is manual and
unscheduled, a paid seat or an invoiced seat can legitimately wait longer than
7 days for its roster row. A 7-day cap on the record that is supposed to hold
that seat's place would silently expire the commitment and re-open a seat that
was already sold. This directly conflicts with "preserve a small accepted race
risk instead of building airline inventory" (packet, owner-accepted direction)
— a *false* re-opening from TTL expiry is a worse failure mode than the
accepted double-booking race, because it is systematic, not a race.

The existing `wordpress/.../class-cohort-capacity.php:191-217` `commit()`
method already establishes the exact right precedent: a checkout hold with a
short TTL is converted on payment success into a "committed" record with an
effectively permanent TTL (`now + 370 days`), never re-checked against a
short window again. The NanoClaw capacity engine should adopt the identical
pattern rather than reusing the 7-day manual-hold cap for committed sales.

### 2.3 Design question 2 answer: one commitment relation, and it should not be an assignment

`commitClassAssignment` (`src/academy-capacity.ts:997-1219`) requires an
existing `enrollmentKey`/`entitlementKey` pair from the enrollment foundation
— i.e., a materialized `student_enrollment` bound to a resolved participant
Party. A Stripe webhook's exact name/email/cohort metadata is not that record;
`docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:32-33` states Stripe/payment/invoice
evidence "must not be assumed to be the student," and full Bookkeeper/party
resolution automation is explicitly out of scope for this task (packet,
candidate implementation boundary). Creating a pending `class_assignment`
immediately from a website success would require crossing that boundary.

Recommendation: use **one** commitment relation for both channels — a
capacity reservation (not an assignment) distinguished only by `sourceScope`/
`reason` metadata (`website_stripe_sale`, `invoice`, `check`, `sponsor`,
`manual_sale`), never by a second data model. Materialization into a real
`class_assignment` continues to happen later, manually, through the
already-authorized `commit_class_assignment` command once Student Roster
confirms identity — this is unchanged from Gate D and requires no new
authority.

### 2.4 `change_capacity` does not exist; `commit_seats`/`release_commitment` do not need new engine code

`configureSeatPool` (`src/academy-capacity.ts:439-534`) only sets capacity
once, at version 0; there is no function to change capacity on an existing,
open pool. A small new function is needed, structurally identical to
`closeSeatPool`/`reopenSeatPool` (`src/academy-capacity.ts:1546-1673`):
version-checked, evidence-hashed, event-appended, idempotent-by-replay.

`release_commitment` needs no new function — it is exactly
`releaseReservation`, already exposed as the `release_reservation` operator
command (`src/academy-capacity-operator-store.ts:43-50`). Naming it
`release_commitment` in the operator command union is cosmetic; do not
duplicate the underlying engine call.

### 2.5 `commit_seats` cannot originate inside the Capacity container

`docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:254-257` is explicit: "The Capacity
container has no database credential, Bash, provider tool, general message
tool, or network authority." A Stripe-webhook-triggered commit must therefore
be a **host-side** IPC handler (the existing pattern is
`src/classify-ipc-handlers.ts`), not a Capacity-minion action. The webhook
event must reach the host asynchronously; the packet's own boundary text
("A successful sale event may be asynchronous after Stripe success; checkout
itself must remain independent of NanoClaw") matches the n8n shadow-relay
pattern Tandemweb already uses for checkout-recovery events
(`class-stripe-checkout.php:60-64`, `:951-957`,
`TANDEM_CHECKOUT_RECOVERY_URL`/`_INGRESS_SECRET`). Reuse that relay pattern
with its own HMAC ingress secret rather than adding a second bespoke
webhook-forwarding mechanism.

### 2.6 Publication must not touch `cohorts.json` or the checkout reservation contract

`cohorts.json`'s `status` field is load-bearing for `reserve()`'s live-seat
math together with `snapshot.occupied_seats` and the two payment-hash arrays
(`class-cohort-capacity.php:105-149`). A second writer touching only `status`
risks disagreeing with the file's own internal accounting, and two
independent writers risk a file-write race — the file has no locking
discipline visible in the reviewed code. `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:232-234`
already states this JSON/option system "remain[s] the public safety layer"
until a separately authorized Gate E cutover.

Recommendation: publish to a **new, separate, small** WordPress option keyed
by pool, decoupled from `cohorts.json`, carrying only display state. Checkout
enforcement (`is_unavailable()`, `validate()`, `reserve()`/`commit()`) stays
exactly as it is today, untouched and unaffected by a NanoClaw publication
outage — a genuine benefit of not merging the two systems, and it directly
satisfies "the failure must be visible and retryable" without ever putting
checkout availability behind NanoClaw's uptime.

### 2.7 State-vocabulary mismatch: 3 engine states vs. 4 site states, and Q5 asks for 2

`showInventory` (`src/academy-capacity.ts:663-704`) returns `publicState` in
`{open, sold_out, closed}`. `SOPs/CLASS-CAPACITY-MANAGEMENT.md:14-19` defines
four site states including `waitlist_offer_pending`, which has no analogue in
the engine's type. Design question 5 asks for a publication payload of only
`available`/`sold_out`. This is resolvable by a pure display-side mapping
(`open → available`, `sold_out → sold_out`, `closed → sold_out`) that never
changes engine semantics — an explicit operator closure stays internally
reason-coded and auditable, it is simply not distinguished from `sold_out` on
the public badge. This mapping should be written down once, in the
publication endpoint, and nowhere else.

### 2.8 Existing production fact is consistent with, not a bug in, this design

The packet states ACC September 7 is `21/12 sold_out` — occupied already
exceeds nominal capacity. `showInventory` computes `occupied` from active
`class_assignment` rows with no cap, so this is expected: occupancy is a
running historical fact, not bounded by `capacity`. Any new `commit_seats`
call against that pool will correctly hit `capacity_unavailable`
(`src/academy-capacity.ts:849-853`), which the operator store already routes
to `needs_review` rather than silently failing — the correct behavior when a
late-arriving payment lands on an already-full pool. This must produce an
operator-visible alert (mirroring the `[ALERT]` pattern already used in
`class-stripe-checkout.php:2037-2041` for the same scenario on the Tandemweb
side) rather than a silently swallowed review row.

## 3. Smallest recommended state model and event transitions

No new state machine is required; the existing one is extended, not replaced.

- **Seat pool occupancy** (unchanged formula, `src/academy-capacity.ts:104-108`):
  `available = max(0, capacity - occupied - reserved)`, where `occupied` comes
  from `class_assignment` rows (unaffected by this work) and `reserved` now
  also includes long-lived committed-sale reservations.
- **`commit_seats`** = `reserveCapacity()` with `channel: 'manual'`,
  `reason` ∈ `{website_stripe_sale, invoice, check, sponsor, manual_sale}`,
  `idempotencyKey` = Stripe PaymentIntent ID or invoice/case reference,
  `sourceEvidenceSha256` = hash of the sale/invoice evidence, and an
  extended-but-bounded `expiresAt` (see §7.1) instead of the current 7-day
  manual cap.
- **`release_commitment`** = `releaseReservation()` with outcome
  `released`/`cancelled` (refund, void, decline) — unchanged engine call,
  new operator-facing name only.
- **`change_capacity`** = new `changeSeatPoolCapacity()`, structurally
  parallel to `closeSeatPool`: version-checked, evidence-hashed, appends
  `seat_pool_capacity_changed`; rejects a new capacity below current
  `occupied + reserved` (must go through `close_seat_pool` instead, keeping
  "explicit operator closure is reason-coded and distinct from derived
  sold_out," `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:119-121`, intact).
- **Materialization** into a real seat (Student Roster confirmed): unchanged
  — an operator later runs the existing `commit_class_assignment`, which
  consumes the reservation atomically (`src/academy-capacity.ts:1171-1184`).
  No double count is possible because the reservation moves from `reserved`
  to `occupied` in the same transaction that creates the assignment.
- **Publication**: derived read-only from the existing `publicState`
  (`open`/`sold_out`/`closed`), mapped to two values per §2.7. No new
  publish-state machine — only a transition *detector* (§4.3).

## 4. Exact NanoClaw and Tandemweb changes

### 4.1 `src/academy-capacity.ts`

- Extend `assertReservationTtl` (or add a sibling `assertCommitmentTtl`) so a
  manual reservation carrying a `reason` in the committed-sale set gets a
  materially longer cap (owner decision, §7.1) instead of the current 7-day
  ceiling used by `src/academy-capacity.ts:718`.
- Add `changeSeatPoolCapacity(state, input)`: same shape as `closeSeatPool`
  (`src/academy-capacity.ts:1546-1603`), version-checked against
  `expectedPoolVersion`, rejects `capacity < occupied + reserved`.

### 4.2 `src/academy-capacity-operator-store.ts`

- Add `commit_seats` and `change_capacity` to the `CapacityOperatorCommand`
  union (mirroring the existing `reserve_manual`/`reconcile_pool` shapes,
  `src/academy-capacity-operator-store.ts:25-105`), and dispatch them in
  `applyCommand` (`:1179-1300`) to the new/extended engine functions.
  `release_commitment` can be an alias of the existing `release_reservation`
  command type — do not fork the code path.
- No change is required to the case-key idempotency, advisory locking, or
  receipt-readback logic (`:1330-1483`) — it already covers the new command
  types by construction.

### 4.3 New, small publication tracking (Postgres, `business_v2`)

Add one narrow table, e.g. `academy_capacity_publications` (`pool_key`,
`last_published_public_state`, `last_published_pool_version`,
`last_published_at`, `last_ack_sha256`). A host-side worker (same shape as
the existing `hive-sync-reaper.ts` 15-minute retry cron, per project memory)
scans pools whose current `publicState` (via `readAcademyCapacityInventory`,
`src/academy-capacity-operator-store.ts:1485-1539`) differs from
`last_published_public_state`, POSTs the signed payload, and updates the
tracking row only on a signed WordPress ack. The daily reconciliation job
enqueues every managed pool once per day; because the comparison is against
`last_published_public_state`, an unchanged day is a no-op against
WordPress — one idempotent path serves both the threshold-triggered and the
daily case, per design question 6.

### 4.4 New host-side IPC handler

A `commit_seats` IPC handler (same shape as `src/classify-ipc-handlers.ts`)
that receives the relayed Stripe success event and calls
`executeAcademyCapacityOperatorCommand('capacity', { type: 'commit_seats',
caseKey: 'stripe:' + paymentIntentId, ... })`. This runs host-side only, per
§2.5 — the Capacity container is never in this path.

### 4.5 Tandemweb — no changes to existing capacity-relevant files

`class-cohort-capacity.php`, `class-stripe-checkout.php`'s
`reserve_session_capacity`/`release_session_capacity`/`commit_session_capacity`
(`:340-384`), and `cohorts.json`'s schema are unchanged. Add:

- A new authenticated REST endpoint (reuse the existing `verify_api_key`/
  `X-Tandem-Key` pattern from `class-program-calendar.php:455-457`, or a
  dedicated key — see §7.5) that accepts the signed publication payload and
  writes the new, separate WordPress option.
- A calendar-card display hook that reads that option (not `cohorts.json`)
  to render the sold-out badge, additive to the existing
  `acc_calendar_actions()` sold-out branch (`class-program-calendar.php:357-365`)
  — or feeding the same branch an OR of both signals, operator's call.
- Reuse `tools/update-calendars.sh`'s exact-URL LiteSpeed purge
  (`:83-104`) and its `cf-purge.sh` call for the same fixed `PAGES` list,
  triggered by the publication worker instead of (or in addition to) the
  daily cron.

## 5. Failure, retry, idempotency, cache, security, and rollback behavior

- **Idempotency**: two layers, both already built. Reservation-level
  `${channel}:${idempotencyKey}` replay (`src/academy-capacity.ts:800-822`)
  prevents a duplicate Stripe retry from creating two reservations for one
  PaymentIntent. Command-level `case_key` replay
  (`src/academy-capacity-operator-store.ts:1343-1386`) prevents a duplicate
  n8n relay delivery from re-running the whole command.
- **Failure without blocking checkout**: because publication is a separate
  WordPress option, a NanoClaw outage cannot affect checkout accept/reject —
  only the freshness of the display badge. This satisfies "retain the sale
  over blocking checkout" for free.
- **Retry**: publication failures stay queued in
  `academy_capacity_publications` until a signed ack; the existing
  `hive-sync-reaper.ts`-style cron pattern provides backoff without new
  infrastructure design.
- **Late-arriving payment against a full pool**: `capacity_unavailable`
  → `needs_review` (already true, §2.8) must also raise an operator-visible
  alert; do not let it sit silently in `needs_review` with no notification
  path.
- **Cache**: purge only the exact URLs already enumerated in
  `tools/update-calendars.sh:86-95`, via the existing targeted LiteSpeed and
  Cloudflare purge calls. Never call a blanket cache/object-cache flush —
  doing so would also drop the unrelated `tc_checkout_*` transients and
  `tc_cohort_*` reservation options that the live checkout race-guard depends
  on (`class-cohort-capacity.php:98-217`), which would be a self-inflicted
  outage.
- **Security**: the publication endpoint must be authenticated and its
  payload signed and revision-checked (monotonic `poolVersion`) so a replayed
  or stale payload cannot flip a badge backward; no PII in the payload per
  the packet's own requirement, which the reservation/pool data already
  satisfies (no participant fields are present in `AcademySeatPool`/
  `AcademyCapacityReservation`).
- **Rollback**: unchanged from `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md:259-265`
  — disable the newest writer (the publication worker and the `commit_seats`
  IPC handler) first; never delete canonical reservations/events; WordPress
  simply stops receiving new badge updates and checkout is unaffected because
  it never reads the new option.

## 6. Focused acceptance tests and live verification

- Duplicate Stripe webhook delivery for the same PaymentIntent produces one
  reservation, not two (reservation-level idempotency replay).
- Duplicate n8n relay delivery of the same sale event produces one operator
  case result, replayed on the second call (`case_key` idempotency).
- `commit_seats` against a pool with `available = 0` (e.g. the existing
  21/12 ACC September 7 pool) returns `needs_review`/`capacity_unavailable`
  and produces an operator-visible alert, not a silent drop.
- `change_capacity` rejects a new capacity below `occupied + reserved`; a
  reduction to something ≥ that sum succeeds and moves `publicState`
  correctly when it crosses zero available.
- A committed-sale reservation created today is still live and still counted
  in `reserved` when checked after the current 7-day manual cap would have
  expired it — proves the TTL correction actually took effect.
- Publication is a no-op when `poolVersion` changes but `publicState` does
  not (e.g. occupied 3→4 while still `open`); publication fires exactly once
  per genuine `open ↔ sold_out` crossing.
- WordPress rejects a publication payload with a stale/lower `poolVersion`
  than its last accepted one.
- Purge verification: after a publication-triggered purge, confirm only the
  fixed `PAGES` list URLs were purged (log diff against
  `tools/update-calendars.sh`'s list) and that `tc_checkout_*`/`tc_cohort_*`
  options/transients are untouched.
- Live verification: trigger one real (or sandboxed) invoice `commit_seats`
  against a non-production-critical pool, confirm the new WordPress option
  updates, confirm the exact-URL purge log, confirm the calendar badge
  changes within the expected latency, and confirm `cohorts.json`-driven
  checkout enforcement is byte-for-byte unaffected before/after.

## 7. Items requiring another owner decision

1. **Committed-sale TTL value.** §2.2 recommends adopting the existing
   370-day precedent from `class-cohort-capacity.php:204,215` rather than the
   current 7-day manual cap. The owner should confirm the exact bound (or
   confirm that a bounded-but-long TTL, versus a true non-expiring record, is
   acceptable — the reservation model's `expiresAt`/`reservationIsLive` check
   requires *some* end time; a genuinely non-expiring commitment would need a
   different representation than a reservation).
2. **Committed-seat transfer before materialization.** `transferClassAssignment`
   (`src/academy-capacity.ts:1236-1442`) only operates on existing
   `class_assignment` rows. Moving an invoice-committed but not-yet-assigned
   seat between pools/dates has no atomic primitive today. Recommend a
   two-step release+reserve for v1 given class sizes are small (owner's
   "small accepted race risk" principle); confirm this is acceptable or
   authorize a small new atomic `transfer_commitment` primitive.
3. **`channel` column storage type.** Not visible in the reviewed artifact
   set (the migration files were out of scope for this review). If
   `business_v2.academy_capacity_reservations.channel` is a Postgres enum or
   CHECK constraint rather than free text, reusing the existing `'manual'`
   value (as recommended) avoids any migration; introducing a new channel
   value instead would require one. Confirm which applies before
   implementation.
4. **Publication endpoint authentication scope.** Reuse the existing
   `X-Tandem-Key`/`TANDEM_API_KEY` used by the calendar-refresh endpoints
   (`class-program-calendar.php:455-457`), or mint a narrower dedicated key
   for this new endpoint. Least-privilege favors a dedicated key; this is a
   secrets-provisioning decision, not an architecture one.
5. **Badge behavior during a publication outage.** §5 establishes that
   checkout is unaffected, but whether the display badge should freeze at
   its last known value, show a neutral "please check availability" state,
   or something else during an extended outage is a product/UX decision
   outside this review's scope.
