# NC-20260903-001 narrow bounded review R1B — response

Base reviewed: `658b473061a3a684e837c409fa3737812fe3a8e9`. Ranges read exactly
as specified in the request; no other files, tests, or Git state consulted.

## Verdict

NO MATERIAL FINDINGS.

Traced the full decision path against the review question (transient
Payment Log/Postgres/roster failure marked handled, failing to retry,
concurrent execution, duplicate business write, or false unmapped/complete
report):

- `derivePaymentFulfillmentOutcome` (process-payment.cjs:681-749) routes every
  non-verified Payment Log/Postgres outcome to `write_failed` with one of the
  three retryable readback codes, and its roster `else` branch defaults any
  unrecognized `rosterMode` to `student_roster_readback_failed` rather than
  `complete` — a safe fallback, not a silent success.
- `assertProcessorFulfillment` (stripe-payment-host.ts:242-310) and
  `assertReceiptCompleteness` (contador-payment-fulfillment-store.ts:300-342)
  independently re-derive the same "all required stages verified" gate before
  allowing `complete`, including the refund-can-never-auto-complete rule — two
  independent enforcement points agree.
- `beginContadorFulfillmentWithClient` (contador-payment-fulfillment-store.ts:420-527)
  serializes admission with a transaction-scoped advisory lock keyed on
  `stripeAccount:paymentIntentId` before checking `duplicateComplete`/
  `inFlight`/`terminalHeld`, so two concurrent admissions for the same intent
  cannot both proceed to run the pipeline.
- All business writes on the retry path are upserts keyed by Stripe ID
  (Payment Log readback, roster cell writes, Sales catch-all row, Postgres
  `ON CONFLICT`), and `clearSalesCatchAll` (process-payment.cjs:456-470) is a
  no-op once the row is already cleared — replays and reaper retries do not
  duplicate rows.
- `webhook-server.ts:1603-1702` and `webhook-inbox-reaper.ts:215-256` both
  call `markWebhookFailed`/`markWebhookHandled` (or throw for retry) *before*
  the presentation Slack write, and swallow only the presentation-write
  error — matching the stated invariant that a notice failure must not reopen
  a business outcome.

## Residual risk (non-material)

- `process-payment.cjs:948-951` — the `notAStudent` branch calls
  `clearSalesCatchAll` without a local `try/catch`, unlike the sibling
  `mapped_verified` (1055-1063) and `unmapped_product` (1081-1107) branches.
  Its outer catch is outside the reviewed range, so its exact effect on
  `results.sheets_roster` is unconfirmed here. Impact is bounded regardless:
  `derivePaymentFulfillmentOutcome`'s roster `else` branch treats any
  `rosterMode` other than `mapped_verified`/`not_student`/`missing_student`/
  `unmapped_product` as retryable `write_failed`, so a thrown exception here
  cannot surface as a false `complete`. Smallest safe correction if desired:
  wrap the `clearSalesCatchAll` call at 949 in the same try/catch pattern used
  by the other two branches, for consistency and a clearer per-stage error
  message rather than relying on the outer catch.
