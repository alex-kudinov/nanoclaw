# NC-20260909-003 correction review R2

Review only:

- `docs/reports/NC-20260909-003-CLAUDE-REVIEW-RESPONSE-R1.md`
- `src/adyen-webhook.ts`
- `src/config.ts`
- `setup/n8n/adyen-test-payments-workflow.json`
- `docs/ADYEN-TEST-WEBHOOK.md`

R1 found that Standard HMAC does not sign `additionalData.store`, and the n8n
draft retained full error executions.

Corrections:

1. The actual signed integration boundary is now the unique
   `tandem-poc-tsv1-` merchant-reference prefix. The reported store remains a
   mismatch rejection only as defense in depth, is stored as `reported_store`,
   and documentation expressly says it is not authenticated by Standard HMAC.
2. n8n now sets both `saveDataSuccessExecution` and
   `saveDataErrorExecution` to `none`; the runbook states both.

Typecheck, 47 focused tests, documentation continuity, and workflow JSON parsing
pass. Determine only whether both R1 findings are closed without a new material
security or reliability defect. Do not inspect other files, credentials,
runtime state, or the internet. Do not edit implementation.

Write to
`docs/reports/NC-20260909-003-CLAUDE-CORRECTION-RESPONSE-R2.md` using
`Corrections accepted; no unresolved material finding.` or one exact remaining
material defect with file/line evidence.
