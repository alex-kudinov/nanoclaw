# NC-20260906-002 bounded correction review R2

Review only the two load-bearing corrections from R1. Do not reopen accepted
population facts or inspect the private manifest.

## R1 findings to close

1. Participant-scoped exceptions were not bound at apply time to the financial
   or offer state they described.
2. SQL keys and aggregate readback used a global `academy-shadow:` prefix
   instead of the manifest batch key.

## Corrected contract

- The manifest validator requires the funding exception to name the one held
  ACC Module 1 participant, the alias exception to name an ACC Full participant,
  and the owner-count exception to name the MCS Friday delivery block.
- Pool and exception keys are batch-scoped at validation. All generated SQL
  keys and every aggregate/readback predicate use
  `academy-capacity-shadow-2026-09-06:` from the manifest batch key.
- The corrected real mode-0600 manifest hash is
  `d44839d2b8ea08495fffd69fb5ca8c8aa6e30a9980c428477c3a4c3ea52793d8`.
- Disposable first apply and zero-insert replay still pass with the exact
  5/5/7/40/310/40/3 counts and expected occupancy.

## Allowed paths

- `scripts/populate-academy-capacity-shadow.mjs`
- `scripts/build-academy-capacity-shadow-manifest.mjs`
- `scripts/verify-academy-capacity-shadow-population-disposable.mjs`
- `src/academy-capacity-shadow-population.test.ts`
- `src/academy-capacity-shadow-manifest.test.ts`
- `src/academy-capacity-shadow-population-disposable.test.ts`
- `docs/reports/NC-20260906-002-CODEX-SHADOW-POPULATION-DISPOSITION-R1.md`

Read only these paths and their bounded diff. Do not inspect `.env`,
credentials, private roster/manifest files, customer records, databases,
browser/session state, or unrelated files. Report only unresolved material
findings with exact evidence. Write the response to
`docs/reports/NC-20260906-002-CLAUDE-SHADOW-POPULATION-RESPONSE-R2.md`; change no
other file. Use `NO MATERIAL FINDINGS` if both findings are closed.
