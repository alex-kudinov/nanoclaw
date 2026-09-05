# NC-20260905-008 bounded reconciliation correction review R2

## Objective

Review only the two load-bearing R1 corrections. Do not reopen accepted source
counts, authority decisions, or unrelated implementation.

## Allowed files

1. `docs/reports/NC-20260905-008-CLAUDE-RECONCILIATION-RESPONSE-R1.md`
2. `docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.json`
3. `docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.md`
4. `facts/catalogs/academy-capacity-reconciliation-evidence-v1.schema.json`
5. `scripts/validate-academy-capacity-reconciliation.mjs`
6. `scripts/validate-academy-capacity-reconciliation.d.mts`
7. `src/academy-capacity-reconciliation.test.ts`

Do not inspect credentials, `.env`, provider data, identities, or unrelated
files. Do not modify source. Write only the response file below.

## Corrections to challenge

1. MCS Friday now references an owned
   `exception:mcs-friday-funding-source-coverage-incomplete` for the three
   active assignments without bound successful non-refunded Stripe payments.
   The narrative reports seven exceptions. The validator now requires every
   positive `funding_unresolved_or_non_stripe` value to have a referenced
   funding-coverage exception; a negative test removes it and must fail.
2. The validator now applies the tracked JSON Schema with a deterministic
   recursive evaluator covering every keyword used by this schema: `type`,
   `const`, `pattern`, `format`, `required`, `properties`,
   `additionalProperties`, `minItems`, and optional `items`. Schema findings
   and domain findings both gate CLI success. Tests prove the current report
   passes and a missing required top-level property is rejected by the schema.

## Mechanical evidence

- CLI validator: 5 delivery blocks, 7 exceptions, aggregate/hash-only — pass.
- Focused reconciliation/capacity tests: 20/20.
- Pinned Node typecheck and diff check: pass.

## Response

Write only
`docs/reports/NC-20260905-008-CLAUDE-RECONCILIATION-RESPONSE-R2.md`.

Report material findings only. If both corrections hold without a material
regression, say `NO MATERIAL FINDINGS` and briefly identify the checks made.
