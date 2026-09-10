# NC-20260909-001 load-bearing correction review R2

Reviewed the five allowed files only: R1's response and the four named source
files.

`NO MATERIAL FINDINGS`

## Finding 1 verification (blanket version-supersession orphaning a live effect)

`src/student-enrollment-projection-store.ts:152-161`, the version-changed
sweep in `claimNextProjection` now reads
`AND o.state IN ('queued','failed')` — it no longer touches `'claimed'` rows
at all (stricter than the suggested `lease_expires_at <= $2` matcher, and
still sufficient: a row under an active, unexpired lease is never superseded
by this sweep).

`src/student-enrollment-projection.ts:326-386` (`deliverProjection`) now
scopes the `try/catch` around `driver.apply()` to that call alone, then
re-checks `ledger.isCurrent(envelope)` before `recordAccepted`, and wraps
`recordAccepted` in its own `try/catch`. Both the post-apply version-loss path
and the `recordAccepted` lease-loss path route to
`ledger.recordPostApplyUncertain(...)`, not `recordRetryableFailure`.

`recordPostApplyUncertain` (`store.ts:351-409`) writes `state='held'` and the
owned exception with `WHERE id=$1` only — no `lease_token` condition — so it
succeeds even though the lease was already nulled/replaced, and it persists
the real `operationId` passed in (`provider_operation_id=$2`). This matches
the correction summary: the already-applied provider effect is durably held
for reconciliation instead of orphaned.

Confirmed via `student-enrollment-projection.test.ts:255-280` (`changeAfterApply`
and `acceptedThrows` cases) and the disposable worker's racing-apply and
lease-loss scenarios (`scripts/student-enrollment-projection-disposable-worker.ts:296-370`).

## Finding 2 verification (fabricated operation ID on replay)

`ExistingProjectionEffect`/`ProviderProjectionDriver.findByIdempotencyKey`
(`student-enrollment-projection.ts:65-74`) is unchanged in shape, but
`deliverProjection:340-341` now does `operationId = prior.operationId;`
directly — the `projectionHash(prior).slice(0, 32)` fabrication is gone.
Since the driver's own idempotency-lookup result already carries the real
operation ID (`ExistingProjectionEffect.operationId`), replay reuses the
provider's genuine ID, and `rollbackProjection` receives that same real ID.

Confirmed via `student-enrollment-projection.test.ts:206-222`
(`ledger.operationIds` asserted `['op-1', 'op-1']` across two deliveries of
the same envelope) and the disposable worker's rollback assertion
(`scripts/student-enrollment-projection-disposable-worker.ts:281-294`, driver
`rollback` asserts on the stored `operationId`).

## No new regression

Checked the code paths touched by both corrections for new failure modes:

- The version-changed sweep no longer superseding `'claimed'` rows still
  leaves a path for a stale claimed row (subject_version behind current) to
  be reclaimed after lease expiry; `deliverProjection`'s `isCurrent()` check
  at entry rejects it with `stale_projection_version` before any provider
  call, so this is a liveness/no-op case, not a duplicate-effect risk, and was
  not part of either flagged finding.
- `recordPostApplyUncertain`'s `row.state === 'superseded'` and
  `provider_operation_id` conflict guards are unreachable under the corrected
  invariants (nothing supersedes a `'claimed'` row with an active lease), so
  they are inert defensive checks, not a regression.

## Scope note

Reviewed only the five files named in the request packet; no other diff,
migration, credential, runtime, or provider surface was inspected.
