# NC-20260915-003 bounded real-gateway review

## Objective

Review only the load-bearing cross-repository diff for one development Tandem
Identity login/binding canary. Find material authentication, authorization,
binding, replay, database, route-isolation, privacy, recovery or evidence
defects before commit or any external mutation.

## Accepted authority

- Google/Firebase authenticates; Company OS owns Party and entitlement truth.
- Owner explicitly designated existing Party `10069` for the exact individual
  pilot account. Checkout duplicates `11646` and `11647` remain untouched.
- No Coaching Tools Plus entitlement exists for Party `10069`; `/tools` must
  deny. No grant may be created.
- Google Cloud independently established the enabled, keyless Cloud Run runtime
  principal email and immutable subject `114536406241819905948` before source
  work. These values and the exact Funnel audience are policy, not learned from
  requests.
- Public gateway traffic is read-only. The one binding is applied only by a
  local operator CLI under the accepted owner decision and migration-167.
- Tailscale Funnel, deployments and database binding remain off/not applied.

## Non-objectives

Do not propose a new service, store, schema, queue, worker, cache, secret,
provider write, entitlement, Party merge, customer migration or production
rollout. Do not review unrelated NanoClaw or Tandem Identity history.

## Allowed read paths

1. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/IDENTITY-LOGIN-TOOLS-GATEWAY-CHECKPOINT.md`
2. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/reports/NC-20260915-003-REAL-GATEWAY-DIFF-R1.patch`
3. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`
4. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/docs/LOGIN-TOOLS-WALKING-SKELETON.md`

Only write the response artifact. Do not edit source or other documentation.

## Required checks

- Exact HTTP path/method, encoded/suffix/query variants and body limits fail
  before lookup; unrelated NanoClaw routes are not made public by source.
- Google token signature/JWKS, issuer, exact audience, verified principal email
  and immutable subject are enforced; no first-request trust-on-first-use.
- BFF uses metadata/ADC ID tokens, a strict short timeout, bounded response and
  no downloaded key or shared secret.
- Caller request cannot choose Party or entitlement.
- Operator binding is pinned to decision, project, UID, email fingerprint,
  caller subject and Party `10069`; volatile timestamps are excluded from replay
  identity.
- First apply is atomic; exact repeat with later time writes zero; changed UID,
  Party, decision or caller identity fails/rolls back. No Party/ref/entitlement/
  provider write occurs.
- Existing accepted/disabled/conflicting auth versions fail safely; rollback can
  be append-only rather than deletion.
- Read response maps only canonical Company OS entitlement data and correctly
  returns no grant for the pilot.
- Disabled-by-default configuration and the proposed exact Funnel mount/rollback
  remain truthful. No deployment or live proof may be inferred from tests.

## Evidence

- NanoClaw focused gateway/webhook: 67/67 passed.
- Real disposable PostgreSQL migration-167 binding/replay proof: 7/7 file passed.
- Tandem Identity full suite: 78 passed / 4 intentional Firestore skips.
- NanoClaw format, typecheck, build and continuity pass. Full suite: 4,472
  passed / 34 skipped / three established unrelated failures; no gateway or
  identity failure.
- Tandem Identity typecheck/build pass.
- No commit, Funnel, endpoint, binding, deployment or provider mutation yet.

## Response

Write
`/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/reports/NC-20260915-003-CLAUDE-REAL-GATEWAY-RESPONSE-R1.md`.

Report only material findings ordered by consequence with exact evidence,
whether each required check is supported, required corrections before commit or
external mutation, and final `PASS`, `PASS WITH CORRECTIONS`, or `BLOCK`.
