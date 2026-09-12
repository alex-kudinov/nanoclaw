# NC-20260909-003 simple checkout correction review R2

Review only the R1 HIGH correction. Do not reopen accepted findings or inspect
secrets, configuration, logs, databases, unrelated files, or the untracked
Tandemweb contract.

R1 found that cleanup could purge a payload because any historical terminal
sub-session existed even while a later successor Session remained live. The
correction now requires the current projection to be `refused` or
`payment_failed` and requires every payment operation on the attempt to have a
terminal-nonpayment receipt. Therefore a live successor or an authorized
current projection prevents purge. The public UI no longer creates successors,
but the guard preserves retained legacy attempts.

R1 also noted that a missing payload/materialization error could make a paid
return/status request fail. The correction routes both post-payment call sites
through `post_payment_admission()`: it attempts exact admission, but on failure
returns `payment_confirmed_fulfillment_pending` while preserving the
authenticated payment state/confirmation. The restart-safe worker remains the
idempotent fulfillment retry owner.

Allowed files:

1. `src/website-checkout-service.ts`
2. `src/payment-deferred-identity-migration.test.ts`
3. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-dispatch-coordinator.php`
4. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/tests/test-checkout-dispatch-coordinator.php`
5. This request and the R1 response.

Evidence: backend typecheck and corrected focused tests 25/25 pass; Tandem
coordinator 41/41, browser 95/95, and both public/preview builds pass.

Write only
`docs/reports/NC-20260909-003-SIMPLE-CHECKOUT-REVIEW-RESPONSE-R2.md`.
Report only unresolved material findings. Use `NO MATERIAL FINDINGS` if the R1
defect is closed and the paid-status fallback does not weaken payment truth.
