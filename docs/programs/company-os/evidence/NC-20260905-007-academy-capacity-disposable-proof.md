# NC-20260905-007 — Academy capacity disposable PostgreSQL proof

Date: 2026-09-05

Program: `program:company-os` charter 1.0.0

Work item: `work:academy-capacity-disposable-schema-proof`

## Authority and lineage

The owner authorized implementation after accepting the capacity architecture
and asked to proceed. This slice combines capacity foundation tip `b7b95824`
with corrected enrollment-verifier tip `01351538`. The accepted decision is
synthetic and local only. Production `nanoclaw_business`, real students,
providers, Student Roster, payments, cohorts, runtime, deployment, and
communications remained outside authority.

## Combined verifier

`scripts/verify-academy-capacity-disposable.mjs` extends the reviewed migration-
142 runner through fixed, frozen hooks. Migration files are confined to the
tracked migration directory; database creation, `/tmp:5432` pinning, stripped
ambient `PG*`, generated-name refusal, reason-matched failure handling, and
`finally` cleanup remain centralized in the base verifier.

The combined proof:

- applies 142 before 143;
- checks seven capacity tables, one view, seven sequences, `nanoclaw_admin`
  ownership, zero non-admin grants, and the expected `NOT VALID` assignment FK;
- maps two offers to one delivery-block seat pool and keeps a second pool
  independent;
- distinguishes unexpired checkout/waitlist holds, an expired manual hold, a
  consumed reservation, and an assignment without double-counting;
- reason-matches duplicate pool, duplicate current assignment, mismatched
  order/seat, unapproved waitlist-send, and populated rollback failures;
- verifies populated rollback retains both pools;
- explicitly deletes the synthetic class assignment coupled to the capacity
  delivery block, clears capacity rows in FK order, and asserts that enrollment
  orders remain before empty rollback;
- reapplies and rolls back 143 inside 142's reapply sequence, then completes
  142 rollback and drops the generated database;
- independently checks the exact generated database is absent before reporting
  CLI success.

## Live synthetic result

The final verifier ran with poisoned parent `PGHOST`, `PGPORT`,
`PGDATABASE=nanoclaw_business`, and a dummy password. Those values were not
inherited by PostgreSQL children. Local PostgreSQL 16.15 returned:

```json
{"ok":true,"serverVersion":"16.15 (Homebrew)","tables":13,"views":1,"syntheticChains":1,"expectedConstraintRefusals":3,"populatedRollbackRefused":true,"emptyRollbackPassed":true,"reapplyPassed":true,"databaseRemoved":true,"capacityTables":7,"capacityViews":1,"capacitySequences":7,"capacityConstraintRefusals":5,"assignmentPlusReservationProjection":true,"consumedReservationExcluded":true,"capacityPopulatedRollbackRefused":true,"capacityEmptyRollbackPassed":true,"capacityReapplyPassed":true}
```

Exact generated-prefix residue was zero before and after.

## Review

Claude Sonnet/high R1 found that `TRUNCATE ... CASCADE` silently deleted the
migration-142 assignment through migration 143's FK and that the capacity CLI
lacked its own residue readback. The implementation now uses explicit,
asserted assignment deletion plus FK-ordered capacity deletion and exports the
base residue check for the capacity CLI. Bounded R2 returned
`NO MATERIAL FINDINGS`.

- R1: 7 model calls; 97,247 cache-create; 345,987 cache-read; 28,531 output;
  105,813 maximum context tokens.
- R2: 7 model calls; 84,339 cache-create; 399,595 cache-read; 11,571 output;
  92,905 maximum context tokens.

## Verification

- Focused verifier/migration tests: 25/25.
- Pinned Node typecheck and build: pass.
- Formatting, documentation continuity/capability, and diff checks: pass.
- Full root: 3,531 passed / 32 skipped / two exact predecessor failures: the
  CNPC wrapper-literal assertion and date-sensitive Trafft freshness fixture.
- Poisoned-environment disposable PostgreSQL proof: pass.
- Database residue: zero.

## Boundary and next gate

Only uniquely generated local databases and synthetic rows existed, and they
were removed. No cluster role, production database, external provider, real
record, runtime, customer message, or live cohort changed. The next candidate,
read-only reconciliation of schedule/offer/payment/roster evidence, remains a
separate owner gate; production migration and every write/integration stage are
later independent gates.
