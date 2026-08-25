# Relationship Context production rollout

Task: `NC-20260825-004`

Program item: `work:relationship-context-production-rollout`

Decision: `.program/decisions/decision-relationship-context-production-rollout-2026-08-25.json`

## Objective

Put the maximum safely supportable Relationship Context slice into production:
the reviewed provider-neutral schema and host boundary plus a continuously
running, read-only Trafft shadow that normalizes existing host booking evidence.
Do not turn historical email matching into authoritative identity.

## Verified starting state

- production release: exact verified `8e475e036ad6d34bafe51d8f45c402b9c8bf1c38`;
- reviewed foundation branch: `dadb5cc704a671399220e7f4b7113fb3152e4049`,
  which directly contains the live release;
- migration 137 absent in production;
- PostgreSQL has `citext` and the core `sha256(bytea)` function but not the
  optional `pgcrypto` extension;
- Trafft ledger: 419 source-bound interactions across 170 Parties; 390 expose
  170 distinct customer IDs and none maps historically to more than one Party;
- Party email rows: 1,420 total and zero source-verified.

The customer-ID consistency is useful shadow evidence, but it is not an
independent identity proof. Therefore the first live adapter records exact
appointment-reference observations with `needs_identity`, leaves
`current_party_id` null, creates no Party projection, and exposes nothing to a
minion.

## Implementation slice

1. Make migration 137 portable to the installed PostgreSQL by using the core
   `sha256(convert_to(...))` function rather than undeclared `pgcrypto.digest`.
2. Add `trafft_host_ledger@1.0.0`, a credential-free adapter that reads only
   minimized fields from `business_v2.interactions`: appointment ID, event
   type, status, service, occurrence time, and update time. It never reads or
   persists raw payloads, names, email, phone, custom answers, message bodies,
   or credentials.
3. Normalize each row into a bounded `appointments.trafft.lifecycle@1`
   observation addressed to the exact Trafft appointment reference. With no
   authoritative Party reference or verified identity claim, ingestion records
   a `needs_identity` exception and no projection.
4. Reconcile at startup and every 15 minutes when
   `RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED=1`. The default remains `0`.
   Limit each run to 1,000 most recently updated rows, split into batches of at
   most 200. Reaching the limit marks health degraded/incomplete.
5. Persist the reviewed adapter manifest and conformance receipt as enabled in
   shadow. Keep `RELATIONSHIP_CONTEXT_ENABLED=0`, so `party_context_get` and all
   minion consumers remain denied.
6. Add `/health.relationshipContext` with query-policy and Trafft-shadow status,
   completeness, replay counts, held-identity count, and content-minimized error
   code.

## Acceptance gates

- migration applies without `pgcrypto`, backfills the 39 valid legacy Party
  source pairs exactly once, and retains zero non-admin grants;
- one disposable Trafft row produces one minimized observation, one open
  identity exception, zero Party projections, and a passed adapter registration;
- replay produces no new observation and no projection;
- shadow-disabled startup performs no context database access;
- focused, full root, independent runner, continuity, capability, diff, and
  secret checks pass, allowing only the known unrelated CNPC wrapper assertion;
- independent Claude Sonnet/high review has no unresolved material finding;
- production backups are readable before migration or restart;
- the immutable archive verifies on the target before activation;
- live health reports the intended release, one listener, connected Gmail and
  Slack, `query.enabled=false`, and a healthy complete Trafft shadow;
- production row counts match the bounded expected set and replay is stable;
- checkout recovery, Community lifecycle shadow, provider registrations,
  legacy receivers, queues, and error baselines are unchanged.

## Conditional minion pilot gate

No minion read pilot may run merely because the shadow is healthy. It requires
an exact active `party_external_refs` mapping or one unique independently
verified claim, a host-issued single-use grant, requested-section policy, and a
content-minimized delivery receipt. If those facts do not exist, the rollout is
successful with the consumer disabled and the identity gap recorded.

## Deployment and rollback

Build only a clean pushed commit. Before mutation, drain active work and back
up PostgreSQL, SQLite, and the installed service definition. Apply only
migration 137 from the verified release. Install a new immutable release
directory, retain the prior release pointer, add only
`RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED=1` and the explicit query flag `0`,
restart once, and verify health plus schema.

Host rollback restores the prior service pointer and plist. Migration 137 may
remain additively installed. Its guarded rollback is eligible only before any
non-legacy relationship evidence exists; once the live shadow writes
observations/exceptions, destructive rollback is refused and removal requires a
separately reviewed archival migration.

## Explicit exclusions

No guessed identity, provider write, customer communication, Plutio field/data
write or backfill, credential change, payment/contract action, broad minion
grant, Circle/lifecycle/checkout/legacy mutation, manufactured provider event,
or destructive rollback.
