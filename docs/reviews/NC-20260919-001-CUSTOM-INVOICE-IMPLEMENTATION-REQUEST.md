# NC-20260919-001 bounded implementation review

Read only
`docs/reviews/NC-20260919-001-CUSTOM-INVOICE-IMPLEMENTATION.diff` and this
request. Do not inspect other files. Write only
`docs/reviews/NC-20260919-001-CUSTOM-INVOICE-IMPLEMENTATION-RESPONSE.md`.

Return `PASS` when no material finding exists. Otherwise report only a finding
that can admit false/wrong payment truth, weaken signature/idempotency or
rollback safety, create an unintended roster/document side effect, drop a
required accounting readback, or break existing catalog payments. Include the
exact diff evidence and smallest safe correction.

## Objective

Close the two Company OS retry failures and one Commerce document defect found
by an actual two-obligation Adyen TEST traversal:

1. accept the exact signed custom-invoice schedule without weakening ordinary
   finite schedules;
2. widen only the existing PostgreSQL cadence CHECK with a populated-custom-row
   rollback refusal;
3. carry server-derived signed `rosterPolicy=none` for Commerce invoice modes,
   while still requiring Payment Log and PostgreSQL readback and performing no
   Student Roster call;
4. prevent a paid-in-full document after installment one and allow the original
   issued invoice only for the final installment.

## Accepted facts and authority

- Commerce retains the provider token and already proved two USD 1.00 TEST
  charges exactly once with no third charge.
- `rosterPolicy` is authored only by Commerce from its retained server-owned
  `fulfillmentMode`; payer, email, title and browser data never choose it.
- No new route, table, column, worker, queue, scheduler, credential or provider
  call is allowed.
- The nested ESD experiment and earlier webhook amount fix were separately
  reviewed and are not part of this review.

## Verification

- Minimum-sufficient S1: `KEEP`.
- Focused finite-billing, disposable migration, Bookkeeper and webhook suites:
  81/81.
- Pinned Node 22.23.2 typecheck: passed.
- Full suite: 4,523 passed, 34 skipped, with the exact three live-base
  predecessor failures in Academy Capacity, CNPC prompt source, and the
  date-sensitive Trafft shadow; none touches this diff. One unrelated worker
  exit was also reported by the broad parallel run. Every changed focused suite
  passed.

## Required invariants

- Custom schedules require source invoice UUID, `custom` cadence, 2–8 ordered
  obligations, base plus fee equal amount, exact totals/currencies/dates,
  schedule/consent digests, first-payment match, and exact selection/initial
  method pair.
- Ordinary finite schedules remain 2–24 and monthly/quarterly/annual.
- Migration reapply is a no-op and preserves rows/owner/grants. Rollback may
  restore the old CHECK only with zero custom rows.
- `rosterPolicy=none` rejects cohort data, skips roster calls, and succeeds only
  with Payment Log plus PostgreSQL readback. Unknown/missing policy fails.
- Initial invoice installment gets a receipt only; final installment may reuse
  the permanent issued invoice. One-time invoices remain unchanged.
