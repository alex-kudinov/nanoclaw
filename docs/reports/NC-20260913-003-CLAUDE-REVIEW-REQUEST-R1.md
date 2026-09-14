# NC-20260913-003 bounded D2 production-shadow review

Mode: bounded independent review, Sonnet/high, one round

## Objective

Review only the load-bearing D2 transaction, production validator,
configuration transaction, and migration-167 interaction. Report a finding
only if it can promote provider-unreconciled evidence, create a forbidden
identity/access/provider/customer effect, omit or duplicate source evidence,
misstate coverage/health, permit an unsafe production target, lose recovery,
or violate transaction/concurrency/idempotency guarantees.

Write only:
`docs/reports/NC-20260913-003-CLAUDE-REVIEW-RESPONSE-R1.md`.

## Authority order

1. `AGENTS.md` completion/risk rules summarized here.
2. `/Users/xbohdpukc/dev/tandemweb/SOPs/plans/tandem-identity-readiness-2026-09-13/16-shadow-control-plane-design.md`.
3. `docs/IDENTITY-CONTROL-PLANE-D2.md` exact accepted scope and gates.
4. migration 167 and D2 source are the proposed mechanics.

Do not propose D3 provider snapshots, canonical resolution, a new provider
hook, a different identity policy, or a different physical database.

## Allowed read paths

- this request;
- `src/identity-control-plane/d2-student-lifecycle-shadow.ts`;
- `src/identity-control-plane/d2-student-lifecycle-shadow.disposable.test.ts`;
- `scripts/validate-tandem-identity-d2-production.mjs`;
- `src/identity-control-plane/d2-config-file.ts`;
- `data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`;
- `docs/IDENTITY-CONTROL-PLANE-D2.md`;
- the absolute Stage D design path above.

The only allowed write is the response file. Do not run Bash, inspect `.env`,
credentials, auth stores, live databases, provider systems, dumps, other
worktrees, or unrelated repository history.

## Accepted current facts

- Exact live release is `c190b957333ac1901b2d46a1f4b3f1cf75c6341c`;
  D2 branch descends from it through reviewed D0/D1.
- Read-only production source is 379 rows/max ID 379, 156 distinct Heartbeat
  users, 71 current Party-linked source rows, zero userless rows, and all 379
  `source_asserted_unreconciled`.
- Minimized prefix SHA-256 is
  `251fe76eed9db7710fbe7d96d11359f0c5231cd9f6cbd0c42ac4d1207642f955`.
- Migration-167 production object count is zero; no D2 production write has
  occurred yet.
- Caught-up D2 health must be `blocked`, never healthy, until an independently
  complete provider reconciliation exists in a later stage.

## Protected invariants

- Source is only existing `student_lifecycle_events`; no provider/network/
  credential client and no raw body, name, email, payment, or customer content.
- Every current row is written only as `unverified_hint`/held, with Party-null
  observation and non-materializable candidate. Existing Party links are
  aggregate comparison evidence only.
- Zero resolution/auth binding, Party/ref/enrollment/entitlement/access/customer
  projection, desired projection, command/attempt/readback, reconciliation,
  drift, provider hook/config/write, communication, or minion capability.
- One transaction/advisory lock, bounded ordered selection, exact dedup key,
  append-only records, source row lock, before/after Party/ref counts, and zero
  accepted facts/provider attempts.
- Unexpected authenticity/event/user/hash state aborts the whole batch.
- New source rows may append, but the first 379 minimized facts cannot drift.
- Production validator is read-only, exact host/database/socket/port bound,
  race-safe for post-enable coverage, and fails closed.
- Config mutation changes only three fixed non-secret values, is exact-release
  and host bound, mode-preserving, atomic, backed up, verified, and restorable.
- Production requires independent review, immutable release, complete readable
  backup, pre/post migration validation, disabled-first activation, explicit
  enable, health/database readback and no-op replay. Populated SQL rollback must
  refuse; runtime rollback preserves evidence.

## Mechanical evidence

- Identity-control-plane 64/64; D2-specific 17/17; format, typecheck, build and
  documentation continuity pass.
- Disposable PostgreSQL: bounded 2+2 catch-up, four held receipts/observations,
  three candidates, third-run zero-write replay, zero canonical/provider
  effects, and whole-batch rollback on provider-authenticity change.
- Full repository: 4,399 pass, 32 skip, 19 failures in the same five unchanged
  baseline files as D1; no D0/D1/D2 source or test failed.

## Response contract

List material findings in descending consequence. For each, name the exact
file/mechanism, concrete failure path, smallest correction, and regression
test. Distinguish a current D2 defect from a later D3 concern. If there are no
material findings, write exactly `NO MATERIAL FINDINGS` plus at most five
sentences naming what was checked. Do not restate the design or create a broad
backlog.
