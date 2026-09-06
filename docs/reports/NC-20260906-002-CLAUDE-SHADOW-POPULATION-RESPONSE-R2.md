# NC-20260906-002 bounded correction review R2 — response

Scope: the two R1 findings and the allowed paths listed in
`NC-20260906-002-CLAUDE-SHADOW-POPULATION-REQUEST-R2.md` only. Private
manifest, rosters, and unrelated files were not inspected.

## Finding 1 — exception binding

`validateAcademyCapacityShadowManifest` (`scripts/populate-academy-capacity-shadow.mjs:372-391`)
now checks each exception's `reason_code` against the participant/block it
names: `funding_source_unresolved` requires `subject_type: 'agreement'` plus
`financial_classification: 'held'` and `offer_key: 'acc-module-1'`;
`cross_provider_email_alias_unresolved` requires `subject_type: 'enrollment'`
plus `offer_key: 'acc-full'`; `mcs_friday_owner_count_variance` requires
`subject_type: 'assignment'` plus `delivery_block_key:
'mcs-practicum:2026-09-25'`. This validator runs at apply time: both
`loadPrivateManifest` and `renderAcademyCapacityShadowSql` invoke it before
any SQL is produced or executed. `src/academy-capacity-shadow-population.test.ts`
(`binds every held exception...`, lines 273-298) moves each exception to a
wrong subject and asserts the three specific rejection messages. Closed.

## Finding 2 — batch-scoped keys

`populate-academy-capacity-shadow.mjs` derives every generated key
(`order`, `source`, `seat`, `agreement`, `enrollment`, `entitlement`,
`assignment`, `projection`, `receipt`, `mapping`, `event`, `exception`,
subject keys) from `const batch = manifest.batch_key` (line 431) — no
hardcoded `academy-shadow:` literal remains in the script. The validator
additionally requires `pool_key` (line 160) and `exception_key` (lines
325-329) to be prefixed with `manifest.batch_key`. All aggregate/zero-row
readback predicates in the generated SQL (lines 822-845, 852-862) use the
same `${batch}:...` prefix. `src/academy-capacity-shadow-population.test.ts`
(`requires every generated namespace key and readback to be batch-scoped`,
lines 300-318) asserts the validator rejects an `academy-shadow:`-prefixed
`pool_key`/`exception_key` and that rendered SQL both contains the batch-
scoped `LIKE` predicate and does not contain the old `academy-shadow:`
literal. Closed.

## Other observations

`d44839d2b8ea08495fffd69fb5ca8c8aa6e30a9980c428477c3a4c3ea52793d8` is
64 lowercase hex characters (valid SHA-256 form). The private manifest it
attests to was out of scope and not inspected, so the digest's correctness
against that file cannot be confirmed from this review; nothing in the
allowed code paths references or depends on this literal.

## Verdict

NO MATERIAL FINDINGS
