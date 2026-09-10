# Student enrollment provider-projection foundation

Status: reviewed local/unwired foundation under `NC-20260909-001`; production
activation is not authorized.

## Authority and scope

Company OS remains canonical for order, funding classification, seat,
participant enrollment, entitlement, dated assignment, projection intent,
receipts, and owned exceptions. Student Roster, Heartbeat, Encharge, and Plutio
remain authoritative only for their native objects and are rebuildable
projections. A provider membership or row never proves payment, entitlement, or
class assignment.

This slice integrates the reviewed admission/store lineage ending at
`8b1ffbb9902b5fd3f7df245142d54db3de92dcee` with the reviewed lifecycle strategy,
catalog reconciliation, and source-bound publication meanings from `40f0d364`,
`0e6fb605`, and `55c068d2`. It does not route a paid event, apply migrations,
connect a driver, read or write a provider, or inspect real or historical
student data.

## Pilot and target contract

The only selected pilot is `supervision-inaugural` version 1, a fully settled,
self-purchased episode assigned to `supervision:2026-10-07` after authenticated
source admission and with zero blocking exceptions.

`facts/catalogs/student-enrollment-projection-targets-v1.json` gives every
canonical target an explicit per-offer/version disposition:

- `student_roster`: required, exact CSS sheet destination recorded;
- `heartbeat`: required, stable Coaching Supervision Mastery Course Access
  Group recorded, but the distinct hidden delivery marker does not yet exist;
- `encharge`: explicitly `not_applicable`;
- `plutio`: explicitly `not_applicable`.

Production readiness is intentionally false. It can become true only after each
required target has a reviewed adapter, exact destination identity, bounded
apply path, exact readback, rollback/reconciliation semantics, and verified
permission plus activation preflight. The missing Heartbeat marker identity and
provider permissions therefore fail closed.

Heartbeat payloads preserve two independent layers: the stable content-bearing
Course Access Group and a separate hidden, admin-controlled, zero-content
delivery marker. The marker payload explicitly states that membership proves
neither payment nor entitlement. Rollback removes only receipt-owned
memberships; it never deletes a group or strips pre-existing course access.

## Delivery mechanics

`src/student-enrollment-projection.ts` provides deterministic target builders,
canonical hashing, readback normalizers, an injected provider-driver interface,
idempotency lookup before apply, exact readback verification, uncertain-
acceptance hold, definitive-failure retry, and provider rollback.

`src/student-enrollment-projection-store.ts` is guarded to uniquely named local
disposable PostgreSQL. It queues one target/version identity, supersedes older
versions, refuses stale assignment versions, claims with `FOR UPDATE SKIP
LOCKED`, fences mutations with a lease token, records append-only receipts, and
opens a projection-worker-owned exception for ambiguous or mismatched results.
Migration 148 adds only the delivery identity/readback columns and indexes needed
for those mechanics. It is unapplied and the rollback refuses after delivery
evidence exists.

An uncertain provider response is not retryable. The worker records a durable
held exception and a later reconciler must first search the target idempotency
key and perform exact readback. A definitive pre-acceptance failure may retry
the same target idempotency key. A partial target failure never rolls back the
settled order, enrollment, entitlement, or dated assignment.

## Verification boundary

Synthetic provider doubles and a generated disposable PostgreSQL database prove
claim contention, retry, exact readback, duplicate-effect prevention,
uncertain-acceptance hold, stale refusal, supersession, preserved canonical
commitment after partial failure, and rollback. No provider shortcut, browser,
CSV, credential, production database, migration apply, runtime wiring,
deployment, financial action, or communication is part of this evidence.
