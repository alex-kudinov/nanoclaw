# NC-20260915-002 service topology complete

Date: 2026-09-15

## Outcome

Selected and proved the smallest standard Tandem Identity BFF-to-Company-OS
caller identity without creating a production transport. A future Cloud Run
request will use a short-lived Google-signed service-account ID token for one
exact HTTPS audience. Company OS verifies injected issuer, audience, verified
runtime principal and immutable subject plus signature and time bounds before
strictly parsing the existing participant proposal.

The fresh minimum-sufficient reviewer returned `KEEP` after removing a
production-shaped BFF token/client abstraction. The accepted proof contains one
pure unwired Company OS verifier, ephemeral in-memory test signing and the
existing unchanged Tandem Identity proposal producer.

## Current topology audit

- Both `https://app.tandemcoach.co/health` and the current direct Cloud Run
  service URL returned the Tandem Identity health response.
- Direct read-only SSH and `/health` over Tailscale verified `mini-claw` at
  `100.115.115.206`, launchd NanoClaw running and port 8088 reachable.
- The Mac Mini had no running or launchd Cloudflare Tunnel. The tracked Cloud
  Run deployment declares no tailnet route or Company OS credential.
- Google IAM remained tracked-declaration evidence: the local host has no
  Google Cloud CLI and this task prohibited loading credentials, so no live IAM
  query was attempted.

## Proof and review

- Focused transport, boundary, exact cross-repository artifact and generated
  disposable PostgreSQL proof passed 23/23.
- NanoClaw format, typecheck, build and documentation continuity passed.
- Full NanoClaw reached 4,447 passed / 34 skipped / 20 unrelated failures with
  no identity failure. Payment reconciliation passed immediately in isolation;
  the established Academy Capacity fixture remained independently red.
- Tandem Identity remained 44 passed / 4 intentional Firestore skips; typecheck
  and build passed.
- Claude Sonnet/high session `6f3acb26-a59b-4bd6-8b0d-2dff28cc0f13`
  returned `PASS` with no material finding or correction. Four model calls used
  84,356 cache-create, 143,816 cache-read and 16,292 output tokens; maximum
  context was 89,197 with no usage warning.

The actual diff reconciles with the accepted obligation delta: no endpoint,
HTTP client, metadata or certificate fetch, IAM/network/secret/config change,
runtime import, durable replay state, worker, migration or deployment exists.

## Committed and pushed receipts

- Tandemweb checkpoint branch
  `codex/tandem-identity-service-topology-20260915`:
  `e2e245e43a9c0ec3b613eedb93e7f402fbf9f814`.
- Tandem Identity runtime-unchanged documentation branch
  `codex/service-topology-disposable-20260915`:
  `3a577a70a5b6436445bd770564e6dab3ca56ae5a`.
- Company OS verifier branch
  `codex/tandem-identity-service-topology-disposable-20260915`:
  `582a9b37f00403c00893c82443ebd36ccb9e0ebd`.

Each remote ref was read back equal to the named local commit.

## Evidence boundary

The synthetic signature proves the verifier contract, not Google
interoperability. No real metadata token, authenticated IAM readback, Google
certificate retrieval/cache, Cloud Run-to-Mac-Mini route, HTTPS endpoint,
credential, real user, production identity/access binding, Party/ref/provider/
customer write, migration or deployment occurred.
