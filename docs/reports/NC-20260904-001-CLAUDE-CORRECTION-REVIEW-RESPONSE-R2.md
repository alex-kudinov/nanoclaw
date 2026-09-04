# NC-20260904-001 correction review — response R2

NO MATERIAL FINDINGS

## Verification

`resolveCohortLabel` (`tools/contador/lib/cohort.cjs:139-167`) now calls
`hasMcsPracticumEvidence` (`cohort.cjs:114-137`) before running the legacy
`sources` text-match loop, and returns `''` immediately if it fails. Evidence
requires one of:

- `cohort_program` explicitly `'mcs-practicum'` (and fails closed — any other
  non-empty `cohort_program` short-circuits to `false` before the slug/phrase
  checks run, `cohort.cjs:115-118`);
- a strict `^mcs-cohort-<month>-` product slug prefix (`cohort.cjs:120-128`);
- or `chargeDescription`/`productName` containing `Mentor Coach Training` or
  `MCS Advanced Accreditation Mentor Coaching` (`cohort.cjs:130-136`).

This closes the exact gap R1 identified: unrelated payment text containing a
coincidental month+weekday pair (e.g. `Friday Leadership Intensive —
September 2026`) can no longer produce a fabricated cohort label, and
downstream `fillCohortCell` (`process-payment.cjs:473-478`) short-circuits on
a falsy `cohort` before it can throw on a missing `Cohort` column — so a
non-MCS payment can no longer be pushed from `complete` to `write_failed`, and
the Postgres write path (`process-payment.cjs:1198,1227`) can no longer
persist a fabricated value.

`cohort.test.ts:108-134` exercises exactly the scenario R1 called out
(unrelated product/description carrying both a month and a weekday token,
expects `''`) and the contradictory-metadata case (explicit
`cohort_program: 'other-program'` alongside metadata/product-name strings
that otherwise look like MCS, expects `''`). Both assertions match the
implementation's fail-closed behavior.

`process-payment.cjs` call sites (`:840-845`, `:1071-1076`, `:1105-1108`,
`:1198`, `:1227`) are unchanged from R1 — the fix is correctly isolated to
`cohort.cjs`, so no new regression surface was introduced there.

Existing legacy/current MCS resolution paths (structured metadata, legacy
`mcs-cohort-<month>-<weekday>` slug, description/product-name text) remain
covered by `cohort.test.ts:10-66,99-106` and are unaffected by the new gate,
since genuine MCS payments carry `cohort_program`, a matching product slug,
or the `Mentor Coach Training`/`MCS Advanced Accreditation Mentor Coaching`
phrase in `productName` (sourced from Stripe's product name at
`process-payment.cjs:567`) or `chargeDescription`.
