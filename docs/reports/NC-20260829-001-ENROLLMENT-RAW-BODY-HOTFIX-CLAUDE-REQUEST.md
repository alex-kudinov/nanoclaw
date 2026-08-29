# Emergency bounded review: enrollment raw-body hotfix

## Incident

Every live enrollment capture returns HTTP 502 `customer_identity_error`.
WordPress logs show repeated identity-resolution status 500. n8n event evidence
shows every execution failing in the verifier with
`invalid_checkout_raw_body [line 8]`; NanoClaw receives no identity request.
The live n8n 2.1.4 Webhook node does not expose a string `rawBody` despite the
configured option. A signed `text/plain` canary still failed because the exact
bytes were preserved in `wrapped.body`, which the verifier ignored.

## Proposed correction

- WordPress sends the existing signed JSON bytes as
  `text/plain; charset=utf-8` for both identity and lifecycle relay calls.
- n8n accepts the exact string from `wrapped.rawBody`, or from `wrapped.body`
  only when it is already a string.
- It never serializes a parsed body. Exact-byte HMAC verification, size limit,
  field allowlist, relay re-signing, and NanoClaw validation remain unchanged.

## Review scope

Read only:

- `/private/tmp/nanoclaw-checkout-recovery.PqylpU/setup/n8n/checkout-recovery-website-verify.js`
- `/private/tmp/nanoclaw-checkout-recovery.PqylpU/src/checkout-recovery-website-n8n-contract.test.ts`
- `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/includes/class-stripe-checkout.php`
- `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/tests/test-stripe-customer-identity.php`
- `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/tests/test-checkout-recovery-shadow.php`

Focused NanoClaw 63/63 and typecheck pass. Tandemweb identity 23/23, recovery
contract, JS syntax, and diff checks pass.

Review only for a material enrollment-restoration, HMAC-bypass, request-byte,
content-type, replay, privacy, or deployment-order defect. Do not reopen the
accepted identity design or propose unrelated work. Do not use Bash, network,
MCP, credentials, databases, or customer data. Write only:

`/private/tmp/nanoclaw-checkout-recovery.PqylpU/docs/reports/NC-20260829-001-ENROLLMENT-RAW-BODY-HOTFIX-CLAUDE-RESPONSE.md`

Return `NO MATERIAL FINDINGS` or `CHANGES REQUIRED`, with exact evidence and a
concise correction criterion.
