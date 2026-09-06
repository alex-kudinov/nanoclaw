# Academy capacity production shadow population

Status: authorized, implementation under review  
Task: `NC-20260906-002`  
Program item: `work:academy-capacity-production-shadow-population`

## Boundary

This operation applies migrations 142 and 143 and imports the exact current
Academy enrollment/capacity state into production PostgreSQL. It does not
activate a host consumer, Capacity minion, checkout adapter, signed website
projection, provider writer, waitlist workflow, message, refund, certificate,
payment, or authority cutover. The live daemon remains on its existing release.

The imported shadow has five delivery blocks and forty active assignments:

| Delivery block | Capacity | Occupied | Expected state |
| --- | ---: | ---: | --- |
| ACC Module 1 · 2026-09-07 | 12 | 21 | sold out |
| MCS Thursday · 2026-09-24 | 12 | 5 | open |
| MCS Friday · 2026-09-25 | 12 | 13 | sold out |
| MCS Thursday · 2027-01-07 | 12 | 1 | open |
| MCS Friday · 2027-01-08 | 12 | 0 | open |

ACC assignments are 10 Module 1 and 11 ACC Full. The active catalog now defines
the missing one-component `acc-module-1:v1` bundle and `acc-module-1` offer.
The Professional Coach offer maps to the shared pool but has zero assignments.
MCS has 19 assignments across the three occupied blocks.

Exactly three facts remain open in `student_enrollment_exceptions_v2`:

1. Friday MCS has 13 authoritative roster assignments against the earlier
   owner count of 12.
2. One ACC Module 1 assignment has held funding classification.
3. One ACC Full roster email differs from the existing Heartbeat identity; the
   source alias remains unresolved and neither provider email is rewritten.

Rita's Friday-to-January assignment is settled and is not an exception.

## Private manifest contract

`build-academy-capacity-shadow-manifest.mjs` consumes two mode-0600 private
Google Sheets readbacks outside the repository and explicit SHA-256 identities
for the three Party-creation allowances, the one held funding assignment, and
the one alias exception. It refuses output inside the repository or overwrite
of an existing file.

The generated real manifest is mode 0600, contains the minimum transient
student identity needed for exact Party resolution, and is never committed or
printed. The reviewed manifest SHA-256 is:

`d44839d2b8ea08495fffd69fb5ca8c8aa6e30a9980c428477c3a4c3ea52793d8`

Public evidence records only this hash, aggregate counts, and readback receipts.

`populate-academy-capacity-shadow.mjs` is dry-run by default. Apply requires the
exact manifest hash and exact local hostname. The command rejects a
group/world-readable manifest, an unexpected database name, duplicate source
identity, multiple exact Party matches, a missing unapproved Party, population
or schedule drift, a missing offer/component, and any post-transaction count or
occupancy mismatch.

Thirty-seven participants currently resolve to exactly one active Party. Three
exact roster identities have no Party and are explicitly allowed to create one
new person plus exact email. Payer identity is always null/unknown and is never
inferred from the participant.

## Population contents

The transaction takes an advisory lock and creates deterministic, idempotent:

- five delivery blocks, five one-block seat pools, and seven offer mappings;
- 40 orders, seats, financial agreements, enrollments, and active assignments;
- 310 frozen component entitlements from catalog revision 1;
- exact roster source references and assignment evidence;
- 40 already-verified Student Roster projection outbox rows and final receipts;
- assignment history and capacity events;
- exactly three open held exceptions;
- zero reservations and zero waitlist rows.

All inserts use deterministic keys and `ON CONFLICT DO NOTHING`, followed by
exact chain, entitlement-count, exception, projection, and occupancy readback.
A second apply must insert zero rows.

## Production procedure

1. Verify `mini-claw.local`, live `/health`, exact release, Node 22.23.2,
   connected channels, and zero active containers/queue work.
2. Verify migrations 142–143 are absent and the prerequisite Party schema,
   append-only function, `nanoclaw_admin` role membership, and grants exist.
3. Commit and independently review this implementation. Build the immutable
   current-lineage release and verify it locally after fresh extraction.
4. Transfer the archive and compare its out-of-band SHA-256. Extract and verify
   it in a new immutable production directory. Do not activate the daemon.
5. Create a mode-0600 custom-format PostgreSQL backup of `business_v2`; verify
   it with `pg_restore --list` before migration.
6. Recheck that the target migration relations are absent. Apply migration 142,
   then 143, from the verified extracted release with `ON_ERROR_STOP=1`.
7. Read back role holders, object owners, table/sequence grants, and empty target
   health/occupancy before population.
8. Transfer the exact private manifest through the existing SSH trust boundary
   to a mode-0700 backup directory, verify mode and SHA-256, and run the
   release-bundled population command first without `--apply`.
9. Apply once with exact host and manifest confirmation. Preserve the aggregate
   receipt, run the same apply again, and require zero inserted rows.
10. Independently read back counts, occupancy, exception reasons, zero pending
    projections, zero reservations/waitlist, ownership/grants, live daemon
    release identity, channels, and queue state.

## Rollback and recovery

Before population, the reviewed rollback files may remove empty migrations in
reverse order. After population, both rollback files deliberately refuse
destructive removal. Runtime rollback is unnecessary because the daemon is not
activated on this artifact. Any post-population defect is held and corrected
forward under a new exact manifest/evidence decision; rows are not deleted to
simulate rollback.
