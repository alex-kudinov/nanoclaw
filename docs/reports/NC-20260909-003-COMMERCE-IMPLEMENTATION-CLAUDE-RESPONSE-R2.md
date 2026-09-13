# Tandem Commerce implementation review — response R2

Reviewed only the three files listed in the R2 request. No source modified, no commands run, no other findings reopened.

## Finding 1 — Closed

`purge_expired_submissions()` no longer exists in `class-tandem-commerce-store.php`. The only remaining writers of `payload_ciphertext = NULL` are:

- `discard_unpaid()` — explicit, caller-triggered discard of a specific submission.
- `record_event()`'s `terminal` branch (line 248, in `class-tandem-commerce-actions.php`'s caller path) — fires only on an explicit failed `AUTHORISATION` (`$code === 'AUTHORISATION' && !$success`) for the exact `merchant_reference` in that webhook.

Neither path is time-based and neither can fire ahead of the real webhook for a given submission. A genuinely-authorised but delayed `AUTHORISATION` therefore always finds `payload_ciphertext` intact when it lands, regardless of how long after `provider_session_expires_at` it arrives — `record_event()`'s paid branch reads a live snapshot and the `commerce_person_missing` failure mode from the prior finding is unreachable. `test-commerce-core.php:72` directly regression-guards this by asserting the destructive `provider_session_expires_at<UTC_TIMESTAMP()` SQL fragment is absent from the store source.

## No new material payment/order failure introduced

- `merchant_reference` is unique per submission and freshly generated (`'TCA-' . hash(...$submission_uuid...)`) on every `create_submission()` call, so retaining old `awaiting_payment`/`abandoned` rows indefinitely does not block, collide with, or misroute any new submission, session, or webhook lookup — `record_event()` and `load_submission_by_merchant_reference()` both key off the exact reference in the request/notification.
- `claim_jobs()` and the jobs table are unaffected; nothing in the reviewed surface reads submission `status`/`payload_ciphertext` state for any purpose other than the same-reference webhook and explicit discard/abandon calls.

The correction closes the finding as scoped (delayed-authentication loss) without introducing a payment- or order-processing regression in the reviewed surface. (Indefinite retention of encrypted PII for stale abandoned/awaiting submissions is a byproduct, but it is a data-retention question, not a payment/order failure, and is out of scope per this request.)
