# Bounded review response: MCS LIVE provider-regression rollback

## Verdict

Rollback correctly restores the last provider-proven LIVE Session request
shape and does not weaken capture, merchant/store binding, webhook
verification, recovery, or idempotency. One maintainability/safety-adjacent
gap found (finding 1); one secondary note on regression-guard strength
(finding 2).

## Confirmed: optimization projection is fully absent from LIVE composition

`src/payment-live-runtime.ts:124-146` — the object passed to
`createPaymentRuntimeCore` has no `providerOptimization` key. `src/payment-runtime-core.ts:246`
passes `config.providerOptimization` straight through to `PaymentSessionService`
with no default/fallback that could reintroduce a value, so it resolves to
`undefined`. `src/adyen-session-adapter.ts:90,136-138` treat `optimization` as
optional and produce `providerOptimization = {}` when absent, so `metadata`,
`lineItems`, enhanced scheme data, forced authentication, and 3DS preference
(`buildAdyenSessionOptimization`, gated at line 136-138) are all excluded —
matching the prior successful request shape.

## Confirmed: unrelated safety properties are unconditional, not gated by optimization

- Capture: `captureDelayHours: 0` is set unconditionally (`adyen-session-adapter.ts:158`), independent of `providerOptimization`.
- Merchant/store binding: `merchantAccount`/`store` come from `scope` unconditionally (`adyen-session-adapter.ts:140-141`), and `scope` is validated against `routing.scope` before this point (`adyen-session-adapter.ts:94-100`).
- Webhook verification: all environment/merchant/store/reference-prefix/event-code/foreign-traffic guards remain in the `createPaymentLiveRuntime` throw clause unchanged (`payment-live-runtime.ts:99-121`), with no dependency on `providerOptimization`.
- Recovery: `recoveryMode`, `recoveryOfferLocales`, `newAttemptOfferLocales` are all set independently of optimization (`payment-live-runtime.ts:133-138`).
- Idempotency: attempt reference generation (`adyenAttemptReference`, `adyen-session-adapter.ts:142-146`) is unconditional and unaffected by the removed field.

## Finding 1 (material): `LIVE_MCS_PROVIDER_OPTIMIZATION_ENABLED` is dead — false affordance for future re-enable

`payment-live-runtime.ts:22` declares `LIVE_MCS_PROVIDER_OPTIMIZATION_ENABLED = false`,
documented in the preceding comment (lines 18-21) as the rollback's disable
switch. It is never read anywhere in `createPaymentLiveRuntime`
(`payment-live-runtime.ts:82-147`) — the composition simply omits the
`providerOptimization` key outright, unconditionally, regardless of this
constant's value. Its only consumer is the regression test at
`payment-live-runtime.test.ts:111`, which asserts the constant equals `false`
but does not wire it to any behavior.

Risk: a future engineer, following the comment's implication, could flip this
constant to `true` expecting the optimization projection to return, deploy,
and find no behavior change (harmless) — or, worse, could take the flag being
`true`-able as evidence the projection is once again gated/controlled, and
build new LIVE code that reads `LIVE_MCS_PROVIDER_OPTIMIZATION_ENABLED` and
branches on it independently, silently reintroducing the exact request shape
that caused this incident without touching `payment-live-runtime.ts`'s own
composition path. This is the same class of "flag exists but doesn't gate the
thing readers assume it gates" confusion, in the same file, that surrounds the
incident. Recommend either wiring the constant into the composition
(`providerOptimization: LIVE_MCS_PROVIDER_OPTIMIZATION_ENABLED ? {...} : undefined`)
or renaming/re-documenting it as historical/informational-only so it cannot
be mistaken for a live gate.

## Finding 2 (secondary): regression guard is source-text matching, not behavioral

`payment-live-runtime.test.ts:110-118` proves the rollback only by reading
`payment-live-runtime.ts` as text and asserting it does not contain the
literal substrings `providerOptimization:` and
`profile: 'mcs-foundations-us-l3-v1'`. No test in this file constructs a live
runtime and inspects an actual built Adyen Session request body to confirm
`metadata`/`lineItems`/enhanced scheme data/`authenticationData`/3DS
preference are absent from the JSON sent to the provider. The listed
verification facts ("prior request had no optimization fields," "failed
request added only the optimization projection") were established outside
this test suite per the request's own Verification section, not re-proven
by an assertion on the composed request payload. A behavioral assertion here
would be resilient to future refactors of `payment-live-runtime.ts` (e.g. a
renamed variable or restructured object literal) that a literal-string check
cannot catch.
