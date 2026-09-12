# Bounded review: MCS LIVE provider-regression rollback

## Incident and objective

An owner-operated USD 1 LIVE MCS canary created an Adyen Session, then the
browser `POST /payments` returned HTTP 500. Durable readback for attempt
`362b5f22-85df-47cb-af0a-5ae63d6294bf` remains `session_available`, with zero
payment events and zero session-result operations. No payment was recorded.

A prior USD 1 LIVE canary on the same merchant, Tandem store, capture mode,
amount, currency, method, origin, and endpoint completed. Comparing the two
decrypted host-owned provider requests showed that the failed request added
only the `mcs-foundations-us-l3-v1` optimization projection: metadata,
lineItems, enhanced scheme data, forced authentication, and a 3DS preference.

The emergency repair removes that optimization projection from the LIVE runtime
composition while leaving the generic, separately tested builder available for
future isolated provider work. Review whether this returns LIVE Session requests
to the last provider-proven shape without weakening payment safety, capture,
merchant/store binding, webhook verification, recovery, or idempotency.

## Exact scope

Read only:

1. `src/payment-live-runtime.ts`
2. `src/payment-live-runtime.test.ts`
3. `src/payment-runtime-core.ts` lines 225-250 for constructor propagation
4. `src/adyen-session-adapter.ts` lines 75-165 for request composition

Do not inspect configuration, credentials, auth stores, environment files,
unrelated source, or Git history. Do not modify source/tests.

## Accepted operational facts

- The public Adyen route and both LIVE service/tunnel launch agents are already
  stopped. Existing Stripe checkout remains live.
- The accepted architecture intentionally uses Tandem's dedicated store and
  balance account under the shared Solera platform merchant. Do not treat the
  merchant name alone as a defect.
- No autonomous new LIVE payment is authorized for verification.

## Verification

- `payment-live-runtime.test.ts` + `adyen-session-adapter.test.ts`: 48/48 pass.
- The prior successful request contained no provider optimization fields.
- The failed request added only the optimization projection.

Report only material findings with file/line evidence. Write the result only to
`reviews/mcs-live-provider-regression-rollback-20260912-RESPONSE-R1.md`.
