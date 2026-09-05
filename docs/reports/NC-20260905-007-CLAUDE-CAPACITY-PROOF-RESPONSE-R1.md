# NC-20260905-007 bounded capacity disposable-proof review R1 — response

## Verdict

Material finding. Claim 7 ("empty rollback 143 removes only capacity
structures and leaves the enrollment foundation intact") is false as
currently coded. A secondary, smaller completeness gap affects claim 8/9's
residue evidence for the capacity script's own CLI entry point. All other
challenged claims (1–6, and the remainder of 8–9) hold under inspection.

## Finding 1 (material): capacity-rollback TRUNCATE CASCADE silently deletes a migration-142 row

**Where:** `scripts/verify-academy-capacity-disposable.mjs:268-278`, inside
`verifyCapacityBehavior`:

```js
context.execute(`
  TRUNCATE
    business_v2.academy_capacity_events,
    business_v2.academy_waitlist_offers,
    business_v2.academy_waitlist_entries,
    business_v2.academy_capacity_reservations,
    business_v2.academy_seat_pool_offers,
    business_v2.academy_seat_pools,
    business_v2.academy_delivery_blocks
  RESTART IDENTITY CASCADE
`);
```

**Root cause:** `data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql:211-215`
adds `student_class_assignments_delivery_block_fk`, a (`NOT VALID`) foreign
key from the migration-142 table `business_v2.student_class_assignments` onto
`business_v2.academy_delivery_blocks`. `NOT VALID` only skips validating
pre-existing rows at creation time; the constraint is fully registered in
`pg_constraint` and is enforced for `TRUNCATE`'s dependency check like any
other FK. Because `academy_delivery_blocks` is in the `TRUNCATE ... CASCADE`
list and `student_class_assignments` is not, PostgreSQL automatically pulls
`student_class_assignments` into the same truncate to preserve referential
integrity — deleting the fixture row `assignment:fixture:m1` created by the
base script's `insertSyntheticChain` (`scripts/verify-student-enrollment-disposable.mjs:426-434`).
Without `CASCADE`, this same statement would instead raise "cannot truncate a
table referenced in a foreign key constraint," so the current code cannot
avoid one of these two outcomes with the FK as written.

**Why it's material:** the extension's own comments and the request's claim 7
assert the capacity rollback path touches "only capacity structures" and
"leaves the enrollment foundation intact." It does not — it reaches back into
a 142 table via the 143 FK and deletes a row, silently, via CASCADE rather
than an explicit, asserted statement. No test in either file checks
`student_class_assignments` row count immediately after this TRUNCATE or
before it, so the deletion is currently unobservable from the proof's output.
The overall proof still returns `ok: true` only because the base script's own
`truncateSyntheticRows` (`scripts/verify-student-enrollment-disposable.mjs:529-549`)
independently re-truncates the same (already-emptied) table two steps later
in the base flow — the correct final state is reached by accident of
sequencing, not because the capacity rollback path is isolated from
migration-142 data as claimed.

**Smallest correction:** make the cross-migration deletion explicit and
assertable instead of an implicit CASCADE side effect. Replace the single
`TRUNCATE ... CASCADE` with:

```js
context.execute(`
  DELETE FROM business_v2.student_class_assignments
   WHERE delivery_block_key IN (
     SELECT delivery_block_key FROM business_v2.academy_delivery_blocks
   );
  TRUNCATE
    business_v2.academy_capacity_events,
    business_v2.academy_waitlist_offers,
    business_v2.academy_waitlist_entries,
    business_v2.academy_capacity_reservations,
    business_v2.academy_seat_pool_offers,
    business_v2.academy_seat_pools,
    business_v2.academy_delivery_blocks
  RESTART IDENTITY;
`);
context.expectScalar(
  `SELECT count(*) FROM business_v2.student_class_assignments`,
  '0',
  'class assignment coupled to truncated delivery block removed before capacity rollback',
);
```

and rewrite the surrounding claim/comment to state that clearing capacity
evidence also removes any 142 class assignment coupled to a deleted delivery
block via the 143 FK, rather than claiming full isolation from the
enrollment foundation.

## Finding 2 (minor): capacity script's CLI entry point has no residue self-check

**Where:** `scripts/verify-academy-capacity-disposable.mjs:345-350` (`main`).

The base script's `main()` (`scripts/verify-student-enrollment-disposable.mjs:624-630`)
independently re-checks `databaseExists(database)` after the run and throws
if the disposable database still exists, in addition to the `finally`-block
`dropDatabase`. `runAcademyCapacityDisposableProof`'s own `main()` has no
equivalent check, and `databaseExists` is not exported for it to reuse. This
does not weaken cleanup itself (the same `dropDatabase`-in-`finally` from the
base function still runs), but it means the "exact generated-prefix database
residue: zero before and after" evidence in the current proof cannot have
come from the capacity script's own CLI the way it can for the base script —
it must have been confirmed externally. Smallest correction: export
`databaseExists` from `verify-student-enrollment-disposable.mjs` and add the
same post-run check to the capacity script's `main()`.

## Claims confirmed with no defect

- Claim 1: hook points (`afterEnrollmentMigration`, `afterSyntheticChain`,
  `afterEnrollmentReapply`) are optional callbacks invoked at fixed points in
  the unchanged base sequence; target pinning (`/tmp:5432`), `childEnvironment`
  allowlist, expected-failure matching, and the `finally`-block cleanup are
  untouched by the extension mechanism.
- Claim 2: `assertMigrationFile` resolves and prefix-checks against
  `data/business/migrations/nanoclaw-v2` and requires a `.sql` extension;
  both `executeFile` and `expectFileFailure` route through it.
- Claim 3: shape checks match the migration exactly — 7 `academy_%` tables,
  1 view, 7 `academy_%_id_seq` sequences, zero non-`nanoclaw_admin` owners/
  grants, and `convalidated='false'` for `student_class_assignments_delivery_block_fk`.
- Claim 4: two delivery blocks/pools (`sep`, `oct`); two offers
  (`acc-full`, `acc-pcc-full`) share `pool:fixture:sep`; held-unexpired
  (`checkout`, `waitlist`) vs. held-expired (`expired`) vs. later `consumed`
  reservations are distinguished correctly by the view's
  `state='held' AND expires_at > now()` filter; waitlist entry state is
  untouched throughout; pre-assignment `0|2|2|1|open` and post-assignment
  `1|2|1|1|open` both match the view's arithmetic against capacity 4.
- Claim 5: all five reason-matched refusals map to real constraints added by
  143 (`academy_seat_pools.delivery_block_id` UNIQUE; partial unique index
  `student_class_assignments_current_enrollment_block_uniq`; composite FK
  `(order_id, seat_id)`; `academy_waitlist_offers` approval/receipt CHECKs;
  rollback's evidence-count guard), and each `expectFailure`/`expectFileFailure`
  regex matches PostgreSQL's actual error text for that constraint type.
- Claim 6: the populated-rollback check (`academy_seat_pools` count `= 2`)
  runs immediately after `expectFileFailure(ROLLBACK, ...)` and before the
  destructive TRUNCATE in Finding 1, so it correctly observes retained
  evidence.
- Claim 8 (ordering): 143 reapply → shape check → 143 empty rollback all run
  inside `afterEnrollmentReapply`, which fires after the base script's 142
  reapply/shape-check and before its final 142 rollback — order is correct.
  `dropDatabase` is unconditional in the base function's `finally`, so the
  generated database is removed on every exit path (subject to Finding 2's
  narrower self-check gap).
- Claim 9: returned flags (`capacityTables: 7`, `capacityViews: 1`,
  `capacitySequences: 7`, `capacityConstraintRefusals: 5`, and the boolean
  flags) each correspond to an assertion actually executed in this run; none
  assert production or runtime behavior.

## Load-bearing checks performed

- Traced the full call sequence of `runStudentEnrollmentDisposableProof` merged
  with the three extension hook invocations, in execution order, against both
  scripts.
- Verified every `expectFailure`/`expectFileFailure` regex against the
  PostgreSQL error text its triggering statement would actually produce, and
  matched each to the specific constraint in `143_academy_capacity_dark.sql`.
- Checked `TRUNCATE ... CASCADE` semantics against the FK PostgreSQL adds in
  143 (`student_class_assignments_delivery_block_fk`), including the
  `NOT VALID` qualifier's actual scope (skips historical validation only, not
  ongoing enforcement or CASCADE participation).
- Verified the `v_academy_seat_pool_occupancy` view definition against every
  expected numeric tuple in both seed and behavior checks.
- Verified `assertMigrationFile`'s path containment against both files it is
  called with (`MIGRATION`, `ROLLBACK` from the capacity script).
- Diffed `main()` in both scripts for cleanup/residue-check parity.
