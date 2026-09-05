# NC-20260905-007 bounded capacity disposable-proof review R2 — response

## Verdict

`NO MATERIAL FINDINGS`. Both corrections hold under inspection; no regression
of the R1-confirmed claims.

## Checks performed

- **Correction 1 (explicit cross-migration cleanup).**
  `scripts/verify-academy-capacity-disposable.mjs:272-290` no longer contains
  `TRUNCATE`/`CASCADE`. It runs an explicit
  `DELETE FROM business_v2.student_class_assignments WHERE delivery_block_key
  IN (SELECT delivery_block_key FROM business_v2.academy_delivery_blocks)`
  first, asserts `student_class_assignments` count `= 0` immediately after,
  then issues seven ordered `DELETE` statements against the capacity tables
  (`academy_capacity_events`, `academy_waitlist_offers`,
  `academy_waitlist_entries`, `academy_capacity_reservations`,
  `academy_seat_pool_offers`, `academy_seat_pools`,
  `academy_delivery_blocks`). I traced this order against every FK in
  `data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql`
  (`academy_seat_pool_offers.pool_id`, `academy_capacity_reservations.pool_id`,
  `academy_waitlist_entries.pool_id`, `academy_waitlist_offers.entry_id` /
  `pool_id` / `reservation_id`, and
  `student_class_assignments_delivery_block_fk`): each table is deleted only
  after every table that references it has already been cleared, so no
  statement in the batch relies on `CASCADE` or would fail as written.
  `rollback_143_academy_capacity_dark.sql`'s evidence-count guard sums exactly
  these seven tables, so `context.executeFile(ROLLBACK)` at line 291 now
  succeeds on its own merits, not by accident of the base script's later
  `truncateSyntheticRows`. Post-rollback, `student_enrollment_orders` is
  asserted `= 2` (line 298-302) with the label "enrollment order foundation
  retained after capacity rollback" — it does not claim the coupled assignment
  row remains, matching the request's boundary. This closes R1 Finding 1
  without reintroducing the silent-CASCADE deletion.

- **Correction 2 (capacity CLI residue self-check).** `databaseExists` is
  exported from `scripts/verify-student-enrollment-disposable.mjs:198-203`
  and declared in `scripts/verify-student-enrollment-disposable.d.mts:4`.
  `scripts/verify-academy-capacity-disposable.mjs:6-10` imports it;
  `main()` (lines 357-365) captures the exact generated name once via
  `generatedDisposableDatabaseName()`, runs the proof, then throws
  `disposable database residue detected after cleanup` if
  `databaseExists(database)` is still true — the same pattern as the base
  script's `main()` (lines 623-629). This closes R1 Finding 2.

- Re-verified the full `runStudentEnrollmentDisposableProof` /
  `runAcademyCapacityDisposableProof` execution order end to end against the
  new code (migration 142 → 143 apply/shape/seed → synthetic chain → capacity
  behavior/refused-populated-rollback/explicit-cleanup/empty-rollback →
  142 refused-populated-rollback → 142 truncate/rollback/reapply → 143
  reapply/shape/rollback (`verifyCapacityReapply`) → final 142
  rollback/uninstall) to confirm the correction did not disturb sequencing,
  the 142 truncate step (which now truncates an already-empty
  `student_class_assignments`), or the reapply path's own 143 rollback (no
  evidence seeded on reapply, so it succeeds independently of Finding 1's
  fix).
- Confirmed no `TRUNCATE` string remains anywhere in
  `scripts/verify-academy-capacity-disposable.mjs` (grep, zero matches),
  consistent with `src/academy-capacity-disposable-verifier.test.ts`'s
  `expect(source).not.toContain('TRUNCATE')` assertion and its checks for the
  new "capacity-coupled class assignment explicitly removed..." and
  "enrollment order foundation retained..." labels.
- Re-checked that none of the R1-confirmed claims (2-6, 8-9) are touched by
  either diff; both corrections are localized to the deletion mechanism and
  the capacity CLI's `main()`.
