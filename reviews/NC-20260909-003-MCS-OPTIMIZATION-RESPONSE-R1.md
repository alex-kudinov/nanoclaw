# Bounded review response: MCS confirmation and provider optimization R1

## Decision

**GO** — no material findings in the reviewed slice.

## Scope reviewed

All eight named files, in full:

1. `src/adyen-session-adapter.ts`
2. `src/adyen-webhook.ts`
3. `src/payment-event-store.ts`
4. `src/payment-checkout-billing.ts`
5. `src/payment-identity-preparation-store.ts`
6. `data/business/migrations/nanoclaw-v2/161_payment_checkout_billing_profile.sql`
7. `wordpress/tandem-snippets/includes/class-checkout-dispatch-coordinator.php` (tandemweb worktree)
8. `wordpress/tandem-snippets/includes/class-payment-private-transport.php` (tandemweb worktree)

No other files, database rows, logs, `.env`, or auth stores were inspected.

## Findings

None material. Checked against every acceptance item:

- **Quote/offer/scope immutability**: `buildAdyenSessionRequest` re-derives and byte-compares the scope against `routing.scope`, hard-pins `mcq-program-a-foundations` / `en-US` / `US` / `USD` inside `buildAdyenSessionOptimization`, and throws rather than silently degrading for any other offer.
- **Metadata/ESD bounds and truthfulness**: `metadata` is capped at 20 pairs / 20-key / 80-value before being returned; `additionalData` fields are all derived from the immutable quote; `taxAmount`/`taxPercentage` are hardcoded `0`, never inflated. No PII (name/email/address) enters `metadata`, `lineItems`, or `additionalData`.
- **3DS request shape**: `authenticationData.attemptAuthentication: 'always'` plus `threeDSRequestorChallengeInd: '02'` matches "request authentication, prefer no challenge" without asserting liability shift.
- **Webhook HMAC integrity**: `admitAdyenWebhook` verifies HMAC over all signed items *before* any item is admitted; ESD/3DS supplemental fields (`enhancedSchemeData*`, `threeD*`, `paymentMethod`, `reason`, `eventDate`) are outside Adyen's own signed field set (matches Adyen's documented HMAC scope, not a code gap) and are never persisted into the `fact` object that drives dedup/state (`payment-event-store.ts` only writes `fact`, not `rawBody`, to `payment_events`). The unsigned `additionalData.store` check is explicitly defense-in-depth on top of the signed `merchantAccountCode` check, not a substitute for it.
- **Financial-state conflict handling**: `recordFact` locks provider references and attempt rows in stable order, detects `provider_reference_conflict`/`scope_conflict`/`delivery_payload_conflict`, and a late positive after a recorded terminal-nonpayment is both flagged in the return value and written to `payment_session_retry_exceptions`, which `refresh()` folds back into the persisted `needs_review` projection before any confirmation read.
- **Confirmation minimization**: `readConfirmationSummary` only returns data when `projection.state === 'authorization_recorded'`, and emits `TCA-<sha256 prefix>` instead of the raw `pspReference`.
- **Billing profile**: strict Zod schema (`.strict()`, control-character rejection, US/CA state requirement), immutable after first write (replay path returns the stored row, never re-writes), encrypted via `vault.seal` with a `preparationId`-scoped AAD, and the insert only occurs when `vault` is configured (`ensure(!command.billingProfile || vault, ...)` prevents the sha256/ciphertext pair from ever going out of sync with migration 161's `payment_identity_billing_profile_pair` CHECK).
- **Migration 161**: two nullable `ADD COLUMN`s with format/size `CHECK`s and a pairing `CHECK`; no default, no rewrite, no data mutation — safe to apply against a populated `payment_identity_preparations` table.
- **WP↔host transport**: request and response HMACs use distinct keys (`hash_equals` explicitly forbids reuse), response verification binds `operationId`/`requestNonce`/`path`/`status`, and every response shape (`session`, payment state, checkout-admission evidence, confirmation) is validated with `exact_keys` plus format/enum checks before use. Confirmation shown to the browser is cross-checked against the quote (`assert_confirmation_quote`) before being returned from `return_payment`/`payment_status`.

## Scope limitation (not a finding)

The acceptance checklist asks that "rollback refuses when billing evidence exists." `rollback_161_payment_checkout_billing_profile.sql` is **not** in the allowed file list for this review packet, so that specific rollback behavior was not verified here and should be confirmed separately before this migration is treated as fully accepted.
