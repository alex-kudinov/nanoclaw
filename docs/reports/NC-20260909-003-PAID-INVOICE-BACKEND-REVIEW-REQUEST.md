# NC-20260909-003 paid-invoice backend review request

## Objective

Review the bounded backend diff for material correctness, security, privacy,
data-integrity and release defects before deployment. Report findings only;
do not edit implementation files.

## Accepted owner decisions - do not reopen

- A signed successful Adyen AUTHORISATION event under the exact configured
  immediate automatic-capture policy is the document issuance signal. The
  customer PDF says Paid; it must not say authorization-only or settlement
  unproven. This does not change the broader settlement/certificate domain.
- Customer documents show `Tax: $0.00 USD` without claiming tax-exempt,
  zero-rated or out-of-scope treatment.
- Tandem seller EIN is omitted; business-buyer tax/VAT ID remains optional.
- Seller is Tandem Coaching Partners, LLC, 104 E Ovilla Rd, Ste 1278,
  Red Oak, TX 75154, United States.
- Invoice numbers use `TCA-YYYY-######`; originals are immutable and corrections
  require replacement or credit-note handling.
- Encrypted document/customer/delivery data is retained for seven years. A
  current legal hold blocks deletion. At expiry, any exact retained Gmail
  attachment is deleted first, local PII/PDF/recipient rows are purged, and a
  non-customer tombstone retains only document identity/date/amount/currency and
  hashes and prevents regeneration.
- The real Tandem logo and approved polished one-page receipt/invoice layout are
  required. Visual rendering has been independently inspected by Codex.
- No real payment or customer email may be created during verification.

## Authority and invariants

- Owner authorization:
  `/Users/xbohdpukc/dev/peri/.program/decisions/decision-mcs-paid-invoice-activation-and-checkout-flow-2026-09-12.json`
- Existing migration163 document immutability, exact-attempt capability access,
  Gmail deduplication/readback, encrypted storage, server-authoritative money,
  and Stripe routing for ordinary MCS traffic must remain intact.
- Migration164 production precondition is an empty migration163 document/email
  store. Rollback must refuse after any v2 document, hold, or tombstone exists.
- Private credentials, `.env`, auth stores, production config and database rows
  are forbidden.

## Review artifact

Read only:

1. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/docs/reports/NC-20260909-003-PAID-INVOICE-BACKEND-REVIEW.diff`
2. This request.

The diff is 56,188 characters with one line of context and covers the exact
document/config/runner/service/migration/release changes. Tests and docs are
excluded from the packet to keep the review bounded.

## Current verification

- Pinned Node 22.23.2 runtime doctor, typecheck, build, formatting and
  documentation continuity pass.
- Focused backend boundary: 44/44 pass, including disposable PostgreSQL forward,
  empty rollback/reapply, populated rollback refusal, concurrency, legal hold,
  seven-year purge, tombstone/regeneration refusal and email-retention worker.
- Full repository: 4,315 pass, 32 skip, four unchanged unrelated baseline
  failures in Capacity/CNPC/Trafft.
- Two deterministic runtime PDFs render cleanly; Poppler extraction contains
  Paid, Tax USD0, seller address and no authorization/settlement wording.

## Questions

Report only material findings, ordered by consequence, with exact file/hunk
evidence. Concentrate on:

1. whether the finance activation hash and immediate-capture evidence are
   actually fail-closed;
2. whether migration164 and its SECURITY DEFINER purge can bypass immutability,
   purge early, ignore a legal hold, leak PII, orphan rows, or regenerate;
3. whether Gmail deletion and local purge are correctly ordered and safely
   retryable after partial failure;
4. whether the retention worker can race, overlap, silently discard evidence,
   or block service shutdown/readiness;
5. whether v2 PDF/snapshot logic preserves deterministic, bounded, truthful
   customer output and protects optional buyer data;
6. whether immutable release packaging contains every new runtime asset and
   migration.

If there are no material findings, say `GO`. Write the response only to:

`/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/docs/reports/NC-20260909-003-PAID-INVOICE-BACKEND-REVIEW-RESPONSE.md`
