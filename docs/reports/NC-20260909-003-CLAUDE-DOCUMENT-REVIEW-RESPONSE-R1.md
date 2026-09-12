# NC-20260909-003 bounded document self-service review R1 — response

Two material findings. All other reviewed paths/questions (unverified/reversed/
cross-attempt payment access, concurrency/replay/crash duplication, capability
scoping, encryption/AAD purpose separation, Gmail readback proof, WordPress/
browser output validation, migration163 ordering/admin-only/immutability/
rollback) checked out against the accepted scope and authority.

## 1. HIGH — paid-invoice activation-hash gate is not enforced by the live config loader

The packet's finance/legal gate requires "an exact activation hash over seller
identity/address, annual sequence, tax policy/jurisdiction, retention, and
replacement-or-credit-note correction policy" before paid invoices can be
enabled. That check exists as `parseWebsiteCheckoutDocumentConfig()`
(`src/payment-checkout-documents.ts:140-155`), which verifies
`activationReceiptSha256 === websiteCheckoutPaidInvoiceActivationHash(content)`.

`src/website-checkout-live-runner.ts` never calls it. The private-config schema
wires the raw `websiteCheckoutDocumentConfigSchema` directly
(`src/website-checkout-live-runner.ts:194`, and the import list at
`src/website-checkout-live-runner.ts:24-28` omits both
`parseWebsiteCheckoutDocumentConfig` and `websiteCheckoutPaidInvoiceActivationHash`).
The one large compound validation `if` in `parseWebsiteCheckoutLivePrivateConfig`
does verify `heartbeatAccess` and `receiptWelcome` activation hashes explicitly
(`src/website-checkout-live-runner.ts:356-361`), but has no equivalent branch
for `parsed.documents.paidInvoice` — the digest is checked only for shape
(`z.string().regex(/^[a-f0-9]{64}$/)`), never for correspondence to content.

**Failure mode:** a private config file with `documents.paidInvoice.enabled:
true` and any syntactically valid 64-hex `activationReceiptSha256` (a stale
digest left over from a prior approved config, a hand-edited seller/tax field
without recomputing the hash, or a copy-paste from another environment) is
accepted at startup. `PgPaymentCheckoutDocumentStore.ensure()` only checks the
boolean `config.paidInvoice.enabled` (`src/payment-checkout-documents.ts:787`)
and never re-verifies the hash, so real paid invoices would be issued with
seller/tax/legal content that was never cryptographically re-approved — the
exact "accidentally enabled by old private configuration" scenario review
question 4 asks about.

**Correction:** in `parseWebsiteCheckoutLivePrivateConfig`, call
`parseWebsiteCheckoutDocumentConfig(parsed.documents)` (or inline the same
`websiteCheckoutPaidInvoiceActivationHash(content)` comparison already used for
`heartbeatAccess`/`receiptWelcome`) and throw
`invalid_website_checkout_live_private_config` on mismatch, mirroring
`src/website-checkout-live-runner.ts:356-361`.

## 2. LOW — signed-response byte ceiling is smaller than the documented PDF's worst-case encoded size

`renderCheckoutDocumentPdf`/`sealPdf`/`openPdf` bound the PDF at up to
1,048,576 raw bytes (`src/payment-checkout-documents.ts:425-427,677,714`), and
`/internal/payments/documents/download` returns it as
`contentBase64: document.pdf.toString('base64')`
(`src/payment-checkout-documents.ts:1442-1443`). Base64 of a 1,048,576-byte PDF
is ~1,398,102 bytes before the surrounding JSON fields are added. The document
controller's `PaymentSignedResponseController` is configured with
`maxBodyBytes = 1_048_576` (`src/website-checkout-service.ts:384-390` →
`new PaymentResponseSigner(..., undefined, 1_048_576)`), and `sign()` throws
`invalid_payment_response` once `input.body.length > this.maxBodyBytes`
(`src/payment-signed-response-controller.ts:176-180`) — a throw that is not
caught anywhere in `PaymentSignedResponseController.handle()`
(`src/payment-signed-response-controller.ts:259-296`).

**Failure mode:** any generated document whose raw PDF exceeds roughly 768 KB
cannot be delivered through `/internal/payments/documents/download` — the
response signer rejects it before a response body can be produced, with no
mapped `PaymentDomainError` code for the WordPress transport to interpret.
Currently unreachable because the fixed single-page renderer produces
documents far under this size, but the two size contracts (PDF ceiling vs.
signed-response ceiling) are inconsistent as written, and any future template
growth (longer billing address, added seller lines, embedded artwork) could
silently break the download path.

**Correction:** raise the document controller's response signer
`maxBodyBytes` to comfortably exceed the base64-encoded worst case (at least
`Math.ceil(1_048_576 / 3) * 4` plus JSON overhead), or lower the PDF ceiling in
`renderCheckoutDocumentPdf`/`sealPdf`/`openPdf` so its base64 form provably
fits under the chosen signer cap.
