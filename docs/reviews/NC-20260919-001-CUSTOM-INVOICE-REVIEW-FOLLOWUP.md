# NC-20260919-001 load-bearing review follow-up

Resolve only the prior finding about whether `initialPaymentMethod` and the
selection-method enum must apply to ordinary finite contracts. Do not reopen
any other review question. Write only
`docs/reviews/NC-20260919-001-CUSTOM-INVOICE-REVIEW-FOLLOWUP-RESPONSE.md`.

The prior review correctly observed that the NanoClaw diff makes these fields
required for both finite and custom contracts, but its claim that no production
ordinary signer was updated lacked the existing Commerce producer contract.
That producer already signs every installment contract as follows; this is
pre-existing source, not a new diff:

```php
// Manual card path, for ordinary finite and custom schedules alike.
$billing_contract = Tandem_Commerce_Installments::schedule(...);
$billing_contract['disclosure'] = Tandem_Commerce_Installments::disclosure($billing_contract);
$billing_contract['disclosureSha256'] = hash('sha256', $billing_contract['disclosure']);
$billing_contract['selectionMethod'] = 'payment_option_and_submit';
$billing_contract['initialPaymentMethod'] = 'scheme';

// Apple Pay path, including ordinary finite schedules.
$contract = self::schedule(...);
$contract['disclosure'] = self::disclosure($contract);
$contract['disclosureSha256'] = hash('sha256', $contract['disclosure']);
$contract['selectionMethod'] = 'apple_pay_recurring_proof';
$contract['initialPaymentMethod'] = 'applepay';
```

The Commerce request builder independently requires the authenticated
contract's `initialPaymentMethod` to equal the provider method type before any
request is dispatched. The stored activation envelope sends that exact signed
contract unchanged. An actual custom manual-card attempt was rejected by the
old NanoClaw strict schema partly because `initialPaymentMethod` was an
unrecognized key. The same old schema also rejects the pre-existing Apple Pay
selection method.

The schedule digest is intentionally computed before `disclosure`,
`disclosureSha256`, `selectionMethod`, and `initialPaymentMethod` are appended.
The NanoClaw implementation therefore removes all four before recomputing the
schedule digest, while separately validating the exact method pair.

Question: with this producer evidence, should the current universal required
pair remain, closing a pre-existing ordinary finite-contract incompatibility,
or does the smallest safe correction remain to narrow it to custom contracts?
Return `PASS` if the universal pair is correct; otherwise restate the smallest
safe correction and the exact remaining incompatibility.
