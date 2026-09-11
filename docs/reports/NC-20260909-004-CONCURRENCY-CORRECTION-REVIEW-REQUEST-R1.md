# NC-20260909-004 concurrency correction — bounded review R1

## Objective

Review the implementation that replaces NanoClaw's global zero-container and
single-program-work serialization with bounded resource-scoped concurrency.
Report only material correctness, safety, race, or authority defects. Write the
response to
`docs/reports/NC-20260909-004-CONCURRENCY-CORRECTION-REVIEW-RESPONSE-R1.md`.

## Accepted authority and facts

- The owner explicitly rejected global serialization and directed that
  independent pieces of work be able to proceed concurrently.
- Company OS now permits at most three active work claims. Consequential shared
  transitions use short-lived shared/exclusive resource leases; an exclusive
  lease conflicts only on the exact resource.
- NanoClaw message containers are detached, retain sidecars/output, survive
  daemon exit, and are adopted by the next daemon. Task containers wrap
  in-process closures and remain unsafe to interrupt.
- A production release remains single-writer during the short activation
  window. Normal apply must compare-and-swap the exact observed live commit.
- Existing enrollment authorization, one-event limit, writer exclusion,
  migrations, provider targets, accounting, rollback, and exact-readback gates
  are unchanged.
- No production/provider/student/financial/configuration mutation has occurred.

## Changed behavior

1. `assessReleaseConcurrency` permits active non-task containers only with a
   concrete container identity, zero queued task closures, consistent runtime
   and queue counts, no waiting groups, and no pending Slack delivery.
2. The activator performs this check during rehearsal and again after acquiring
   its exclusive activation lock. Active task containers fail closed.
3. Normal apply requires a full `--expected-current-commit`; a sibling release
   between rehearsal and apply fails before plist/service mutation.
4. `programctl` supports atomic shared/exclusive resource acquisition, renewal,
   release, stale/conflict/orphan validation, and foreign-owner mutation
   protection. The NanoClaw program policy is enabled at revision 282 with
   `max_active_claims=3` and one-hour resource leases.

## Allowed review sources

Read only these implementation sources plus this request:

- `src/release-concurrency.ts`
- `src/release-concurrency.test.ts`
- `src/release-activation-exec.ts`
- `src/release-activation-exec.test.ts`
- `src/group-queue.ts` (shutdown/status/adoption evidence only)
- `/Users/xbohdpukc/.codex/skills/program-management/scripts/programctl.py`
- `/Users/xbohdpukc/.codex/skills/program-management/tests/test_programctl.py`

Do not inspect `.env*`, credentials, auth/session stores, logs, databases,
provider state, or unrelated repository files. Do not edit implementation.
Write only the named response artifact.

## Verification already run

- Program-control tests: 25/25 pass; skill validation passes.
- Focused combined tests: 153/153 pass.
- Typecheck, build, rollout validator, and documentation continuity pass.
- Full root suite: 4,024 pass / 32 skip / four unchanged baseline failures on
  files untouched from live; the parallel-load-only timeout passes alone.

## Review questions

1. Can any container classified as adoptable by the new gate still be stopped,
   orphaned, lose pending work, or fail adoption because required state is not
   represented in the health snapshot?
2. Is there a race between the locked health/CAS check and daemon unload that
   can start unsafe task work or overwrite a sibling release?
3. Can two program tasks acquire conflicting leases, retain stale/orphaned
   leases, alter another owner's lease, or bypass the intended revision CAS?
4. Does any recovery/error path remove a foreign lock, mutate installed state
   before failure, or leave the release gate weaker than the prior contract?

## Required response

List material findings ordered by consequence with exact file/line evidence and
a concrete correction. If none exist, write `NO MATERIAL FINDINGS`. Do not add
cosmetic suggestions or a general restatement.
