# NC-20260909-003 correction and checkout-flow review R2 — response

## Decision

**NOT GO.** One unresolved material finding (backend, retention worker
reporting gap). No findings on the checkout-flow diff.

## R1 correction 1 — session-GUC delete escape hatch: RESOLVED

Confirmed in `164_payment_checkout_document_retention.sql`:

- `fn_payment_checkout_document_tombstone_guard` (lines 166-200) only permits
  `INSERT` (any `UPDATE`/`DELETE` unconditionally raises). On insert it
  independently `SELECT ... FOR UPDATE`-locks the source document row (line
  175-177), independently re-checks the latest retention event for
  `hold_placed` (lines 179-185), and independently re-checks
  `retention_until` plus every immutable field for an exact match against
  that locked row (lines 186-197) — none of this depends on a caller-settable
  session variable.
- `purge_payment_checkout_document` (lines 227-287) performs the same checks
  before the `INSERT`, so both the RPC path and the trigger enforce the rule
  independently (defense in depth), matching the R1 requirement.
- Every downstream child/document `DELETE` guard (body, capability, email
  job, email receipt, retention-event triggers) requires
  `EXISTS (... tombstones WHERE document_id = OLD.document_id)` — a row that,
  per the above, can only exist if it was exactly validated. No GUC or other
  caller-settable flag appears anywhere in the migration.

## R1 correction 2 — duplicate Gmail-deletion evidence / shutdown: PARTIALLY RESOLVED

- **Duplicate deletion evidence:** resolved. `deleteExact` (excerpt lines
  68-133) attempts `this.exact(...)` first; a `404` on that verification is
  treated as `already_absent` evidence rather than an error, so a message
  already deleted by a prior partial sweep no longer blocks the purge.
  `store.purge` (lines 19-56) only calls the SQL function once a complete,
  same-length evidence array exists, and the SQL function treats a matching
  `purge_receipt_sha256` replay as `already_purged`, not a conflict. No
  legitimate duplicate is rejected.
- **Shutdown ordering:** `PaymentCheckoutDocumentRetentionWorker.stop()`
  (lines 228-232) clears the timer and `await`s `this.inFlight`, so the
  worker itself will not return from `stop()` mid-sweep. Whether the caller
  awaits `stop()` before closing the pool is outside the allowed artifacts
  (not in the excerpts) and is not re-verified here.
- **Privacy-minimized reporting — gap found:** in `sweep()` (excerpt lines
  153-207), the branch that skips a candidate because Gmail isn't wired does
  **not** report:

  ```js
  if (candidate.emailJobs.length && !this.gmail) {
    held++;
    continue;
  }
  ```

  `continue` skips the `catch` block entirely, so `reportFailure` is never
  invoked for this case — unlike every other held outcome, which does call
  `reportFailure` with a document ID/kind/code. A document held for this
  reason produces no structured signal at all, which is exactly the case R1
  correction 2 required to surface ("surface **each** held purge"). Fix:
  call `reportFailure` (e.g. with a
  `checkout_document_retention_gmail_unconfigured` code) in that branch
  before `continue`.

## Checkout flow (frontend diff): no material findings

Reviewed against the four accepted-decision constraints and the four review
questions:

- **Q1 (submit without required active details / validate hidden inactive
  details):** `informationValid()` gates the info-stage `Continue` button and
  intentionally excludes the recipient/billing sections (they aren't visible
  yet); the real submission gate is `valid()`, which conditionally requires
  the recipient/billing fields only `if (active(recipient))` /
  `if (active(billing))`. Unchecked (inactive) sections are never validated;
  checked (active) sections always are, regardless of which stage is
  currently displayed.
- **Q2 (wrong learner/business identity, extra intent, Back rebinding):**
  `recipientOption`/`billingOption` are disabled (not just read-only) whenever
  `reviewingInformation` is true (`showInformationStep`,
  `showAdditionalDetailsStep(review=true)`), so once a preparation exists the
  checkboxes — and therefore `hasAdditionalDetails()` and which section
  attaches — cannot change. Navigating between information/additional/payment
  stages is pure DOM state; no fetch/intent creation occurs outside the
  existing submit handler, which still requires `validation.valid()` (or an
  existing `preparationId` in review mode).
- **Q3 (step visibility/numbering, four checkbox combinations):**
  `syncStepStructure()` recomputes `additionalStep.hidden` and renumbers
  payment/confirmation on every `selectStep()` call, so numbering stays
  truthful for all four combinations (neither/recipient-only/billing-only/
  both) without needing per-combination copy — `participantSection.hidden`
  and `billingSection.hidden` are independently tied to their own checkboxes.
- **Mobile-safety:** no CSS is part of this diff, so it isn't assessable from
  the allowed artifacts.

No path was found where the conditional flow can submit without required
active fields, validate an inactive section, misattach a learner/business
identity, create a duplicate intent, or unlock a prepared identity via Back
navigation.

## Required action before GO

Add a `reportFailure` call to the `!this.gmail` branch in
`PaymentCheckoutDocumentRetentionWorker.sweep()` so every held purge —
including this one — is surfaced through the existing structured reporting
path.
