# Bounded review response: checkout failure customer remediation

Reviewer: Claude (bounded, read-only)
Scope: `src/checkout-recovery-guidance.ts`, `src/checkout-recovery-sender.ts`,
`src/checkout-recovery-store.ts`, their test files, `src/checkout-recovery.ts`
(imported dependency, read for classification/type verification only),
`docs/CHECKOUT-FAILURE-RECOVERY.md`, `docs/CHECKOUT-RECOVERY-CONTROL.md`, all
eight files in
`docs/programs/company-os/provider-assets/checkout-recovery/`, and in the
Tandemweb companion worktree: `assets/js/checkout.js`, `assets/css/checkout.css`,
`tests/test-checkout-recovery-shadow.php`.

## Outcome

**NO MATERIAL FINDINGS**

## Verification performed against each review question

1. **Raw/sensitive Stripe detail reaching DOM, analytics, or Encharge:**
   None found. `checkout.js:customerPaymentFailureGuidance` (checkout.js:208-238)
   only reads `decline_code`/`code`/`advice_code` to select a closed category
   and never renders `error.message`. The panel uses `textContent`
   (checkout.js:312), never `innerHTML`. `gtmPush`/`ctTrack` calls at
   checkout.js:1688-1709 send only `guidance.key` and the already-safe
   localized `msg`, never raw Stripe fields. On the NanoClaw side,
   `checkoutRecoveryCustomerCopy` (checkout-recovery-guidance.ts:173-190)
   selects from a closed, static copy table; `dispatchCheckoutRecoveryToEncharge`
   payload (checkout-recovery-sender.ts:466-493) carries only `guidance_key`,
   `failure_specific`, opaque `case_ref`/`intent_ref` UUIDs, and the rendered
   copy fields — no `decline_code`, `failure_code`, `advice_code`, card
   brand/last4, or raw Stripe IDs. `checkout-recovery-guidance.test.ts:35-37`
   and `checkout-recovery.ts:658` (guidance computed only from closed sets,
   only for `payment.failed`) corroborate this.

2. **Classification completeness/accuracy:** The six safe categories are
   defined identically in `checkout-recovery.ts:296-345`
   (`checkoutFailureGuidance`) and `checkout.js:213-218`
   (`customerPaymentFailureGuidance`) — same decline-code sets, same
   `do_not_honor → contact_issuer_or_change_method` mapping, same
   fraud/sensitive-code → `generic_decline` fallback, same unknown-code
   fallback to `generic_decline`. Every key has EN/ES/FR/JA copy in
   `checkout-recovery-guidance.ts` and matching localized strings in
   `checkout.js`'s `spanishCopy`/`japaneseCopy`/`frenchCopy` tables. Generic
   abandonment (`checkout_incomplete`) is only ever produced when
   `customer_guidance_key` is null and is textually distinct from all six
   failure categories, matching `decision:checkout-failure-specific-followup-2026-08-29`.

3. **Persistent website state vs. transient banner:** `showPaymentFailureStep`
   (checkout.js:310-316) creates a non-auto-dismissing panel (`hidden` toggled
   only by explicit retry or `setStep(n!==2)`), inserted above the Payment
   Element without removing or destroying it, so the mounted Stripe Elements
   instance and `payBtn` remain fully operable. Retry only hides the panel and
   refocuses the existing payment form; it does not require re-creating
   Elements. CSS in `checkout.css:316-398` gives it a fixed layout that does
   not overlay or displace the payment fields.

4. **Sender gate preservation + field completeness:** All existing gates
   (prospective cutoff, v2/v3 consent, sibling-purchase suppression,
   touch-one-acceptance prerequisite for touch two, ambiguous-lease hold,
   idempotency via `ON CONFLICT`, cross-case in-flight guard) remain intact
   and unchanged in `checkout-recovery-sender.ts:339-458`; the new
   `checkoutRecoveryCustomerCopy` call (line 461) is inserted strictly after
   every suppression check and before the lease write, so it cannot bypass or
   reorder a gate. `checkout-recovery-sender.test.ts:117-138` still exercises
   every named guard string. Both known-failure and generic-abandonment cases
   populate all six required person fields (`checkoutRecoveryCustomerCopy`
   always returns `subject`/`title`/`body`/`supportUrl` regardless of
   `guidanceKey`).

5. **Eight templates avoid blank guidance / retain required elements:**
   Read all eight files directly. Each renders
   `{{person.checkout_recovery_subject}}`, `_product_name`,
   `_guidance_title}}`, `_guidance_body}}`, `_return_url}}`,
   `_support_url}}`, `{{person.managePreferencesURL}}`, and
   `{{person.unsubscribeURL}}`, plus a reply/human-support line and a
   fresh-checkout-not-a-resume disclaimer. `checkout-recovery-guidance.test.ts:61-89`
   enforces this same contract programmatically and would fail on any missing
   field or leaked raw-code string.

6. **"You were not charged" safety:** Every decline code routed to a category
   that includes this claim (`contact_issuer_or_change_method`,
   `generic_decline` in both surfaces; all six categories in the NanoClaw
   email copy) represents a Stripe decline that never captures funds, so the
   claim holds for every mapped code, including `do_not_honor`,
   authentication-required, data-entry, temporary-failure, and sensitive/fraud
   codes. No category makes this claim for a code where a charge could have
   captured.

No defect was found in privacy/data-minimization, classification correctness,
frontend persistence/operability, delivery-gate ordering, template rendering,
or claim accuracy. Both stated verification facts (14/14 NanoClaw focused
tests, NanoClaw typecheck, Tandemweb JS syntax, Tandemweb static contract) are
consistent with what the reviewed source actually enforces.
