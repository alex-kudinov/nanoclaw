# NC-20260905-002 Claude foundation review response R2

Scope reviewed only: `docs/STUDENT-ENROLLMENT-FOUNDATION.md`,
`facts/catalogs/student-enrollment-foundation-v1.json`,
`facts/catalogs/student-enrollment-foundation-v1.schema.json`,
`scripts/validate-student-enrollment-foundation.mjs`,
`src/student-enrollment-foundation.test.ts`, and
`docs/reports/NC-20260905-002-CLAUDE-FOUNDATION-REVIEW-RESPONSE-R1.md`. No
other files were read, no Bash/tools invoked, no data inspected.

## R1 findings verified resolved

- **P0-1** (`financial_obligation` undefined): resolved. `entities` now
  includes `financial_obligation`
  (`cardinality: many_per_financial_agreement`,
  `identity: agreement_id plus stable obligation_id plus version`);
  `query_contracts.next_payment_due.starts_from` names it; the validator
  requires the entity and generically asserts every query's `starts_from`
  names a real entity key (`scripts/validate-student-enrollment-foundation.mjs`
  lines 235–241).
- **P0-2** (large parts of the contract unchecked): resolved except one
  residual gap — see P1-1 below. `success_exit_or_message_is_not_receipt`,
  all six `privacy_and_audit` flags, all five `authority` fields (including
  per-fact `native_fact_owners` arrays and the `projections_not_masters`
  list), and all ten `synthetic_scenarios.expected` outcomes are each now
  individually asserted, matching the fixture's actual content one-for-one.
- **P1-1** (no alias/multi-reference representation): resolved.
  `order_source_reference` entity added; `link_source_reference` command
  added requiring `order_version`, `source_scope`, `source_object_type`,
  `source_object_id`, `idempotency_key`; validator asserts the command is
  `append_only` and requires each field; mutation test covers removal.
- **P1-2** (`materialize_enrollment` missing compare-and-swap version):
  resolved. `requires` is now `["order_version", "seat_version",
  "all_materialization_gates"]`, matching the doc's "compare-and-swaps both
  order and seat versions"; validator and mutation test both assert this.
- **P2-1** (`pending` undefined): resolved.
  `state_semantics.enrollment.pending` defines it exactly as the doc's
  Materialization gate section implies (future effective start / accepted
  activation condition, not a half-written state); validator asserts every
  `state_machines.enrollment` entry has non-empty semantics, and a mutation
  test deletes `pending` to confirm the check fires.

## P1

### P1-1: One materialization gate is still unenforced by both the schema and the validator

Evidence: `facts/catalogs/student-enrollment-foundation-v1.json`,
`materialization_gates` has 7 entries:
`order_has_immutable_source_reference`,
`offer_key_and_bundle_version_are_exact`,
`seat_is_assigned_to_one_exact_party`,
`participant_evidence_is_source_bound`,
`payer_participant_relationship_is_explicit`,
`required_financial_terms_are_classified`,
`no_blocking_identity_offer_or_entitlement_conflict`. In
`scripts/validate-student-enrollment-foundation.mjs` (lines 172–182), the
`for (const gate of [...])` presence check lists only 6 of these 7 — it
omits `required_financial_terms_are_classified`. The JSON Schema's
`materialization_gates` property is `{"$ref": "#/$defs/uniqueStrings"}` with
no `minItems: 7` and no per-item enumeration, so it does not compensate.
`src/student-enrollment-foundation.test.ts` has no test that reads or
mutates `materialization_gates` at all.

Consequence: `required_financial_terms_are_classified` is one of the seven
bullets in the doc's Materialization gate list ("required financial terms
are classified, including `not_applicable`") and is exactly the invariant
that makes `financial_obligation`/`not_applicable` classification load-
bearing rather than optional. Today, deleting that one string from
`materialization_gates` passes the schema, passes the validator, and passes
`npm test` — the same "decorative, not enforced" failure mode the R1 P0-2
correction was meant to close everywhere, still open for this one gate.

Correction: add `'required_financial_terms_are_classified'` to the
validator's gate-presence loop (same pattern as the other six), and add a
mutation test that removes it from the fixture and asserts the resulting
finding.

## Note on the R2 request's own summary, not the reviewed artifacts

The request text states "Focused tests are 21/21." Counting `it(` blocks in
`src/student-enrollment-foundation.test.ts` gives 12, not 21. This is a
discrepancy in the transmittal claim, not in any of the five reviewed
artifacts, and does not change the substance of this review; flagged for
completeness only, not as a load-bearing correctness finding.

## Invariants re-verified as sound (unchanged from R1, still correct)

- Order → seat → student-enrollment three-level identity and cardinalities.
- `payer_equals_participant` enum plus rejection of `automatic`.
- `outbox_only` / `append_only` writes-shape for projection and correction
  commands.
- Nine-item phase boundary and `later_gates` sequencing.
- Owner-decision items correctly left as explicitly gated future decisions.
