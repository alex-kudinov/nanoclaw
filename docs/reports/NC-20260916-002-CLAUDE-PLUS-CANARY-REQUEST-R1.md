# Bounded review request: Coaching Tools Plus Alex canary

Review mode: bounded security/authorization/rollback review only.

Model: Claude Sonnet, high effort.

Write the response only to:

`/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/reports/NC-20260916-002-CLAUDE-PLUS-CANARY-RESPONSE-R1.md`

## Objective

Review the smallest load-bearing slice for one owner-authorized, ephemeral
Coaching Tools Plus canary. Identify only material defects that could grant the
wrong access, leave access active, mutate unrelated state, break idempotency,
mis-target Heartbeat, or make rollback unreliable.

Do not implement, edit source, run commands, inspect credentials, browse, or
review unrelated repository history.

## Authority and accepted decisions

1. Accepted owner authorization:
   `/Users/xbohdpukc/dev/NanoClaw/.program/decisions/decision-tandem-identity-coaching-tools-plus-alex-canary-2026-09-16.json`
2. Accepted minimum-sufficient checkpoint and fresh `KEEP` verdict:
   `/Users/xbohdpukc/dev/tandemweb/.worktrees/tandem-identity-service-topology-20260915/SOPs/plans/tandem-identity-readiness-2026-09-13/26-coaching-tools-plus-alex-canary-minimum-sufficient-checkpoint.md`

Do not reopen these accepted facts:

- canonical Party is `10069` and its existing enrollment `82` must not change;
- the accepted Firebase binding already resolves to Party `10069`;
- exact Heartbeat user is `bc42394c-ad45-4d81-89eb-448347b3d518`;
- exact Heartbeat group is `bc095770-0c8b-4495-9369-985e4c4649d7`;
- Heartbeat is a downstream projection, never authorization authority;
- one canary-specific episode may use existing enrollment schema, but no DDL,
  generic grant API, service, queue, worker, scheduler, or cohort expansion;
- live writes are separately gated and have not occurred;
- canary access must be revoked and Heartbeat membership removed immediately
  after proof; a 30-minute `validUntil` is only a fail-safe ceiling.

## Files to review

NanoClaw:

1. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/coaching-tools-plus-canary.ts`
2. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/scripts/manage-coaching-tools-plus-canary.ts`
3. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/coaching-tools-plus-canary.disposable.test.ts`

Toolbox isolated worktree:

4. `/Users/xbohdpukc/dev/toolbox/.worktrees/heartbeat-remove-group-20260916/shared/heartbeat/tools/heartbeat/add-to-group-exact.sh`
5. `/Users/xbohdpukc/dev/toolbox/.worktrees/heartbeat-remove-group-20260916/shared/heartbeat/tools/heartbeat/remove-from-group.sh`
6. `/Users/xbohdpukc/dev/toolbox/.worktrees/heartbeat-remove-group-20260916/shared/heartbeat/tests/test-add-to-group-exact.sh`
7. `/Users/xbohdpukc/dev/toolbox/.worktrees/heartbeat-remove-group-20260916/shared/heartbeat/tests/test-remove-from-group.sh`

You may read the two authority files above, these seven files, and this request
only. Write only the response path.

## Intended mechanics

- A strict mode-0600 manifest provides the already-authorized project, Firebase
  UID/email fingerprint, Party, exact Heartbeat user/group IDs, and a safety
  expiry no more than 30 minutes after grant observation.
- Policy pins the owner decision and every identity/access coordinate.
- One serializable transaction verifies the accepted auth binding and Party,
  fingerprints existing enrollment `82`, takes an advisory lock, then creates a
  separate complimentary canary order/source-ref/seat/agreement/enrollment plus
  `shared.coaching-tools-plus` component and append-only evidence/history.
- Exact replay returns zero writes. Partial or altered state refuses.
- Gateway readback sees the component as active only until `ended_at`.
- Revocation is permitted even after the safety expiry, updates all five
  canary state rows to cancelled/revoked version 1, and appends evidence/history.
- The provider tools resolve exact email to the expected immutable Heartbeat
  user ID, resolve the exact group ID, default dry-run, require exact live
  confirmation, fix sibling removal false, and read membership back.
- Removal exact replay is a zero-write `already_absent` result.

## Verification already run

- Canonical disposable PostgreSQL canary proof: 2/2 passed.
- NanoClaw typecheck and production build passed.
- Heartbeat exact-add and exact-remove tests passed.
- Toolbox registry validation passed.
- Toolbox registry suite: 24/24 passed.
- Toolbox dispatcher suite: 29/29 passed.
- Real provider dry runs resolved the exact Alex user/group, reported
  `would_add`, and confirmed removal preimage `already_absent`; no provider write.
- NanoClaw full suite: 4,491 passed, 34 skipped, with three established unrelated
  failures that reproduce alone: CNPC source-wrapper assertion, Trafft stale-time
  fixture, and Academy Capacity reservation expectation. The canary proof passes
  alone and in the full run.

## Review questions

1. Can any altered manifest/policy or partial pre-existing row chain be accepted?
2. Are first apply, exact replay, expiry, revoke-after-expiry, and revoke replay
   atomic and fail-closed?
3. Can enrollment `82`, Party/auth/reference state, or provider-attempt counts
   change through this slice?
4. Could an accepted provider operation target the wrong user/group, remove a
   sibling membership, or claim success without exact readback?
5. Is there any plausible crash/timeout state that makes immediate full rollback
   unsafe or ambiguous?

## Response contract

Start with `PASS` or `PASS WITH CORRECTIONS`. Report material findings only,
ordered by consequence, with exact file/line evidence and the smallest feasible
correction. If no material finding exists, say so directly. Do not add a broad
backlog, restate the design, or recommend generalized infrastructure.
