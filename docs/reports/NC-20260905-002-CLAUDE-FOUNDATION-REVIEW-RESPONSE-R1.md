# NC-20260905-002 Claude foundation review response R1

Scope reviewed only: `docs/STUDENT-ENROLLMENT-FOUNDATION.md`,
`facts/catalogs/student-enrollment-foundation-v1.json`,
`facts/catalogs/student-enrollment-foundation-v1.schema.json`,
`scripts/validate-student-enrollment-foundation.mjs`,
`src/student-enrollment-foundation.test.ts`. No other files were read, no
Bash/tools invoked, no data inspected.

## P0

### P0-1: `financial_obligation` is used as a query fact source but is not a defined entity

Evidence: `facts/catalogs/student-enrollment-foundation-v1.json` —
`query_contracts[2]` (`next_payment_due`) sets
`"starts_from": "financial_obligation"`. The `entities` array (8 entries)
defines `financial_agreement` (`zero_or_one_per_order`) but has no
`financial_obligation` entity with its own identity/cardinality, unlike the
parallel case of `component_entitlement` (`many_per_student_enrollment`,
correctly split out from `student_enrollment`). Every other query's
`starts_from` (`class_assignment`, `class_assignment`, `enrollment_seat`,
`enrollment_exception`) matches a real entity key; `financial_obligation`
does not. The doc text (`docs/STUDENT-ENROLLMENT-FOUNDATION.md` "Financial
agreements and their dated obligations belong to the order... installment
due status comes from an actual obligation schedule") and the
`obligation` state machine (`not_due, due, paid, waived, cancelled,
refunded, disputed`) both imply per-installment records distinct from the
one agreement, exactly the "many rows transition independently" shape that
justified giving `component_entitlement` and `class_assignment` their own
entities.

Consequence: an implementer has no defined identity, cardinality, or version
field for the thing `next_payment_due` is supposed to start from. They must
invent the obligation record's shape themselves — the review question "can a
later implementation proceed without inventing major semantics" is directly
answered no for this query, which the review request specifically calls out
("operational queries for class recipients, cohort views, and payment due").

Correction: add a `financial_obligation` entity (e.g.
`cardinality: many_per_financial_agreement`, `identity: "agreement_id plus
obligation_id plus version"`), reference it from
`materialization_gates`/`assign_class` where relevant, and have the
validator assert `query_contracts.next_payment_due.starts_from` names a real
entity key (see P0-2 for the general cross-reference gap).

### P0-2: Large parts of the machine-readable contract are unchecked by both the JSON Schema and the validator

Evidence, `scripts/validate-student-enrollment-foundation.mjs`:

- `projection_policy.success_exit_or_message_is_not_receipt` is set `true` in
  the fixture and encodes the single most emphasized invariant in the doc
  ("Timeout, script exit zero, queued status, Slack message, or a row-count
  change is not verification" — `docs/STUDENT-ENROLLMENT-FOUNDATION.md`,
  Projection contract). It is never read by the validator (compare the four
  `projection_policy.*` checks around lines 214–236, which cover
  `verified_requires_exact_readback`,
  `direct_operator_target_edit_is_not_canonical_intake`,
  `heartbeat_access_groups_remain_constant`, and
  `heartbeat_marker_groups_are_zero_content_parallel_projection`, but skip
  `success_exit_or_message_is_not_receipt` and `targets`).
- `privacy_and_audit` has 6 keys in the fixture; only
  `append_only_evidence_and_transition_history` and
  `named_actor_for_manual_decisions` are asserted (lines 255–265).
  `store_source_references_not_raw_financial_documents`,
  `raw_participant_uploads_short_lived`, `content_minimized_operational_views`,
  and `retention_policy_requires_owner_acceptance_before_build` are never
  checked.
- `authority` (canonical process owner, identity owner, entitlement catalog
  pointer, native fact owners, projections-not-masters list) is never
  inspected anywhere in the validator, and the JSON Schema only requires
  `"type": "object"` for it with no `required`/`properties`, so it is
  unconstrained at both layers.
- Of the 10 `synthetic_scenarios`, the validator only asserts the specific
  `expected` outcome for 2 (`sponsor_nine_only_four_named`,
  `check_without_participant`; lines 279–294). The other 8 — including
  `refund_or_dispute` → `held_for_policy_not_silent_revoke` (the doc's
  explicit "a refund/dispute creates a policy hold, not an automatic silent
  revocation" rule), `module_only_future_module` →
  `no_future_payment_obligation_without_agreement` ("module-only ownership
  does not create a debt for the next module"), and `duplicate_manual_capture`
  → `deduplicated_by_source_key` (the idempotency invariant) — are only
  checked for `channel` existing and `seats > 0`, not for their `expected`
  text matching the doc's stated rule.
- `src/student-enrollment-foundation.test.ts` mirrors exactly the invariants
  the validator already checks; it adds no independent coverage of the gaps
  above.

Consequence: a future edit could delete
`success_exit_or_message_is_not_receipt`, flip any of the four unchecked
`privacy_and_audit` flags, replace `authority.canonical_process_owner` with a
different owner, or change `refund_or_dispute.expected` to
`"silently_revoked"` — and `npm test` plus the validator script would both
still report success. This directly answers the review's final question:
today, these sections are decorative, not enforced.

Correction: extend the validator with one assertion per currently-unchecked
flag/scenario outcome, following the exact pattern already used for
`verified_requires_exact_readback` and `sponsor_nine_only_four_named`, before
treating this contract as a build gate.

## P1

### P1-1: Alias/multi-reference linkage has no representation in entities, commands, or exceptions

Evidence: `docs/STUDENT-ENROLLMENT-FOUNDATION.md`, Ingress contract →
Idempotency: "Aliases link Checkout Session, Payment Intent, charge, invoice,
contract, and operator references without creating duplicate orders." In
`facts/catalogs/student-enrollment-foundation-v1.json`, `capture_order`
requires a single `source_reference` (not a set/list), there is no alias
entity or "attach alias to existing order" command distinct from
`attach_evidence` (which appends evidence, not identity aliasing), and the
only related exception code is `duplicate_source_conflict`, which detects a
conflict but does not model linking a new reference to an already-captured
order.

Consequence: the mechanism the doc relies on to guarantee "the same payment
cannot create a second order merely because it arrived through email and a
webhook" has no defined data shape. An implementer must invent how aliases
are stored and matched, with no schema or validator guardrail against
getting it wrong.

Correction: add an explicit alias/source-reference-link concept (e.g. let
`enrollment_order` identity include a `source_references: []` set, or add a
`link_source_reference` command requiring `order_version` +
`source_reference` + `idempotency_key`), and have the validator assert its
presence the same way it asserts other command shapes.

### P1-2: `materialize_enrollment` is missing a compare-and-swap version field

Evidence: `facts/catalogs/student-enrollment-foundation-v1.json`, `commands`
array. Every other mutating command carries a version field matching the
"compare-and-swap" rule in `docs/STUDENT-ENROLLMENT-FOUNDATION.md` ("States
and exceptions": "State changes are compare-and-swap, reason-coded, and
append-only in history") — `create_seats` requires `order_version`,
`assign_participant` requires `seat_version`, `assign_class` requires
`enrollment_version`, `request_projection` requires `subject_version`,
`resolve_exception` requires `exception_version`, `correct_or_transfer`
requires `current_version`. `materialize_enrollment` requires only
`["all_materialization_gates"]` — no `seat_version` or `order_version`.

Consequence: `materialize_enrollment` is the command that transitions the
seat to `materialized` and creates the `student_enrollment` row (cardinality
`zero_or_one_current_materialization_per_assigned_seat`). Without a required
version token, two concurrent materialization attempts on the same seat have
no defined compare-and-swap guard at the command-contract level, leaving the
"zero-or-one" cardinality unenforced by anything other than an
implementation detail nobody was told to add.

Correction: add `seat_version` (and, if the order's `ready_to_materialize`
state also gates this, `order_version`) to `materialize_enrollment.requires`.

## P2

### P2-1: `enrollment` state `pending` has no defined meaning

Evidence: `state_machines.enrollment` is
`["pending", "active", "held", "completed", "withdrawn", "cancelled"]`, but
the Materialization gate section of the doc states materialization is
all-or-nothing ("The transaction creates the enrollment and its included
component entitlements or creates neither"), which implies a freshly
materialized enrollment should already be usable/active, not pending. `held`
is well defined (refund/dispute policy hold); `pending` is not defined
anywhere in the doc (e.g. as "materialized but before its effective start
date"). Minor — likely resolvable by a one-line clarification rather than a
redesign, but worth closing before it's read two different ways by two
implementers.

## Invariants verified as sound

- Order → seat → student-enrollment three-level identity and the
  `zero_or_one_current_materialization_per_assigned_seat` /
  `one_or_many_per_order` cardinalities correctly prevent `payment = student`
  and `roster row = enrollment` collapse.
- `payer_equals_participant` enum (`only_with_explicit_self_purchase_evidence
  / never_inferred / not_applicable`) plus the validator's explicit rejection
  of `automatic` (and the matching mutation test) correctly blocks silent
  payer-to-participant promotion, including for `sponsored_cohort`.
  `sponsor_nine_only_four_named` → `partially_materializable` and
  `check_without_participant` → `held_needs_participant` are the two
  scenarios with real assertion coverage and both hold.
  `unassigned_sponsor_seats` query correctly `forbids: ["invented_participant"]`.
- `request_projection` (`outbox_only`) / `record_projection_readback`
  (`append_only`) / `correct_or_transfer` (`append_only`) writes-shape is
  enforced by the validator with matching mutation tests, correctly keeping
  projection out of the materialization transaction and keeping corrections
  non-destructive.
- Phase boundary correctly forbids all nine out-of-scope actions
  (reconciliation, backfill, provider write, migration, runtime change,
  deployment, communication, historical inspection), matches
  `later_gates`/rollout-gates sequencing in the doc, and is asserted by the
  validator with a mutation test.
- Owner-decision items in the doc's closing section (retention periods,
  confirmation-role assignment, check/ACH/wire evidence sufficiency,
  pre-payment activation policy, roster column finalization, transfer
  policy) are correctly left as explicitly gated future decisions, not
  silently assumed — these are not defects.
