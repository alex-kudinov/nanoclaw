# NC-20260909-003 canonical website enrollment adapter review R1 — response

## Finding 1 (material): authorized payment amount/currency is never checked against the quote before materialization

`src/website-checkout-enrollment-adapter.ts:608-622`:

```ts
const authorized = current.projection.projection.payments.filter(
  (payment) => payment.evidence.authorization === 'authorized',
);
const payment = authorized.find(
  (candidate) =>
    candidate.paymentReference === current.method?.paymentReference,
);
if (authorized.length !== 1 || !payment) {
  metadata = {
    ...metadata,
    currentPaymentState: 'needs_review',
    reasons: ['multiple_or_mismatched_provider_payments'],
  };
  return { ...state, orderKey, disposition: 'held' as const };
}
```

This block, and the readiness gate it follows (`src/payment-readiness.ts:113-116`, the
`financial.authorization !== 'authorized'` branch), verify PSP reference identity and
authorization status only. Neither reads nor compares any amount or currency field on
`payment.evidence` against `attempt.quote.finalAmount` / `attempt.quote.currency`. The
same absence holds for the card branch (`payment-readiness.ts:118-131`), which returns
`courseAccess: 'eligible'` on bare `authorized` status with no further amount gate ever
applied later (card has no separate received-funds checkpoint the way ACH does).

Violated accepted fact — `docs/MCS-WEBSITE-CHECKOUT-ENROLLMENT-ADAPTER.md:109-111`:
"For new materialization it requires one exact method binding and one current authorized
payment projection **matching the quote amount/currency/PSP**, with no second authorized
PSP or adverse/conflicting evidence." The code enforces PSP match only; amount/currency
match against the quote is absent.

Consequence: `admissionDigest`/`financialDigest` and the persisted financial obligation
record `attempt.quote.finalAmount` (`website-checkout-enrollment-adapter.ts:775`)
unconditionally — the WordPress-declared amount — regardless of what Adyen actually
authorized. A PSP authorization for a different amount or currency than the quote (e.g.
a manipulated or misrouted session amount) still satisfies every existing check and
reaches canonical order/seat/enrollment/agreement/obligation writes and provisional
course access, with the obligation ledger silently misstating what was actually accepted.
The webhook fixture in the disposable test already carries `amount`/`currency`
(`src/website-checkout-enrollment-adapter-disposable.test.ts:356-359`), confirming the
projection data needed for this comparison is available; no test in the suite exercises
an amount/currency mismatch.

Smallest bounded correction: in the `authorized`/`payment` block above, additionally
require `payment.evidence`'s authorized amount and currency to equal
`attempt.quote.finalAmount` and `attempt.quote.currency`; hold with a new reason (e.g.
`provider_amount_currency_mismatch`) before the ACH-mandate check and writer claim if
they don't match. No other control-flow change is needed.
