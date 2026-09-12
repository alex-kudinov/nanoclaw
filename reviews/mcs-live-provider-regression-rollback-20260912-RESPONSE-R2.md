# Focused correction review response: LIVE provider projection rollback

## Verdict

Finding 1 is resolved. Finding 2 is not resolved — the behavioral assertion
was added to a different function than the one the LIVE runtime actually
calls, so the composed LIVE request body is still never inspected.

## Finding 1 (R1): dead boolean — RESOLVED

`payment-live-runtime.ts` no longer declares
`LIVE_MCS_PROVIDER_OPTIMIZATION_ENABLED`. `liveMcsProviderOptimization()`
(lines 18-27) is the single source of truth: it hardcodes `return undefined`,
documents the failed 2026-09-12 canary, and its return value is the literal
expression assigned to `providerOptimization` at the composition call site
(`payment-live-runtime.ts:146`). There is no longer a flag that a reader could
believe gates behavior it doesn't gate. `payment-live-runtime.test.ts:109-111`
asserts `liveMcsProviderOptimization()` is `undefined`, replacing the old
substring-matching assertion on the constant. No remaining reference to the
old constant exists in either file.

## Finding 2 (R1): source-text regression guard — NOT RESOLVED

The correction moved the assertion style from string-matching to a real
`expect().not.toHaveProperty()` check, but the check was added to
`adyen-session-adapter.test.ts:143-165`, which exercises
`buildAdyenTestSessionRequest(a, routing)` — not `buildAdyenSessionRequest`,
the function this same test file uses at line 114 (with a policy argument) to
prove optimization fields *can* appear. These are two distinct exported
functions (both imported separately at lines 4-9). Every call to
`buildAdyenTestSessionRequest` in this file (lines 145, 172, 189, 203, 216,
226, 230, 247, 259, 269) takes at most `(attempt, routing, capabilities)` —
there is no call site anywhere in the file that passes it a policy/
optimization argument. Structurally, this function appears to never accept an
optimization policy at all, so asserting it produces no optimization fields
proves nothing about whether `buildAdyenSessionRequest` — the function
`payment-runtime-core.ts` presumably calls with `optimization:
config.providerOptimization` on the LIVE path per R1's evidence — correctly
omits those fields when `optimization` is `undefined`. The new assertion is a
property of the wrong function.

Separately, `payment-live-runtime.test.ts:109-111` only calls
`liveMcsProviderOptimization()` directly and checks its return value. It does
not invoke `createPaymentLiveRuntime` and inspect what
`config.providerOptimization` resolves to in the object actually passed to
`createPaymentRuntimeCore`, nor does it exercise `providerTransport` (already
available as a test dependency, used elsewhere in this file to assert
non-invocation) to capture and inspect a real composed Adyen Session request
body. If the call site at `payment-live-runtime.ts:146` were changed to
`providerOptimization: {}` or to inline a stale policy instead of calling
`liveMcsProviderOptimization()`, this test would still pass.

Net effect: R1's original complaint — "no test in this file constructs a live
runtime and inspects an actual built Adyen Session request body ... established
outside this test suite ... not re-proven by an assertion on the composed
request payload" — still holds. The gap was relocated to a function that is
structurally incapable of ever exercising the optimized branch, not closed.
Recommend either passing `undefined`/no policy explicitly through
`buildAdyenSessionRequest` (the function actually used with a policy elsewhere
in this file) and asserting the same five properties are absent, or driving
`createPaymentLiveRuntime`'s `providerTransport` in
`payment-live-runtime.test.ts` and asserting on the captured request JSON.
