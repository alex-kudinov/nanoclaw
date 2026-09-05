# NC-20260905-008 — Claude reconciliation response R2

Scope reviewed: the seven allowed packet files only (R1 response, evidence
JSON/MD, schema, validator, validator type declarations, test file). No other
files were opened; no source was modified. No shell/test execution tool was
available this session, so verification is static code review, consistent
with R1's own methodology.

## NO MATERIAL FINDINGS

Both R1 corrections hold.

### Correction 1 — MCS Friday funding-coverage exception

- `exceptions[]` now has 7 entries (was 6); the new entry
  `exception:mcs-friday-funding-source-coverage-incomplete` (owner
  `bookkeeper_integration`) states the 3-of-13 unbound-payment fact and
  carries `next_evidence`.
- `delivery_blocks[1]` (`mcs-practicum:2026-09-25`) `.exception_ids` now
  references it.
- The MD's "Durable exceptions" section lists seven items; item 4 is the
  Friday funding gap, matching the JSON exactly.
- `validate-academy-capacity-reconciliation.mjs` `validateBlock()` (lines
  192–199) adds: any block with
  `payments.funding_unresolved_or_non_stripe > 0` must reference an
  `exception_id` ending in `funding-source-coverage-incomplete`, or the block
  fails. Both MCS Friday (3 unresolved) and ACC September 7 (6 unresolved)
  satisfy this against their respective owned exceptions.
- `src/academy-capacity-reconciliation.test.ts` adds a negative test
  (`'requires an owned exception for every unresolved funding gap'`) that
  strips the Friday exception reference and asserts the exact failure string
  fires. Confirmed the assertion string matches the `add()` message verbatim.

Non-material observation: the rule matches by string suffix
(`endsWith('funding-source-coverage-incomplete')`) rather than binding the
referenced exception to the specific block's program. A block could in
principle satisfy the rule by citing a differently-scoped coverage exception
(e.g., ACC citing MCS Friday's). Not exploitable in the current 5-block, fixed
`REQUIRED_BLOCKS` population, and not contradicted by either correction's
claim — flagged only as a hardening opportunity, not a regression.

### Correction 2 — schema actually applied via recursive evaluator

- `walkJsonSchema()` (lines 45–109) implements exactly the eight keywords
  claimed: `const`, `type` (with correct `integer`/`array`/`object`/`null`
  handling), `pattern`, `format` (`date-time` and `date`), array `minItems`
  and optional `items` recursion, object `required`, `properties` recursion,
  and `additionalProperties: false` extra-key rejection.
- `main()` now calls `validateJsonSchemaDocument(schema, report)` and
  concatenates its findings with `validateAcademyCapacityReconciliation()`'s
  before the single `findings.length` gate that sets `process.exitCode = 1`.
  The prior R1-flagged dead check (only comparing
  `schema.properties.schema_version.const`) is gone — no vestigial code
  remains.
- Traced the schema against the current report field-by-field: all 11
  top-level required keys present and no extras (`additionalProperties:
  false` on the report and on `source_window`/`privacy` all satisfied);
  `report_id`/`task_id` patterns, `observed_at` date-time, `source_window`
  dates, and the three `privacy` consts all match the live JSON values.
- Test file's `'tracks the exact bounded population in the reusable schema'`
  asserts `validateJsonSchemaDocument(schema, report)` is `[]` (current report
  passes) and that deleting `boundary` produces the exact finding
  `'$.boundary: is required'` (missing required top-level property rejected).
  Both assertions align with the actual evaluator behavior traced above.
- `scripts/validate-academy-capacity-reconciliation.d.mts` exports match the
  four actual `.mjs` exports (`defaultReportPath`, `defaultSchemaPath`,
  `validateJsonSchemaDocument`, `validateAcademyCapacityReconciliation`).

## Checks performed with no finding

- Delivery-block population unchanged at 5; `REQUIRED_BLOCKS` set and JSON
  `delivery_block_key`s still correspond 1:1.
- All prior R1 "checks performed with no finding" items (arithmetic,
  fail-closed capacity, deferral chain, ACC funding/offer split, receipt
  hashes, privacy scan, boundary counts) are untouched by this diff — spot
  re-checked, no drift.
- New exception's `exception_id`, `owner`, `next_evidence`, `severity`,
  `facts` fields all satisfy the existing per-exception validator checks
  (`KEY` pattern, non-empty owner/next_evidence).

## Not evaluated

CLI execution and the "20/20 tests" / pinned-typecheck claims were not
independently re-run (no execution tool available this session); static
trace found no contradiction with the claimed pass state.
