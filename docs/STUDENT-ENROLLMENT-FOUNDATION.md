# Student Enrollment Foundation

Status: foundation revision 2, design and local dark implementation contract

Task: `NC-20260905-002`

Machine-readable authority:
`facts/catalogs/student-enrollment-foundation-v1.json`

## Decision

Every legitimate Academy enrollment enters one provider-neutral Company OS
process, regardless of whether it began with website Stripe, a manual Stripe
payment, a Plutio invoice or contract, a check/ACH/wire, a sponsored cohort, a
scholarship, a complimentary grant, or a correction.

The process does not start by adding a row to Student Roster or a member to
Heartbeat. It starts with a source-bound enrollment order. One order owns one or
more seats. A seat can remain unassigned. Only an explicitly identified
participant can produce a student enrollment.

This foundation phase performs no historical reconciliation, backfill,
provider write, database migration, runtime change, deployment, or student
communication.

## Why the three-level model is necessary

`payment = student` fails for sponsored cohorts, parents or employers paying,
manual arrangements, scholarships, and one payment covering several people.
`roster row = enrollment` fails when a legitimate student has not been added or
when a row was created without source authority. `Heartbeat member = purchase`
fails because access and cohort marker groups are projections, not commercial
truth.

The foundation therefore separates:

1. **Enrollment order** — the commercial agreement or authorized grant.
2. **Enrollment seat** — one participant slot under that order.
3. **Student enrollment** — one exact participant bound to an offer and frozen
   entitlement bundle version for one episode.

A nine-seat sponsor order may have four assigned and five unassigned seats. The
four exact participants can progress without inventing the remaining five.

## Authority

Company OS owns the cross-provider process, identifiers, current projections,
exceptions, and receipts. Native sources retain their facts:

- Stripe owns its payment objects and schedules;
- Plutio owns its invoices and contracts;
- bank/check evidence owns the fact that an off-platform payment was received;
- checkout/application or a sponsor roster owns participant assertions;
- Party Context owns internal person identity and source-reference joins;
- the entitlement catalog owns offer-to-bundle/component promises;
- an accepted delivery-block catalog owns class identity and schedule;
- Heartbeat owns supported access and learning facts;
- Student Roster, Heartbeat markers, Encharge, and Plutio student projects are
  purpose-specific projections, never the universal master.

Evidence conflicts remain explicit. Recency, a plausible name, a matching
email, or an operator's direct target edit cannot silently outrank source
authority.

## Canonical records

### Enrollment order

An order contains a stable internal ID, source channel, immutable idempotency
key, source references, buyer/payer relationship, exact offer key, requested
seat count, commercial/grant terms, financial agreement reference when
applicable, evidence status, state/version, and timestamps.

The order stores source references and minimized facts, not check images,
contracts, raw webhook bodies, bank data, or card details.

Each source reference is a separate append-only alias keyed by source scope,
object type, and object ID. Many references may bind to one order; one reference
cannot bind to two orders. Conflicting reuse creates a blocking exception.

### Enrollment seat

Each seat has a stable ID independent of the participant. It records the order,
seat number, state/version, participant Party reference when assigned,
participant-evidence references, relationship to the payer, and transfer or
cancellation history.

Unassigned is a valid, visible state. Missing names do not block already valid
seats in the same order.

### Student enrollment

Materialization freezes the offer key, entitlement catalog revision, bundle key
and version, language, participant, originating order/seat, effective dates,
and the source facts that passed each gate. Identity is an enrollment UUID and
version, not `party + course`; a correction or transfer appends history.

### Entitlements, assignments, and obligations

The enrollment materializes component entitlements from the frozen bundle.
Class assignments are separate and bind only scheduled components to exact
delivery blocks. A financial agreement owns many independently versioned,
dated financial obligations. Those obligations belong to the order and remain
independent of entitlement and class assignment.

Consequences:

- full-program purchase does not invent future class assignments;
- module-only ownership does not create a debt for the next module;
- installment due status comes from an actual obligation schedule;
- access does not prove payment or attendance;
- completion does not consume mentoring or supervision allowances;
- a refund/dispute creates a policy hold, not an automatic silent revocation.

## Ingress contract

Every channel invokes the same commands. No channel writes Student Roster or
Heartbeat directly.

1. `capture_order` admits a source reference and idempotency key.
2. `link_source_reference` appends another provider/operator alias to that
   order after exact collision checks.
3. `attach_evidence` appends commercial, payment, participant, or grant proof.
4. `record_financial_agreement`, `record_financial_obligation`, and
   `transition_financial_obligation` keep actual dated obligations versioned
   and independent from enrollment or entitlement.
5. `create_seats` uses an explicit seat-count authority.
6. `assign_participant` binds one seat to one exact Party reference.
7. `materialize_enrollment` compare-and-swaps both order and seat versions and
   checks every gate atomically.
8. `assign_class` binds eligible components to accepted delivery blocks.
9. `request_projection` writes a version-bound outbox command.
10. `record_projection_readback` records the exact target result.
11. `resolve_exception` requires evidence and a named actor.
12. `correct_or_transfer` appends a new version and preserves prior facts.

### Idempotency

Provider intake uses stable provider scope plus source object/event identity.
Manual intake receives an opaque order key before work begins; retry reopens the
same order. Aliases link Checkout Session, Payment Intent, charge, invoice,
contract, and operator references without creating duplicate orders.

The same payment cannot create a second order merely because it arrived through
email and a webhook. A source-key collision with different material facts is a
blocking `duplicate_source_conflict`, never last-write-wins.

### Participant identity

Evidence order is:

1. exact participant identity submitted through checkout/application;
2. exact named sponsor roster tied to the order;
3. exact Plutio contract or invoice participant evidence;
4. a named operator confirmation linked to its supporting source;
5. otherwise `participant_missing` or `participant_ambiguous`.

Payer identity may become participant identity only when the purchase path
explicitly attests self-purchase. Matching names or emails alone are
insufficient. One payer may fund many seats and need not become a student.

## Materialization gate

A seat becomes a student enrollment only when all are true:

- immutable source reference exists;
- offer key and bundle version are exact;
- the seat is assigned to one exact Party;
- participant evidence is source-bound;
- payer/participant relationship is explicit;
- required financial terms are classified, including `not_applicable`;
- no blocking identity, offer, or entitlement conflict remains.

The transaction creates the enrollment and its included component entitlements
or creates neither. Projection is never part of this transaction.

## Manual and sponsored intake

The future operator surface is a canonical intake form, not a shortcut to the
Sheet. It supports save-as-incomplete and must show:

- source channel and source reference;
- payer/buyer, or explicit no-payer grant;
- offer and frozen bundle version;
- seat count and seat-count evidence;
- participant list with evidence per seat;
- starting delivery block when known;
- financial agreement type and source schedule when applicable;
- unresolved fields and the next responsible owner.

Bulk upload is staging only. It validates shape, duplicates, Party candidates,
seat count, offer, and delivery block before an operator accepts exact rows.
Raw uploads receive short retention and never become canonical evidence merely
because parsing succeeded.

## States and exceptions

Order, seat, enrollment, financial obligation, projection, and exception each
have independent state machines defined in the machine-readable contract.
State changes are compare-and-swap, reason-coded, and append-only in history.

`pending` means the enrollment has been materialized but has a future effective
start or a separately accepted activation condition. It cannot be projected as
active. It is not a half-written materialization state.

Minimum durable exceptions include missing/conflicting source, offer, bundle,
financial terms, seat count, participant, payer relationship, delivery block,
entitlement, projection, roster/access drift, contact identity, and
consent/suppression. Each exception has a stable fingerprint, owner, first/last
seen, review time, version, and evidence-backed resolution.

Slack and email may present an exception. They are not the queue and cannot
close it.

## Projection contract

Each target receives the smallest relevant versioned projection through an
outbox. A projection is `verified` only after exact target readback for the
same subject version. Timeout, script exit zero, queued status, Slack message,
or a row-count change is not verification.

- **Student Roster:** participant, enrollment, program/offer/bundle revision,
  cohort/class assignment, lifecycle summary, and source-safe status columns.
- **Heartbeat:** constant content-access groups plus separately governed hidden
  zero-content class/enrollment markers. Neither layer is canonical truth.
- **Encharge:** identity, service lifecycle, purpose eligibility, and
  suppression; never raw payment evidence or inferred marketing consent.
- **Plutio:** operator-facing engagement/project context; not canonical student
  identity or entitlement authority.

Projection correction is generated from canonical state. Directly fixing a
target can be emergency containment, but must create an exception until the
canonical source and readback agree.

## Query semantics

Operational lists begin from the fact they claim:

- tomorrow's class starts from the exact delivery block and current class
  assignments, then joins active enrollment, verified contact identity,
  purpose eligibility, suppression, and delivery holds;
- cohort roster starts from current class assignments, not payments;
- next payment due starts from actual dated financial obligations, not course
  ownership or a guessed next module;
- unassigned sponsor seats start from seat state and never invented people;
- fulfillment work starts from durable open exceptions, not Slack history.

Every query exposes freshness, missing/conflicting facts, and the authority
used. Unknown stays unknown.

## Security, privacy, and audit

- admit only registered source channels and bounded typed fields;
- keep source identifiers scoped by provider/account/community;
- store references and hashes instead of raw financial documents;
- keep raw participant uploads short-lived and access-limited;
- record named actor, reason, previous/new version, and source evidence for
  every manual decision;
- never put student emails or raw personal lists in logs, Slack summaries,
  review packets, fixtures, or tracked schema documents;
- separate read, intake, identity resolution, materialization, projection,
  exception resolution, and communication capabilities;
- require explicit retention and deletion policy acceptance before build.

## Failure and recovery rules

- transient canonical-store failure retries the same command/idempotency key;
- ambiguous provider acceptance does not blind-retry a write;
- projection failure remains replayable from the immutable outbox command;
- identity/offer/evidence conflicts hold without projection;
- partial sponsor orders advance valid seats while retaining owned unassigned or
  invalid seats;
- replay uses canonical receipt/case ID, never pasted source payload;
- correction and transfer append new versions and supersede target projections;
- no destructive rollback deletes audit history.

## Rollout gates

1. **Foundation acceptance (this task):** design, schema, synthetic scenarios,
   validation, and independent convergence only.
2. **Dark schema/runtime:** separately authorize ordered migrations and
   default-off host mechanics; no provider or student data.
3. **Read-only reconciliation:** separately authorize source inventories,
   historical window, privacy scope, and exact known-case investigation.
4. **Operator pilot:** separately authorize a small set of new manual orders;
   canonical-only, projections still disabled.
5. **Projection pilot:** separately authorize each target and exact readback;
   no bulk backfill.
6. **Bounded backfill:** separately authorize cohort/window, expected counts,
   exception ownership, rollback, and provider effects.
7. **Communication consumers:** separately authorize purpose, recipients,
   preview/approval, suppression, idempotency, and delivery receipts.

No later gate is implied by acceptance of this foundation.

## Synthetic acceptance scenarios

The contract validates self-pay, separate payer, fully and partially named
sponsor orders, check without a participant, scholarship, module-only future
payment semantics, duplicate capture, transfer, and refund/dispute hold. These
are synthetic and contain no student data.

Before any implementation, schema tests must additionally cover concurrent
capture, alias collision, stale version, partial materialization, transfer,
reversal, outbox replay, exact-readback mismatch, least privilege, retention,
and rollback.

## Owner decisions still required before production promotion

The local dark build uses the conservative defaults in
`facts/catalogs/student-enrollment-policy-v1.json`. Before applying migration
142 or enabling any runtime path, the owner must confirm or version-replace:

- accepted retention periods for evidence, raw uploads, receipts, and history;
- which roles can confirm participants, seat counts, transfers, and grants;
- financial evidence sufficient for check/ACH/wire and unpaid invoiced orders;
- whether enrollment may activate before payment for each agreement type;
- exact roster projection columns and operator-edit coexistence window;
- exact provider projection sequence and failure compensation policy;
- whether and when a sponsor may replace an assigned participant;
- policy for refunds, disputes, deferrals, withdrawals, and entitlement holds;
- separately accepted reconciliation/backfill population and time window.
