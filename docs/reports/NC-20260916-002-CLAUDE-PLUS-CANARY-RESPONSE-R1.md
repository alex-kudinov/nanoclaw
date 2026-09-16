# Bounded review response: Coaching Tools Plus Alex canary

PASS WITH CORRECTIONS

## Material finding

**`remove-from-group.sh` has no exact-user-id precondition, unlike its
add-side counterpart — the rollback path can silently act on the wrong
Heartbeat user.**

- File: `/Users/xbohdpukc/dev/toolbox/.worktrees/heartbeat-remove-group-20260916/shared/heartbeat/tools/heartbeat/remove-from-group.sh`
- Evidence: usage/options at lines 7–22 and argument parsing at lines 31–42
  accept only `--group-id`, `--email`, `--instance`, `--execute`, `--confirm`
  — there is no `--expected-user-id` flag. `read_user()` (lines 58–72)
  resolves a single user strictly by exact email match, but the script never
  compares the resolved `user_id` (line 85) against any caller-supplied
  expected ID before checking membership (lines 88–97) or issuing the DELETE
  (lines 105–109).
- Contrast: `add-to-group-exact.sh` (same slice, same file directory)
  requires `--expected-user-id` (line 7, 29, 39) and hard-fails with
  `CONFLICT` if the email-resolved user ID doesn't match it (lines 77–82),
  *before* any state check or write. `remove-from-group.sh` has no analogous
  check anywhere in the file.
- Consequence: this directly matches review question 4 ("mis-target
  Heartbeat") and the checkpoint's own obligation row ("Provider rollback...
  with exact group/user preconditions," checkpoint lines 64, 78–79). If
  Heartbeat's `/find/users?email=` ever resolves the canary email to a
  different account than `bc42394c-ad45-4d81-89eb-448347b3d518` (email
  reassignment, provider-side merge, stale index), `remove-from-group.sh`
  will remove that unverified account from the exact group with no defense
  — the opposite of `add-to-group-exact.sh`'s guarantee for the same
  rollback obligation. `test-remove-from-group.sh` has no test for this case
  either, consistent with the missing parameter (confirmed by reading the
  test file — no `--expected-user-id` scenario exists, unlike
  `test-add-to-group-exact.sh` lines 74–80).
- Smallest feasible correction: add a required `--expected-user-id` UUID
  argument to `remove-from-group.sh`, mirroring `add-to-group-exact.sh` lines
  77–82 — resolve the user by email, compare to the expected ID, `fail
  CONFLICT` and exit before checking membership or calling DELETE if it
  doesn't match. Add one test case to `test-remove-from-group.sh` mirroring
  `test-add-to-group-exact.sh` lines 74–80. Invoke the corrected script with
  `--expected-user-id bc42394c-ad45-4d81-89eb-448347b3d518` at rollback time.

## Review questions — no further material findings

1. Altered manifest / partial pre-existing rows: rejected. Authorization
   fields (`projectId`, `partyId`) are `z.literal` in
   `CoachingToolsPlusCanaryRequestSchema` (canary.ts lines 9–20) so an
   altered manifest can't even parse a different value; all other identity
   fields are re-checked against the hardcoded `policy` object in
   `manage-coaching-tools-plus-canary.ts` (lines 42–53) inside
   `validateScope` (canary.ts lines 105–131), independent of what the
   manifest claims. A partial pre-existing canary row chain is caught by the
   `LIKE`-prefix count check (canary.ts lines 307–316) before any insert.
2. Atomicity: the whole grant/revoke body runs inside one
   `BEGIN ISOLATION LEVEL SERIALIZABLE … COMMIT` in the CLI (script lines
   58–96), with `ROLLBACK` on any thrown error; a crash before `COMMIT`
   leaves zero rows by Postgres guarantee, and both first-apply/replay and
   revoke/replay are exercised end-to-end in the disposable test (lines
   220–350). Fail-closed confirmed for expiry range (canary.ts lines
   125–129), altered-state replay (`plus_canary_grant_conflict` /
   `plus_canary_revoke_conflict`), and optimistic per-row version guards in
   the five revoke `UPDATE`s (canary.ts lines 514–553, all require
   `rowCount === 1`).
3. Enrollment 82 / protected counts: both `grantCoachingToolsPlusCanaryWithClient`
   and `revokeCoachingToolsPlusCanaryWithClient` fingerprint enrollment 82
   and snapshot `parties`/`party_external_refs`/`auth_accounts`/
   `provider_projection_attempts` counts before any write and re-verify both
   after every write path, including the duplicate/no-op paths (canary.ts
   lines 279–305, 430–435, 484–509, 592–598). No statement in the file
   touches those four tables. Confirmed by the disposable test's own before/
   after snapshots (lines 217–239, 305–324).
4. Wrong-target / sibling removal / false success on the Heartbeat add path:
   not found. `add-to-group-exact.sh` pins `shouldRemoveFromSiblingGroups:
   false` (line 99), verifies the exact group ID readback (lines 68–74),
   verifies the exact expected user ID before any write (lines 77–82), and
   re-reads membership after the `PUT` rather than trusting the HTTP status
   (lines 105–116). The one gap is the remove path, covered above.
5. Crash/timeout ambiguity: none beyond the two-system (Postgres/Heartbeat)
   split that the checkpoint already designs for. Each side is independently
   idempotent and retry-safe — canonical grant/revoke replay is a verified
   zero-write no-op (canary.ts lines 291–306, 495–509), and
   `add-to-group-exact.sh` / `remove-from-group.sh` both return `no_op` on
   an already-converged state (add lines 88–92, remove lines 93–97) — so a
   crash between the two non-atomic steps is recoverable by re-running both
   to completion, not an unsafe or ambiguous state.
