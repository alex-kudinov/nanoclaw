# NC-20260909-002 load-bearing correction review response R2

Reviewer: Claude Code Sonnet 5, independent review per `docs/MODEL-ROUTING-POLICY.md`.
Scope: only the five allowed files listed in
`docs/reports/NC-20260909-002-CLAUDE-CORRECTION-REQUEST-R2.md`. No Bash, web,
MCP, or external tool was used; no file outside the allowed list was read.

## Verdict

`NO MATERIAL FINDINGS`. R1's finding is closed.

R1's finding was that `eligibility.all_required`,
`eligibility.refuse_or_preserve_legacy`, five `writer_ownership.*` string
fields, `rollout.monitoring.checks`, `rollout.abort_triggers`,
`duplicate_and_alias_assertions`, `rollback.post_rollback_verification`,
`external_mutations`, `forbidden_actions`, and `owner_decisions[].decision`/
`.safe_hold` were gated only by `hasPath` or `array.length >= N`, so a
same-length content substitution inside any of them produced zero findings.

The correction adds `studentEnrollmentProductionRolloutSafetyHash()`
(`scripts/validate-student-enrollment-production-rollout.mjs:61-78`), a
canonical (key-sorted, array-order-preserving) SHA-256 over a superset object
containing all thirteen operational safety families, including every family
R1 named. The validator then asserts two things
(lines 137-147): the packet's own `safety_contract_sha256` matches the
computed hash of its actual content, and that computed hash matches
`EXPECTED_SAFETY_CONTRACT_SHA256`, a value hard-pinned in the `.mjs` itself.
Because the pin lives in a reviewed source file rather than the JSON packet,
an attacker who edits both the content and the packet's own declared digest
still fails the second assertion — the same pattern already used for
`migrations[].source_sha256`, and exactly the remedy R1 proposed (option a).
`safety_contract_sha256` was also added to `x-required-paths`
(`schema.json:92`), closing the omission gap for the digest field itself.

This closes the gap by construction, not by enumeration: because the hash
covers each flagged field's entire parent object/array, every leaf under
`eligibility`, `writer_ownership`, `rollout`, `duplicate_and_alias_assertions`,
`rollback`, `external_mutations`, `owner_decisions`, and `forbidden_actions`
is hash-protected whether or not that specific leaf is individually exercised
by a test. The new test (`src/student-enrollment-production-rollout.test.ts:110-164`)
samples twelve representative same-length mutations spanning all of the
above families and confirms both failure messages fire for each; it does not
individually mutate all five `writer_ownership` string fields or
`owner_decisions[].decision` (only `.safe_hold`), but that is a sampling gap
in the test, not a gap in the mechanism, since those leaves sit inside the
same hashed subtrees as the leaves that are tested.

Fields outside the thirteen-family hash (`population`, `migrations`,
`authority`, `lineage`) are unaffected because they already carry independent
exact-value assertions elsewhere in the validator, unchanged by this
correction.

## Scope notes

- Did not recompute `safety_contract_sha256`, the migration hashes, or the
  artifact hash independently (no crypto/Bash tool in scope); their values
  are taken as given, consistent with R1's own precedent of not re-running
  the validator.
- Cross-checked the reported "186 omission paths": `schema.json`'s
  `x-required-paths` array (lines 92-277) contains exactly 186 entries,
  including the newly added `safety_contract_sha256`.
- `current_read_only_evidence` remains checked only via `hasPath` (no
  content-hash or exact-value assertion), the same as before this
  correction. R1 did not flag this family and the correction did not touch
  it, so per the review request's scope it is noted here but not raised as a
  finding.
