# NC-20260909-003 correction and checkout-flow review R2

## Purpose

This is the second and final bounded Sonnet/high review for the approved paid-
invoice release. Verify the two load-bearing backend corrections from R1 and
review the separate checkout-flow implementation. Report material findings
only. Do not edit source.

## Accepted decisions

- Information has independent `buying for someone else` and `business invoice`
  checkboxes.
- If either is selected, one Additional details page shows only the selected
  learner and/or business sections and validates only those fields.
- If neither is selected, Additional details is skipped and Payment/
  Confirmation dynamically renumber.
- Back navigation preserves the active path. Prepared payment identity remains
  read-only and cannot be changed or rebound.
- Paid document/tax/EIN/storage/design decisions in the R1 request remain
  authoritative and must not be reopened.

## R1 material findings and required corrections

1. Remove the session-GUC delete escape hatch. Every document tombstone INSERT
   must independently lock and validate the exact source document, seven-year
   retention window and current legal-hold state. Child/document DELETE guards
   must require that validated exact tombstone, not a caller-settable flag.
2. Do not reject legitimate duplicate Gmail-deletion evidence. Surface each
   held purge through privacy-minimized structured reporting, and make service
   shutdown await an in-flight sweep before closing the database pool.

## Allowed read artifacts

1. This request.
2. Current full migration:
   `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/data/business/migrations/nanoclaw-v2/164_payment_checkout_document_retention.sql`
3. Current corrected retention/Gmail/worker excerpts:
   `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/docs/reports/NC-20260909-003-PAID-INVOICE-BACKEND-R2-EXCERPTS.txt`
4. Exact frontend source diff:
   `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/review/PAID-INVOICE-CHECKOUT-FLOW-R2.diff`

These artifacts total under 45,000 characters. Do not read private config,
`.env`, credentials, database rows, unrelated source, generated bundles or the
pre-existing untracked `MCS-PROTECTED-BFF-CONTRACT.md`.

## Verification already performed

- Corrected backend focused boundary: 45/45 pass, including a direct attempt to
  set the old GUC and delete outside the purge function, legal hold/release,
  exact tombstone purge, regeneration refusal, duplicate Gmail deletion
  evidence, privacy-minimized failure reporting and shutdown-safe types.
- Frontend source: 85/85 Node tests and PHP 26/26 plus 7/7 pass; TEST and LIVE
  bundles rebuilt from source; diff check clean.
- No payment, email or production write occurred.

## Review questions

1. Can any normal DML path delete customer/document rows early, during a legal
   hold, or without the exact non-PII tombstone?
2. Are Gmail-first deletion, duplicate evidence, failure reporting and worker
   shutdown now safely retryable without exposing raw PII/error text?
3. Can the conditional checkout flow submit without required active details,
   validate hidden inactive details, attach the wrong learner/business identity,
   create an extra intent, or alter a prepared identity during Back navigation?
4. Are step visibility/numbering and accessibility semantics truthful for all
   four checkbox combinations and mobile-safe at the source level?

Write the response only to:

`/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/docs/reports/NC-20260909-003-PAID-INVOICE-CORRECTION-AND-FLOW-R2-RESPONSE.md`

If there are no unresolved material findings, say `GO`.
