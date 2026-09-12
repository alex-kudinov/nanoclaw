# NC-20260909-003 bounded document self-service review R1

## Objective

Review the current uncommitted implementation of immutable English MCS checkout
receipt and paid-invoice documents across NanoClaw and tandemweb. Report only
material correctness, security, privacy, accounting-integrity, idempotency, or
release defects. Write the response only to
`/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/docs/reports/NC-20260909-003-CLAUDE-DOCUMENT-REVIEW-RESPONSE-R1.md`.

This packet names more than eight source files because one load-bearing trust
boundary spans PostgreSQL persistence, response signing, Gmail MIME/readback,
private runtime composition, WordPress verification, and browser download.
Do not inspect unrelated files or reopen accepted product scope.

## Accepted scope and authority

- One verified English `mcq-program-a-foundations:en-US` Adyen LIVE card
  authorization may produce one receipt and, only behind finance/legal
  activation plus pre-payment business details, one paid invoice.
- Ordinary MCS traffic remains Stripe. A reviewer must not propose a cutover,
  payment, refund, customer message, provider mutation, or manual repair.
- Receipt and paid invoice are distinct immutable artifacts. Replays must return
  identical snapshot/PDF bytes, never consume another invoice number, and never
  blindly resend email.
- Snapshot and PDF PII must be encrypted at rest under separate purpose keys.
  No PII or capability belongs in a URL, log, review artifact, or provider
  metadata.
- Download requires the existing exact-attempt checkout capability plus a new
  opaque attempt/document-bound capability expiring within 15 minutes.
- Paid invoices default disabled. Enabling requires an exact activation hash
  over seller identity/address, annual sequence, tax policy/jurisdiction,
  retention, and replacement-or-credit-note correction policy. Missing billing
  details must still refuse.
- Email is a user-triggered Gmail-backed PDF attachment job. Exact Sent/readback
  reconciliation must bind recipient, sender, subject, message/thread,
  filename, and attachment digest. Lost or ambiguous acceptance must hold
  without resend.
- The original fulfillment exclusion and all earlier payment evidence remain
  untouched. No real payment, email, invoice number, or production document row
  has been created in this implementation phase.

## Exact review paths

NanoClaw:

1. `data/business/migrations/nanoclaw-v2/163_payment_checkout_documents.sql`
2. `data/business/migrations/nanoclaw-v2/rollback_163_payment_checkout_documents.sql`
3. `src/payment-checkout-documents.ts`
4. `src/payment-checkout-document-api-controller.ts`
5. `src/website-checkout-service.ts`
6. `src/website-checkout-live-runner.ts`
7. `src/payment-signed-response-controller.ts`
8. `src/gmail-api.ts`

Tandemweb:

9. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-payment-private-transport.php`
10. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-dispatch-coordinator.php`
11. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-preview-bff.php`
12. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/src/protected-preview-core.js`

Read tests only when a specific source claim needs confirmation:

- `src/payment-checkout-documents.test.ts`
- `src/payment-checkout-documents-disposable.test.ts`
- `src/payment-checkout-document-api-controller.test.ts`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/protected-preview.test.mjs`

## Current verification evidence

- Pinned Node 22.23.2 typecheck passes.
- NanoClaw focused boundary: 12 files, 141 tests passed. This includes generated
  disposable PostgreSQL apply/empty rollback/reapply, five-way generation
  contention, unique invoice allocation, encrypted snapshot/PDF storage,
  populated rollback refusal, capability cross-attempt denial, and lost-ACK
  email adoption.
- Tandem checkout prototype: 85/85 tests passed.
- Affected PHP: syntax passes; private transport 61/61, protected BFF 69/69,
  page 25/25, public controller 44/44, bootstrap 58/58, and attribution 17/17.
- Vite rebuilt both protected and public production assets.
- Full suites, immutable release build, production migration and live browser
  verification have not yet run.

## Review questions

1. Can any unverified, reversed, conflicting, cross-scope, or cross-attempt
   payment obtain a document?
2. Can concurrency, serialization retry, replay, crash, or a lost HTTP/Gmail
   acknowledgement duplicate a document, invoice number, email, or mutate a
   frozen artifact?
3. Are ciphertext, AAD, purpose-key separation, hashes, grants, URL/log/response
   privacy, capability expiry, and signed-response size/validation correct?
4. Can the finance gate be bypassed, incompletely bound, or accidentally enabled
   by old private configuration?
5. Does Gmail readback prove the exact attachment without trusting search alone?
6. Do WordPress and browser boundaries validate host output before presenting a
   download or delivery claim, while preserving receipt availability when the
   invoice is gated?
7. Is migration163 safely ordered, admin-only, append/immutability protected,
   and rollback-safe under populated state?

## Response contract

Write either `GO` when there are no material findings, or a short ordered list
of material findings with severity, exact file/line evidence, failure mode, and
the smallest concrete correction. Do not include style, speculative backlog,
unrelated modernization, or accepted-scope alternatives. Do not edit source,
run commands, access `.env` or credentials, inspect auth/session stores, use
MCP/network/provider/database tools, or perform any side effect.
