# NC-20260915-002 service topology reviewed precommit

Date: 2026-09-15

State: reviewed source; commit/push pending

## Decision and topology evidence

- Company OS program revision 351 validated before claim. The work was claimed
  as `NC-20260915-002` at revision 352 and continuity attached at revision 353.
- The current BFF public health path and current direct Cloud Run health path
  returned the expected Tandem Identity response.
- Direct read-only SSH to Tailscale peer `mini-claw` at `100.115.115.206`
  succeeded; launchd NanoClaw was running and `/health` was reachable on 8088.
- The Mac Mini had no running or launchd `cloudflared`. The tracked Cloud Run
  deployment declares no Tailscale route and no Company OS credential.
- Google Cloud CLI was absent and the task forbids loading credentials, so live
  IAM was not queried. Tracked IAM is declaration evidence only.
- The minimum-sufficient checkpoint and fresh `KEEP` verdict are committed in
  Tandemweb at `e2e245e43`. Runtime-unchanged Tandem Identity documentation is
  committed at `3a577a7`.

## Implemented proof

- One pure Company OS verifier uses injected Google certificate and policy
  inputs. It requires strict RS256, issuer, exact audience, verified principal
  email, immutable subject, bounded time and bounded strict proposal bytes.
- Test-only ephemeral RSA signing produces no persisted private key.
- The exact existing BFF proposal artifact traverses the verifier without a
  Tandem Identity source change.
- Generated disposable PostgreSQL proves accepted apply, zero-write exact
  replay, altered reuse refusal and unchanged explicit serializable transaction
  authority.
- Structural proof excludes runtime imports, HTTP/network/metadata clients,
  environment/config/secrets, custom HMAC, retry workers and new migrations.

## Verification

- Focused transport, boundary, cross-repository and disposable database tests:
  23/23 passed.
- NanoClaw format, typecheck, build and documentation continuity: passed.
- Full NanoClaw: 4,447 passed / 34 skipped / 20 unrelated failures; no identity
  test failed. Payment reconciliation passed immediately in isolation. The
  pre-existing Academy Capacity fixture remained independently red.
- Tandem Identity: 44 passed / 4 intentional Firestore skips; typecheck/build
  passed.
- `git diff --check`: passed in each affected worktree.

## Independent review

Claude Sonnet/high bounded review
`6f3acb26-a59b-4bd6-8b0d-2dff28cc0f13` returned `PASS` with no material
finding or required correction. Four unique model calls used 84,356
cache-create, 143,816 cache-read and 16,292 output tokens; maximum context was
89,197 and the usage audit emitted no warning.

## Evidence boundary

The synthetic signer proves the verifier contract, not Google interoperability.
No real metadata token, IAM readback, certificate retrieval/cache, Cloud Run-to-
Mac-Mini path, HTTPS endpoint, credential, real user, production identity or
access binding, provider/customer write, migration or deployment occurred.
