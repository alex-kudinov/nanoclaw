# NC-20260909-003 canonical adapter correction review R2 — response

## FINDING RETRACTED

R1's amount/currency finding assumed the adapter's own PSP-match block
(`website-checkout-enrollment-adapter.ts:608-622`) was the only gate standing
between a mismatched authorization and canonical writes. The omitted trusted
projection boundary closes that gap before the adapter ever sees the fact.

## Decisive boundary evidence

`payment-domain.ts:433-460` validates every raw fact against the persisted
attempt inside `projectPaymentEvidence`:

```ts
check(fact.currency === attempt.quote.currency, 'fact_currency_mismatch');
check(fact.amount <= attempt.quote.finalAmount, 'fact_amount_exceeds_payment');
check(
  fact.kind !== 'authorization' ||
    fact.amount === attempt.quote.finalAmount,
  'authorization_amount_mismatch',
);
```

`payment-event-store.ts:402-416` calls this validation on the incoming fact
inside a try/catch whose catch branch unconditionally `return`s an
`amount_or_fact_conflict` exception result:

```ts
try {
  projectPaymentEvidence({ attempt, paymentReference: fact.paymentReference, facts: [fact] });
} catch (error) {
  if (!(error instanceof PaymentDomainError)) throw error;
  return this.exception(client, fact, 'amount_or_fact_conflict', attemptRow.attempt_id);
}
```

Because the catch branch returns before any further code runs, the only path
that reaches the insert at `payment-event-store.ts:495-506` and the projection
refresh at `payment-event-store.ts:528-532` is the path where the fact already
satisfied exact currency equality and, for `kind === 'authorization'`, exact
amount equality against `attempt.quote.finalAmount`/`currency`. No authorization
fact that mismatches the quote is ever persisted or folded into the projection
the adapter later reads as `current.projection.projection.payments`.

The end-to-end regression at
`website-checkout-enrollment-adapter-disposable.test.ts:616-644` exercises both
the wrong-amount and wrong-currency cases through the real `PaymentEventStore`
(not a mock) and asserts, via direct query, exactly one durable
`amount_or_fact_conflict` exception, zero `payment_enrollment_admissions`, and
zero `student_enrollment_writer_claims` — i.e., the adapter is held and no
canonical write is reachable in either case.

`docs/MCS-WEBSITE-CHECKOUT-ENROLLMENT-ADAPTER.md:119-126` now records this as
the accepted contract: the trusted payment-event boundary owns amount/currency
validation before publication; the adapter's PSP-identity check operates only
on facts that boundary has already admitted.

## Conclusion

No path exists by which a mismatched authorization can become an `authorized`
projection entry consumed by `website-checkout-enrollment-adapter.ts:608-622`.
R1's finding is retracted; no adapter-level amount/currency check is needed,
and the projection schema should not be expanded to duplicate the invariant
already enforced at the trust boundary.
