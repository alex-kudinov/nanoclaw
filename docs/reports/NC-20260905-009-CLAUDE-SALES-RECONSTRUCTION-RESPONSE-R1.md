# NC-20260905-009 bounded ACC sales reconstruction review — response R1

## Verdict

`NO MATERIAL FINDINGS`

## Scope note

This environment exposed no command-execution tool, so "pass" was confirmed
by statically tracing every branch of `validateAcademyCapacityReconciliation`
and `validateAcademyCapacitySalesReconstruction`
(`scripts/validate-academy-capacity-reconciliation.mjs:265-641`) against the
literal field values in both evidence JSON files, rather than by re-running
`node`/`vitest`. This is a manual re-derivation of the same checks, not an
independent execution. Flag if a re-run is required before closing.

## Load-bearing checks performed

1. **Schema conformance** — `academy-capacity-reconciliation-correction-v1.schema.json`
   `required`/`properties` (13 keys) match the correction JSON's top-level
   keys exactly; `correction_id`, `task_id`, `observed_at`, and
   `corrects.commit` all satisfy their regex/format constraints.
2. **Lineage** — `corrects.report_id`/`task_id`/`commit` in the JSON
   (`NC-20260905-009-academy-capacity-sales-reconstruction.json:6-10`) match
   `academy-capacity-readonly-reconciliation-2026-09-05` / `NC-20260905-008` /
   `c0779fcb` exactly, matching the validator's literal equality checks and
   the recent commit history (`c0779fcb feat(student-lifecycle): reconcile
   capacity sources read-only`).
3. **Arithmetic closure (Claim 1/6)** — `8 + 13 = 21` (operational) and
   `8 + 14 = 22` (upper boundary) both hold; `10 + 11 = 21`
   (`by_roster_route`); `13 (exact offers 8+5+0) + 8 (unclassified) = 21`
   (Payment Log). All four identities are exactly what the validator asserts
   and all balance.
4. **Cross-file hash identity** — `shared_pool.explicit_rowset_sha256`
   (`a89c9567...0ada6`) is byte-identical to NC-008's
   `sources.student_roster.acc.relevant_rowset_sha256`
   (`NC-20260905-008-academy-capacity-readonly-reconciliation.json:58`),
   confirming the correction's "explicit 8" is the same underlying rowset as
   NC-008's labeled cohort, not a re-derived or drifted set. All four SHA-256
   fields (`candidate_rowset`, `explicit_rowset`, `unlabeled_rowset`,
   `payment_log.candidate_rows`) are well-formed 64-character hex.
5. **No invented offer/capacity count (Claim 2/3)** — `acc-pcc-full` is `0` in
   both Payment Log exact offers and Stripe; `projection_coverage.
   professional_offer_count` is `null`; `shared_pool.capacity`/`availability`/
   `over_capacity` are all `null` with `public_state: "sold_out"`. No field
   anywhere asserts a $7,499 seat count — consistent with treating the
   missing PCC/ACTC/Heartbeat projections as fulfillment exceptions, not
   seats.
6. **Payer/participant separation (Claim 4)** —
   `plutio_and_email.counted_without_exact_binding` is `0` and
   `participant_offer_bindings_persisted` is `0` despite Plutio/email evidence
   existing; no invoice, payer, or conversation record is converted into a
   seat or offer anywhere in the JSON or Markdown.
7. **MCS deferral (Claim 5)** — `origin_confidence:
   "owner_recollection_not_confirmed"`, `current_destination:
   "2027-01-07-thursday"` (unchanged from NC-008's `janThursday.roster.active
   === 1` / `janFriday.roster.active === 0`), and
   `current_friday_roster_excludes_deferral_subject: true` — no roster field
   in either evidence file was touched by this correction.
8. **Exception completeness (Claim 6)** — the correction's `exceptions` array
   contains exactly the 6 IDs the validator's `expectedExceptions` set
   requires, no more, no fewer, each with a non-empty `owner` and
   `next_evidence`.
9. **Privacy** — no email pattern, Stripe raw-ID pattern, or any of
   `student_name`/`student_email`/`payer_name`/`payer_email`/
   `payment_intent_id`/`charge_id`/`customer_id` appears anywhere in either
   evidence JSON.
10. **Write boundary** — `boundary.source_mutations` and
    `production_mutations` are both `0`, `external_reads_only` is `true`, and
    `forbidden_actions` lists 8 explicit prohibitions covering roster,
    provider, website, database, runtime, waitlist, deployment, and
    authority-cutover writes.
11. **Type/export parity** — `scripts/validate-academy-capacity-reconciliation.d.mts`
    declares exactly the 7 exports the `.mjs` file exports, with matching
    shapes; the test file's imports match both.
12. **Test count (mechanical evidence claim)** — counted 13 `it(...)` blocks
    across both `describe` groups in
    `src/academy-capacity-reconciliation.test.ts`, matching the claimed
    "13/13."
13. **Internal cross-check not enforced by the validator, verified by hand**
    — Payment Log's `without_exact_product_map_offer` (8) decomposes
    consistently as `2` unclassified Module 1 rows (`10 module_1 route − 8
    exact acc-module-1`) plus `6` unclassified Full Program rows (`11 full
    route − 5 exact acc-full`) = `8`, matching. `with_other_or_ambiguous_payment_rows:
    4` is a subset of, not a reduction from, `without_any_exact_funding_classification:
    8` — ambiguous rows are explicitly non-exact, so both fields correctly
    equal 8. No arithmetic drift found.

## Observations (non-material, no correction needed)

- `projection_coverage.acc_full_heartbeat_group_candidate_intersection: 10`
  is descriptive evidence only; it is not constrained by the schema
  (`projection_coverage` has no `required`/`additionalProperties` restriction)
  or checked by the JS validator. It does not feed any seat, offer, or
  capacity total, so its absence from validation is not a fail-open gap on
  any claim in scope — but if this field is ever promoted to a load-bearing
  count, it will need an explicit validator assertion first.
