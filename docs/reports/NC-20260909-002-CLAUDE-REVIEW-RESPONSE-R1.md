# NC-20260909-002 bounded rollout-packet review response R1

Reviewer: Claude Code Sonnet 5, independent review per `docs/MODEL-ROUTING-POLICY.md`.
Scope: only the eight allowed files listed in the review request. No Bash, web,
MCP, or external tool was used; no file outside the allowed list was read.

## Verdict

Not `NO MATERIAL FINDINGS`. One material finding, affecting review questions 2,
5, and 6.

## Material finding 1 — the validator enforces presence/count, not content, for most safety-bearing arrays and narrative fields

**Files:**
`scripts/validate-student-enrollment-production-rollout.mjs` (whole file, esp.
lines 88-93, 177-185, 203-206, 388-392, 406);
`docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.schema.json`
(`x-required-paths`, lines 89-275).

**Issue:** `hasPath` (validator lines 23-38) only proves a field is non-empty —
present, non-blank string, or non-empty array/object. For most of the packet's
actual safety content, that is the *only* check ever applied. The following
fields are gated solely by `hasPath` (via `x-required-paths`) or by an
`array.length >= N` threshold, with no assertion on the array's contents:

- `eligibility.all_required` (validator line ~177, `>= 9`) and
  `eligibility.refuse_or_preserve_legacy` (line ~182, `>= 6`) — the nine
  positive gates and six refusal families that answer review question 1.
- `writer_ownership.shared_orchestrator`, `.gate_transaction`,
  `.one_event_budget_rule`, `.legacy_writer_rule`, `.canonical_writer_rule` —
  only `hasPath`-checked as non-empty strings; only `.atomic_gate` and
  `.actual_ingress_paths` get an exact-value assertion (lines 188-201). These
  are the fields review question 2 asks about.
- `rollout.monitoring.checks` (`>= 8`), `rollout.abort_triggers` (`>= 8`),
  `duplicate_and_alias_assertions` (`>= 7`), `rollback.post_rollback_verification`
  (`>= 6`), `external_mutations` (`>= 8`), `forbidden_actions` (`>= 6`) — lines
  388-392, 406. These are the fields review question 5 asks about, alongside
  `owner_decisions`, whose `id` values are exact-matched (lines 394-405) but
  whose `decision` and `safe_hold` text is never checked.

**Consequence:** the schema and validator "fail closed" only against
*deletion* or *shrinkage* of these fields. A future edit that keeps the same
array length but swaps a specific refusal rule, abort trigger, or forbidden
action for a weaker or unrelated one — or that rewrites an owner-decision
`safe_hold` clause to something less protective while leaving its `id` intact
— produces zero findings from the validator and no failing test. The existing
test file (`src/student-enrollment-production-rollout.test.ts`) does not cover
this either: its omission test only deletes whole `x-required-paths` entries,
and its "refuses broadened..." test's six variants (`maximum_natural_events`,
Heartbeat `activation_ready_now`, one migration hash, ingress-path count,
milestone order, and an extra top-level field) do not exercise content
substitution inside any of the arrays above. This directly matches review
question 6's framing: a required safety field cannot *disappear* undetected,
but its substance can be silently replaced.

Root cause: the `.mjs` never runs the `.schema.json` through a real JSON
Schema engine (no ajv/zod/etc. import). It only reads `schema.required` and
`schema['x-required-paths']` and re-implements a small, hand-picked subset of
the schema's own structural constraints (e.g. `migrations` length, `population`
exact values, the four `owner_decisions` ids). Anything in the schema that
isn't hand-duplicated in the `.mjs` — including every `type`/`minItems`/`const`
constraint inside nested `$defs` objects — has no runtime effect. The
`.schema.json` file is authoritative only insofar as the `.mjs` happens to
mirror it.

**Correction:** for the fields the objective cares most about — the refusal
rules (`eligibility.refuse_or_preserve_legacy`), abort triggers
(`rollout.abort_triggers`), forbidden actions (`forbidden_actions`), and the
four `owner_decisions[].decision`/`safe_hold` texts — either (a) hash-pin the
exact array/string content the same way `migrations[].source_sha256` is
pinned, or (b) assert exact string equality/membership against a hard-coded
expected list in the validator, the same way `population` and the migration
records already are. A length threshold alone is not a safety gate for
free-text arrays whose specific wording is the control.

## Scope notes

- Cross-checked every commit hash, dollar amount, sheet/group ID, migration
  number/order, and date appearing in the packet, schema, evidence file, and
  the two strategy docs against each other; no inconsistency found beyond the
  finding above.
- Did not re-run the validator, tests, or typecheck (Bash is out of scope for
  this review); the pre-review verification numbers are taken as reported.
- `docs/STUDENT-ENROLLMENT-AUTHENTICATED-ADMISSION.md` and
  `docs/STUDENT-ENROLLMENT-TRANSACTIONAL-STORE.md`, cited in
  `evidence_sources`, are not on the allowed-files list and were not read; the
  writer-claim and store-contract narrative in `writer_ownership` and
  `accounting_continuity` was reviewed only as stated in the packet, not
  against its own source contracts.
