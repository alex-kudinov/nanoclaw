# Academy Capacity Dark Implementation

Status: `NC-20260905-005` local implementation complete at `5b69e107`;
`NC-20260905-007` proves migrations 142 and 143 together on disposable local
PostgreSQL; `NC-20260905-008` records the bounded read-only source
reconciliation and seven owned exceptions; `NC-20260905-009` corrects its
labeled-only ACC count to 21 operational unique seats with an explicit
21-versus-22 boundary; `NC-20260905-010` records owner-confirmed capacity 12
and begins fail-closed prevention hardening; both migrations remain unapplied
and runtime unwired

Base: reviewed enrollment dark-foundation tip `deac91a8` and accepted capacity
architecture `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md`

## Boundary

This task creates portable, reversible source and deterministic tests only.
Migration 143 remains unapplied. No production composition root imports the
capacity engine. No real student, order, payment, roster, provider, schedule,
waitlist, or cohort record is read or changed. No minion is created or
activated, no customer is contacted, and nothing is deployed.

## Exact extension rule

Capacity adds no parallel enrollment model. It references migration 142's:

- `student_enrollment_orders` and `student_enrollment_seats` for optional hold
  bindings;
- `student_enrollments_v2`, `student_component_entitlements`, and
  `student_class_assignments` for assignment authority;
- append-only history and projection mechanisms for later side effects.

The pure TypeScript engine accepts and returns the existing
`EnrollmentFoundationState`. Assignment commit calls its reviewed
`assignClass` command. Transfer and withdrawal update the same assignment
records and append compatible history; they do not introduce a capacity-owned
student or funding record.

## Migration 143

The ordered source migration creates admin-only:

1. `academy_delivery_blocks`
2. `academy_seat_pools`
3. `academy_seat_pool_offers`
4. `academy_capacity_reservations`
5. `academy_waitlist_entries`
6. `academy_waitlist_offers`
7. `academy_capacity_events`
8. `v_academy_seat_pool_occupancy`

It also adds a foreign key from migration 142's class-assignment
`delivery_block_key` to the canonical delivery-block key. One seat pool per
delivery block is enforced by a unique key. Offer mappings are versioned by
offer key and entitlement-catalog revision. Reservations are uniquely
idempotent, time bounded, and may bind to an enrollment order/seat. Append-only
capacity events preserve command history.

The occupancy view counts `pending` and `active` class assignments as occupied
because both consume a promised future/current class seat. It counts only
unexpired `held` reservations as reserved and only `waiting`/`offered`
waitlist entries as waiting demand. A consumed reservation is not counted, so
an assignment cannot double-consume capacity.

The guarded rollback refuses after any migration-143 table contains a row. It
then removes only migration-143's assignment constraint, view, triggers,
tables, and sequences. It never drops migration-142 state.

The disposable proof makes the cross-migration cleanup consequence explicit:
before an empty rollback of 143, it deletes the synthetic migration-142 class
assignment whose delivery block belongs to 143, asserts that deletion, clears
the seven capacity tables in foreign-key order, and verifies that the
enrollment order foundation remains. It does not hide this coupling behind a
cascading truncate.

Composite foreign keys also ensure a reservation's seat belongs to its stated
order and a waitlist offer's entry and reservation belong to its stated pool.
The current-assignment unique index prevents one enrollment from occupying the
same delivery block twice through different entitlement records.

## Reservation channels

- `checkout`: maximum 30 minutes; no operator reason is required.
- `manual`: maximum seven days; named actor, nonblank reason, and source hash
  are required.
- `waitlist_offer`: maximum seven days; created only by FIFO waitlist staging
  and never treated as permission to send a message.

This internal waitlist reservation closes the race where public checkout could
take the released seat after a human-approved offer is staged. It supplements,
and does not weaken, the accepted checkout/manual channels.

## Pure command engine

`src/academy-capacity.ts` has no database, provider, filesystem, network,
clock, randomness, or environment dependency. Callers supply stable keys,
versions, evidence hashes, actors, and timestamps.

Commands cover:

- delivery-block registration;
- seat-pool configuration and exact offer mapping;
- reserve/release/expiry;
- assignment commit through the existing enrollment foundation;
- atomic cross-pool class transfer and withdrawal;
- operator close/reopen;
- FIFO waitlist entry, staging, approval/sent/accept/decline/expiry resolution;
- reconciliation assertions and inventory projection.

Every mutating command clones both relevant states before mutation. Version
tokens and idempotency keys fail closed. Invalid enums, keys, hashes, times,
TTLs, source bindings, entitlements, offer mappings, terminal states, stale
versions, over-capacity attempts, and duplicate assignments produce typed
`CapacityCommandError` values rather than partial state.

## Public inventory semantics

```text
occupied = pending + active assignments for the pool's delivery block
reserved = unexpired held reservations
available = max(0, capacity - occupied - reserved)
```

`operationalState=closed` projects `closed`. Otherwise zero available projects
`sold_out`; positive availability projects `open`. `inventory_unknown` belongs
to the later signed/freshness-aware projection adapter; this dark engine has no
external source clock or signature and does not pretend to establish it.

## Waitlist semantics

FIFO is ordered by `joinedAt`, then immutable `sequenceNumber`, then entry key.
Only one active offer may exist per pool in v1. Staging selects the oldest
eligible waiting entry and atomically creates a `waitlist_offer` reservation.
Approval and sent state are recorded separately. Acceptance does not itself
create a student assignment; the existing reservation must pass ordinary
commit validation. Decline, expiry, and cancellation release the reservation.
No command sends a message.

## Read-only source reconciliation

`NC-20260905-008` tests the current MCS September/January and ACC September 7
facts without populating this model. `NC-20260905-009` preserves that report as
historical evidence and corrects its ACC conclusion after the owner identified
check/email and combined-program sales outside the dated cohort labels. MCS
Thursday is reconciled at 5/12 and
remains open. MCS Friday has 13 active roster assignments against capacity 12,
not the owner hypothesis of 12; it remains sold out and blocked from import.
The owner-named deferral is currently assigned to January Thursday, but its
origin weekday is disputed by the prior transfer record and owner count
context. ACC September 7 has 8 explicitly labeled plus 13 operationally bounded
unlabeled assignments: 21 unique participants, or 22 if the held May 27 row
also belongs to September. The operational 21 split into 10 Module 1 and 11
Full Program roster routes. `NC-20260905-010` confirms capacity 12, making the
operational overage 9 and held upper-bound overage 10. Current source evidence
classifies 8 as Module 1, 5 as `$3,999` ACC Full, and none defensibly as
`$7,499` Professional Coach. None of the 21 appears in PCC, ACTC, or the
Professional Coach Heartbeat group, so the `$7,499` subgroup and expected
projections remain held rather than inferred.

The reusable evidence validator rejects lower owner overrides, unknown-capacity
availability claims, PII/raw Stripe IDs, unowned exceptions, funding gaps
without owned exceptions, population drift, and Heartbeat membership as
capacity authority. The report is evidence for a
later source-write decision, not a parallel operational catalog.

## Test matrix

Focused tests cover:

- one delivery block per pool and many offers per pool;
- checkout/manual/waitlist TTL and reason rules;
- last-seat and expired-hold behavior;
- idempotent replay versus conflicting key reuse;
- assignment-derived occupancy and no reservation double count;
- entitlement, enrollment, offer, delivery-block, and version checks;
- atomic transfer success and destination-full rollback;
- withdrawal and pool close/reopen;
- FIFO selection, one-active-offer, human approval/sent separation, and
  reservation release on terminal outcomes;
- SQL objects, constraints, append-only events, least privilege, guarded
  rollback, release packaging, and production unwired proof.
- disposable PostgreSQL 16.15 apply/shape/behavior/populated-refusal/explicit
  cleanup/empty-rollback/reapply for ordered migrations 142 and 143, including
  exact zero database residue under poisoned ambient `PG*` values.

## Promotion gates

1. Commit and push this reviewed local source. Complete under `NC-20260905-005`.
2. Separately authorize disposable PostgreSQL migration-142-plus-143
   apply/replay/rollback validation. Complete under `NC-20260905-007`.
3. Separately authorize production empty-schema migration with backups and
   least-privilege readback.
4. Separately authorize read-only schedule, offer, Bookkeeper, Stripe, and
   Student Roster reconciliation. The bounded September/January population is
   complete under `NC-20260905-008/009`, with the corrected 21-seat operational
   count, capacity 12, overage 9/10, one 21-versus-22 boundary, and held source
   exceptions.
5. Separately authorize operator/minion, Tandemweb, provider, communication,
   and authority-cutover stages.

Nothing in `NC-20260905-008` authorizes gates 3 or 5, production population, or
resolution of the held source exceptions.
