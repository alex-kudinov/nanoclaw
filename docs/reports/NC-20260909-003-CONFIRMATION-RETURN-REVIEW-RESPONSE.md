# NC-20260909-003 confirmation return review — response

NO MATERIAL FINDINGS

The `/internal/payments/returns` branch in `src/payment-api-controller.ts`
computes its minimized `state` once from `result.state` (needs_review and
terminal_nonpayment mappings unchanged) and now calls
`events.readConfirmationSummary(attemptId)` only in the `confirming_payment`
case, attaching `confirmation` only when the store returns a value. This
mirrors the pre-existing `/status` fallthrough branch exactly, so the fix
reuses an already-vetted minimized-summary shape rather than introducing a
new one. The capability/`permitsStatus` gate that authorizes `/status` reads
is the same gate already enforced ahead of the `/returns` branch, so no new
authorization boundary is created for the added field. `retry` attachment on
`terminal_nonpayment` and the `needs_review` short-circuit are untouched by
this change.

`src/payment-api-controller.test.ts` was updated in lockstep: the returns
test now asserts the full response body including `confirmation`, matches
the `/status` test's expected shape, and retains the existing
non-exposure assertions for PSP/session values (`must-not-expose`,
`command.sessionResult`).
