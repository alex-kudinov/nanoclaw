# NC-20260915-003 bounded real-gateway review R2

## Objective

Review the previously omitted load-bearing authentication, authorization,
binding, replay, and read-path implementation for one development Tandem
Identity canary. Confirm whether the R1 blockers are resolved and find any
remaining material defect before commit or external mutation.

## Authority and boundary

- Google/Firebase authenticates. Company OS owns Party and entitlement truth.
- The owner explicitly designated existing Party `10069` for this one pilot.
- Party `10069` has no Coaching Tools Plus entitlement, so `/tools` must deny.
- No entitlement grant, Party merge, customer migration, or production rollout
  is authorized.
- The exact keyless runtime principal email and immutable Google subject
  `114536406241819905948` were independently read before implementation.
- Public gateway traffic is read-only. The sole binding write is performed by
  the local operator CLI under the accepted owner decision.
- No deployment, Funnel, endpoint, database binding, provider write, or other
  external mutation has occurred.

## R1 corrections

1. The three omitted load-bearing files are now explicitly readable below.
2. The route-isolation namespace is derived from the configured exact gateway
   path and malformed top-level paths fail at server construction.
3. The replay identity now includes decision UUID as well as decision ref,
   project, UID, verified-email fingerprint, Party and caller subject.
4. An existing accepted binding is a duplicate only when its immutable receipt
   payload hash equals that full stable binding identity.
5. The disposable database proof now changes UID, Party, decision and caller
   subject separately, and confirms each failure leaves all binding/evidence
   counts unchanged.

## Allowed read paths

1. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/login-tools-gateway.ts`
2. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/scripts/bind-tandem-identity-pilot.ts`
3. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/webhook-server.ts`
4. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/webhook-server.test.ts`
5. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/login-tools-gateway.test.ts`
6. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/d2-student-lifecycle-shadow.disposable.test.ts`
7. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`
8. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/config.ts`
9. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/index.ts`
10. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/IDENTITY-LOGIN-TOOLS-GATEWAY-CHECKPOINT.md`
11. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/src/company-os-identity-gateway.ts`
12. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/tests/company-os-identity-gateway.test.ts`
13. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/src/config.ts`
14. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/src/server.ts`

Only write the response artifact. Do not edit source or other documentation.

## Required checks

- Verify Google JWKS/signature, issuer, exact audience, verified principal
  email and pre-pinned immutable subject fail closed.
- Verify the BFF mints ADC/metadata ID tokens for the exact audience, uses no
  downloaded key/shared secret, and bounds timeout and response.
- Verify no request field lets the caller choose Party or entitlement.
- Verify exact route/method/query/encoding isolation is derived from the
  configured path and all auth/body/schema failures precede database lookup.
- Verify the operator binding is atomic and pinned to decision ref/UUID,
  project, UID, email fingerprint, Party and caller subject, excluding time.
- Verify exact later replay is zero-write, while changed UID, Party, decision,
  or caller subject fails and rolls back without any evidence or protected
  write.
- Verify accepted/disabled/conflicting binding states fail safely and rollback
  remains possible through append-only versioning.
- Verify the read response derives only the existing canonical entitlement and
  the pilot returns bound with no grant.
- Verify configuration is disabled by default and no test implies a live
  endpoint, live binding, Funnel, deployment, or provider outcome.

## Current verification

- NanoClaw gateway/webhook focused suite: 67/67 passed.
- Real disposable PostgreSQL migration-167 suite: 7/7 passed, including the
  expanded changed-field zero-write proof.
- NanoClaw formatting and typecheck pass after R1 corrections.
- Earlier full verification: NanoClaw 4,472 passed / 34 skipped / three known
  unrelated failures; Tandem Identity 78 passed / four intentional Firestore
  skips, plus typecheck/build pass.

## Response

Write only
`/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/reports/NC-20260915-003-CLAUDE-REAL-GATEWAY-RESPONSE-R2.md`.

Report material findings ordered by consequence, required-check support,
required corrections before commit or external mutation, and final `PASS`,
`PASS WITH CORRECTIONS`, or `BLOCK`.
