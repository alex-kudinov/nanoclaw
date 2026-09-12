# NC-20260909-003 simple checkout correction review R2 — response

Reviewed exactly the 4 allowed files (`website-checkout-service.ts`,
`payment-deferred-identity-migration.test.ts`, the PHP coordinator, and its
test file) plus the R2 request and R1 response. No other file, database,
config, or log was opened.

## R1 HIGH — part 1: unscoped terminal-receipt purge

`cleanupCheckoutSubmissions` (`src/website-checkout-service.ts:443-464`) now
selects purge candidates via:

```sql
WHERE e.projection->>'state' IN ('refused','payment_failed')
  AND NOT EXISTS (
    SELECT 1 FROM business_v2.payment_operations o
    WHERE o.attempt_id=a.attempt_id
      AND NOT EXISTS (
        SELECT 1 FROM business_v2.payment_session_terminal_nonpayment_receipts t
        WHERE t.payment_operation_id=o.operation_id
      )
  )
```

This requires every `payment_operations` row on the attempt to carry a
terminal-nonpayment receipt, joined by `payment_operation_id` (per
sub-session), not just "any receipt exists for the attempt" as before. The
same-attempt retry scenario from R1 — an earlier sub-session goes terminal,
`retry_payment()` opens a new sub-session on the same `attemptId`, that
sub-session later authorizes — leaves the new operation without a terminal
receipt, so the inner `NOT EXISTS` finds it, the outer `NOT EXISTS` becomes
false, and the row is excluded from purge. A still-pending (not yet
resolved) sub-session is blocked the same way, since it also lacks a
terminal receipt. This closes the gap as described.

`payment-deferred-identity-migration.test.ts:37-43` pins the corrected SQL
shape by substring, consistent with the "25/25" evidence claim.

No new gap found in the allowed files: a `NULL` evidence row (LEFT JOIN
`e`) makes `e.projection->>'state' IN (...)` evaluate to `NULL`, so the row
is excluded (fails closed, retains payload) rather than purged — the
opposite failure direction from R1's defect, and not a payment-truth or
security regression.

## R1 HIGH — part 2: unguarded `admit_checkout()` on post-payment paths

`return_payment()` (line 745) and `payment_status()` (line 777) both now
call `post_payment_admission()` instead of `admit_checkout()` directly.
`post_payment_admission()` (lines 1211-1220) wraps the same
`admit_checkout()` call in `catch (Throwable $error)` and returns
`pending_enrollment('payment_confirmed_fulfillment_pending')` on failure —
mirroring the swallow pattern already accepted in `start_payment()`
(line 690).

Critically, `$payment['state']`, `$payment['retry']`, and
`$payment['confirmation']` in both call sites come from
`validate_payment_state()` against the authenticated `/internal/payments/returns`
or `/internal/payments/status` response, computed *before* and independently
of `post_payment_admission()`. `assert_confirmation_quote()` and the
`confirmation` field in the returned result are unaffected by whether
admission succeeded or fell back — a caller now always gets the true payment
state instead of an uncaught throw. This closes the compounding gap R1
identified in `return_payment()`/`payment_status()` lacking the try/catch
that `start_payment()` already had.

`test-checkout-dispatch-coordinator.php:65` pins both call sites route
through `post_payment_admission($request, $preparation` (count === 2) and
that the fallback reason string is present, consistent with "41/41" passing.

## Verdict

NO MATERIAL FINDINGS. Both halves of the R1 HIGH are closed within the
allowed packet, and the paid-status fallback returns the authenticated
payment state/confirmation unconditionally — it does not weaken payment
truth, it only defers enrollment materialization to the restart-safe
fulfillment worker.
