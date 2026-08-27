# NC-20260823-006 terminal-held replay correction review R2

Reviewed exactly the bounded file set named in the request. No Bash, web,
MCP, credentials, logs, databases, provider access, unrelated files, or
implementation edits were used.

NO MATERIAL FINDINGS

## Verification of the R1 correction

- `beginContadorFulfillmentWithClient`
  (`src/contador-payment-fulfillment-store.ts:412-528`) now has a dedicated
  branch (lines 466-471) checked before the catch-all reopen `else`: `state
  === 'write_failed' && last_error_code === 'expired_processing_terminalized'`
  sets `terminalHeld = true` and returns `prior.rows[0]` unmodified. This
  branch is ordered ahead of the `inFlight` check and the reopen `else`, so a
  terminalized case can never fall through to the `UPDATE` that resets
  `state`/`version`/`attempt_count`/lease.
- `bindAliases` (line 506) and the `admission` receipt insert (line 508) are
  both explicitly gated on `!terminalHeld`, matching the `duplicateComplete`/
  `inFlight` no-mutation pattern already used for the other short-circuits.
  `leaseToken` is `null` for `terminalHeld` (line 526).
- `BeginContadorFulfillmentResult.terminalHeld` (line 124) is exposed and
  consumed by `handleStripePayment`
  (`src/stripe-payment-host.ts:425-435`), which returns a
  `[PAYMENT HELD]`/`[REFUND HELD]` summary and returns *before* the
  `admission.inFlight || !admission.leaseToken` check (line 436) and before
  building `execFile` args or calling `execFileAsync`/`finalizeContadorFulfillment`.
  No processor script, finalizer, or lifecycle enqueue can execute on this
  path.
- Ordinary `write_failed` states (`processor_failed`,
  `processor_contract_invalid`, `product_mapping_missing`, etc.) do not match
  `last_error_code === 'expired_processing_terminalized'` and correctly fall
  to the pre-existing reopen `else`, preserving retry behavior.
- Only `src/stripe-payment-host.ts` calls `beginContadorFulfillment`/
  `finalizeContadorFulfillment` (confirmed by searching all of `src/` for both
  symbols) — no other entry point exists that could reopen or externally
  process a terminalized case.
- `finalizeContadorFulfillmentWithClient` requires `state === 'processing'`
  to proceed (line 546) and `terminalizeExpiredContadorFulfillmentCaseWithClient`
  requires `eligible` (also `state === 'processing'`, unless already
  terminalized, which is a no-op) — neither can act on a `write_failed`/
  terminalized case, so no other write path can reopen it either.

## Test coverage

- `contador-payment-fulfillment-store.test.ts:353-381` ("never reopens a case
  closed by expired-processing terminalization"): drives
  `beginContadorFulfillmentWithClient` with a prior terminalized row, asserts
  `terminalHeld: true`, `leaseToken: null`, and `query` called exactly twice
  (advisory lock + `FOR UPDATE` select only — no alias/receipt/update calls).
- `stripe-payment-host.test.ts:386-410` ("never reruns external writes for a
  terminalized expired case"): mocks `beginFulfillment` to return
  `terminalHeld: true`, asserts the injected `execFile` invocation spy is
  never called and `finalizeFulfillment` is never called.

Both regressions match the request's claimed proof and directly cover the R1
defect (untested negative/replay path). No gap found in the bounded file set.
