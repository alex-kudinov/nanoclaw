# NC-20260829-001 — Enrollment raw-body hotfix: bounded review response

## Verdict

**NO MATERIAL FINDINGS**

## Scope honored

Read only the five files listed in the request. No Bash, network, MCP,
credentials, databases, or customer data were used.

## Evidence checked

**Byte-exactness end to end**

- WordPress (`class-stripe-checkout.php:2437-2479` `checkout_identity_relay_request`,
  `:2842-2871` `send_checkout_recovery_shadow_body`) computes
  `$body = wp_json_encode($payload)`, signs `"{timestamp}.{$body}"` with the
  ingress secret, and POSTs `$body` verbatim as `Content-Type: text/plain;
  charset=utf-8` — the same string, unparsed, unmutated.
- n8n verifier (`checkout-recovery-website-verify.js:10-15`) reads
  `wrapped.rawBody` first, else `wrapped.body` **only if already a string**,
  never re-serializes it, and HMACs `"{timestamp}.{rawBody}"` with the same
  ingress-secret convention. This directly closes the defect described in the
  incident (old verifier apparently checked `rawBody` only).
- The contract test (`checkout-recovery-website-n8n-contract.test.ts:90-91,
  104-107`) exercises exactly the byte-fragility case that matters for a PHP
  producer: `wp_json_encode` escapes `/` to `\/` by default, and the test's
  `exactRawBody` deliberately differs from `JSON.stringify(body)` in that way,
  proving the verifier authenticates against the literal wire bytes rather
  than a re-derived encoding.
- `verifierSource` assertions (`...test.ts:222-223`) statically confirm no
  `JSON.stringify(wrapped.body)` path exists in the shipped file — re-checked
  directly against `checkout-recovery-website-verify.js` and confirmed absent.

**Field-allowlist parity (identity vs. event)**

- `checkout_identity_relay_request` payloads for `checkout.identity.resolve`
  (`:2505-2515`, 9 fields) and `checkout.identity.bind` (`:2541-2548`, 6
  fields) match the verifier's `allowedIdentityRequests` field lists
  (`verify.js:74-93`) exactly, field-for-field.
- `fire_checkout_recovery_shadow` payload (`:2806-2827`) matches the
  verifier's `allowedEvents` field list (`verify.js:95-113`) exactly.
- Both PHP relay call sites use `'Content-Type' => 'text/plain; charset=utf-8'`
  (2 occurrences, matching `test-checkout-recovery-shadow.php:27`'s
  `substr_count(...) >= 2` assertion).

**HMAC and size bounds**

- Signature comparison uses `crypto.timingSafeEqual` on two fixed 32-byte
  buffers (input pre-validated against `/^[0-9a-f]{64}$/` before compare, so
  no length-mismatch throw path).
- 32768-byte cap is enforced identically on ingress (`verify.js:16`, PHP
  `strlen($body) > 32768`) and on the re-serialized outbound relay body
  (`verify.js:122`). PHP `strlen()` and JS `Buffer.byteLength(..., 'utf8')`
  are both byte-counts, so the bound is consistent across languages.

**Call ordering / blocking vs. shadow architecture**

- `establish_checkout_customer_identity` (blocking, gates checkout capture)
  calls resolve → `ensure_stripe_customer` → bind, in that order
  (`:2505, 2536, 2541`), matching
  `test-stripe-customer-identity.php:203-208`'s asserted call ordering.
  A relay failure here correctly fails the whole capture request (502) rather
  than silently degrading identity — unchanged by this hotfix.
- `fire_checkout_recovery_shadow`/`send_checkout_recovery_shadow_body`
  (marketing-reminder events) fail soft into `queue_checkout_recovery_shadow_body`
  on delivery failure, unaffected by this hotfix's raw-body handling change.

**Deployment order**

- The WordPress side already sends `text/plain` in the code reviewed (this is
  the code that produced the live 502s per the incident); only the n8n
  verifier and its embedded-workflow copy are changing in this hotfix. No new
  two-sided synchronized-deploy requirement is introduced by this change.

## Correction criterion (for future changes only — not required now)

If either side is ever modified independently in a future change, confirm
before deploy that WordPress's request `Content-Type` and n8n's verifier body
source (`rawBody` vs. `body`) still agree, since a mismatch reproduces this
exact `invalid_checkout_raw_body` failure mode and — because the identity
relay is blocking — takes down live enrollment capture, not just the shadow
reminder path.
