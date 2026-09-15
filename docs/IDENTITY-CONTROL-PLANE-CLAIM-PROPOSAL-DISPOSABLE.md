# Tandem Identity Claim-Proposal Disposable Receiver

Status: independently reviewed, source-only and unwired; synthetic cross-
repository and generated disposable PostgreSQL evidence only

Task: `NC-20260914-007`

Reviewed implementation commits: Tandem Identity `926774f` (private pushed
head `fc5714d`) and Company OS `512a4ee6` (private pushed completion head
`d6048eac`).

## Outcome

This slice removes Party selection and identity-conflict authority from the
Tandem Identity BFF. Company OS independently validates a strict participant-
only Google/Heartbeat proposal, derives the current candidate and exception
state from its own canonical records inside one serializable transaction, and
only then invokes the existing reviewed migration-167 account-claim store.

The incoming proposal cannot contain a Party ID, candidate list, conflict flag,
staff/payer role, entitlement or provider action. Email remains a verified
identifier candidate, not a standalone resolution authority. Acceptance needs
both a recent explicit proposal and exactly one active, current, source-verified
or provider-asserted `verified_email_candidate` Party with no open exception for
the exact Heartbeat reference.

## Independent proposal boundary

`google-account-claim-proposal.ts` defines Company OS's own strict schema rather
than importing BFF code. It requires:

- the exact `tandem-company-os:identity-account-claim` audience;
- Google secure-token issuer, expected project, source scope and environment;
- one verified-email SHA-256 and Firebase UID;
- one exact scoped Heartbeat user UUID in the same environment;
- literal `participant` / `self` semantics; and
- authentication within five minutes, no more than 60 seconds of future clock
  tolerance, and proposal expiry no more than ten minutes after issue.

Wrong/extra shape, audience or non-participant roles fail strict parsing. Wrong
project, issuer, environment or time returns a typed rejection before any
database query.

## Server-derived transactional context

`applyGoogleAccountClaimProposalWithClient` first refuses every database except
generated `nc_tandem_identity_d2_test_*` names and requires the caller's active
transaction isolation to be `serializable`. It assigns a PostgreSQL transaction
ID at entry and requires the same ID after all context reads, before any write.
Therefore a session-level serializable setting in autocommit mode cannot mimic a
single protected transaction: the ID changes and the receiver fails before
calling the claim store.

For a new claim ID, the receiver reads:

1. active, unexpired migration-137 `verified_email_candidate` rows whose
   confidence is `source_verified` or `provider_asserted`, joined to an
   unmerged Party; and
2. open `party_identity_exceptions` carrying the exact SHA-256 of the scoped
   Heartbeat reference.

Zero candidates, multiple candidates or an open exception returns a typed hold
with zero identity writes. Exactly one candidate is converted to the existing
internal Google claim with a proposal fingerprint and the explicitly synthetic
BFF-sequence evidence label.

An existing accepted-claim decision for the exact claim ID and Heartbeat
reference supplies only the historical Party needed to reconstruct exact replay.
Any other decision under that UUID is held as a conflict. The unchanged dark
store then verifies exact payload replay and associated receipt/auth/decision/
related-reference completeness.

## Cross-repository artifact

The Tandem Identity fixture emitter produces one 880-byte, mode-0600 temporary
JSON artifact with SHA-256
`8dc277b4f6bc06e3233329cc64e7bb4708051343686c090d4d259f45ef356c66`.
The conditional cross-repository integration test consumes that exact path and
hash. No fixture copy is checked into NanoClaw, and the artifact contains no
email address, token, credential, Party ID or conflict state.

## Evidence boundary

This is not authenticated service-to-service transport. The S2 necessity review
removed bespoke HMAC, canonical signing and key-ID handling because a public
fixture key would not prove a real trust boundary. The proposal label and
receipt are synthetic/disposable evidence that the existing BFF verification
ordering and Company OS schemas interoperate.

A later endpoint/topology decision must separately choose standard transport
identity, verify audience and body integrity, operate credentials/rotation, and
cover retries/recovery. None of that is implied here.

## Verification contract

Focused tests prove:

- exact BFF-produced artifact acceptance by the independent schema;
- bad shape/audience/project/environment/time rejection;
- Party/conflict authority and staff/payer shapes unrepresentable;
- non-serializable transaction refusal;
- session-level serializable autocommit refusal through transaction-ID mismatch;
- zero-candidate, shared-identifier, open-exception and prior-decision holds;
- exactly one server-derived candidate accepted through migration 167;
- exact replay zero-write and altered reuse refusal;
- unchanged Party/external-reference/provider-attempt counts; and
- no HMAC, network, credential, runtime import, forbidden writer or migration
  168.

Current focused proof with the exact BFF artifact passes 19/19. Format,
typecheck, build and documentation continuity pass. Two full NanoClaw runs each
produced 4,435 passed, 33 skipped and 20 failed with no identity-control-plane
failure. Each had the established 19 unrelated failures plus a different known
disposable/concurrency flake: payment-method reconciliation on the first run and
Academy Capacity shadow timeout on the second. Both passed immediately in
isolation (11/11 and 2/2), making the effective comparison 4,436 passing with
the same baseline.

## Independent review

One bounded Claude Sonnet/high round found one material proof defect: checking
the isolation GUC did not prove the client was inside one persistent explicit
transaction. The receiver now pins `pg_current_xact_id()` across derivation, and
a real PostgreSQL regression proves that session-level serializable autocommit
fails with zero writes. This load-bearing correction is mechanically verified,
so a second review round is not required.

The review's secondary note observed that historical exact replay reconstructs
the original Party even if it is later merged. The existing reviewed store
returns exact replay before any Party or evidence write; altered reuse is hash-
conflict/rollback protected. No wrong binding or mutation path exists in this
slice, so that informational note requires no change.

Review session `af3584b4-78d8-430d-9e17-efa31f0aa6e6` used four unique Sonnet
model calls, 71,968 cache-create, 138,150 cache-read and 28,000 output tokens;
maximum context was 83,647 tokens with no usage warning.

## Not authorized or proven

- a production fingerprint algorithm/pepper migration for current email data;
- a real endpoint, transport authentication, network, credential or retry path;
- runtime wiring, live token, user or Heartbeat selection;
- Party creation/merge, external-reference, access, enrollment, entitlement,
  customer or provider mutation;
- production migration/database use; or
- deployment or live outcome.

## Rollback

The proposal validator/receiver and tests are unregistered source. Reverting
them removes the Company OS side. The generated database is dropped after the
proof and the neutral artifact is temporary, so no live state needs
compensation.
