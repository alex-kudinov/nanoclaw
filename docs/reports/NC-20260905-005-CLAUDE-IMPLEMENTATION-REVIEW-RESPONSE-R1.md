# NC-20260905-005 bounded implementation review R1 — response

## Verdict

`NO MATERIAL FINDINGS`

## Load-bearing checks performed

1. **Duplicate occupancy (commit path).** `commitClassAssignment` blocks a
   second `pending`/`active` assignment for the same `enrollmentKey` +
   `deliveryBlockKey` before calling `assignClass`
   (`src/academy-capacity.ts:1123-1134`), independent of `assignClass`'s own
   narrower `entitlementKey` + `deliveryBlockKey` check
   (`src/student-enrollment-foundation.ts:1552-1563`). SQL enforces the same
   invariant directly with
   `student_class_assignments_current_enrollment_block_uniq` on
   `(enrollment_id, delivery_block_key) WHERE state IN ('pending','active')`
   (migration 143 line 217-219). Runtime and SQL agree.

2. **Duplicate occupancy (transfer path).** `transferClassAssignment` does
   *not* repeat the enrollment-level duplicate check before writing the
   destination assignment; it relies solely on `assignClass`'s
   `entitlementKey`-scoped check. I traced whether this is reachable: the
   destination's `entitlementKey` is always the origin's own entitlement
   (`src/academy-capacity.ts:1401-1412`), `entitlement.componentKey` must
   equal `destinationBlock.componentKey` (`component_conflict` check, line
   1347-1351), and `materializeEnrollment` enforces that `componentKey` is
   unique per enrollment across the entitlements it creates together
   (`src/student-enrollment-foundation.ts:1432-1442`) and never mutates
   `componentKey` afterward (verified: no other write path touches it). A
   second entitlement for the same enrollment sharing that `componentKey`,
   and therefore capable of colliding with the transfer's destination block,
   cannot exist under the reviewed foundation's command set. Not exploitable
   given the current foundation invariants — noted, not reported as a
   defect.

3. **Reservation replay vs. stale version.** In `reserveCapacity`,
   `commitClassAssignment`, `releaseReservation`, `closeSeatPool`,
   `reopenSeatPool`, and `resolveWaitlistOffer`, the exact-idempotent-replay
   branch is always checked before `assertVersion`, so replay succeeds
   independent of a caller's stale expected version while any non-identical
   reuse of the same key still hits `assertVersion`/`idempotency_conflict`.
   Confirmed for each command.

4. **Last-seat arithmetic.** `showInventory`'s `reserved` count already
   excludes `held` reservations whose `expiresAt <= atMs`
   (`reservationIsLive`, line 654-661), so `reserveCapacity`'s
   `available < 1` gate is correct even though the stale-hold expiry
   bookkeeping loop runs after that gate. No seat can be double-issued from
   an unexpired-looking snapshot.

5. **Atomicity of mutating commands.** Every mutating command (`reserve`,
   `release`, `commit`, `transfer`, `withdraw`, `close`, `reopen`, `join`,
   `stage`, `resolve`) validates against the untouched input state and only
   calls `copyCapacity`/`copyEnrollment` (both `structuredClone`) once all
   checks pass; `transferClassAssignment`'s intermediate clone used to mark
   the origin `transferred` before calling `assignClass` is discarded on
   throw and never returned, so a rejected transfer leaves both input
   aggregates provably unchanged (also confirmed by the exact-replay/
   `toEqual` assertions in `src/academy-capacity.test.ts:270-299`,
   `508`, `564`, `618`, `703-704`, `889-903`).

6. **Transfer/withdrawal scope.** `transferClassAssignment` only mutates
   `ClassAssignment` records (plus `EnrollmentHistory`) via the same
   `assignClass` command and hand-built `EnrollmentHistory` entries; it
   creates no capacity-owned student/order/entitlement record.
   `withdrawClassAssignment` only sets the assignment to `cancelled` and
   appends history — it does not touch `orders`, `agreements`,
   `obligations`, or `enrollments.state` (verified against
   `src/academy-capacity.ts:1444-1543` and confirmed by the test at
   `src/academy-capacity.test.ts:511-545`, which asserts the enrollment
   stays `active`).

7. **Enrollment exceptions block assignment/transfer.**
   `hasBlockingEnrollmentException` is invoked in `commitClassAssignment`
   (line 1111-1122) and `transferClassAssignment` (line 1352-1363) against
   `open`/`acknowledged` exceptions on order/seat/enrollment/entitlement
   keys; not invoked in `withdrawClassAssignment`, which the design does not
   require to be blocked.

8. **Reservation TTL/reason rules.** `assertReservationTtl` caps `checkout`
   at 30 minutes and `manual`/`waitlist_offer` at 7 days
   (`src/academy-capacity.ts:706-724`); `manual` requires a non-blank
   `reason`; `waitlist_offer` requires `reason === 'waitlist_offer'`. SQL's
   `CHECK` constraints on `academy_capacity_reservations` (migration 143
   lines 114-120) impose the identical bounds and reason rules. Agree.

9. **FIFO/one-active-offer/approval-before-outreach.**
   `stageWaitlistOffer` selects strictly by `(joinedAt, sequenceNumber,
   entryKey)` (line 1838-1843) and refuses a second active offer per pool
   via `ACTIVE_WAITLIST_OFFER_STATES` (line 1823-1833), matching the SQL
   partial unique index `academy_waitlist_offers_one_active_pool_uniq ...
   WHERE state IN ('staged','approved','sent','accepted')`.
   `resolveWaitlistOffer` requires `approvalEvidenceSha256` before
   `approved`/`sent`/`accepted` and `deliveryReceiptSha256` before `sent`
   (line 1985-2009), matching SQL's `CHECK` on `approval_evidence_sha256`/
   `delivery_receipt_sha256`. Terminal outcomes (`declined`/`expired`/
   `cancelled`) release the reservation and free capacity; `converted`
   consumes it via `commitClassAssignment`'s waitlist-offer branch
   (line 1141-1150, 1194-1217).

10. **SQL composite-key integrity.** Verified `UNIQUE (pool_id, id)` on both
    `academy_capacity_reservations` and `academy_waitlist_entries` backs the
    composite `FOREIGN KEY (pool_id, reservation_id)` /
    `(pool_id, entry_id)` on `academy_waitlist_offers`, and the added
    `UNIQUE (order_id, id)` on `student_enrollment_seats` backs
    `academy_capacity_reservations`'s `(order_id, seat_id)` FK. No
    orphaned composite relationship is representable.

11. **Validation bound parity (runtime vs. SQL).** Cross-checked every
    `assertKey`/`assertText`/`assertSha`/`assertPositiveInteger` bound in
    `src/academy-capacity.ts` against the corresponding `CHECK` constraint
    in migration 143 (key patterns, `capacity` 1-10000, hash regex,
    idempotency/reason/close-reason 1-500, timezone 1-100, source-object-id
    1-300, delivery-block key/pool key/mapping key/reservation key/entry
    key/waitlist-offer key 1-250, component/offer/source-scope key 1-200).
    All runtime bounds are equal to or tighter than SQL; none is looser.

12. **Rollback and least privilege.** `rollback_143_academy_capacity_dark.sql`
    refuses whenever any of the seven migration-143 tables has a row, then
    drops only the FK, the new unique index, the view, migration-143's seven
    tables, and reverses the one `student_enrollment_seats` constraint it
    added — it issues no `DROP` against any `student_*` (migration-142)
    table. The migration's `DO` blocks grant all seven tables, the view, and
    their sequences only to `nanoclaw_admin` with an explicit `REVOKE ALL ...
    FROM PUBLIC`.

13. **Dark/unwired.** `src/academy-capacity.ts` has no import of a database
    driver, provider client, filesystem, network, clock, or RNG API; all
    inputs (keys, timestamps, versions, evidence hashes, actors) are
    caller-supplied.
