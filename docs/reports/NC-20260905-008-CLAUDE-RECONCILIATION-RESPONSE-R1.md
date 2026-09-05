# NC-20260905-008 — Claude reconciliation response R1

Scope reviewed: the seven allowed packet files only (evidence JSON/MD, schema,
validator, test file, `tools/cohort-capacity.py`, `data/checkout/cohorts.json`
in the `tandemweb-level1-capacity-20260905` worktree). No other files were
opened; no source was modified.

## Finding 1 — MCS Friday's unresolved-funding seats have no durable exception (asymmetric to ACC)

**Consequence:** highest. This is a gap in the "exact authorized population"
and "payer-versus-participant separation" guarantees the task exists to
verify — the evidence records the fact pattern but drops it before it becomes
an owned, actionable exception.

**Evidence:**
- `.../evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.json`,
  `delivery_blocks[1]` (`mcs-practicum:2026-09-25`): `payments.successful: 10`,
  `payments.fully_refunded: 0`, `payments.failed: 1`,
  `payments.funding_unresolved_or_non_stripe: 3` against
  `roster.active: 13`. That block's `exception_ids` are only
  `mcs-friday-owner-roster-count-conflict`,
  `mcs-deferral-origin-track-conflict`, and
  `tandemweb-owner-override-masks-roster-overcapacity` — none addresses the 3
  roster-active seats with no bound successful Stripe payment.
- Contrast with `delivery_blocks[4]` (`acc.module-1:2026-09-07`), which
  carries the exact parallel fact
  (`payments.funding_unresolved_or_non_stripe: 6` against `roster.active: 8`)
  and *does* have a dedicated, owned exception:
  `exception:acc-funding-source-coverage-incomplete` (owner
  `bookkeeper_integration`).
- The narrative doc
  (`.../evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.md`)
  states the "3 may be non-Stripe or unresolved funding" fact in the summary
  table (row for MCS 2026-09-25) but the "Durable exceptions" section (six
  enumerated items) never surfaces it.
- Neither `academy-capacity-reconciliation-evidence-v1.schema.json` nor
  `validate-academy-capacity-reconciliation.mjs` ties
  `payments.funding_unresolved_or_non_stripe > 0` to any required exception
  coverage, so this asymmetry is not caught mechanically. None of the 6 tests
  in `src/academy-capacity-reconciliation.test.ts` exercise it either.

**Smallest safe correction:** add one exception entry —
`exception:mcs-friday-funding-source-coverage-incomplete`, owner
`bookkeeper_integration`, facts stating 3 of the 13 active Friday roster
assignments have no bound successful non-refunded Stripe payment, next
evidence mirroring the ACC exception's wording — and reference it in
`delivery_blocks[1].exception_ids`. Update the MD's "Six owned exceptions"
section to seven and add the corresponding numbered item. No schema or
validator code change is required for this fix alone (the schema's
`exceptions` array only requires `minItems: 1`); optionally extend the
validator with a rule that any block with nonzero
`funding_unresolved_or_non_stripe` must reference at least one exception, to
prevent recurrence.

## Finding 2 — the schema file is never actually applied to the report

**Consequence:** moderate. It weakens claim 6's precision ("The schema, the
validator, and the tests reject...") and the artifact-contract framing of
`facts/catalogs/academy-capacity-reconciliation-evidence-v1.schema.json` as a
"reusable schema," though it does not currently let a bad report pass,
because the imperative checks independently re-derive most of the same
required-field constraints.

**Evidence:** `scripts/validate-academy-capacity-reconciliation.mjs`,
`main()` (lines ~317–334): the schema file is read and only
`schema?.properties?.schema_version?.const !== '1.0'` is checked against it.
The loaded `schema` object is never passed to any JSON Schema validation
routine (no ajv or equivalent), and `validateAcademyCapacityReconciliation()`
does not consult it either — all structural enforcement (required top-level
keys, block population, arithmetic, exception ownership) lives entirely in
hand-written checks, independent of the schema file's `required`/`minItems`
declarations. A regression that dropped a required property from the schema
file itself (e.g., removing `"exceptions"` from `required`) would go
undetected by `main()`.

**Smallest safe correction:** either (a) wire an actual JSON Schema
validation pass (e.g., ajv) into `main()` ahead of the imperative checks, so
the schema file's `required`/`type`/`minItems` constraints are genuinely
enforced, or (b) if the imperative validator is intended to remain the sole
enforcement mechanism, reword the "reusable schema" framing in the MD's
"Artifact contract" section and drop the implication in claim 6 that the
schema itself rejects regressions — it currently only documents shape.

## Checks performed with no finding

- MCS Thursday, Friday, January Thursday, January Friday, and ACC
  September 7 roster/payment/computed arithmetic all balance exactly against
  `validate-academy-capacity-reconciliation.mjs`'s rules (roster
  `active = rows − refunded`; `occupied ≥ roster.active`;
  `available = max(0, capacity − occupied)`;
  `over_capacity = max(0, occupied − capacity)`; null-capacity blocks stay
  fail-closed with `available`/`over_capacity` null).
- MCS Friday's roster-floor-of-13 (not the owner's 12) is the value actually
  recorded in `computed.occupied`/`over_capacity`, correctly preserving the
  fail-closed variance called out in claim 2; `tools/cohort-capacity.py`
  (lines 208–210, `owner_confirmed_occupied_seats` override) and
  `cohorts.json`'s `2026-09-25.owner_confirmed_occupied_seats: 12` confirm
  the Tandemweb reconciler literally substitutes the owner value, matching
  exception `tandemweb-owner-override-masks-roster-overcapacity`.
- The Thursday→January-Thursday deferral chain in `cohorts.json`
  (`mcs-2026-09-24-transfer-001` ↔ `mcs-2027-01-07-transfer-in-001`, same
  `source_ref`) does say the origin was September Thursday, consistent with
  the evidence claim that the transfer ledger names Thursday as origin while
  the owner's Friday-count context conflicts with it (claim 3); no second
  roster row is touched by either artifact.
- ACC September 7 stays `capacity: null` / policy-only sold out with all
  eight assignments and the 2/8 exact-funding split preserved unchanged
  (claim 4); Heartbeat membership (24 / 22 / 3) is recorded as
  `capacity_authority: false` only, never used in any computed occupancy.
- All six SHA-256 receipt hashes in the JSON (`mcs`/`acc` roster rowsets,
  the owner-named deferral row, and the three Heartbeat group hashes) are
  well-formed 64-character hex values.
- Privacy scan: no email addresses, no `pi_`/`ch_`/`cus_` Stripe identifiers,
  no student/payer names anywhere in the seven reviewed files.
- `boundary.forbidden_actions` has exactly 8 entries (schema requires ≥8);
  `boundary.external_reads_only` is `true`.

## Not evaluated

The "19/19" focused-test and typecheck/continuity claims in the request
reference test coverage outside the allowed packet (only
`src/academy-capacity-reconciliation.test.ts`, 6 `it` blocks, was in scope)
and were not independently re-run; no contradiction was found within what
was reviewed.
