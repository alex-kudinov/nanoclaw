# Academy Capacity Dark Implementation

Status: `NC-20260905-005` local implementation complete at `5b69e107`;
`NC-20260905-007` proves migrations 142 and 143 together on disposable local
PostgreSQL; `NC-20260905-008` records the bounded read-only source
reconciliation and seven owned exceptions; `NC-20260905-009` corrects its
labeled-only ACC count to 21 operational unique seats with an explicit
21-versus-22 boundary; `NC-20260905-010` records owner-confirmed capacity 12;
`NC-20260906-002` applied migrations 142-143 and populated the exact production
shadow; `NC-20260906-003` implements the separately authorized Gate D
host/operator boundary while Gate E/F remain unapproved

Base: reviewed enrollment dark-foundation tip `deac91a8` and accepted capacity
architecture `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md`

## Boundary

The original Gate B task created portable, reversible source and deterministic
tests only. Migrations 142-143 are now populated in production under the
separate Gate C/shadow decision. Gate D adds a default-off host adapter and
operator minion without changing checkout, provider, message, or public-site
authority.

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
`NC-20260906-001` settles the owner-named deferral's assignment as September
Friday to January Thursday. The historical Stripe payment remains attributed
to Thursday, so Tandemweb now carries assignment origin and payment source as
separate fields rather than forcing one false origin. The roster already had
the destination; the stale September Heartbeat membership was removed while
preserving the user and base MCS access. Thursday reconciles to 5 funded seats,
and three exact manual/legacy bindings reconcile Friday funding to all 13
current rows. The distinct Friday 13-versus-owner-12 roster variance remains;
the settled deferral must not return to the exception set.

The same source-repair slice makes ACC September 7 explicit at 21 assignments:
10 Module 1 and 11 Full Program routes, capacity 12, oversold by 9. The May 27
row is assigned to the prior June cohort and there are zero post-boundary
unlabeled rows. Exact payment and paid-invoice evidence classifies 9 as Module
1, all 11 Full Program seats as `$3,999` ACC Full, and 0 as `$7,499`
Professional Coach. One Module 1 assignment remains funding-source unresolved.
All 11 ACC Full participants have current Full Course access in Heartbeat (10
exact-email plus one explicit alias candidate); no Professional Coach
projection is required.

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
   least-privilege readback. Authorized for shadow-only population under
   `NC-20260906-002`; implementation and exact production readback are in
   progress, with no daemon activation.
4. Separately authorize read-only schedule, offer, Bookkeeper, Stripe, and
   Student Roster reconciliation. Complete under `NC-20260905-008/009`.
   Separately authorize exact source repairs. `NC-20260906-001` resolves the
   May 27 boundary, labels all 21 September assignments, settles the 11-seat
   `$3,999`/`$7,499` split as 11/0, reduces ACC funding uncertainty to one
   assignment, and settles the MCS Friday-to-January transfer with provider
   readback.
5. Separately authorize operator/minion, Tandemweb, provider, communication,
   and authority-cutover stages.

`NC-20260906-002` authorizes gate 3 only: reviewed production schema and shadow
population with the three held exceptions. It does not authorize gate 5,
runtime activation, customer communication, refunds, or authority cutover.

## Gate D operator implementation

Migration 144 adds only two admin-owned tables and one privacy-minimized view:
`academy_capacity_operator_cases`, append-only
`academy_capacity_operator_receipts`, and
`v_academy_capacity_operator_cases`. Cases store exact public/internal keys,
versions, hashes, counts, and bounded result summaries; they do not store names,
emails, payment details, provider payloads, or message content. A populated
rollback refuses evidence deletion.

`src/academy-capacity-operator-store.ts` is the host adapter. A mutation:

1. takes an advisory lock on the exact case key;
2. replays an identical completed case or rejects changed facts under the same
   key;
3. records a requested receipt;
4. locks affected seat pools in stable ID order;
5. reconstructs the existing canonical capacity/enrollment state and invokes
   the reviewed pure command engine;
6. applies only the engine delta under compare-and-swap versions;
7. reloads database state and records a final hash-bound readback receipt.

A savepoint preserves the case while rolling back every partial domain write
on refusal or error. Last-seat competitors serialize on the same pool. The
disposable proof demonstrates exactly one winner, one stale-version review
case, identical replay, conflicting-case refusal, manual release, FIFO
waitlist staging with no message, one-active-offer refusal, compatible atomic
transfer, independent withdrawal, reconciliation, 14 cases/28 receipts, no PII
markers in summaries, zero non-admin grants, and populated rollback refusal.

The `capacity` capability has no credentials, network, Bash, filesystem write,
provider, email, general Slack-send, payment, refund, certificate, checkout, or
public-site tool. Read commands require exact pool/enrollment keys and expose
no participant identity. Mutation IPC is additionally guarded by
`ACADEMY_CAPACITY_OPERATOR_ENABLED`; capability enforcement must include
`capacity` before the registered group is loaded. For a new folder, activate
the release that recognizes its manifest while the mutation switch is off;
create/register the group without restarting the old daemon; add `capacity` to
the enforced list; then restart once so group and manifest become visible
atomically. Never put a new folder into an old release's enforced list because
that also breaks its rollback startup.

## Gate E simple status synchronization

`NC-20260906-005` supersedes the proposed real-time reservation cutover. The
owner explicitly prefers a small residual simultaneous-sale risk to making
checkout depend on NanoClaw or creating 30-minute seat holds.

Migration 145 adds `commitment` to both reservation constraints and separates
durable committed seats from temporary `reserved` inventory in the occupancy
view. A commitment is one successful website sale or one explicit
invoice/check/sponsor/manual promise. It may exceed capacity because the sale
has already happened and inventory must remain truthful; it stays live through
the delivery-block end. Exact release, transfer, and assignment reconciliation
prevent double count. The same migration extends operator case types and adds
an admin-only retryable website-publication outbox.

The host adds four bounded commands: `commit_seat`, `change_capacity`,
`transfer_commitment`, and `reconcile_commitment`. Website Stripe facts enter
only after Contador's exact PaymentIntent, Payment Log, PostgreSQL, and Student
Roster disposition is complete. The fact carries no customer identity. Invoice
and other off-site promises enter one seat at a time through Capacity. No
command creates a participant or assignment, contacts a customer, or performs
a financial action.

`academy-capacity-publication.ts` maps only ACC Module 1 and MCS delivery blocks
to `available|sold_out`. Threshold changes enqueue immediately; one daily pass
replays every managed pool. A signed raw-body POST updates a monotonic local
WordPress option. The host then purges only the program's fixed Cloudflare URLs
and prewarms them before recording the acknowledgment. Failures retain the
outbox row with bounded backoff and freeze the last accepted website state.

Tandemweb's separate live option drives both calendar rendering and server-side
checkout validation. `cohorts.json` remains the disabled-mode bootstrap and
rollback fallback. When simple sync is enabled, new checkout attempts skip the
legacy WordPress option reservation; existing in-flight reservation metadata
can still drain safely. The signed endpoint purges only affected LiteSpeed URLs
and prewarms them, while the host performs the exact Cloudflare purge and final
prewarm. Program pages remain normally cached and make no per-visitor capacity
request.
