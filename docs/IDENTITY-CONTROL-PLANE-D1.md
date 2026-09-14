# Tandem Identity D1 Disposable PostgreSQL Store

Status: source-only and unwired; verified only in generated disposable PostgreSQL

Task: `NC-20260913-002`

## Outcome

Migration 167 turns the independently reviewed D0 identity contracts into an
admin-only PostgreSQL persistence boundary without connecting a source or
provider. It extends the existing Company OS relationship-context foundation;
it does not create a second person/member database.

The migration is deliberately absent from the release bundle. It has not been
applied to `nanoclaw_business`, imported by the host, registered with a runtime,
or supplied with provider credentials. D2 production shadow admission remains a
separate owner-validated change.

## Existing foundations retained

- `party_external_refs` gains an explicit environment dimension while retaining
  its existing stricter provider/scope/entity/external-ID uniqueness.
- `party_context_adapter_registrations` gains environment, acceptance interval,
  and declared identity entity/event types. A receipt or reconciliation run is
  accepted only when its provider, environment, scope and effective time match
  a passed manifest; event/entity declarations are checked at insert time.
- `parties`, identifier claims, identity exceptions, observations, projections,
  and student enrollment/entitlement records remain their existing authorities.
  Migration 167 provides no Party-creation, merge, ref-binding, enrollment,
  entitlement, access, or provider-write function.

## Added records

| Record | Enforced contract |
| --- | --- |
| `identity_event_receipts` and related refs | immutable authenticated/held transport evidence, exact provider/environment/scope, dedup hash conflict rejection, element-wise TEST/LIVE class segregation |
| `identity_candidates` | append-only versioned staged non-Party subject with forward-only lifecycle; materialization flag needs accepted status and one closed Tandem creation basis; there is intentionally no `party_id` |
| `identity_resolution_decisions` | immutable closed result/basis/Party/candidate coupling plus evidence fingerprint |
| `auth_accounts` | append-only issuer/subject versions with monotonic version and explicit accepted Party binding |
| `provider_desired_projections` | append-only managed-field projections with derived key/hash and monotonic desired version |
| `provider_projection_commands` | only `simulated`, `superseded`, or `blocked`; writes false, attempt count zero, operation/next-attempt null, exact projection FK and derived idempotency key |
| `provider_projection_attempts` | table exists for future versioned evolution, but an insert trigger always refuses in the Stage D contract |
| `provider_projection_readbacks` | immutable simulated comparison evidence only |
| reconciliation runs and snapshot items | manifest-bound runs, one fact per scoped object/type, immutable items, terminalization with DB-recomputed count and canonical snapshot hash |
| `provider_drift_items` | immutable visible drift; absence requires the same provider/environment/scope on a full, complete, final-page, still-fresh snapshot |

Every new relation and function is owned only by `nanoclaw_admin`; `PUBLIC`
receives no privileges. No minion or runtime role receives a grant.

The admin-only receipt function returns the existing receipt ID and
`inserted=false` for an exact replay. Reusing a deduplication key with a
different payload hash is rejected before storage.

## Deterministic snapshot boundary

`fn_tandem_identity_finalize_reconciliation_run` locks one running full run,
recomputes its observed/normalized/held counts and SHA-256 over the declared
watermark plus canonically ordered snapshot facts, then performs the sole legal
running-to-complete transition. Snapshot facts cannot be added after the run is
terminal. Each item insert holds a share lock on the run row, so finalization
cannot race a late item into a hash that omitted it. The watermark is
provider-declared and hash-bound here; proof of the
provider's final-page/cursor semantics belongs to the accepted adapter and D2
conformance tests rather than being guessed by PostgreSQL.

## Disposable proof

Run:

```bash
npm run tandem-identity-d1:verify
```

The verifier:

1. strips all ambient `PG*` variables, pins the local Unix socket and
   PostgreSQL 16 binaries, and refuses existing, remote, or production-like
   database names;
2. proves a deliberate mid-migration failure rolls back the earlier schema
   alterations;
3. applies migration 167, validates 12 tables/one view/admin ownership/zero
   non-admin grants, and directly reapplies it;
4. writes one synthetic receipt/candidate/decision/auth/projection/command/
   readback/snapshot/drift chain and exercises 18 reason-matched refusals;
5. proves an invalid second statement rolls back the first statement in the
   same transaction;
6. creates a custom-format backup, restores it to another generated database,
   verifies exact state and trigger behavior there;
7. runs two PostgreSQL clients against the same run and proves terminalization
   refuses a concurrent late snapshot item without leaving it behind;
8. proves populated rollback refuses without deleting evidence, performs an
   explicit disposable-only truncate, proves empty rollback and reapply; and
9. removes both databases and its private temporary backup, then reports zero
   residue.

The fixture uses only synthetic IDs/hashes and never opens a provider/network
connection. The proof's `productionConnections` and `providerAttempts` counters
must both be zero.

## Rollback and recovery

`rollback_167_tandem_identity_control_plane.sql` is usable only while every D1
table is empty and the new environment/manifest fields contain no D1 evidence.
Once a receipt, candidate, decision, auth binding, projection, command,
readback, snapshot, or drift item exists, rollback refuses before dropping
anything. A populated real store would require a separately reviewed archival
migration; deleting identity history is not a recovery mechanism.

Backup/restore proof establishes mechanics for synthetic D1. It does not set a
production RPO/RTO or select the final physical database. Those remain required
before customer authorization depends on this control plane.

## Not authorized or proven

- production migration, population, provider read, webhook mirror, or account
  import;
- Party/ref/access/enrollment/entitlement/customer-facing projection writes;
- Firebase/Google, Heartbeat, Plutio, Encharge, Trafft, Chaos, Sertifier,
  Stripe, Adyen, Sheets, or WordPress connectivity;
- provider dispatch, retries, egress, credentials, runtime registration,
  scheduling, communication, packaging, deployment, or live outcome;
- provider completeness semantics, production backup recovery time, failover,
  or a migration batch.

D2 may mirror production ingress only after explicit validation. It must still
perform no Party, ref, entitlement, access, provider, or customer-facing write.
