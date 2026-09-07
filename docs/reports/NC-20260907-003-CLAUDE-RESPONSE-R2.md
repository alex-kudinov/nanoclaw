# NC-20260907-003 Claude independent review — response R2

## Review scope receipt

Reviewer: Claude Code, Sonnet, high effort, independent (no execution role).

Read set (exactly as authorized, no others):

- `docs/reports/NC-20260907-003-CLAUDE-REQUEST-R2.md`
- `docs/STUDENT-LIFECYCLE-STRATEGY.md`
- `docs/STUDENT-LIFECYCLE-DECISION-REGISTER.md`
- `docs/reports/NC-20260907-003-CLAUDE-RESPONSE-R1.md`

No other file, Git history, `.program`, credentials, settings, runtime state, or
provider data was read. Model routing, source catalog design, simple-sync,
typed identity, progress/action, and first-packet choices were not reopened.
No source file was edited; only this response was written; R1 was not edited.

Method: checked the six accepted-correction points and the exact portfolio
mapping in the request against `STUDENT-LIFECYCLE-STRATEGY.md` (phase table,
"Canonical admission and end-to-end supervision milestones" section) and
`STUDENT-LIFECYCLE-DECISION-REGISTER.md` (`SLD-009`, `SLO-005`, the four
proposed portfolio deltas), then traced the dependency graph across all four
proposed items plus their named existing dependencies for cycles, and
compared R1's Phase 3 replay statement against the current Phase 3 text.

## Findings

None of the six accepted-correction points are contradicted, weakened, or
left unimplemented.

1. Ready-before-divert with explicit fallback: Phase 4's row text ("Route no
   real event to the new writer unless the selected projection
   execution/readback path is already reviewed and both canonical plus
   provider activation are explicitly authorized for one rollout"), `SLD-009`
   ("If both activation authorities are not ready, preserve the existing
   route"), and `SLO-005` ("the new route off until canonical plus projection
   activation are both prepared, reviewed, and authorized. If either is
   missing, do not divert the event") all state the same fallback
   consistently.

2. Distinct milestones inside one rollout, no Phase 5/6 wait: Phase 4's exit
   evidence separates a "First evidence milestone" (canonical) from an
   "Immediate second milestone" (projection apply/readback), and its
   portfolio-mapping column states the pilot and projection-reconciliation
   "execute sequential evidence within the same authorized bounded rollout;
   no unrelated phase or additional real event sits between them." The
   "Canonical admission and end-to-end supervision milestones" section
   states canonical admission "does not itself prove provider write/readback
   or end-to-end acceptance," and the dependent item then applies readback
   "in the same authorized bounded rollout." Phase 6's continuation of
   `work:student-enrollment-projection-reconciliation` (population-wide
   legacy-writer retirement and ongoing reconciliation) is a distinct,
   later-scoped continuation of the same work item, not a precondition the
   first pilot's end-to-end acceptance waits on; `SLO-005`'s gate phases are
   correctly scoped to "3 and 4" only.

3. Acyclic item graph: `work:student-enrollment-projection-foundation`
   depends on catalog-source-reconciliation, transactional-store, and
   authenticated-source-admission; `work:student-enrollment-production-
   admission-pilot` now additionally depends on projection-foundation (the
   new edge from the exact mapping); `work:student-enrollment-projection-
   reconciliation` depends on both production-admission-pilot and
   projection-foundation; `work:academy-capacity-authority-cutover` depends
   on projection-reconciliation. This is a diamond (foundation → pilot →
   reconciliation, plus foundation → reconciliation directly), not a cycle.
   The strategy document's Phase 3 portfolio-mapping column states the same
   edge ("production pilot depends on both source reconciliation and this
   reviewed projection foundation"), so the register and strategy agree.

4. End-to-end before unrelated financial-family activation: Phase 5's row
   ("After the fully settled supervision path is accepted end to end, add
   multiple distinct installment payments...") and the financial-agreement-
   semantics item's downstream note ("no family activates before Phase 4
   acceptance") match the correction; "Phase 4 acceptance" here is the full
   canonical-plus-readback milestone defined in point 2 above, not partial
   canonical-only admission.

5. Local-only foundation, separately authorized live/cutover work:
   projection-foundation is `candidate`/`internal_reversible`, authorization
   not required, with completion requiring "pinned code and no live
   provider/student write." projection-reconciliation is `candidate`/
   `external_consequential`, "authorization required and not authorized;
   source reads and every target write or retry are separately authorized."
   `academy-capacity-authority-cutover` is stated unchanged and continues to
   depend on the still-unauthorized reconciliation item. No authority
   broadening found.

6. One-receipt/many-alias in the first pilot, multiple-distinct-receipt
   later: unchanged from R1 (`SLD-003`, Phase 3's "distinguish one funding
   receipt from its identifiers/aliases," Phase 5's "multiple distinct
   installment payments... only after" the pilot is accepted end to end).

R1's replay disposition: the current Phase 3 row still reads "...accounting
continuity, serializable replay, projection execution/readback, retry, and
uncertain acceptance in local/disposable tests," listed before Phase 4's
real-event pilot. R1's sentence that "Phase 3 explicitly excludes
replay/duplicate-suppression proof" was therefore an overstatement against
the table as the request states; the table itself was never wrong and still
requires replay proof ahead of the natural pilot. Nothing in this revision
removes or weakens that requirement, and R1 was left unedited.

Portfolio count arithmetic checks out: 17 candidates at revision 246 plus the
four proposed deltas (catalog-source-reconciliation,
financial-agreement-semantics, projection-foundation,
projection-reconciliation) equal the stated 21; count is treated as a review
signal only in both documents, not as an authorization claim.

## Verdict

`NO MATERIAL FINDINGS`
