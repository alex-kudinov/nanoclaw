# NC-20260909-003 confirmation return review

Review only the two-file correction below. Report material payment-truth,
privacy, replay, or response-contract findings; do not inspect secrets,
configuration, logs, databases, unrelated source, or edit implementation.

Defect: an authenticated successful `/internal/payments/returns` response used
`state: confirming_payment` but omitted the minimized confirmation summary.
WordPress consequently completed enrollment and the browser showed “You’re
enrolled,” but step 4 and receipt/paid-invoice actions did not render. A later
`/status` response already included the same summary.

Correction: in `src/payment-api-controller.ts`, the return branch now derives
its minimized state once and calls the existing
`events.readConfirmationSummary(attemptId)` only when that state is
`confirming_payment`. It adds `confirmation` only when the trusted store returns
one. Terminal nonpayment and needs-review responses remain unchanged. The
existing WordPress validator independently binds offer/amount/currency and only
accepts confirmation alongside `confirming_payment`.

Allowed files:

1. `src/payment-api-controller.ts`
2. `src/payment-api-controller.test.ts`
3. This request.

Verification: typecheck passes; payment API, full disposable checkout service,
and live composition tests pass 43/43; WordPress coordinator and BFF tests pass
111/111.

Write only
`docs/reports/NC-20260909-003-CONFIRMATION-RETURN-REVIEW-RESPONSE.md`.
Use `NO MATERIAL FINDINGS` if the correction safely restores confirmation
without exposing PSP/session/method data or weakening terminal states.
