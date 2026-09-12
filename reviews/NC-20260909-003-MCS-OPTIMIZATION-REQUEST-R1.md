# Bounded review: MCS confirmation and provider optimization R1

## Decision requested

Review the current uncommitted implementation for material defects at the
payment, privacy, identity, and schema boundary. Report only findings that can
cause an invalid Adyen request, false confirmation, PII leakage, mutable or
cross-checkout billing state, lost/conflicting evidence, unsafe migration or
rollback, or a material failure of the accepted scope. Do not review generated
checkout assets or visual styling.

Write the result to:
`/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/reviews/NC-20260909-003-MCS-OPTIMIZATION-RESPONSE-R1.md`

Use `GO` when there are no material findings. Otherwise list each finding with
severity, exact file/evidence, failure scenario, and the smallest correction.

## Authority and accepted scope

- Program authority: `/Users/xbohdpukc/dev/peri/PROGRAM.md` and accepted
  `/Users/xbohdpukc/dev/peri/.program/decisions/decision-mcs-checkout-confirmation-esd-3ds-2026-09-12.json`.
- Current slice: exact English `mcq-program-a-foundations:en-US`, US/USD,
  one-time Visa/Mastercard checkout. Ordinary MCS traffic remains on Stripe.
- Send only non-sensitive provider metadata. Full attribution stays internal.
- Level 3 arithmetic must come from the immutable quote. Zero tax is truthful;
  the implementation must not invent nonzero tax to seek Level 2 savings.
- Request 3DS authentication for this checkout while preferring no challenge;
  an attempt does not prove authentication or liability shift.
- Persist bounded Adyen ESD and 3DS result fields as supplemental evidence,
  without treating them as signed financial evidence.
- Optional company/address/tax data is frozen with identity preparation and
  encrypted at rest. Invoice issuance remains disabled until finance/legal
  approves seller identity, numbering, tax, retention, and corrections.
- A Confirmation summary may appear only from capability-protected durable
  authorization evidence. Never expose the raw PSP reference.
- No real payment, fulfillment replay, customer communication, or Stripe
  routing change is part of this review.

## Provider and test evidence already established

- Adyen Checkout v72 accepts metadata up to 20 pairs, key length 20 and value
  length 80. Current ESD validation fields are
  `enhancedSchemeDataReceived`, `enhancedSchemeDataSubmitted`,
  `enhancedSchemeDataRefusalReasons`, and
  `enhancedSchemeDataWarningReasons`; 3DS result fields are `threeDOffered`,
  `threeDAuthenticated`, and `liabilityShift`.
- A real TEST `/v72/sessions` request using this implementation first returned
  error 702 because Sessions rejects `merchantRiskIndicator`; that field was
  removed. The next request returned 201, was never submitted for payment, was
  encrypted/reused from a disposable database, and the database was removed.
- Focused NanoClaw suites currently pass after expected-shape updates; focused
  tandemweb JS/PHP suites pass. Full suites have not yet run.

## Exact allowed review files

1. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/adyen-session-adapter.ts`
2. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/adyen-webhook.ts`
3. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/payment-event-store.ts`
4. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/payment-checkout-billing.ts`
5. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/payment-identity-preparation-store.ts`
6. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/data/business/migrations/nanoclaw-v2/161_payment_checkout_billing_profile.sql`
7. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-dispatch-coordinator.php`
8. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-payment-private-transport.php`

You may read this request and write only the named response. Do not inspect
`.env`, auth stores, private configuration, database rows, logs, browser
profiles, unrelated diffs, or generated assets. Do not edit implementation.

## Acceptance checks

- Exact quote/offer/scope and retry behavior remain immutable.
- Metadata and ESD are bounded, PII-free, arithmetically exact, and API-shaped.
- Supplemental webhook fields cannot weaken HMAC admission or financial state.
- Billing input is strictly normalized, request-bound, encrypted at rest,
  replay-safe, and unavailable to non-admin roles.
- Confirmation cannot appear from browser return alone, multiple/conflicted
  payments, or a raw provider identifier.
- Migration 161 is safe on the populated live schema; rollback refuses when
  billing evidence exists.
