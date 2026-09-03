# NC-20260903-001 — Runtime wiring closeout R4 response

## Item 1 — `src/ipc.ts:1846-1873`

Confirmed. Every `classify_label_write` branch calls
`mailmanClassificationBindingIssue` with `runId` (`undefined` when
`data.run_id` is not a string), `gmailMessageId`, and `sourceContext`; any
non-null `bindingIssue` — including the absent-`run_id` case, which yields
`runId: undefined` — is quarantined via `quarantineIpcFile` and the loop
`continue`s before `dispatchClassifyIpc` is reached.

## Item 2 — `src/mailman-run-context.ts` / `.test.ts`

**Material finding:** the test titled `'fails classification binding closed
on missing, expired, wrong-message, and wrong-thread proof'`
(`src/mailman-run-context.test.ts:80-119`) does not exercise the expired
case. It registers a context with no `now` override, then asserts only three
outcomes: `runId: undefined` (missing), a mismatched `gmailMessageId`
(wrong-message), and a mismatched `threadTs` (wrong-thread). No call in this
test advances time past `expiresAt` and re-invokes
`mailmanClassificationBindingIssue` for the same `runId` to prove the expired
branch independently.

Validator logic (`mailman-run-context.ts:108-109`) does fail closed for
expiry: `getMailmanRunContext` prunes expired entries, so an expired `runId`
falls through the same `if (!turn) return 'missing or expired Mailman run
proof'` line as a genuinely absent `runId`. This is a correct implementation,
and a separate test (`'binds one run to its exact source message set and
expires it'`, lines 48-58) proves `getMailmanRunContext` returns `undefined`
past `expiresAt`. But no test composes those two facts through
`mailmanClassificationBindingIssue` itself with a `now` advanced past
`expiresAt`, so the docstring's claim that the behavior test "covers"
expiration for the binding-issue function specifically is not accurate as
written — coverage of that path is inferred, not asserted.

## Item 3 — `src/host-router.ts:345-430` / `src/classification-policy.ts`

Confirmed. `routeClassifiedEmail` obtains policy exclusively via
`classificationPolicyFor(params.label)` (line 351), fails closed with
`routed: false` for any label absent from the canonical map, and dispatches
solely through `policy.disposition` in the `switch` — including
`classify_only` (line 402-403, no side-effecting route) and both `support`
(line 371-372) and `refund_support` (line 373-390, Sales-primary /
Chief-secondary-visibility) paths.

## Result

One exact material finding on Item 2 (test does not directly assert the
expired-proof branch of `mailmanClassificationBindingIssue`, despite the test
name claiming it does). Items 1 and 3 confirmed with no findings.
