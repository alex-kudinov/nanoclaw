# NC-20260915-003 login-to-tools source complete

Date: 2026-09-15

State: source committed and pushed; live walking skeleton waiting on exact pilot
identity and Company OS gateway authority

## Outcome

Tandem Identity now contains the first customer-facing authorization path. The
existing revocation-checked session and exact `(Google project, Firebase UID)`
gateway lookup protect `/tools`. Only one version-1, fresh, active
`coaching_tools.plus` projection within its exact validity interval permits
access.

Unbound, ambiguous, missing, duplicate, held, revoked, future, expired, stale or
malformed projections deny. A gateway failure is a distinct temporary-
unavailable result. `/account` and `/tools` independently resolve the same
Party in the HTTP proof. Party IDs and entitlement projections do not enter
HTML, and `/api/me` retains its previous public binding-summary shape.

## Minimum-sufficient and review evidence

- Fresh necessity verdict: `KEEP`; no store, transport, cache, queue, worker,
  tunnel or second authority was admitted.
- Focused access/application tests: 55/55 passed.
- Full repository: 74 passed / 4 intentional Firestore skips.
- Typecheck, build and diff checks passed.
- Claude Sonnet/high session `58e97d58-0019-4e90-929f-67adf1374fa6`
  returned `PASS` with no material finding. Four model calls used 59,235
  cache-create, 95,172 cache-read and 12,157 output tokens; maximum context was
  64,076 with no warning.
- The review's low error-middleware consistency suggestion was applied.
- A formatter-expanded intermediate diff was corrected: established file
  formatting was restored and route tests moved to a separate focused file.
  Full verification passed again.

## Source receipt

Private Tandem Identity branch
`codex/login-tools-walking-skeleton-20260915` is pushed at exact remote head
`d46fb591e4c22e8edc5f113ee0dc99c0062f7589`.

## Live and authority boundary

The deployed server still uses `UnconfiguredIdentityGateway`. No development
or production deployment, Firebase user, email verification, Party/auth binding,
entitlement grant, provider write, identity store, gateway transport or customer
effect occurred.

A deployment now would guarantee denial for every user and would not prove the
walking skeleton. The exact owner-selected controlled account, canonical Party,
current `coaching_tools.plus` entitlement and authorized Company OS gateway
path are required before the end-to-end canary.
