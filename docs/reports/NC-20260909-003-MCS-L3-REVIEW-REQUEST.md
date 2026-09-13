# NC-20260909-003 MCS Level 3 review request

## Objective

Review the exact MCS Level 3 enhanced scheme data implementation before LIVE
release. Report material correctness, payment-safety, provider-wire-contract,
or regression findings only. Write the response to
`docs/reports/NC-20260909-003-MCS-L3-REVIEW-RESPONSE.md`.

## Accepted owner facts

- MCS invoice tax is always USD0.
- The invoice item is known server-side; no buyer-supplied amount, tax or item
  description is authoritative.
- Current LIVE capture is immediate automatic capture.
- The change is restricted to the direct English US MCS card canary; ordinary
  Sessions and main-page Stripe routing must not change.
- Proposed commodity classification is UNSPSC `86132000`, management education
  and training services. Owner confirmation is pending; report only if the
  implementation fails to keep this as an explicit bounded policy value.

## Provider evidence to treat as factual

- Official Checkout v72 OpenAPI: `/payments` supports top-level structured
  `enhancedSchemeData.levelTwoThree`; `/sessions` does not expose that field.
- v72 `/sessions` accepted legacy flattened keys, but its browser payment call
  failed. Direct v72 `/payments` returned code 209 saying enhanced scheme data
  must be in the structured field. Direct v72 `/sessions` with the structured
  field returned code 702 unknown field.
- Direct v69 `/payments` with the exact flattened Level 3 payload and official
  Visa TEST card returned HTTP 200 `Authorised`.
- v69 `/sessions` returned HTTP 201 and a full Adyen Web secured-fields payment
  with the official Visa TEST card returned `Authorised`.
- No LIVE payment was made. Evidence is minimized in
  `docs/reports/NC-20260909-003-MCS-L3-PROVIDER-PROOF.md`.

## Review paths

Read only:

1. `src/adyen-session-adapter.ts`
2. `src/adyen-session-adapter.test.ts`
3. `src/payment-live-runtime.ts`
4. `src/payment-live-runtime.test.ts`
5. `src/payment-runtime-core.ts`
6. `src/payment-test-runtime.ts`
7. `src/website-checkout-test-runner.ts`
8. `scripts/verify-adyen-test-session-store.ts`
9. `docs/reports/NC-20260909-003-MCS-L3-PROVIDER-PROOF.md`

Write only the response artifact named above. Do not inspect `.env`, runtime
configuration, credentials, auth stores, browser profiles, other reports, or
unrelated repository files. Do not run Bash, tests, network calls, MCP tools,
commits, pushes, deployment or provider actions.

## Required checks

- Exact v69 pin applies only when the exact Level 3 policy is active; ordinary
  requests remain v72 and the assigned LIVE hostname prefix is preserved.
- Required Level 3 fields and format bounds are complete for a digitally
  delivered one-item US course, including zero tax and discount arithmetic.
- No forced 3DS/authentication preference remains coupled to Level 3.
- No PII, API key, PSP reference, card data or mutable browser amount is added
  to metadata/logs/public responses.
- Replay, encrypted Session persistence, webhook authority and capture evidence
  remain unchanged.
- TEST wiring exercises the same policy without weakening TEST/LIVE separation.

## Verification already completed

- Typecheck and formatting pass.
- Focused adapter/runtime/provider-evidence/disposable tests: 123/123.
- All Adyen/payment/website-checkout test files: 504/504.
- Fresh unused provider Session: HTTP 201, one provider call, exact encrypted
  Session reuse after pool reopen, generated database removed.
- Full official-card browser proof: `Authorised` on v69; control failed on v72.

Return `NO MATERIAL FINDINGS` if the bounded implementation is safe. Otherwise
list each material finding with exact file/evidence, consequence and smallest
corrective action.
