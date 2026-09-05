# NC-20260905-003 Claude dark-foundation implementation review R1 — Response

Reviewed strictly the seven listed artifacts. No Bash/MCP/web tools invoked, no
live data inspected, no implementation file edited.

## P0 — Domain aggregate cannot produce required audit/lifecycle columns

`src/student-enrollment-foundation.ts` entity interfaces omit fields that
`142_student_enrollment_dark_foundation.sql` declares `NOT NULL`. A later
persistence adapter cannot fill these columns from command input alone — it
would have to invent the values, which is exactly the failure mode the review
brief asks to rule out.

- `EnrollmentException` (line 220) has no `firstSeenAt`, `lastSeenAt`,
  `reviewAt`, or `resolvedAt`, and `openEnrollmentException`/
  `resolveEnrollmentException` never compute them. SQL requires
  `first_seen_at`, `last_seen_at`, `review_at` NOT NULL and ties `resolved_at`
  to the resolved/accepted/superseded states via a CHECK (lines 258-266). The
  foundation doc explicitly lists "first/last seen, review time" as mandatory
  exception attributes — this isn't incidental audit metadata, it's the
  re-observation mechanic itself, and it lives nowhere in the pure aggregate.
- `FinancialAgreement` (line 151), `FinancialObligation` (line 167),
  `ComponentEntitlement` (line 136), and `ClassAssignment` (line 186) all omit
  `createdAt`/`updatedAt`/`updatedBy`, though the corresponding tables
  (`student_financial_agreements`, `student_financial_obligations`,
  `student_component_entitlements`, `student_class_assignments`) require all
  three NOT NULL. `recordFinancialAgreement`, `recordFinancialObligation`, and
  `assignClass` already receive `actor`/`occurredAt` on the command input but
  currently strip them out (`...agreement`, `...obligation`, `...assignment`
  destructuring) instead of stamping the entity with them.
- `ProjectionOutboxItem` (line 196) omits `createdAt`/`updatedAt`
  (`student_projection_outbox` requires both). `ProjectionReceipt` (line 208)
  has `occurredAt` but not `recordedAt`, and `student_projection_receipts`
  requires both independently (they are allowed to differ — that's the point
  of tracking record-time separately from the source-observed time).

**Correction (bounded, no new semantics):** add the missing fields to each
interface and stamp them from the `actor`/`occurredAt` already present on
every command's input — `createdAt = updatedAt = occurredAt`,
`updatedBy = actor` on first write, `updatedAt`/`updatedBy` refreshed on each
subsequent transition. For `EnrollmentException` specifically: set
`firstSeenAt = lastSeenAt = occurredAt` in `openEnrollmentException`; add a
re-observation branch (see next finding) that advances `lastSeenAt`; require
`reviewAt` as an input to `openEnrollmentException`; set `resolvedAt` in
`resolveEnrollmentException`.

## P1 — `openEnrollmentException` silently drops re-observation and conflicting facts

Line 1398: `if (state.exceptions[input.exceptionKey]) return state;` no-ops on
any repeat call with the same `exceptionKey`, regardless of whether the new
call carries different `evidenceSha256`, `severity`, `ownerRole`, or
`reasonCode`. Every other idempotent command in this file
(`captureOrder`, `attachEnrollmentEvidence`, `requestProjection`,
`recordProjectionReadback`) compares material facts and throws a `*_conflict`
error when they differ, only silently short-circuiting on an exact match.
This command is the odd one out, and because the entity also lacks
`lastSeenAt` (see P0), a recurring condition never advances its last-seen
time and differing evidence is discarded without a trace.

**Correction:** on a repeat `exceptionKey`, compare `reasonCode`/`severity`/
`ownerRole`/`evidenceSha256` against the stored exception; if identical, bump
`lastSeenAt` (and push a `re_observed` history row) instead of a bare no-op;
if different, throw a conflict error (or route to `resolveEnrollmentException`
+ a fresh exception, per the append-only philosophy used elsewhere) rather
than silently keeping the stale record.

## P1 — `transferParticipant` has no seat-state precondition and can silently infer a payer relationship

Line 1467: `transferParticipant` never checks `seat.state` or
`seat.participantPartyId` before reassigning. Two concrete consequences:

1. It can be called on a seat in state `'unassigned'` (no current
   participant). In that branch `current` is `undefined`, so no
   `ownerDecisionSha256` is required, and the seat's `payerRelationship`
   defaults `'unknown' → 'separate_payer'` (line 1526-1529) with **no
   evidence attached and no explicit relationship supplied by the caller**.
   This is a real bypass of `assignParticipant`'s requirement that
   `payerRelationship` be explicit and evidenced, and directly contradicts
   the contract's `payer_as_participant: never_inferred` /
   "Matching names or emails alone are insufficient" language — here the
   *relationship*, not just identity, is what gets inferred.
2. Nothing prevents calling this on a seat whose state is `'cancelled'` or
   `'transferred'`; the function unconditionally sets `state: 'assigned'`,
   which would silently resurrect a cancelled seat.

**Correction:** require `seat.participantPartyId !== null` (i.e., a genuine
prior assignment) and `seat.state` to be one of the actively-held states
(`'assigned' | 'accepted' | 'materialized'`) before permitting
`transferParticipant`; route first-time assignment exclusively through
`assignParticipant`. Require an explicit `payerRelationship` argument rather
than defaulting `'unknown'` to `'separate_payer'`.

## P1 — Blocking-exception filter is an invented severity rule not sourced from the contract

`hasBlockingException` (line 1003) only treats `severity` in
`['critical', 'high']` as blocking for `materialize_enrollment`. Neither
`student-enrollment-foundation-v1.json` nor
`student-enrollment-policy-v1.json` defines a severity-to-blocking mapping —
severity is caller-assigned at `openEnrollmentException` time, with no
contract-fixed default per `reasonCode`. As written, an operator who opens
`participant_ambiguous` or `duplicate_source_conflict` at `medium` severity
(a plausible default for a first-pass triage) would let `materialize_enrollment`
proceed despite the gate text "no blocking identity, offer, or entitlement
conflict remains" — the contract does not say only high-severity conflicts
block. This is exactly the kind of implementation-invented, load-bearing
semantic the review brief asks to catch.

**Correction:** treat *any* `open`/`acknowledged` exception on the affected
order/seat/enrollment as blocking for materialization, independent of
severity; reserve `severity` for triage/SLA ordering only. If a
severity-gated exemption is genuinely wanted, it needs to be an explicit,
owner-approved addition to the policy catalog first, not an implicit default
in the aggregate.

## P1 — Projection supersession in `transferParticipant` skips version bump and history

Lines 1535-1540: when a transfer supersedes prior projections tied to the
withdrawn enrollment, the code sets `projection.state = 'superseded'` but
never increments `projection.version`, and no `student_enrollment_history`
entry is pushed for any of the affected projections (only one history entry
is recorded, for the seat). This breaks the stated invariant "order, seat,
enrollment, agreement, obligation, assignment, exception, and projection
changes compare-and-swap expected versions" and "State changes are
compare-and-swap, reason-coded, and append-only in history." A caller holding
a stale `expectedProjectionVersion` for one of these now-superseded
projections would not detect the mutation via a version mismatch, and the
supersession itself leaves no audit trail.

**Correction:** for each superseded projection, increment its `version` and
push a `student_enrollment_history` row (`subjectType: 'projection'`,
`reasonCode: 'superseded_by_transfer'`) alongside the existing seat history
entry.

## P1 — Closed-set fields validated only at compile time, not at the runtime boundary

`captureOrder` and `assignParticipant` are the only commands that check
closed-set fields against a runtime `Set` (`SOURCE_CHANNELS`,
`FINANCIAL_CLASSIFICATIONS`, `PAYER_RELATIONSHIPS`). Every other command
trusts the TypeScript union type alone, which provides no protection once
input arrives from JSON/IPC rather than a same-process caller — exactly the
"untrusted runtime validation" property this review was asked to check:

- `correctOrderTerms` (line 633) never validates
  `input.financialClassification` against `FINANCIAL_CLASSIFICATIONS` (the
  one place `captureOrder` does check it, `correctOrderTerms` does not).
- `recordFinancialAgreement`/`recordFinancialObligation`/
  `transitionFinancialObligation` accept `agreementType`, agreement `state`,
  and obligation `state` with no membership check.
- `assignClass`, `openEnrollmentException`/`resolveEnrollmentException`, and
  `requestProjection` accept `state`, `severity`, `ownerRole`, `target`, and
  `subjectType` values with no membership check.
- Several numeric fields with SQL-side `CHECK (... > 0)` bounds
  (`policyRevision` in `captureOrder`, `catalogRevision` in
  `materializeEnrollment`) are never range-checked at runtime either.

**Correction:** add the same `Set`-membership pattern already used for
`SOURCE_CHANNELS`/`FINANCIAL_CLASSIFICATIONS`/`PAYER_RELATIONSHIPS` for:
agreement type/state, obligation state, assignment state, exception
severity/owner role/state, projection target/subject type, plus explicit
positive-integer checks for `policyRevision`/`catalogRevision`.

## P1 — Generic `assertKey` bound is looser than the SQL column bounds it mirrors

`assertKey` (line 302) enforces one shared pattern,
`^[a-z0-9][a-z0-9._:-]{0,499}$` (up to 500 characters), for every `_key`
field: `orderKey`, `offerKey`, `bundleKey`, `seatKey`, `agreementKey`,
`obligationKey`, `enrollmentKey`, `sourceScope`. The SQL migration constrains
these same fields much tighter and inconsistently by column:
`order_key`/`offer_key`/`bundle_key`/`seat_key`/`agreement_key`/
`obligation_key`/`enrollment_key`/`source_scope` all cap at 200 characters
(`{0,199}`), `source_object_type` caps at 100 (`{0,99}`), and
`entitlement_key`/`assignment_key`/`delivery_block_key`/`evidence_key` cap at
250 (`{0,249}`). A key the domain layer accepts at, say, 350 characters would
be rejected by the SQL `CHECK` constraint at persistence time — a direct
break of "exact alignment ... between the accepted contract, policy defaults,
SQL shape, and TypeScript semantics."

**Correction:** parameterize `assertKey` with a `maxLength` argument and pass
the exact bound matching each column (200 for the order/offer/bundle/seat/
agreement/obligation/enrollment/source-scope family, 100 for
`sourceObjectType`, 250 for entitlement/assignment/delivery-block/evidence
keys), rather than one shared ceiling.

## P2 — Minor, non-blocking observations

- `ready_to_materialize` (order state machine) and the order-level `held`/
  `cancelled` states are declared in both the contract and the SQL `CHECK`
  but no command in `student-enrollment-foundation.ts` ever produces them —
  they are currently dead states. If order-level holds are meant to be
  representable independent of obligation-state/exception mechanics, a
  `hold_order`/`cancel_order` command is missing; if not, consider dropping
  the unused states from the contract to avoid the appearance of an
  unimplemented gate.
- `assignClass` does not reject a duplicate `(entitlementKey,
  deliveryBlockKey)` pair — nothing stops binding the same component to the
  same delivery block twice under two different `assignmentKey`s.

## Strongest invariants verified

- One order → many seats, one seat → at most one *current* enrollment is
  enforced identically in both layers: SQL's partial unique index
  `student_enrollments_v2_current_seat_uniq ... WHERE state IN ('pending',
  'active', 'held')` and the domain's equivalent check in
  `materializeEnrollment` (line 1089-1099) use the exact same three-state
  definition of "current."
- Migration 142's table creation order and the rollback's drop order are both
  FK-dependency-correct (verified by full topological trace); the rollback
  correctly drops the view before any table and checks all 13 tables for rows
  before allowing any drop.
- All 13 tables, the view, and their sequences are re-owned to
  `nanoclaw_admin` with `PUBLIC` revoked and no minion role granted — zero
  agent grants, matching the stated boundary.
- Append-only triggers are applied exactly to the tables the docs call
  append-only (source refs, evidence, projection receipts, history) and not
  to the mutable versioned aggregates — consistent with the stated design.
- `record_projection_readback`'s ambiguous-acceptance path correctly holds
  (`state: 'held'`) rather than verifying or blind-retrying, matching
  `projection_failure.ambiguous_acceptance: hold_for_readback_not_blind_retry`
  in the policy catalog.
- The source is genuinely unwired: no import of
  `src/student-enrollment-foundation.ts` appears in the reviewed artifacts
  outside its own test files, and every command in the reviewed file is a
  pure function over a cloned in-memory state with no DB/network/fs/clock/
  random dependency, consistent with the stated "no path to live data"
  requirement.
