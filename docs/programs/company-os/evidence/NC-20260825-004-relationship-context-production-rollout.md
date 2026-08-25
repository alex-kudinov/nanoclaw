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

## Immutable release and backup

- implementation: `e97c9f8700dab83ab74fe013ea1388d0bc172e27`;
- source tree: `59756c0220bce8316ec9d613741fee55bf54cdf7`;
- artifact: 984 files,
  `d82fddcd7c3e17202962c1cca9b2478f320947628d77245dbf71dc61d3114e0c`;
- archive:
  `cb2091bb5a4ecf4971d2afda7bafd0637a60807eeed857d7293c995b9894e6d4`,
  byte-identical and runtime-verified on the Mini;
- four consecutive pre-mutation samples: zero active containers, zero active
  queue entries, zero waiting groups;
- mode-0700 backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260825-004-20260825T2254Z`;
- PostgreSQL dump SHA-256:
  `fc0d01cac13652b5096ec962b776ff9858bfb9ace9a44ffc26c3c10da956e680`;
- SQLite backup SHA-256:
  `cec4012f232336850a1fbf5657acfa2800a746216025b9c73b76e91d757dfddf`;
- installed plist backup SHA-256:
  `f0d2f32fa01bf0560112668954862f059fdb78d1f3e61a4a95ebda5f7b5b4a86`.

## Production migration and activation

- migration 137 applied once from the verified release: 39 legacy compatibility
  refs, zero observations/projections/exceptions at the migration boundary,
  zero non-admin grants, and zero wrong relation owners;
- installed configuration explicitly sets shadow `1` and query `0`;
- activation changed only code root, expected commit, and executable pointer;
- exact live release is `e97c9f87`, Node 22.23.2, verified tree/artifact/code
  root, one listener, Gmail/Slack connected, and zero waiting groups;
- rollback plist:
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-8e475e036ad6-2026-08-25T22-52-29-960Z`.

## Live shadow and non-interference

- startup shadow: healthy and complete, 414 eligible ledger rows, 414 new
  minimized observations, 414 held identities, zero projections;
- durable readback: all 414 Trafft observations have null Party identity; 414
  open identity exceptions; one enabled/passed adapter; zero query receipts;
  zero raw/email/phone/name/custom-field keys;
- direct replay: 414 duplicates, zero new observations, zero projections;
- health: query disabled, zero grants, consumer disabled;
- checkout recovery remains enabled with production send mode and the same
  cutoff; Community lifecycle remains enabled/healthy with 29 events, 16 open
  exceptions, action consumers false and Circle false;
- natural work was allowed after restart; one active container appeared with
  zero waiting groups and no Relationship Context failure. No customer or
  provider event was manufactured.

The conditional minion pilot is completed as an evidence-backed refusal: no
exact Trafft customer-to-Party authority exists, so no grant, query, or
projection was activated. That boundary is the next separately governed item.
