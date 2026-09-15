# Tandem Identity Google Account-Claim Dark Foundation

Status: source-only and unwired; verified with synthetic data and disposable
PostgreSQL only

Task: `NC-20260914-006`

## Outcome

This slice proves the smallest authenticated linkage mechanism needed after the
12 difficult Heartbeat proof cases. A recent, email-verified Google Identity
Platform session can carry one explicit Heartbeat-user selection to one already
existing Tandem Party. The claim is accepted only when the caller supplies one
exact candidate Party and every ambiguity, shared-identifier, conflict, role and
scope guard is closed.

The mechanism does not discover a person from email, name, purchase, group or
payment similarity. The verified-email hash is evidence inside the claim, not a
matching key. Without an accepted claim, the C02-shaped fixture remains
ambiguous and held. After acceptance, the existing D0 resolver can use the
durable `accepted_claim` fact and return `resolved_claim_or_operation`.

## Concrete contract

The strict version-1 claim contains:

- one Firebase UID under the exact Google secure-token issuer and project;
- one explicit environment and source scope equal to that project;
- one scoped Heartbeat user reference in the same environment class;
- one existing target Party selected by explicit provider subject;
- participant, staff or payer role plus an explicit payer/learner relationship;
- a Google authentication time no more than five minutes before issue;
- an expiry no more than ten minutes after issue;
- bounded evidence references and a canonical SHA-256 over the complete body.

Acceptance additionally requires a strict runtime context: one exact candidate
Party, no shared identifier, no open identity conflict and, for a separate payer
path, an explicit seat relationship. Missing context fails schema validation.
The first slice deliberately has no generalized identity-provider abstraction
and no `claim_available` intermediate state.

## Durable dark write

`applyGoogleAccountClaimWithClient` is an admin-only injected-transaction
function. It is not imported by the NanoClaw runtime. On an accepted synthetic
claim it uses only migration 167 to append:

1. a dark Google adapter registration;
2. one authenticated event receipt and one related Heartbeat reference;
3. one accepted `auth_accounts` subject-to-Party binding; and
4. one `identity_resolution_decisions` row with
   `resolved_claim_or_operation` / `accepted_claim`.

The function takes a transaction-scoped advisory lock, rejects reuse of a claim
ID with a different payload, refuses a previously observed Google subject, and
checks the target Party still exists and is not merged. An existing adapter
scope cannot be silently moved between environments. Exact receipt replay
verifies the associated auth binding, decision and related reference, then
returns a zero-write duplicate. Any late constraint failure rolls back the
whole transaction.

The function has no network, environment-variable, credential, Firebase Admin,
HTTP, provider-toolbox or runtime dependency. It has no Party, external
reference, provider-attempt, desired-access, enrollment, entitlement or
customer-facing writer. No migration 168 exists.

## Verification contract

The focused proof must establish:

- C02-shaped ambiguity before the claim and D0 accepted-claim resolution after;
- exact replay as a zero-write no-op and altered claim-ID reuse as refusal;
- expiry, issuer, environment, shared-identifier, multiple-candidate, open-
  conflict, payer/learner and email-only failure behavior;
- a strict caller context and a body-bound claim hash;
- disposable PostgreSQL accepted write, readback and exact replay;
- rollback after a late unique conflict;
- fail-closed adapter scope/environment reuse;
- unchanged Party, external-reference and provider-attempt counts; and
- no production runtime import, credential/network surface or new DDL.

The PostgreSQL proof creates and destroys a generated local database from the
existing disposable D2 harness. It contains synthetic IDs and hashes only.

## Current verification

Pinned Node 22.23.2 verification produced:

- 20/20 focused evaluator, boundary and disposable-PostgreSQL tests;
- passing format check, TypeScript typecheck, build and documentation
  continuity;
- full suite: 4,422 passed, 32 skipped and 20 failed, with no identity-control-
  plane failure;
- the established unrelated baseline accounts for 19 failures; the additional
  Academy Capacity disposable timeout passed immediately in isolation (2/2),
  so the effective comparison is 4,423 passed with the same 19 baseline
  failures.

The disposable test now explicitly exercises missing-Party refusal, reuse of a
Google subject under a distinct claim ID, cross-environment adapter collision,
altered claim-ID reuse, exact replay and late-conflict rollback. Every refusal
leaves the receipt, related-reference, auth-account, decision and adapter counts
unchanged.

## Independent review

One bounded Claude Sonnet/high round reviewed the evaluator, store, tests, D0
resolver and relevant migration-167 constraints. It found no behavioral defect
and one moderate proof gap: `target_party_unavailable` and
`auth_subject_already_observed` were correct by inspection but lacked negative
tests. Both paths are now exercised against disposable PostgreSQL with exact
zero-write readback. The correction is mechanically verified, so a second
review round is not warranted.

Session `b7f57971-d2bc-472f-bd64-de4aa6a0c1d0` used 13 unique model calls,
113,010 cache-create, 965,527 cache-read and 13,591 output tokens. Maximum
context was 119,643 tokens, above the 100k bounded-review target; this is an
orchestration warning, not additional product evidence. The request and
response are retained under `docs/reports/NC-20260914-006-CLAUDE-REVIEW-*`.

## Not authorized or proven

- verification of a real Google ID token, signed BFF-to-Company-OS transport,
  key rotation, anti-CSRF/session UI or account-recovery behavior;
- Firebase/Firestore, Tandem Account or website runtime changes;
- deriving the candidate/conflict context from live canonical data;
- a real user claim, Party binding, production database write or migration;
- Heartbeat, Plutio, Encharge, Trafft, Chaos, Sertifier, Peri, Adyen or provider
  synchronization;
- Party creation/merge, external-reference, access, Plus/Pro, enrollment,
  entitlement, certificate, attendance or customer communication changes; or
- deployment, activation or provider-side proof.

The next gate is a disposable cross-repository integration in which the Tandem
Identity BFF verifies a fresh Google ID token, constructs the exact claim and
passes it over an authenticated, replay-safe transport while Company OS derives
all candidate and conflict facts itself. That requires a separate
minimum-sufficient checkpoint and authorization before any production path or
real account is introduced.

## Rollback

This branch is source-only, unregistered and undeployed. Reverting the source,
tests and documentation removes the mechanism. The disposable proof deletes its
generated database, so there is no persistent customer, provider, credential or
runtime state to compensate.
