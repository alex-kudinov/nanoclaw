# NC-20260909-003 amount/currency boundary evidence R2

R1 concluded that the adapter can consume an authorization whose amount or
currency differs from the quote. That conclusion omitted the trusted projection
boundary that produces the only `payment_checkout_evidence` row the adapter can
consume.

## Projection validation

`src/payment-domain.ts:433-460` validates every raw payment fact against the
persisted attempt before projecting it:

```ts
const attempt = validateAttempt(input.attempt);
// ...scope, attempt and PSP checks...
check(fact.currency === attempt.quote.currency, 'fact_currency_mismatch');
check(fact.amount <= attempt.quote.finalAmount, 'fact_amount_exceeds_payment');
check(
  fact.kind !== 'authorization' ||
    fact.amount === attempt.quote.finalAmount,
  'authorization_amount_mismatch',
);
```

`PaymentEvidenceProjection` at `src/payment-domain.ts:408-425` deliberately
retains authorization state and later financial totals, not the already-validated
authorization amount/currency.

## Persistence ordering

`src/payment-event-store.ts:402-416` calls `projectPaymentEvidence` on the
candidate fact before inserting it. Any `PaymentDomainError`, including either
mismatch above, is persisted as `amount_or_fact_conflict` and returns before the
payment event insert. Only a validated fact reaches the insert at lines 495-506
and the full projection refresh at lines 528-532. The adapter therefore cannot
read an `authorized` projection created from a mismatched fact through this
trusted store.

## End-to-end regression

`src/website-checkout-enrollment-adapter-disposable.test.ts:616-644` sends a
signed authorization with, independently, the wrong amount and wrong currency
through the real `PaymentEventStore`. Both cases produce one durable
`amount_or_fact_conflict`, the adapter returns held, and there are zero writer
claims and zero canonical admissions. The corrected adapter suite is 16/16.

## Current contract

`docs/MCS-WEBSITE-CHECKOUT-ENROLLMENT-ADAPTER.md:119-126` now makes the boundary
explicit: the trusted payment-event projection owns amount/currency validation;
the adapter consumes the minimized validated projection and exact PSP binding.
Adding amount/currency fields to the projection would broaden the accepted
adapter slice and duplicate an enforced trust-boundary invariant.
