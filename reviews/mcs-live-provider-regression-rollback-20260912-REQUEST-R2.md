# Focused correction review: LIVE provider projection rollback

Review only the two findings from R1 and only these files:

1. `src/payment-live-runtime.ts`
2. `src/payment-live-runtime.test.ts`
3. `src/adyen-session-adapter.test.ts`
4. `reviews/mcs-live-provider-regression-rollback-20260912-RESPONSE-R1.md`

Corrections:

- The dead boolean was removed. `liveMcsProviderOptimization()` now explicitly
  returns `undefined`, documents the failed LIVE canary, and is the value passed
  to the actual runtime-core `providerOptimization` field.
- The live runtime test asserts that function is undefined.
- The request-builder test now behaviorally asserts that an unoptimized request
  has no metadata, lineItems, additionalData, authenticationData, or
  threeDS2RequestData.

Verification: the two focused suites pass 48/48; full TypeScript typecheck
passes; diff check passes.

Report only unresolved material issues. Do not edit source/tests. Write only
`reviews/mcs-live-provider-regression-rollback-20260912-RESPONSE-R2.md`.
