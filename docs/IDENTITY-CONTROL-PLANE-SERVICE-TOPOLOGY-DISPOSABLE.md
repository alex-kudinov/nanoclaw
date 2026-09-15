# Tandem Identity service topology disposable proof

Status: source-only, network-free and unwired; synthetic service-identity and
generated disposable PostgreSQL evidence only

Task: `NC-20260915-002`

Companion topology checkpoint: Tandemweb commit `e2e245e43`

Tandem Identity runtime-unchanged documentation: commit `3a577a7`

## Selected topology

The smallest standard service identity is a short-lived Google-signed service-
account ID token minted by the existing Tandem Identity Cloud Run runtime for an
exact Company OS HTTPS audience. Company OS verifies Google signature, issuer,
audience, expiry, verified runtime service-account email and immutable subject
before it parses the existing participant-only proposal.

The future HTTPS route remains separately gated. Cloudflare, Tailscale or
another ingress may transport bytes, but does not become identity authority.
Company OS remains the only Party/conflict derivation and claim-decision
boundary.

## Why this is minimum-sufficient

- Cloud Run already has an attached least-privilege service account and can use
  metadata-issued ID tokens without a downloaded key.
- A second Company OS Cloud Run runtime would add deployment, database and
  recovery ownership.
- Cloud Run has no current Tailscale route to the Mac Mini.
- The Mac Mini has no current Cloudflare Tunnel; Access service tokens would add
  a long-lived shared credential and rotation obligation.
- A custom HMAC, body-signing format or transport replay ledger would duplicate
  standard TLS/token and existing migration-167 idempotency controls.

## Disposable verifier

`google-service-account-transport.ts` is a pure, unwired verifier. It accepts an
injected trusted certificate map and injected policy. It requires:

- a strict RS256 JWT header with a bounded key ID;
- issuer `https://accounts.google.com`;
- one exact HTTPS audience;
- exact verified service-account email and exact immutable subject;
- issue/expiry times within a one-hour token lifetime and a 60-second
  application skew;
- an 8 KiB token limit and 16 KiB UTF-8 JSON body limit; and
- the unchanged strict Google account-claim proposal policy.

Expected values come from trusted policy and are never derived from the token.
All signature/library failures collapse to typed fail-closed results without
returning or logging token bytes.

## Proof traversal

Tests generate an ephemeral RSA key pair in memory. The private key is never
written. The synthetic token has Google service-account claim shape and is
verified through the existing `google-auth-library` certificate verifier.

The exact 880-byte proposal produced by the unchanged Tandem Identity fixture
crosses this boundary. In generated disposable PostgreSQL, Company OS then:

1. refuses wrong service audience before database derivation;
2. preserves the existing explicit serializable-transaction and transaction-ID
   guards;
3. accepts one exact safe server-derived candidate;
4. returns `EXACT_CLAIM_REPLAY_NOOP` with zero additional writes; and
5. accepts that a bearer token does not bind body bytes, then rejects an altered
   proposal reuse through the existing claim payload-conflict semantics.

Negative tests cover wrong issuer, audience, principal, verified-email flag,
subject, signature/certificate, expired/future token, missing token, malformed
or oversized body, and an authority-bearing proposal.

## Evidence boundary

This proves the receiver contract against synthetic signatures. It does not
prove Google interoperability, metadata-token minting, current IAM grants,
certificate fetch/cache behavior, Cloud Run-to-Mac-Mini routing, HTTPS ingress,
availability, retries or production recovery.

Production remains blocked until a separately authorized slice verifies a real
metadata-issued token and its immutable subject, reads back current IAM, selects
and operates an HTTPS route, defines certificate refresh/failure behavior, and
passes end-to-end failure/replay proof without a real customer or identity write.

No runtime import, HTTP endpoint/client, environment variable, secret, Google
metadata request, certificate fetch, retry worker, migration, DDL, real user,
Party/ref/access/provider/customer write or deployment is present.

## Rollback

Revert the pure verifier, tests and documentation. The temporary BFF proposal,
ephemeral key and generated database are removed after verification, so no live
state requires compensation.

## Independent review

One bounded Claude Sonnet/high authentication review inspected only the
necessity checkpoint, verifier, load-bearing tests and this evidence boundary.
It returned `PASS` with no material finding or required correction. The review
confirmed the injected-policy issuer/audience/principal/subject checks, strict
time and body handling, synthetic signature boundary, existing replay authority
and serializable transaction guard. See
`docs/reports/NC-20260915-002-CLAUDE-REVIEW-RESPONSE-R1.md`.
