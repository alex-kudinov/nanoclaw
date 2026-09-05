# NC-20260905-007 bounded capacity disposable-proof review R1

## Objective

Review the migration-142/143 combined disposable proof and the small hook
refactor to the previously reviewed enrollment verifier. Report only material
defects that could weaken target safety/cleanup, make the base proof lie, accept
the wrong failure, miss a migration-143 ownership/relationship/occupancy defect,
or overstate rollback/reapply/residue evidence.

Write:
`docs/reports/NC-20260905-007-CLAUDE-CAPACITY-PROOF-RESPONSE-R1.md`

## Accepted facts and boundaries

- `scripts/verify-student-enrollment-disposable.mjs` was corrected and reviewed
  under NC-20260905-006: all child processes pin `/tmp:5432`, ambient `PG*` is
  stripped, the server address must be local, names are generated-prefix and
  new-only, expected failures are reason-matched, no roles are created/altered,
  and cleanup is in `finally`.
- This task adds an extension context with only pinned-database execute,
  execute-file, reason-matched failure, scalar, and assertion methods. SQL files
  are restricted to the tracked migration directory.
- Migration 142 applies first. Migration 143 applies only through extension
  hooks, is removed before migration-142 rollback, and is similarly
  reapplied/removed during the base reapply phase.
- All rows are synthetic. No production, `nanoclaw_business`, real student,
  provider, roster, payment, cohort, runtime, deployment, or communication
  access is authorized.
- Migration 143 remains unapplied outside disposable databases.

## Allowed files

Read only:

1. this request;
2. `scripts/verify-student-enrollment-disposable.mjs`;
3. `scripts/verify-student-enrollment-disposable.d.mts`;
4. `scripts/verify-academy-capacity-disposable.mjs`;
5. `src/academy-capacity-disposable-verifier.test.ts`;
6. `data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql`;
7. `data/business/migrations/nanoclaw-v2/rollback_143_academy_capacity_dark.sql`.

Write only the named response. No Bash, web, MCP, database, environment,
credential, or other file access.

## Claims to challenge

1. Hook refactoring cannot alter the base proof's target pinning, expected
   failure semantics, cleanup, or base migration order.
2. Extension SQL files cannot escape the tracked migration directory.
3. Shape proof covers seven capacity tables, one view, seven sequences,
   `nanoclaw_admin` ownership, zero non-admin table/sequence grants, and the
   deliberately not-yet-validated assignment delivery-block FK.
4. Synthetic data proves two delivery blocks/pools, multiple offers sharing one
   pool, live versus expired versus consumed reservations, stable waitlist
   state, and view arithmetic before and after the migration-142 assignment.
5. Reason-matched refusals prove one-pool-per-block, one-current-assignment per
   enrollment/block, order/seat composite integrity, waitlist approval/receipt
   constraints, and populated migration-143 rollback.
6. Failed populated rollback retains capacity evidence.
7. Empty rollback 143 removes only capacity structures and leaves the
   enrollment foundation intact; an auxiliary synthetic mismatch order is
   removed before the base proof resumes.
8. Migration 143 reapplies over the base reapply and rolls back empty before
   migration 142 rolls back; the generated database is always removed.
9. Returned proof flags correspond to observed assertions and do not claim
   production/runtime behavior.

## Current proof

- Typecheck: pass.
- Focused verifier/migration tests: 24/24.
- Actual local PostgreSQL 16.15 run with poisoned parent `PG*`: all enrollment
  and capacity flags true; seven capacity tables/sequences, one view, five
  reason-matched capacity refusals, assignment-plus-reservation projection,
  consumed-reservation exclusion, populated/empty rollback, and reapply passed.
- Exact generated-prefix database residue: zero before and after.

## Required response

Return a concise verdict and material findings with exact evidence and smallest
correction. If none exist, say exactly `NO MATERIAL FINDINGS` and list the
load-bearing checks performed.
