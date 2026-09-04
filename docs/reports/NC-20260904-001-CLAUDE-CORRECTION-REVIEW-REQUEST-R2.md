# NC-20260904-001 correction review R2

Review only the load-bearing correction for R1's material finding. Write the
verdict to
`docs/reports/NC-20260904-001-CLAUDE-CORRECTION-REVIEW-RESPONSE-R2.md`.

## R1 finding

The legacy month+weekday fallback was not scoped to MCS. An unrelated payment
whose free text contained a month and weekday could receive a fabricated cohort
or fail a roster target that had no `Cohort` column.

## Correction

`tools/contador/lib/cohort.cjs` now permits legacy fallback only when at least
one source proves MCS practicum identity:

- explicit `cohort_program=mcs-practicum`;
- a strict legacy `mcs-cohort-<month>-<weekday>` product slug; or
- a known MCS practicum product phrase (`Mentor Coach Training` or
  `MCS Advanced Accreditation Mentor Coaching`).

An explicit contradictory `cohort_program` fails closed even if other strings
look like MCS. Tests cover unrelated month+weekday text and contradictory
structured metadata. Focused processor/cohort/release/store/host/webhook/reaper
tests pass 160/160 after the correction.

## Allowed files

1. `docs/reports/NC-20260904-001-CLAUDE-REVIEW-RESPONSE-R1.md`
2. `tools/contador/lib/cohort.cjs`
3. `tools/contador/lib/cohort.test.ts`
4. `tools/contador/process-payment.cjs`

Read this request and only those files. Write only the named R2 response. Do
not edit implementation, use Bash/web/MCP, or inspect credentials/raw payment
data.

Return `NO MATERIAL FINDINGS` if R1 is fully resolved without breaking current
or legacy MCS cohort resolution. Otherwise report only unresolved material
findings with exact file/line evidence.
