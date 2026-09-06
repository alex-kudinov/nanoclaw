# Academy Capacity Control Plane

Status: accepted architecture v1 with owner-approved simple-sync Gate E
strategy; migrations 142-144, the exact source-bound shadow, and Gate D are
live; `NC-20260906-005` implements the simplified cached-site integration

Task: `NC-20260905-004`

Owner acceptance: 2026-09-05

Predecessors:

- `docs/STUDENT-ENTITLEMENT-CATALOG.md`
- `docs/STUDENT-ENROLLMENT-FOUNDATION.md`
- `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`

Reviewed source proposal: Tandemweb commit `2bc59b670`, independently reviewed
in two bounded Claude Sonnet/high rounds before owner acceptance.

## Decision

Academy capacity is a Company OS domain in NanoClaw. Tandem OS owns canonical
capacity, assignment, reservation, transfer, withdrawal, waitlist, event,
receipt, and exception state. Tandemweb is a presentation and checkout client.
Student Roster, Heartbeat, Encharge, Google Calendar, Stripe, and Plutio retain
their native evidence or projection roles; none is the capacity database.

A narrow **Capacity** minion may take natural-language or structured orders,
perform bounded deterministic and AI-assisted processing, and invoke typed host
commands. It is not the database, transaction boundary, policy authority, or
message sender.

This acceptance completes the architecture gate only. It authorizes no
migration, runtime change, historical student reconciliation, provider write,
roster mutation, minion activation, waitlist contact, or deployment.

The separately authorized `NC-20260905-005` local dark implementation now
exists as migration/rollback 143 and `src/academy-capacity.ts`. It does not
cross any of those operational boundaries.

## Integration with the existing foundations

The accepted Tandemweb proposal used conceptual `academy_*` table names before
the current enrollment foundation was visible in that worktree. Those names do
not create a second model. The Company OS vocabulary and records below win:

| Capacity concept | Canonical predecessor or extension |
| --- | --- |
| Commercial offer and included promise | Versioned offer/bundle/component records from the entitlement catalog |
| Purchase, grant, sponsor, or manual arrangement | `enrollment_order` |
| One participant slot bought under an order | `enrollment_seat` |
| Exact participant bound to a frozen offer/bundle | `student_enrollment` |
| Scheduled class membership | `class_assignment` to one delivery block |
| Payment, invoice, check, sponsor, or scholarship evidence | Existing financial agreement/obligation and source-evidence model |
| Capacity limit and public availability | New seat-pool record for exactly one delivery block in v1 |
| Temporary checkout or operator hold | New capacity reservation linked to a seat pool and, when known, an order/seat |
| Released-seat demand | New waitlist entry and time-limited waitlist-offer records |

The schema implementation must therefore extend the enrollment foundation. It
must not introduce parallel enrollment, funding, participant, entitlement, or
schedule authorities merely because an earlier proposal suggested different
table names.

The existing `business_v2.programs` identity foundation is reusable.
`program_variants` mixes delivery instance, price, and capacity;
`variant_enrollments` has no participant identity; and
`v_program_variant_seats` counts per variant rather than per shared pool. They
remain untouched until the dark-schema design explicitly assigns a narrow
remaining role or deprecation path. They are not v1 capacity authority.

## Terminology

- **Governance program**: a durable workstream such as `program:company-os`.
- **Coaching program**: a customer-facing pathway such as ACC Level 1.
- **Component**: a promised teachable or service component such as ACC Module 1.
- **Offer**: a versioned commercial or grant package.
- **Delivery block**: the exact scheduled class or series used by the enrollment
  foundation. Public copy may call it a cohort.
- **Seat pool**: the capacity boundary for exactly one delivery block in v1,
  shared by one or more offers.
- **Enrollment seat**: a participant slot owned by an enrollment order. It is
  not capacity occupancy until an eligible student enrollment receives a live
  class assignment.
- **Capacity reservation**: an expiring hold against one seat pool.
- **Projection**: a versioned read model for a website, sheet, provider, or
  operator; never the write authority.

## Shared-pool rule

One delivery block has one seat pool in v1. Multiple offers may sell into it
when their frozen entitlements permit assignment to that block.

The September 7, 2026 ACC Module 1 delivery block illustrates the rule. The
standalone Module 1 offer, ACC full-program offer, and Professional Coach
Program offer all consume the same class capacity even though their broader
entitlements differ.

A full-program purchase creates its promised component entitlements but only
the selected starting class assignment. It does not pre-consume seats in every
future module. Multi-cohort pooled capacity is outside v1.

## Occupancy and public state

```text
occupied = current capacity-bearing class assignments in the seat pool
reserved = unexpired, unconsumed capacity reservations
committed = successful sales and explicit invoice/manual seat promises not yet
            reconciled to an assignment
available = max(0, capacity - occupied - reserved - committed)
```

Payment count, order count, enrollment-seat count, roster-row count, Heartbeat
membership, and waitlist size do not substitute for `occupied`.

The pool projection returns capacity, occupied, reserved, available, waitlist
count, public state, source revision, generated time, and expiry. Public state
is one of `open`, `sold_out`, `closed`, or `inventory_unknown`. An expired,
signature-invalid, contradictory, or unavailable authority produces
`inventory_unknown`, which is closed to checkout.

An explicit operator closure is reason-coded and distinct from derived
`sold_out`. Reopening requires a current occupancy calculation and cannot erase
the closure event.

## Typed host commands

Capacity extends the enrollment foundation rather than replacing its commands.

Existing commands remain authoritative for order and participant work:

```text
capture_order              link_source_reference
attach_evidence            create_seats
assign_participant         materialize_enrollment
assign_class               request_projection
record_projection_readback resolve_exception
correct_or_transfer
```

The capacity extension adds these command families, with final names frozen by
the dark-schema contract:

```text
register_delivery_block    configure_seat_pool
map_offer_to_seat_pool     reserve_capacity
release_reservation        commit_class_assignment
transfer_class_assignment  withdraw_class_assignment
close_seat_pool            reopen_seat_pool
reconcile_seat_pool        join_waitlist
stage_waitlist_offer       resolve_waitlist_offer
show_inventory             show_enrollment
commit_seat                transfer_commitment
reconcile_commitment       change_capacity
```

The minion may resolve operator wording to exact candidate IDs and explain
conflicts. Low confidence, multiple matches, absent schedule evidence, stale
state, or a last-seat conflict returns a review request. The minion may not
invent an ID, capacity, participant, assignment, payment state, or waitlist
position and may not bypass host validation with direct provider/database
writes.

## Transaction contracts

### Reserve capacity

Lock the seat pool, expire stale holds, count current capacity-bearing
assignments and live reservations, and create one reservation only if capacity
remains. Every source uses an immutable idempotency key.

- Checkout holds use a short fixed TTL.
- Manual holds require a bounded TTL, named actor, reason, and supporting order
  or intake reference. They cover invoices, checks, sponsor lists, and other
  temporary commitments before participant materialization is complete.

The simplified Gate E does not create checkout reservations. A successful
website sale or explicit operator promise creates one durable `commitment`
record per seat. It remains counted through the delivery-block end unless it is
released, transferred, or reconciled to an exact assignment. A commitment is
funding/capacity evidence, not participant or assignment authority. Duplicate
PaymentIntent or invoice-seat references replay idempotently.

### Commit assignment

In one transaction, validate the reservation, offer entitlement, delivery
block, student-enrollment version, and seat-pool version; create or reuse one
idempotent class assignment; consume the reservation; and append events. Roster
and Heartbeat projections happen afterward and cannot roll back canonical
assignment state.

### Transfer

Lock origin and destination pools in stable ID order, verify destination
availability, end the origin assignment, create the destination assignment,
and append one transfer event atomically. The enrollment order, enrollment
seat, participant, entitlement history, and funding remain distinct and are not
silently rewritten.

### Refund and withdrawal

A refund changes financial evidence or obligation state. A withdrawal ends a
capacity-bearing assignment. Neither implies the other. Deferral and transfer
policy remains a separate pre-build owner decision under the enrollment
foundation.

### Waitlist offer

Lock the pool and oldest eligible entry, allow only one active time-limited
offer for the released seat, and record its resolution. Capacity selects and
stages. Mailman contacts the person only after human approval and returns a
delivery receipt. A message, timeout, or click does not by itself create an
assignment.

## Cross-system boundary

- Google Calendar supplies schedule evidence for accepted delivery blocks.
- Bookkeeper/Contador records source-bound funding evidence and enrollment
  exceptions; it never decides occupancy or a last seat.
- Capacity invokes typed host commands over canonical state.
- Tandemweb renders a signed two-state projection stored locally in WordPress.
  Checkout reads that local state and never calls NanoClaw synchronously.
  Browser-visible availability is never internal inventory authority.
- Student Roster is an operator projection with exact readback.
- Heartbeat access and marker writes are projections; later progress drift is
  owned by the Student Lifecycle Control Plane.
- Encharge does not own FIFO or contact eligibility.
- Mailman sends only an approved, host-bound waitlist message.
- Certifier consumes verified identity/completion evidence and never writes
  capacity.

Before any cutover, the Bookkeeper path must stop writing assignment truth
independently and instead resolve the enrollment order/seat and capacity command
before the canonical projection drives Student Roster. That integration is a
named gated work item, not an assumed side effect.

## Tandemweb contract

Tandemweb receives a signed, PII-free `available|sold_out` projection with
exact pool, program, cohort date, monotonic publication revision, and payload
hash. WordPress stores it separately from `cohorts.json`; the accepted live
option drives both cached calendar rendering and server-side checkout
validation, while `cohorts.json` remains the bootstrap and rollback fallback.

Checkout never waits for NanoClaw and creates no temporary capacity hold. A
verified successful payment later enters the host through the existing
Contador path and creates one durable commitment. This deliberately accepts a
small simultaneous-sale/stale-publication oversale risk in exchange for fewer
lost-sale dependencies.

Threshold crossings and one daily reconciliation use one publication outbox.
On an accepted change, only the fixed affected LiteSpeed and Cloudflare URLs
are purged, then immediately prewarmed. Publication failure freezes the last
accepted website state, remains retryable, and alerts internally; it never
turns a functioning checkout into a NanoClaw availability dependency.

## Delivery gates

| Gate | Deliverable | Boundary |
| --- | --- | --- |
| A — architecture | This accepted integration record and canonical portfolio | Complete; no implementation authority |
| B — capacity extension | Reversible capacity relations, functions, views, permissions, fixtures, rollback, and default-off host mechanics extending the active enrollment dark foundation | Requires separate owner authorization; no provider or student data |
| C — read-only reconciliation | Exact schedule/catalog/Stripe/Bookkeeper/Roster source inventory and variance report | Requires explicit population, privacy scope, and historical window |
| D — operator pilot | Manual holds, transfers, withdrawals, reconciliation, and waitlist staging behind current website behavior | Requires internal-write authorization; no customer messages |
| E — simple site sync | Committed-seat ingestion, operator capacity changes, signed available/sold-out WordPress projection, daily/threshold publication, and targeted purge/prewarm with no checkout holds | Authorized under `NC-20260906-005`; requires reviewed release and live cache/status proof |
| F — authority cutover | Tandem OS becomes assignment/capacity authority; prior writers become projections | Requires a separate owner cutover decision |

No completed gate authorizes the next.

## Owner-approved Gate E simplification

On 2026-09-06 the owner rejected the proposed real-time reservation cutover as
disproportionate to current sales volume and explicitly accepted the residual
race risk. The superseding Gate E rules are:

1. count only successful website sales and explicit invoice/check/sponsor or
   manual promises as durable commitments;
2. create no 30-minute or other checkout-attempt seat hold;
3. update WordPress daily and whenever the two-state public threshold changes;
4. keep program pages fully cached and refresh only exact affected URLs;
5. keep checkout functioning from the last accepted local state during a
   publication outage;
6. preserve current sold-out ACC September 7 and MCS Friday, available MCS
   Thursday, and Rita's settled January Thursday assignment;
7. keep automatic waitlist contact, refunds/payments, and Gate F authority
   cutover separately governed.

Gate D is separately authorized by
`.program/decisions/decision-academy-capacity-gate-d-2026-09-06.json`. Its
host boundary derives actor and time, requires one immutable case key plus
expected versions and evidence, serializes each affected pool, runs the pure
capacity engine, persists only the validated delta, and returns an exact
readback receipt. The Capacity container has no database credential, Bash,
provider tool, general message tool, or network authority. Its runtime mutation
switch remains fail-closed until the exact reviewed release and capability
allowlist are live. Waitlist staging creates an internal reservation only; it
cannot approve, send, accept, convert, or contact a customer.

## Rollback

Disable the newest writer first. Keep current Student Roster, Tandemweb
availability JSON, and WordPress checkout guards intact through dark, shadow,
and operator gates. Never delete canonical events, reservations, assignments,
or receipts to simulate rollback. Reconcile accepted commands before restoring
traffic to a prior writer.

## Accepted owner choices

The owner accepted all of the following on 2026-09-05:

1. Company OS/NanoClaw is the governance and database home; the separate
   tandemweb program draft is retired.
2. The worker is the narrow Capacity minion with the bounded command scope
   above.
3. Capacity gets explicit relations in the existing Tandem OS database and
   does not repurpose the ambiguous empty variant tables as pooled truth.
4. V1 uses exactly one delivery block per seat pool and allows multiple offers
   to share it.
5. Checkout and manual reservations both exist; manual holds require reason,
   actor, source reference, and TTL.
6. Waitlist outreach remains human-approved initially.

The September 24, 2026 MCS Thursday delivery block remains open by explicit
owner instruction. The sold-out override covers the September 7 ACC shared
pool and September 25 MCS Friday, not MCS Thursday.

## Decisions still required before Gate B

The enrollment foundation's unresolved policy decisions remain open, including
retention, role authority, acceptable off-platform financial evidence,
activation-before-payment rules, transfer/deferral/withdrawal/refund policy,
projection ordering/compensation, and any reconciliation/backfill scope. This
architecture acceptance does not infer answers to them.
