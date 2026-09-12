# NC-20260909-003 load-bearing correction review R2 — response

GO

## Correction 1 — paid-invoice activation-hash gate

`parseWebsiteCheckoutLivePrivateConfig` (`src/website-checkout-live-runner.ts:300-304`)
now runs `parsed.documents` through `parseWebsiteCheckoutDocumentConfig`
before the config is accepted. Any thrown error inside that block —
including `parseWebsiteCheckoutDocumentConfig`'s own
`invalid_checkout_document_configuration` on a hash mismatch
(`src/payment-checkout-documents.ts:150-157`) — is normalized to
`invalid_website_checkout_live_private_config` by the surrounding
try/catch (`src/website-checkout-live-runner.ts:294-314`), matching the
existing pattern used for `heartbeatAccess`/`receiptWelcome`. The gap
identified in R1 — a syntactically valid but content-mismatched
`activationReceiptSha256` passing straight through the runner's schema —
is closed.

Regression: `src/website-checkout-live-service.test.ts:550-602`,
"rejects any paid-invoice config whose finance activation hash does not
bind its content", drives this through the runner-level
`parseWebsiteCheckoutLivePrivateConfig` (not just the lower-level
`parseWebsiteCheckoutDocumentConfig`, which R1 had already found enforced
correctly in isolation). It writes a full private config with
`documents.paidInvoice.activationReceiptSha256: '0'.repeat(64)` and
asserts a throw of `invalid_website_checkout_live_private_config`, then
recomputes the exact hash via `websiteCheckoutPaidInvoiceActivationHash`
and asserts `documents.paidInvoice.enabled === true` on acceptance. This
directly covers the failure mode R1 described.

## Correction 2 — signed-response byte ceiling vs. worst-case PDF size

`CHECKOUT_DOCUMENT_MAX_PDF_BYTES` is now `500_000`
(`src/payment-checkout-documents.ts:40`), and all three enforcement points
use the same constant consistently: `renderCheckoutDocumentPdf`
(line 429), `sealPdf` (line 684), and `openPdf` (line 722). No stale
`1_048_576`/`1_000_000` literal remains at any of the three checks.

Regression: `src/payment-checkout-documents.test.ts:81-114`, "keeps
worst-case PDF double-base64 delivery below the one-megabyte WordPress
envelope", builds a `CHECKOUT_DOCUMENT_MAX_PDF_BYTES`-sized buffer,
base64-encodes it into the inner download JSON shape, wraps that in the
outer signed-response JSON shape (with the same field set
`payment-signed-response-controller.ts` produces), and asserts both
`inner.length` and `outer` byte length stay under `1_048_576` — the
Node signer's `maxBodyBytes`. Math checks out independently: 500,000
raw bytes base64-encodes to ~666,667 bytes; with the outer envelope and
JSON field overhead this comes in well under the 1,048,576 ceiling, so
the assertion is not a near-miss.

`data/business/migrations/nanoclaw-v2/163_payment_checkout_documents.sql:34`
bounds `encrypted_pdf` at `octet_length(encrypted_pdf) BETWEEN 256 AND
1000000`. The AES-256-GCM envelope (`pdf-v1.<iv>.<ciphertext>.<tag>`,
all base64url) for a 500,000-byte PDF is ~666,700 bytes — comfortably
inside that 1,000,000-byte column check, so the DB constraint does not
conflict with the tightened application-level ceiling. This migration is
new (not a modification of a prior looser bound), so there is no stale
value left over from before the correction.

## Scope

Only the four allowed paths were read:
`src/website-checkout-live-runner.ts`, `src/payment-checkout-documents.ts`,
`src/website-checkout-live-service.test.ts`,
`src/payment-checkout-documents.test.ts` — plus the R1 response document
for context and, incidentally, the new migration file
(`163_payment_checkout_documents.sql`) to check the ciphertext column
bound the correction packet claimed was tightened. No source was edited,
no commands were run.
