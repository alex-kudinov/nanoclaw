# NC-20260909-003 MCS Level 3 review response

Date: 2026-09-12

Reviewed only the paths listed in the review request.

## Result

NO MATERIAL FINDINGS

## Checks performed

- v69 pin: `AdyenSessionAdapter` only rewrites `/v72/sessions` → `/v69/sessions`
  when constructed with `checkoutApiVersion: 69`, and asserts the resulting
  URL ends with the matching version suffix (fail-closed on mismatch). The
  live endpoint prefix is preserved by string substitution on the resolved
  profile URL, not reconstruction (confirmed by
  `adyen-session-adapter.test.ts`'s LIVE-prefix test). `AdyenSessionOptimizationPolicy.checkoutApiVersion`
  is typed as the literal `69`, so any code path that attaches L3 data is
  structurally forced onto v69; ordinary sessions (no `providerOptimization`)
  default to 72.
- Field completeness/bounds: `buildAdyenSessionOptimization` populates
  customerReference, totalTaxAmount, and the full itemDetailLine1 set
  (productCode, description, quantity, unitOfMeasure, commodityCode,
  unitPrice, discountAmount, totalAmount, orderDate) with regex-bounded
  formats matching the provider evidence's proven-Authorised v69 payload
  shape. Discount arithmetic (`unitPrice=originalAmount`,
  `discountAmount`, `totalAmount=finalAmount`) and zero-tax fields are
  covered by both the full-price and discounted test cases.
- No forced 3DS/authentication coupling: request builder never sets
  `authenticationData`/`threeDS2RequestData`; explicitly asserted in
  `adyen-session-adapter.test.ts`.
- No PII/secret leakage: metadata is limited to attempt/quote identifiers and
  an optional bounded promo policy reference; a test asserts the serialized
  request contains no email/name/click-id fields. The adapter never logs the
  API key, truncates/redacts provider error bodies, and hashes (not raws)
  the session id in the disposable proof script's output.
- Environment separation: `createPaymentRuntimeCore` and
  `createPaymentLiveRuntime` both fail closed on any TEST/LIVE credential,
  scope, or webhook mismatch; the TEST runner restricts its offer/locale
  admission to the same single MCS US English offer it uses for the L3
  policy, so applying `liveMcsProviderOptimization()` unconditionally in TEST
  does not widen the policy's effective scope beyond the canary.
- UNSPSC commodity code and other policy constants are hardcoded, frozen,
  and regex-validated, not caller-supplied.

No changes to webhook authority, replay handling, or capture configuration
were observed in the reviewed files beyond what the accepted owner facts
describe as already in place.
