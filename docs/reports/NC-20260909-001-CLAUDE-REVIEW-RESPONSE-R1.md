# NC-20260909-001 bounded implementation review response R1

Reviewed the eight allowed files only. Two material findings, highest
consequence first.

## Finding 1 (high) — blanket version-supersession can orphan a live in-flight
provider effect and lead to a duplicate at the provider

`src/student-enrollment-projection-store.ts:138-147`, the re-supersede step
that `claimNextProjection` runs on every invocation:

```sql
UPDATE business_v2.student_projection_outbox o
SET state='superseded', lease_token=NULL, lease_expires_at=NULL, ...
FROM business_v2.student_class_assignments a
WHERE o.target=$1 AND o.subject_type='assignment'
  AND o.subject_key=a.assignment_key AND o.subject_version <> a.version
  AND o.state NOT IN ('verified','superseded')
```

`state NOT IN ('verified','superseded')` includes `'claimed'` **with no
`lease_expires_at` check**, unlike the reclaim clause two queries later
(`store.ts:151-152`, `(o.state='claimed' AND o.lease_expires_at <= $2)`).
So a row currently owned by a live, unexpired lease is superseded and its
`lease_token` nulled the instant `assignment_version` changes, even while a
worker is mid-delivery.

`src/student-enrollment-projection.ts:315-350` (`deliverProjection`) only
calls `ledger.isCurrent()` once, before `driver.apply()`. If the supersession
above lands between that check and `ledger.recordAccepted()`, `apply()` has
already produced a real provider-side effect, then `recordAccepted` fails
inside `PgProjectionDeliveryLedger.receipt()` (`store.ts:219-233`) because
`row.lease_token !== this.leaseToken` (line 231-232) — the lease was just
nulled. This lands in the generic `catch` at
`student-enrollment-projection.ts:335-349`, which calls
`ledger.recordRetryableFailure(...)`; that call re-runs the same `row()` +
lease check and throws again for the identical reason, so the exception
propagates uncaught out of `deliverProjection`.

Net effect: the provider write from `driver.apply()` is never recorded
(`recordAccepted` never committed), never marked `held`
(`ProjectionAcceptanceUncertainError` is not what was thrown, so
`recordHeldException` is never reached), and the owning outbox row is already
`superseded`, so nothing will ever retry or reconcile it. The next queued
version for the same subject/target gets its own version-scoped
`target_idempotency_key` (`student-enrollment-projection.ts:198`) and will
independently apply, producing a second, untracked provider effect for the
same participant/target — a duplicate the idempotency key, lease token, and
SQL uniqueness constraint are specifically supposed to prevent (Question 1).
This exact interleaving is not exercised by the disposable worker or unit
tests: both bump `assignment_version` only after the prior claim has already
reached a terminal state.

**Correction:** restrict the blanket supersede update to rows that are not
under an active lease, matching the reclaim clause already used in the same
file: `AND (o.state IN ('queued','failed') OR (o.state='claimed' AND
o.lease_expires_at <= $2))`. Additionally, `deliverProjection`'s catch block
must not treat a lease/version-loss error the same as a definitive provider
failure — since `driver.apply()` may already have succeeded, it needs to
route through `recordHeldException` (with a code distinct from
`provider_acceptance_uncertain`) so the already-applied effect is durably
tracked for reconciliation instead of silently orphaned.

## Finding 2 (medium) — idempotent replay overwrites the real provider
operation id with a fabricated hash, breaking later rollback

`src/student-enrollment-projection.ts:325-330`:

```ts
const prior = await driver.findByIdempotencyKey(...);
if (prior) {
  operationId = projectionHash(prior).slice(0, 32);
} else {
  operationId = (await driver.apply(envelope)).operationId;
  ...
}
```

On first delivery, `operationId` is whatever the real driver's `apply()`
returns (the provider's own operation/resource id). On any later delivery of
the same envelope that hits the idempotency-duplicate branch (worker restart,
manual retry, or supersession-induced resumption from Finding 1),
`operationId` is instead a locally computed hash of whatever
`findByIdempotencyKey` returned — the `ProviderProjectionDriver` interface
(`student-enrollment-projection.ts:65-74`) defines no field that carries the
provider's real id back through `findByIdempotencyKey`.

This fabricated value is then persisted unconditionally by
`PgProjectionDeliveryLedger.recordVerified`
(`student-enrollment-projection-store.ts:267-283`), overwriting the real
`provider_operation_id` column from the original `apply()`. `rollbackProjection`
(`student-enrollment-projection.ts:367-375`) hands whatever is stored to
`driver.rollback(envelope, operationId)`. Once overwritten, no real driver
(Google Sheets row, Heartbeat membership) can use that value to locate the
provider-side resource to undo — the genuine id is gone. The existing tests do
not catch this: the unit test's "duplicate effect" case never asserts on the
persisted `operationId`, and the rollback test bypasses `deliverProjection`'s
return value entirely and hardcodes `'op-1'`.

**Correction:** either extend `ProviderProjectionDriver.findByIdempotencyKey`
to return the provider's real operation id alongside the record so
`deliverProjection` can reuse it instead of hashing the payload, or have
`recordAccepted`/`recordVerified` preserve an existing non-null
`provider_operation_id` rather than overwriting it on the idempotent-replay
path.

## Scope note

Reviewed only the eight files named in the request packet; no other diff,
credential, runtime, or provider surface was inspected.
