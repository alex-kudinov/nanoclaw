# NC-20260909-004 final bounded correction review R3 — response

Scope: `src/student-enrollment-production.ts`,
`src/student-enrollment-stripe-evidence.ts`,
`src/student-enrollment-provider-drivers.ts`, and
`tools/contador/process-payment.cjs` (argument parsing,
`enrollmentRegistrationMode`, writer-claim read, registration-mode selection,
roster branch only), per `NC-20260909-004-CLAUDE-FINAL-CORRECTION-REQUEST-R3.md`.
Prior R1/R2 findings not reopened.

## Verdict

NO MATERIAL FINDINGS.

All three listed corrections are present in the code as described:

1. `student-enrollment-stripe-evidence.ts:122-144` now branches on
   `source.sourceObjectId`: a `cs_`-prefixed id resolves a Checkout Session as
   before; any other id must equal `source.paymentIntentId` (native direct
   PaymentIntent path) or the resolver refuses with
   `native_evidence_incomplete`. For the direct path, `session`/`line` stay
   `null`, so `productId`/`priceId` are `null` and `purchasePath` is
   `'tandem_payment_intent'`. `student-enrollment-production.ts:234-289`
   (`assertNativePilotEvidence`) enforces the two paths as mutually exclusive
   and exact: the direct path requires
   `checkoutSessionId/checkoutPaymentStatus/checkoutMode/checkoutAmountMinor/
   productId/priceId` all `null` plus `sourceObjectId === paymentIntentId`;
   the Checkout path still requires the exact `cs_` id, `paid`/`payment`
   status, `checkoutAmountMinor === 399600`, and the exact
   `prod_.../price_...` ids. Both paths share the same downstream checks for
   offer/cohort (`offerKey`, `cohortProgram`, `cohortStart`), terms
   (`termsAccepted`, `termsVersion`), standard/no-coupon/non-regional metadata
   (`discountMinor`, `discountCount`, `couponCode`, `pricingPolicy`,
   `regionalPriceApplied`, `baseAmountMinor`, `originalAmountMinor`), exact
   amount-received (`amountReceivedMinor`), charge amount/currency
   (`chargeAmountMinor`, `chargeCurrency`, `chargePaid`), and the
   no-invoice/refund/dispute/Connect-transfer block (`invoiceId`,
   `amountRefundedMinor`, `chargeDisputed`, `connectedAccountTransfer`).
   Party/email/name and Party-lookup agreement are enforced by
   `participantResolved` in the evidence resolver (`stripe-evidence.ts:165-175`,
   requiring `participantPartyId === declaredPartyId` from
   `metadata.tandem_party_id`, a non-empty name, and customer-email agreement
   when present, else `participantPartyId` is forced to `0`) and the
   `participant_identity_unresolved` check in `assertNativePilotEvidence`
   (lines 280-286).
2. `student-enrollment-production.ts:646-671` claims `writer=legacy`
   atomically (`claimLegacyWriter`, `BEGIN ISOLATION LEVEL SERIALIZABLE` …
   `COMMIT`, lines 432-477) before returning the legacy route, restricted to
   `population_not_selected`/`participant_identity_unresolved` refusals where
   evidence resolved with `account === 'tandem'`, `offerKey === OFFER`, and
   `eventCreated` at or after `activationEpoch` — i.e. source-valid,
   post-activation, in-scope-offer refusals only. `process-payment.cjs:396-417`
   reads that persisted claim independently via a separate `psql` invocation
   keyed on the canonical PaymentIntent id, validating the result against
   exactly `'legacy'`/`'enrollment'` and folding anything else (missing row,
   read error) to `null`. `enrollmentRegistrationMode` (lines 369-394) returns
   `'legacy'` only when the offer is in scope, the event is not verifiably
   pre-activation, and `writer === 'legacy'` (and `--accounting-only` wasn't
   passed); every other case — `writer === 'enrollment'`, no claim row, a
   `psql` read failure, or an unparseable/absent `--event-created` post the
   early-return checks — folds to `'accounting_only'` unless the event is
   independently provable pre-activation via a valid 10-digit
   `--event-created` under `activationEpoch`, or the offer/account is out of
   scope, both of which correctly pass through unchanged to legacy.
3. `student-enrollment-provider-drivers.ts:234-243` (`apply`, existing-row
   branch) writes only `B:C` (when the name cell is blank/`Unknown`) or `C`
   alone, plus `F:M` — never `A`, `D`, or `E`. `rollback` (lines 288-313)
   computes the full expected postimage via `rosterPostimage` and diffs it
   against a full `A:M` read (`projectionHash` equality, line 292) before
   writing anything, then restores only via the same `B:C`/`C` plus `F:M`
   writes. `FileProjectionPreimageStore.put` (lines 67-89) `fsync`s the
   temp-file descriptor, renames it into place, then opens and `fsync`s the
   containing directory; `apply` calls `preimages.put(prepared)` (line 233)
   before any `api.update`/`api.append` provider call.

## Verification

Confirmed by reading, not by execution. No Bash, MCP, runtime, or additional
file reads were used beyond the four listed sources.

NO MATERIAL FINDINGS.
