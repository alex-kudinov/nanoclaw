# Tandem Commerce implementation review — response

Reviewed only the files listed under "Review surface" in the request, plus the
listed supporting tests. No source was modified, no commands were run.

## Finding 1 — Critical: a genuine but delayed AUTHORISATION can be permanently unfulfillable, with no durable trace of the failure

**Files:** `wordpress/tandem-commerce/includes/class-tandem-commerce-store.php` — `purge_expired_submissions()` (lines 296–301) and `record_event()` (lines 199–259, specifically 208, 222–227, 253–258).

`purge_expired_submissions()` nulls `payload_ciphertext` for any submission still `awaiting_payment` or `abandoned` once `provider_session_expires_at` has passed, based purely on elapsed time — it does not check whether a payment attempt is actually in flight:

```php
public function purge_expired_submissions(): void {
    $this->db->query(
        "UPDATE {$this->prefix}submissions SET status='terminal_nonpayment',payload_ciphertext=NULL,updated_at=UTC_TIMESTAMP() " .
        "WHERE status IN ('awaiting_payment','abandoned') AND provider_session_expires_at IS NOT NULL AND provider_session_expires_at<UTC_TIMESTAMP()"
    );
}
```

This runs unconditionally at the top of every `Actions::run()` call, which fires whenever *any* customer's webhook is processed successfully (`Controller::webhook()` → `Actions::request_run()`), not only for the submission whose session just expired. On a real site this can execute frequently and sweeps every row in the table, not just the one tied to the current request.

If a shopper's card was genuinely authorised but Adyen's `AUTHORISATION` webhook is delivered after `provider_session_expires_at` has already passed (webhook delay, Adyen-side retry queue, or an outage), the purge can null that submission's `payload_ciphertext` before the real webhook arrives. When the webhook then lands, `record_event()`'s paid branch reads the already-purged row:

```php
$submission = ...SELECT ... FOR UPDATE...;           // payload_ciphertext already NULL
...
$snapshot = $this->security->open((string) $submission['payload_ciphertext']);
foreach (['payer', 'learner'] as $role) {
    $person = is_array($snapshot[$role] ?? null) ? $snapshot[$role] : null;
    if ($person === null) throw new RuntimeException('commerce_person_missing');
}
```

The thrown exception is caught by the surrounding `try`, which issues `ROLLBACK` on the whole transaction — including the `events` INSERT that had just been made in the same transaction. The webhook handler then returns `webhook_unavailable` (503). Because the `events` row is rolled back, **nothing about this failure is durably recorded in WordPress**; every Adyen retry hits the identical state and fails identically, forever (there is no self-healing path — the payload cannot be reconstructed). Eventually Adyen exhausts its retry window and the merchant has no order, no receipt, no invoice, no Bookkeeper record, and no learner enrollment for a payment that was actually captured — with no application-side signal that this happened.

This directly contradicts invariant 3 ("a late authentic payment cannot be silently lost") and touches the payment-lost, customer-stuck, and documents/enrollment-failure categories in the review objective.

Note: I confirmed the more obvious "decline-then-retry-on-the-same-session" variant of this race is *not* reachable — `commerce-checkout-core.js` permanently disables `payButton` once `paymentStarted` is true and only clears it via a full reset to a brand-new submission after `terminal_nonpayment` is observed, so a second authorisation can never arrive for a merchant reference that already received a failed one. The purge-driven path above is the real gap; it is also untested — `tests/test-commerce-core.php` never exercises `Store::record_event()` or `purge_expired_submissions()` against a live/mocked `wpdb`.

## Finding 2 — Low: undocumented pre-launch dependency for the Bookkeeper roster projection

**File:** `tools/contador/process-commerce-payment.cjs`, `recordRoster()` (lines 92–96).

```js
const productRows = ((await get(ROSTER_ID, 'Product Map!A:C')).values || [])
  .filter(row => String(row[0] || '').trim() === fact.productName && row[1] && row[2]);
if (!productRows.length) fail('product mapping missing');
```

`fact.productName` is hardcoded to `'Mentor Coaching Foundations (Program A)'` (`process-commerce-payment.cjs` line 157). If the "Product Map" tab in the Roster spreadsheet has no row with that exact string before go-live, every `nanoclaw.bookkeeper.notify` delivery will fail this check and the WordPress job will retry indefinitely (exponential backoff capped at 3600s, no attempt limit) without ever succeeding. This does not block checkout, payment capture, receipt/invoice, or Heartbeat enrollment (all are WordPress-side and independent of this job), but it does mean the Bookkeeper Sheets/Postgres projection for every real sale will silently stay missing until the mapping is added. Confirm this row exists in production before enabling the flow.

## No other material findings

No defects were found against invariants 1, 2, 4–10 in the reviewed surface: submission/session creation has no payer/learner uniqueness gate; paid-order creation is strictly gated on HMAC-valid, reference/amount/currency-matched `AUTHORISATION` success with browser polling unable to fabricate a paid state; card collection enforces full AVS billing address with automatic capture and internally consistent zero-tax L3 line-item arithmetic; customer-facing error copy stays generic with no internal state language; documents are order-bound and blocked pre-payment; Heartbeat enrollment correctly distinguishes `invited` from `access_ready` via a readback; the NanoClaw delivery is HMAC-signed, retried by WordPress, non-blocking for the webhook response, and only acknowledged after Sheets/Postgres readback all pass; the Postgres/Sheets projections are idempotent by PSP reference and `psql` is invoked via `execFileSync` with parameterized `-v key=value` / `:'var'` substitution (no shell or SQL string interpolation of input); and migration 166 only adds a new table and does not touch Stripe fulfillment tables.
