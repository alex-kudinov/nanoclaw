# NC-20260909-003 load-bearing correction review R2

Review only the two material R1 corrections. Do not reopen other scope.

R1 response:
`docs/reports/NC-20260909-003-CLAUDE-DOCUMENT-REVIEW-RESPONSE-R1.md`.

Allowed source paths:

- `src/website-checkout-live-runner.ts`
- `src/payment-checkout-documents.ts`
- `src/website-checkout-live-service.test.ts`
- `src/payment-checkout-documents.test.ts`

Correction 1: `parseWebsiteCheckoutLivePrivateConfig` now passes the structurally
parsed document block through `parseWebsiteCheckoutDocumentConfig`; any
mismatched paid-invoice activation hash becomes
`invalid_website_checkout_live_private_config`. A regression proves a random
64-hex digest is rejected and an exact content hash is accepted.

Correction 2: the PDF ceiling is now 500,000 raw bytes. The test constructs the
worst-case inner download JSON and the outer signed-response JSON and proves
both remain below the existing 1,048,576-byte Node signer and WordPress
transport limits after the two base64 layers. Renderer, encryption seal/open,
and migration ciphertext bounds use the tightened ceiling.

Focused post-correction typecheck and 36/36 document/config/release tests pass,
including the disposable PostgreSQL proof.

Write only
`docs/reports/NC-20260909-003-CLAUDE-DOCUMENT-CORRECTION-RESPONSE-R2.md`.
Return `GO` if both R1 findings are fully resolved without a new material defect;
otherwise report only the remaining material issue with exact evidence. Do not
edit source, run commands, use MCP/network/database/provider tools, or inspect
credentials, `.env`, auth stores, unrelated files, or prior session history.
