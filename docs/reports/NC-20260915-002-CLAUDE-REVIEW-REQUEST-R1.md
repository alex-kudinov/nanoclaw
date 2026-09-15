# NC-20260915-002 bounded authentication review

## Objective

Review only the load-bearing decision and diff for a network-free disposable
proof that a future Tandem Identity Cloud Run service can authenticate to
Company OS with a Google-signed service-account ID token. Report material
security, authorization, replay, parser or evidence defects that could make the
proof validate the wrong boundary.

## Authority and accepted facts

- Company OS alone derives Party candidates/conflicts and decides the existing
  migration-167 claim. Email never resolves identity by itself.
- The existing Tandem Identity participant proposal producer is accepted and
  unchanged. The service token authenticates the caller but deliberately does
  not sign/bind the proposal body; TLS is the future transport-integrity layer,
  and existing claim-ID payload fingerprinting must reject altered reuse.
- The fresh necessity verdict is `KEEP` after removing a production-shaped BFF
  token/client abstraction. Expected issuer, audience, principal and immutable
  subject must be injected policy, not token-derived.
- Synthetic signatures prove contract behavior only. Real Google metadata-token
  minting, IAM, certificate refresh, HTTPS route and production availability are
  explicit future gates.

## Non-objectives and forbidden expansion

Do not propose or implement an endpoint, HTTP client, runtime import, metadata
call, certificate fetch, IAM/network/secret change, custom HMAC/body signature,
replay table, retry worker, DDL/migration, real credential/user, Party/ref/access/
provider/customer write or deployment. Do not review unrelated NanoClaw or
Tandemweb history.

## Allowed read paths

1. `/Users/xbohdpukc/dev/tandemweb/.worktrees/tandem-identity-service-topology-20260915/SOPs/plans/tandem-identity-readiness-2026-09-13/25-service-topology-minimum-sufficient-checkpoint.md`
2. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/src/identity-control-plane/google-service-account-transport.ts`
3. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/src/identity-control-plane/google-service-account-transport.test.ts`
4. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/src/identity-control-plane/google-account-claim-proposal-boundary.test.ts`
5. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/src/identity-control-plane/google-account-claim-proposal-crossrepo.integration.test.ts`
6. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/src/identity-control-plane/d2-student-lifecycle-shadow.disposable.test.ts`
7. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/docs/IDENTITY-CONTROL-PLANE-SERVICE-TOPOLOGY-DISPOSABLE.md`

Only write the response path below. Do not edit source or other documentation.

## Current evidence

- Focused transport/cross-repository/disposable proof: 23/23 passed.
- NanoClaw format, typecheck, build and documentation continuity passed.
- Full NanoClaw: 4,447 passed / 34 skipped / 20 unrelated failures; no identity
  test failed. Payment reconciliation passed immediately in isolation; the
  pre-existing Academy Capacity fixture remains independently red.
- Tandem Identity unchanged-source suite: 44 passed / 4 intentional Firestore
  skips; typecheck and build passed.
- Structural tests assert no runtime import, network client, metadata/ADC call,
  new credential/config, custom HMAC, endpoint or migration 168.

## Required review response

Write
`/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-service-topology-disposable-20260915/docs/reports/NC-20260915-002-CLAUDE-REVIEW-RESPONSE-R1.md`.

Include only:

1. material findings ordered by consequence, with exact file/evidence references;
2. whether issuer/audience/principal/subject/time/signature/body/replay and
   transaction-authority claims are actually supported;
3. whether any correction is required before commit/push; and
4. a concise `PASS`, `PASS WITH CORRECTIONS`, or `BLOCK` verdict.

Avoid restating the design or creating a speculative backlog.
