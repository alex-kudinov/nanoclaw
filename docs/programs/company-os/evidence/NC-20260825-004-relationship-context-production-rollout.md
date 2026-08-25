# NC-20260825-004 — Relationship Context production rollout evidence

Date: 2026-08-25

Program item: `work:relationship-context-production-rollout`

Decision: `.program/decisions/decision-relationship-context-production-rollout-2026-08-25.json`

Change class: C5 identity/security boundary plus C3 deployment

## Authorized boundary

The owner directed the maximum safely supportable rollout. This authorizes the
reviewed foundation, additive migration 137, credential-free read-only Trafft
host-ledger shadow, context-table writes, immutable deployment, and live
verification. A minion pilot is conditional on exact identity proof.

Provider/customer communications, provider writes, Plutio writes/backfill,
credential changes, payment/contract actions, guessed identity, broad minion
grants, Circle/lifecycle/checkout/legacy changes, and destructive rollback are
excluded.

## Pre-mutation evidence

- exact live release `8e475e036ad6d34bafe51d8f45c402b9c8bf1c38` is verified,
  Node 22.23.2, one running service, Gmail/Slack connected;
- the rollout branch begins at reviewed foundation `dadb5cc7`, which directly
  contains exact live `8e475e03`;
- migration 137 is absent in production;
- production PostgreSQL has `citext` and core `sha256(bytea)`, not `pgcrypto`;
- Trafft ledger has 419 interactions over 170 Parties; 390 expose 170 customer
  IDs and zero IDs map historically to multiple Parties;
- 1,420 Party emails exist and zero have `verified_at`, so historical mapping is
  not accepted as identity authority;
- 39 active legacy Party source pairs are eligible for migration 137's exact
  compatibility backfill.

## Implemented production slice

- migration 137 uses core `sha256(convert_to(...))`, eliminating an undeclared
  production extension dependency;
- `trafft_host_ledger@1.0.0` reads only appointment ID, event/status/service,
  occurrence time, and update time from the existing host ledger;
- raw payload, name, email, phone, custom answers, messages, and credentials are
  excluded before JavaScript normalization and persistence;
- every row becomes an exact Trafft appointment-reference observation with null
  Party identity, `needs_identity`, and zero Party projection;
- startup plus 15-minute shadow reconciliation is default-off, bounded to 1,000
  rows and 200-row batches, transaction-atomic, non-overlapping, fire-and-forget,
  and timer-unreferenced;
- `/health.relationshipContext` reports query denial plus shadow completeness,
  replay counts, held identities, and minimized error state;
- `RELATIONSHIP_CONTEXT_ENABLED=0` and no grant issuer or consumer activation
  remain unchanged.

## Review

Claude Sonnet/high R1 session `5913a735-fe46-4347-ad70-3b2aca278b95`
found one material startup issue: the first shadow tick was awaited and its
timer retained the event loop. The correction uses fire-and-forget startup,
`.unref()`, and a `finally`-released in-flight guard. R2 session
`11c346bd-f1c0-40ca-97f8-fa17738d819d` returned `NO MATERIAL FINDINGS` and
confirmed the whole run is one PostgreSQL transaction. Remaining limit-boundary
test specificity was closed mechanically with a pure boundary check.

Measured review usage:

- R1: nine model calls, 94,665 cache-create, 581,339 cache-read, 22,252 output,
  maximum context 103,231; bounded-review threshold warning;
- R2: nine model calls, 52,695 cache-create, 370,413 cache-read, 10,780 output,
  maximum context 61,261; no warning.

## Verification so far

- focused relationship, health, migration, and host-wiring tests pass;
- root typecheck passes;
- disposable PostgreSQL without `pgcrypto`: migration 137 applies; Trafft
  shadow integration passes 2/2; replay, null Party, zero projection, minimized
  value, adapter registration, legacy backfill/conflict/merge proof, zero
  non-admin grants, populated rollback refusal, and empty rollback pass.
- full root: 3,280 tests pass / 25 skip; only the unchanged unrelated CNPC
  wrapper-literal assertion fails;
- independent runner: 45/45; documentation continuity, capability matrix, diff,
  and targeted sensitive-pattern checks pass.

## Pending

- immutable commit/push/release build and target verification;
- production drain/backups/migration/activation/live non-interference proof;
- terminal program and changelog reconciliation.
