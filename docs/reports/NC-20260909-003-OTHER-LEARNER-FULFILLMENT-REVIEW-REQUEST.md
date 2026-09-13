# NC-20260909-003 other-learner fulfillment and documents review

## Objective

Review the bounded correction for the first confirmed LIVE `other`-learner MCS
purchase. Report only material correctness, duplicate-creation, authorization,
privacy, document-integrity, or regression findings.

## Accepted production facts

- The payment is authorized and its canonical order/enrollment is materialized.
- The payer and participant are deliberately different; repeated emails across
  different purchases are allowed by the accepted simplified-checkout model.
- The participant does not yet exist in Heartbeat. Heartbeat's exact-email
  `/find/users` returns HTTP404, and the registered toolbox wrapper exits
  nonzero. Its name path scans at most1,000 users and returns an array.
- The Heartbeat projection currently retries `provider_lookup_failed`; the
  participant has not been created or granted access.
- Migration165 intentionally leaves the pre-payment
  `payment_identity_preparations.payer_party_id/participant_party_id` null and
  records paid identities in `payment_identity_materializations`.
- Receipt and paid-invoice prepare calls currently fail before creating a
  document because the authority SQL still joins those old null columns.
- No new payment is authorized by this change. Provider writes remain the
  existing idempotent Heartbeat create/add flow after exact authority checks.

## Review scope

Read only:

- `src/website-checkout-heartbeat-live-delivery.ts`
- `src/website-checkout-live-service.test.ts`
- `src/payment-checkout-documents.ts`
- `src/payment-checkout-documents.test.ts`
- this request

Compare the working diff to base commit
`126e9392624ac92439985a2888f571f6586ed946`.

Write only:

- `docs/reports/NC-20260909-003-OTHER-LEARNER-FULFILLMENT-REVIEW-RESPONSE.md`

Do not read or expose private configs, credentials, logs, database rows,
customer information, browser state, dumps, `.env`, auth stores, or unrelated
files. Do not edit implementation or tests. Do not run provider calls.

## Required questions

1. Does email lookup failure followed by bounded name lookup and exact
   normalized-email filtering safely distinguish a normal new learner from an
   existing account, including same-name/different-email collisions?
2. Can the fallback create a duplicate or turn a transient lookup failure into
   an unsafe write? Evaluate the existing uncertain-acceptance/readback behavior
   in the listed source only.
3. Does the document SQL now bind payer/participant identity exclusively to the
   immutable paid materialization while preserving all existing authorization,
   payment, active-enrollment, and retry-exception checks?
4. Are the tests load-bearing enough for the two production defects?

## Verification already completed

- Focused:4 files,33/33 tests.
- Broader Adyen/payment/checkout/projection:56 files,526/526 tests.
- TypeScript typecheck passes.
- Full repository:4,326 passed,32 skipped,19 failed in five unrelated
  pre-existing suites (missing external Tandemweb source fixture plus existing
  CNPC, capacity, and Trafft assertions). None of the failed files overlaps this
  diff.

## Response format

Write either `NO MATERIAL FINDINGS` with a concise rationale, or an ordered list
of material findings with exact file and line evidence plus the smallest safe
correction. Do not add speculative backlog or restate the packet.
