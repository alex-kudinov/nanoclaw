# NC-20260823-006 terminal-held replay correction review R2

Review only the load-bearing correction to R1 material finding 1. Read:

- `docs/reports/NC-20260823-006-CLAUDE-TERMINAL-CORRECTION-RESPONSE-R1.md`
- `src/contador-payment-fulfillment-store.ts`
- `src/contador-payment-fulfillment-store.test.ts`
- `src/stripe-payment-host.ts`
- `src/stripe-payment-host.test.ts`
- this request

Write only:

`docs/reports/NC-20260823-006-CLAUDE-TERMINAL-CORRECTION-RESPONSE-R2.md`

No Bash, web, MCP, credentials, logs, databases, provider access, unrelated
files, or implementation edits. Report material findings only; if the R1 replay
defect is closed without introducing another material defect, write
`NO MATERIAL FINDINGS`.

Correction:

- `BeginContadorFulfillmentResult` now exposes `terminalHeld`.
- Before the ordinary retry branch, admission recognizes exactly
  `state='write_failed'` plus
  `last_error_code='expired_processing_terminalized'`.
- It returns the prior case unchanged, with null lease, and skips alias binding
  plus admission receipt.
- `handleStripePayment` returns a payment/refund-held result for
  `terminalHeld` before the in-flight/processor path; it never invokes
  `execFile`, finalization, lifecycle enqueue, or external writes.
- Other `write_failed` states remain retryable under the pre-existing policy.
- Store regression proves only advisory-lock/select occur and no case/alias/
  receipt mutation happens.
- Host regression proves no processor/finalizer call and held output with the
  existing case/version.
- Typecheck and focused store/host/webhook/reaper tests pass 103/103.

Review specifically whether any later delivery can still reopen or externally
process an `expired_processing_terminalized` case, whether the no-mutation
short circuit is ordered correctly, and whether ordinary retryable exceptions
retain their prior behavior.
