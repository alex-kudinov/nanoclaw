# NC-20260913-002 bounded D1 persistence review

Mode: bounded independent review, Sonnet/high, one round

## Objective

Review only the load-bearing migration 167 persistence and disposable recovery
mechanisms for material security, identity, distributed-consistency, rollback,
or proof defects. Report a finding only when it can permit a forbidden state,
misstate the proof, lose/corrupt evidence, contact a non-disposable database, or
make rollback/restore unsafe.

Write the result only to:
`docs/reports/NC-20260913-002-CLAUDE-REVIEW-RESPONSE-R1.md`.

## Authority order

1. `AGENTS.md` and `CLAUDE.md` safety/completion rules.
2. `/Users/xbohdpukc/dev/tandemweb/SOPs/plans/tandem-identity-readiness-2026-09-13/16-shadow-control-plane-design.md`
   Stage D and D1 contract.
3. `docs/IDENTITY-CONTROL-PLANE-D0.md` accepted pure contract.
4. Migration 167, its rollback and verifier are the proposed implementation.

Do not reopen the accepted D0 product policy unless migration 167 contradicts
it. Do not propose D2 provider wiring, a production migration, or a different
physical database.

## Allowed read paths

- this request;
- `data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`;
- `data/business/migrations/nanoclaw-v2/rollback_167_tandem_identity_control_plane.sql`;
- `scripts/verify-tandem-identity-d1-disposable.mjs`;
- `src/identity-control-plane/d1-migration.test.ts`;
- `docs/IDENTITY-CONTROL-PLANE-D1.md`;
- `docs/IDENTITY-CONTROL-PLANE-D0.md`;
- the absolute Stage D design path above.

The only allowed write is the exact response file. Do not edit implementation,
run Bash, inspect `.env`, credentials, auth stores, database dumps, live data,
other worktrees, or unrelated repository history.

## Protected invariants

- generated local database names only; stripped ambient `PG*`; local socket and
  explicit PostgreSQL 16 binaries; no production/provider/network path;
- no Party creation/merge, external-ref binding function, enrollment,
  entitlement, access, customer-facing projection, provider attempt or dispatch;
- provider/environment/scope/entity/event manifest matching and element-wise
  related-ref environment-class segregation;
- candidates cannot silently become Parties; exact resolution result/basis/
  Party coupling; append-only evidence;
- exact event replay is a no-op, changed hash conflicts, auth/projection versions
  are monotonic, and command/projection/idempotency correlation is exact;
- commands are representable only as simulated/superseded/blocked with writes
  false, zero attempts and null operation/next-attempt; attempt insert always
  refuses;
- a complete snapshot has DB-recomputed counts/hash and immutable items; absence
  drift references the same full/complete/final/fresh scope;
- failed migration/data transactions leave no partial state; backup restores
  data and triggers; populated rollback refuses before deletion; empty rollback
  and reapply work; cleanup removes every generated database and backup.

## Current mechanical evidence

- PostgreSQL 16.15 disposable result: 12 tables, one view, one synthetic chain,
  16 reason-matched refusals, failed-migration rollback, direct reapply, exact
  receipt replay no-op, backup/restore, populated refusal, empty rollback and
  rollback/reapply all pass.
- Result counters: provider attempts 0, production connections 0, database
  residue 0.
- D0+D1 focused tests: 51/51.
- Format, pinned Node 22.23.2 typecheck, build and docs continuity pass.

## Response contract

List material findings in descending consequence. For each, give the exact file
and mechanism, a concrete failure path, and the smallest correction plus test.
Distinguish a real defect from a future D2 concern outside this slice. If there
are no material findings, write exactly `NO MATERIAL FINDINGS` plus at most five
sentences naming what you checked. Do not restate the architecture or produce a
general backlog.
