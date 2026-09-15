# NC-20260914-006 bounded auth and identity review request R1

## Decision requested

Review the smallest load-bearing implementation of the dark Google account-
claim foundation. Report only material defects that could let the wrong Google
subject bind to a Party, accept ambiguous/conflicting evidence, cross scope or
environment, create partial/repeated durable state, or escape the explicitly
disposable-only boundary.

Write the response only to:

`docs/reports/NC-20260914-006-CLAUDE-REVIEW-RESPONSE-R1.md`

Order findings by consequence. For each finding, cite exact file and line or
specific evidence, explain the failing path, and give the smallest correction.
If there is no material defect, write `NO MATERIAL FINDINGS` and briefly state
which load-bearing properties you checked. Do not edit implementation or any
other file.

## Objective

Prove one concrete, normalized Google Identity Platform claim that can link one
explicitly selected Heartbeat user to one already-existing Tandem Party only
after all ambiguity, shared-identifier, conflict, role, scope and freshness
guards close. Before the claim, the C02-shaped fixture must remain ambiguous.
After acceptance, the existing D0 resolver may use `accepted_claim` to return
`resolved_claim_or_operation`.

## Non-objectives and prohibited expansion

- No generalized identity-provider abstraction or `claim_available` state.
- No token verifier, BFF, UI, Firebase/Firestore, HTTP, network, credentials,
  signing, key management or production transport.
- No real account, customer, Party creation/merge, external-reference write,
  access/enrollment/entitlement/customer/provider write or provider attempt.
- No migration 168, runtime import, release, deployment or activation.
- Do not require the current slice to solve future token verification or
  server-side context derivation; identify only an interface choice that makes
  those future controls impossible or unsafe to add.

## Accepted authority and constraints

- Migration 167 is the existing persistence contract and must not be changed in
  this slice.
- The store must remain locked to generated databases named
  `nc_tandem_identity_d2_test_*`; this is deliberate defense against accidental
  use on the production database.
- The claim payload hash is an internal integrity/replay binding, not a
  cryptographic authentication mechanism. A future BFF must verify the Google
  token and authenticate transport before calling any production successor.
- The supplied candidate/conflict context is trusted only inside this synthetic
  proof. A future production successor must derive it from canonical server-side
  data in the same protected transaction.
- An accepted auth-account mapping is intended to persist beyond the ten-minute
  claim window. The window limits claim creation/consumption, not account
  lifetime.
- Exact replay may return a historical duplicate without re-evaluating current
  ambiguity because it performs no new write or binding; altered reuse must
  fail.
- Claim IDs are expected to be server-generated UUIDs. Reuse of the same UUID
  in the global resolution-decision namespace must fail and roll back.

## Allowed read paths

1. `docs/reports/NC-20260914-006-CLAUDE-REVIEW-REQUEST-R1.md`
2. `src/identity-control-plane/google-account-claim.ts`
3. `src/identity-control-plane/google-account-claim-store.ts`
4. `src/identity-control-plane/google-account-claim.test.ts`
5. `src/identity-control-plane/google-account-claim-boundary.test.ts`
6. `src/identity-control-plane/d2-student-lifecycle-shadow.disposable.test.ts`
7. `src/identity-control-plane/resolver.ts`
8. `data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`

All other repository paths and all environment, credential, auth-store, user or
provider data are forbidden.

## Current evidence

- Pinned Node 22.23.2 typecheck passes.
- Focused evaluator, structural-boundary and disposable-PostgreSQL suites pass:
  3 files, 20 tests.
- The disposable path proves accepted append, exact replay with zero writes,
  altered claim-ID refusal, rollback after a late global decision collision,
  and fail-closed reuse of one adapter scope across environment classes.
- Party, external-reference and provider-attempt counts remain unchanged.
- Format, build and documentation continuity pass.
- Full suite: 4,422 passed, 32 skipped and 20 failed. Nineteen failures are the
  established unrelated baseline; the additional payment-method concurrency
  failure passed immediately when rerun in isolation (11/11). No identity-
  control-plane test failed.

## Load-bearing questions

1. Can any accepted evaluator path bind the wrong target Party, cross the Google
   project/environment or Heartbeat scope, or use email similarity as authority?
2. Can exact/altered replay, concurrent subject claims, adapter upsert behavior,
   a missing/merged Party or a late SQL failure create partial or conflicting
   evidence under the caller-owned transaction?
3. Does any function or test accidentally make production/runtime/network/
   credential use possible in this dark slice despite the database-name guard
   and absence from `src/index.ts`?
4. Does the appended receipt/auth/decision evidence satisfy migration 167's
   manifest, append-only, version, result/basis and evidence-hash constraints?
5. Is a missing negative case material enough that the current success claim is
   not supported, rather than merely desirable future coverage?
