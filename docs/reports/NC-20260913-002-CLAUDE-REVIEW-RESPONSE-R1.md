# NC-20260913-002 bounded D1 persistence review — response (R1)

## Finding 1 (material): resolution decisions can carry a dangling candidate reference for `ambiguous` / `not_found` / `conflict`

**File/mechanism:** `data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`,
`business_v2.identity_resolution_decisions`, constraint `identity_resolution_target_chk`
(lines ~311–322).

The four branches of this CHECK are supposed to pin `party_id`/`candidate_id`/
`resolution_basis` exactly per `result`, matching the protected invariant "exact
resolution result/basis/Party coupling." Three of the four branches do this
correctly (`resolved_*` pins `candidate_id IS NULL`; `staged_candidate` pins
`candidate_id IS NOT NULL`; `ignored_stale` pins `candidate_id IS NULL`). The
`ambiguous`/`not_found`/`conflict` branch is missing the `candidate_id IS NULL`
clause that the other non-`staged_candidate` branches all carry:

```sql
(result IN ('ambiguous', 'not_found', 'conflict') AND party_id IS NULL
  AND resolution_basis IS NULL) OR
```

**Failure path:** an insert with `result='conflict'` (or `ambiguous`/`not_found`)
may set `candidate_id` to any existing `identity_candidates.id` — including one
from a completely unrelated provider/environment/scope — and the row still
satisfies every constraint in the table (the FK only checks the row exists; the
resolution guard trigger only recomputes `evidence_sha256`, it does not check
`candidate_id` scope agreement). This lets a `conflict`/`ambiguous` decision
misrepresent itself as bound to a specific staged candidate it has no actual
relationship to, which is exactly the class of forbidden state the exact-coupling
invariant exists to prevent. The verifier's 16 reason-matched refusals do not
exercise this path, so the "16 reason-matched refusals" evidence does not cover it.

**Smallest correction:** add the missing clause so the branch matches its
siblings:

```sql
(result IN ('ambiguous', 'not_found', 'conflict') AND party_id IS NULL
  AND candidate_id IS NULL AND resolution_basis IS NULL) OR
```

**Test:** add one `expectFailure` case to
`verifyConstraintRefusals` in `scripts/verify-tandem-identity-d1-disposable.mjs`
inserting a `result='conflict'` row with a non-null `candidate_id` and asserting
rejection (bumping the documented refusal count from 16 to 17), plus a
corresponding assertion in `src/identity-control-plane/d1-migration.test.ts`
that the migration text pins `candidate_id IS NULL` in that branch.

## Checked, no further material findings

Reviewed all other CHECK constraints and triggers in migration 167 (auth
version monotonicity, projection/command key and idempotency derivation,
reconciliation terminal-state and snapshot-hash recompute, drift absence-based
snapshot binding, related-ref TEST/LIVE class segregation, append-only/attempt-
prohibition triggers, admin-only ownership/grants); the guarded rollback's
evidence-existence precondition and table/column drop order; and the disposable
verifier's name/host/port pinning, stripped-`PG*` child environment, and
cleanup path. No other gap permits a forbidden state, misstates the proof,
loses evidence, reaches a non-disposable database, or makes rollback/restore
unsafe. One non-material observation for a future slice: `identity_candidates`
is fully immutable (`identity_candidates_immutable` blocks all `UPDATE`s) with
no versioning column, so the Stage D candidate lifecycle
(`open → evidence_pending → claim_available → accepted|rejected|...`) has no
write path in this schema yet — out of scope for D1 since no transition
function is wired or claimed here, but worth flagging before D2 needs to update
candidate status.
