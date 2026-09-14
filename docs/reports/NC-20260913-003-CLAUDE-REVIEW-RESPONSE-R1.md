# NC-20260913-003 bounded D2 production-shadow review — response R1

## Finding 1 (material, D2 defect): `unsupported_source_subject` health never reaches `blocked`

**File/mechanism:** `src/identity-control-plane/d2-student-lifecycle-shadow.ts`,
`healthFromCounts` (status/reason derivation), interacting with the source
query in `runTandemIdentityD2ShadowWithClient` (`WHERE e.heartbeat_user_id IS
NOT NULL`).

**Concrete failure path:** the mirror query only ever selects rows with a
non-null `heartbeat_user_id`; rows counted by `source_rows_without_user` can
never receive a receipt. `unmirroredRows = sourceRows - mirroredReceipts`
therefore has a floor of `sourceRowsWithoutUser` and can never reach `0` once
any such row exists. `catchingUp = unmirroredRows > 0` is consequently `true`
forever in that case, so `status` is pinned to `'catching_up'` permanently,
even though `reason` correctly reports `'unsupported_source_subject'`. The
documented state machine (`docs/IDENTITY-CONTROL-PLANE-D2.md`: "the only
truthful fully caught-up scoreboard is `blocked`") has no path to `blocked`
for this case — it is a real, unbounded misstatement of health, not merely a
slow catch-up. The current 379-row production prefix has zero such rows
(accepted facts), so the defect is latent, not yet triggered; the source
column is nullable and the design explicitly anticipates append-only rows
with this shape, so it is a present code defect, not a D3 concern. The
disposable test suite never seeds a row with `heartbeat_user_id IS NULL`, so
this branch is untested.

**Smallest correction:** in `healthFromCounts`, compute
`mirrorableUnmirrored = unmirroredRows - sourceRowsWithoutUser` and derive
`catchingUp` (and thus `status`) from `mirrorableUnmirrored > 0` instead of
`unmirroredRows > 0`, leaving `reason` unchanged. This keeps `unmirroredRows`
itself as an honest gap count while letting `status` legitimately reach
`blocked` once no further progress is structurally possible.

**Regression test:** add a case to
`d2-student-lifecycle-shadow.disposable.test.ts` that seeds one source row
with `heartbeat_user_id = NULL` alongside otherwise-normal rows, runs the
worker to exhaustion, and asserts `health.status === 'blocked'` with
`reason === 'unsupported_source_subject'` and `unmirroredRows === 1` (not
`'catching_up'`).

## Scope checked

Read `src/identity-control-plane/d2-student-lifecycle-shadow.ts` (transaction,
advisory lock, batch selection, mirror/receipt/candidate/observation writes,
before/after protected-count check), `d2-student-lifecycle-shadow.disposable.test.ts`,
`scripts/validate-tandem-identity-d2-production.mjs` (host/database binding,
frozen-prefix hash, per-stage coverage/emptiness checks), `d2-config-file.ts`
(atomic write, backup, host-confirmed apply/restore), migration
`167_tandem_identity_control_plane.sql` in full (constraints, guards,
append-only triggers, ownership/grants, health view), and
`docs/IDENTITY-CONTROL-PLANE-D2.md` plus the Stage D design doc. Verified: no
SQL string interpolation of untrusted input, idempotent receipt/observation
inserts via `ON CONFLICT`, whole-batch rollback on contract-mismatch rows
(intended fail-closed behavior, not a defect), candidate versioning/guard
correctness, and that the production validator's per-stage queries are each
internally consistent under `REPEATABLE READ`. No other material finding
against the stated criteria (forbidden identity/access/provider/customer
effect, evidence omission/duplication, unsafe production target, lost
recovery, or transaction/concurrency/idempotency violation).
