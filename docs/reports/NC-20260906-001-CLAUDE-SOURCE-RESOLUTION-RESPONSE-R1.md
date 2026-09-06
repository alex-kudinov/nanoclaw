# NC-20260906-001 bounded source-resolution review — response (R1)

Reviewer: Claude (Sonnet 5)
Scope: the 8 allowed paths in the request only. Rita's settled disposition and
the ACC 21/12 owner facts were not reopened.

## Verified correct

- Arithmetic balances mechanically as claimed: ACC 21 active rows = 10 Module 1
  + 11 Full Program routes; 12 capacity vs 21 occupied = 0 available / 9 over;
  paid-offer split 9/11/0 plus the one held Module-1 funding case sums to 21;
  refunds = 0.
- Mutation/readback receipt is internally consistent and correctly separates
  writes performed (11 roster + 2 payment log + 1 Heartbeat = 14) from the 2
  precondition conflicts already at the desired value — satisfies the
  "distinguish writes from precondition conflicts" criterion.
- May 27 row is durably reassigned to the prior `2026-06` cohort
  (`prior_june_boundary.active_rows: 1`) and `unlabeled_post_boundary_rows: 0`,
  so it no longer inflates the September upper bound.
- Rita's transfer is represented as settled and does not appear in
  `remaining_exceptions`; the validator (`validateAcademyCapacitySourceResolution`)
  independently rejects any resolution file that reintroduces an
  `mcs-deferral` exception.
- Zero Professional Coach participants (`heartbeat.professional_coach.candidate_matches: 0`,
  `professional_projection_required: 0`) — no PCC/ACTC mutation is implied or
  performed; Heartbeat is explicitly marked `capacity_authority: false`
  throughout.
- Evidence JSON contains no email, name, raw Stripe ID, or invoice ID — only
  counts, dispositions, and SHA-256 hashes, confirmed by direct inspection and
  consistent with `validatePrivacy()`'s email/`pi_`/`ch_`/`cus_`/forbidden-field
  checks.
- Cross-checked against `tandemweb-level1-capacity-20260905/data/checkout/cohorts.json`:
  the `september_thursday` (5 roster / 6 floor), `september_friday` (13 roster
  / 10 floor / -1 adjustment / 13 occupied), and `january_thursday` (1 roster /
  +1 adjustment / 1 occupied) figures in the resolution JSON match the live
  registry snapshot exactly, including that the Friday cohort stays
  `sold_out` at `occupied_seats: 13` despite `owner_confirmed_occupied_seats: 12`
  — the roster floor is not lowered by the owner estimate, matching
  `test_owner_estimate_cannot_lower_roster_occupancy` in the Tandemweb test
  file.
- The Heartbeat toolbox disposition (`heartbeat-remove-from-group-CODEX-DISPOSITION-R1.md`)
  confirms the fix that makes false-success-on-failed-removal impossible before
  the resolution's claim of `september_membership_removed_and_verified: true`
  — the cross-repository claim holds.
- `resolves.prevention_commit: "3b03332f"` and the `report_id`/`correction_id`
  lineage match real prior evidence files and the current commit history; not
  fabricated.

## Material finding

**Test coverage gap: two of the five regression classes the acceptance
criteria require are untested for the new source-resolution artifact.**

The request's acceptance criteria state: "Validator and tests fail on
settled-deferral regression, arithmetic drift, invented Professional seats,
false mutation counts, or missing readback."

`src/academy-capacity-reconciliation.test.ts`'s `Academy capacity source
resolution` block has only two negative-path tests:
- `refuses to keep the settled deferral as an active exception` (covers
  settled-deferral regression)
- `refuses invented Professional Coach projections or hidden mutations`
  (covers invented Professional seats and false mutation counts, combined in
  one assertion)

No test in that block mutates a balance field (e.g. `resolution.capacity.occupied`,
`offer_and_funding.assignment_routes`, or `offer_and_funding.exact_paid_seats`
totals) to confirm the validator rejects **arithmetic drift**, and no test
removes or corrupts a readback field (e.g. `student_roster.owner_named_deferral.matches`,
`heartbeat.owner_named_deferral.september_membership_removed_and_verified`) to
confirm the validator rejects **missing readback**.

The validator function (`validateAcademyCapacitySourceResolution` in
`scripts/validate-academy-capacity-reconciliation.mjs`) does contain checks
for both cases (e.g. lines checking `capacity.available`/`over_capacity`
arithmetic, and lines checking `roster.owner_named_deferral` /
`heartbeat.owner_named_deferral` completeness), so the underlying logic is not
missing. The gap is that the test suite does not exercise those specific
branches for this artifact, unlike the equivalent `Academy capacity
read-only reconciliation` and `Academy capacity sales reconstruction`
describe blocks, which each have dedicated mutation tests per failure class.

Recommendation: add two tests to the `Academy capacity source resolution`
block — one that corrupts a resolved arithmetic total and expects a specific
"does not balance"/"is incorrect" finding, and one that clears a readback
field and expects a specific "readback is incomplete" finding — so a future
edit cannot silently drop either guard without a test failing.

No other material correctness, safety, privacy, or evidence defects found in
the allowed packet.
