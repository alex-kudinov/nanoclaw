# NC-20260914-007 bounded identity proposal review request R1

## Decision requested

Review only the new participant-proposal and Company OS server-derived context
boundary. Report material defects that could let an unverified/stale BFF session
produce a proposal, let the BFF select a Party or suppress conflict, accept
cross-scope/time/role data, race canonical context, bind/replay the wrong Party,
leave partial durable state, or escape the generated-disposable-only boundary.

Write only:

`docs/reports/NC-20260914-007-CLAUDE-REVIEW-RESPONSE-R1.md`

For each material finding, cite exact file/line, give the concrete failure path
and smallest correction. If none, write `NO MATERIAL FINDINGS` and briefly list
the load-bearing checks performed. Do not edit implementation or any other file.

## Objective

Prove a network-free cross-repository traversal:

1. Tandem Identity's existing `/api/session` sequence verifies the injected raw
   Firebase token, verified email and recent authentication before calling its
   injected identity gateway.
2. A test gateway converts only that `LoginObservation` into a strict
   participant-only proposal with no Party ID or conflict authority.
3. Company OS independently validates the proposal, requires one serializable
   generated-disposable transaction, derives candidates/open conflict from its
   own migration-137 state and invokes the existing reviewed migration-167
   account-claim store only for exactly one unmerged verified candidate with no
   exception.
4. Exact replay is zero-write; altered/conflicting/ambiguous paths fail closed.

## Accepted simplification and non-objectives

Fresh S2 necessity review returned `REMOVE` on bespoke HMAC. Do not reopen that
decision for this proof. There is no real endpoint, so a public fixture key
would prove shared test data rather than transport authentication while adding
premature signing/key-custody obligations.

- No HMAC/signature/key ID/custom canonical signing.
- No second raw-token verifier or Firebase client in Company OS.
- No endpoint, network client, bearer token, credential, Secret Manager, retry,
  circuit breaker or runtime import.
- No shared package or second checked-in fixture copy.
- No staff/payer proposal, Party creation/merge, external-reference, access,
  enrollment, entitlement, customer or provider write.
- No migration/DDL, real account, production database or deployment.

This slice proves BFF verification ordering, schema interoperability and
Company OS identity authority. It explicitly does not prove authenticated
service-to-service transport. A later topology decision must select a standard
transport identity or envelope.

## Accepted existing facts

- The existing dark internal Google claim and migration-167 store were reviewed
  under `NC-20260914-006`; do not reopen their internals.
- That store rejects every database except
  `nc_tandem_identity_d2_test_*`, performs exact replay completeness checks and
  has no Party/ref/access/provider writer.
- Migration 137 defines `party_identifier_claims` and
  `party_identity_exceptions`; migration 167 defines the receipt/auth/decision
  records. Neither migration changes in this slice.
- Existing `/api/session` order in `src/app.ts`: same-origin/CSRF, strict body,
  `auth.verifyIdToken`, verified email, recent auth,
  `identityGateway.observeLogin`, session-cookie creation.

## Allowed read paths

1. `docs/reports/NC-20260914-007-CLAUDE-REVIEW-REQUEST-R1.md`
2. `/Users/xbohdpukc/dev/tandem-identity-claim-proposal-20260914/src/account-claim-proposal.ts`
3. `/Users/xbohdpukc/dev/tandem-identity-claim-proposal-20260914/src/app.ts`
4. `/Users/xbohdpukc/dev/tandem-identity-claim-proposal-20260914/tests/account-claim-proposal-boundary.test.ts`
5. `src/identity-control-plane/google-account-claim-proposal.ts`
6. `src/identity-control-plane/google-account-claim-proposal-store.ts`
7. `src/identity-control-plane/google-account-claim-proposal-boundary.test.ts`
8. `docs/IDENTITY-CONTROL-PLANE-CLAIM-PROPOSAL-DISPOSABLE.md`

All other paths, environment/config files, credentials, auth stores, provider or
user data are forbidden.

## Current evidence

- Tandem Identity baseline plus feature: 44 passed, four Firestore integration
  tests intentionally skipped; typecheck and build pass under Node 22.
- NanoClaw focused proposal/artifact/disposable proof: 19/19 passed.
- Exact neutral artifact: 880 bytes, mode 0600, SHA-256
  `8dc277b4f6bc06e3233329cc64e7bb4708051343686c090d4d259f45ef356c66`;
  it contains no email address, token, Party/conflict field or credential.
- NanoClaw format, typecheck, build and docs continuity pass.
- NanoClaw full suite: 4,435 passed, 33 skipped, 20 failed. Nineteen failures
  are the established unrelated baseline; the additional payment-method
  concurrency failure passed immediately in isolation (11/11). No identity-
  control-plane failure occurred; effective comparison is 4,436 passed with the
  same 19 baseline failures.

## Load-bearing questions

1. Does the proposal builder actually depend on the existing verified/recent
   `LoginObservation` ordering without making itself a callable auth bypass or
   leaking raw email?
2. Are the two independent strict schemas semantically compatible while making
   Party/conflict authority and staff/payer roles unrepresentable?
3. Can policy timestamps, proposal fields or a prior decision cause the receiver
   to derive/replay the wrong Party or bypass exact Heartbeat scope?
4. Does checking `current_setting('transaction_isolation')='serializable'`,
   locking the read rows, and requiring the caller-owned transaction adequately
   support the stated snapshot/atomicity claim? Identify any concrete race that
   violates the result, not merely future runtime hardening.
5. Can zero/multiple verified candidates, merged Parties, open exact-reference
   exceptions, UUID collision, altered replay or a late migration-167 failure
   leave new evidence or a binding?
6. Does any evidence label or documentation falsely imply authenticated live
   transport despite the explicit disposable boundary?
