# NC-20260909-003 correction review — response R2

Reviewed: `docs/reports/NC-20260909-003-CLAUDE-REVIEW-RESPONSE-R1.md`,
`src/adyen-webhook.ts`, `src/config.ts`,
`setup/n8n/adyen-test-payments-workflow.json`,
`docs/ADYEN-TEST-WEBHOOK.md`.

## Finding 1 — closed

The `store` check (`src/adyen-webhook.ts:215-217`) is still enforced (fails
closed with 403 on mismatch), but it is no longer misrepresented as an
authenticated boundary. `docs/ADYEN-TEST-WEBHOOK.md:42-45` now states
explicitly that Adyen's Standard HMAC does not sign `additionalData.store`
and that the check is defense-in-depth routing only. The signed
`merchantReference` prefix check (`src/adyen-webhook.ts:134`, `:218`,
default `tandem-poc-tsv1-` in `src/config.ts:177`) is documented as the
actual tenant/environment boundary, consistent with R1's own analysis that
`merchantAccountCode` and `merchantReference` are signed. The stored field
is renamed to `reported_store` (`src/adyen-webhook.ts:257`), signaling to
downstream consumers that it is unauthenticated. R1's concern was the
documentation/contract overstating what the code enforces, not the presence
of the check itself — that gap is closed.

## Finding 2 — closed

`setup/n8n/adyen-test-payments-workflow.json:95-96` now sets both
`saveDataErrorExecution` and `saveDataSuccessExecution` to `"none"`.
`docs/ADYEN-TEST-WEBHOOK.md:27-28` states both are disabled, matching the
workflow. The leak path (full payload retained on any error execution) is
closed.

Corrections accepted; no unresolved material finding.
