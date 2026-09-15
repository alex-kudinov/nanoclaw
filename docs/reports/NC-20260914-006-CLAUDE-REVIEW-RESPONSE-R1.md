# NC-20260914-006 bounded auth and identity review response R1

## Finding 1 (moderate — missing negative case, not a proven behavioral defect)

Two of the store's guards that stand directly between "the wrong Google
subject binds to a Party" and "partial/conflicting durable state" have zero
test coverage anywhere in the allowed packet:

- `target_party_unavailable` —
  `src/identity-control-plane/google-account-claim-store.ts:271-278`
  (rejects a claim whose `targetPartyId` does not exist or has
  `merged_into IS NOT NULL`).
- `auth_subject_already_observed` —
  `src/identity-control-plane/google-account-claim-store.ts:279-291`
  (rejects a second, differently-`claimId`'d claim that reuses the same
  `(issuer, environment, source_scope, subject)` Google subject after a prior
  claim already exists for it).

`src/identity-control-plane/d2-student-lifecycle-shadow.disposable.test.ts:524-735`
is the only test in the packet that exercises
`applyGoogleAccountClaimWithClient`, and it never constructs a fixture that
hits either branch: every claim in that test uses a target Party that exists
and is unmerged (`1` or `2`), and every claim that reuses `claimId`
`...000002` is an exact-payload replay (short-circuited earlier by the
`deduplication_key` lookup, `google-account-claim-store.ts:202-264`), never a
second distinct `claimId` against the same Google subject.
`google-account-claim.test.ts` only exercises the pure evaluator
(`evaluateGoogleAccountClaim`), not the store, so it cannot cover these
branches either.

I read both guards and found the logic correct by inspection (merged-Party
exclusion via `merged_into IS NULL`; subject reuse via an unscoped `FOR SHARE`
lookup keyed on `issuer, environment, source_scope, subject`, independent of
`account_state`), and confirmed the surrounding transaction/rollback wiring
that a `fail()` throw here would propagate to the caller's `ROLLBACK` exactly
as it does for the two conflict paths that already are under test
(`adapter_scope_environment_conflict`, the late `decision_uuid` collision).
So this is not a defect I can currently demonstrate — it is a coverage gap on
exactly the two properties Q1/Q2 ask about (wrong-Party binding, missing/
merged-Party partial state), which is why I'm surfacing it under Q5 rather
than staying silent.

**Smallest correction:** add two cases to the existing
`d2-student-lifecycle-shadow.disposable.test.ts` "atomically accepts one
explicit Google claim..." block: (a) a claim with a `targetPartyId` that does
not exist (or is merged) and assert `applyGoogleAccountClaimWithClient`
rejects with `target_party_unavailable` and leaves counts unchanged; (b) an
accepted claim followed by a second, distinct `claimId` for the same
`googleSubject` (different `targetPartyId` or same) and assert rejection with
`auth_subject_already_observed` and unchanged counts.

## Load-bearing properties checked and found sound

1. **Wrong-Party binding / email-as-authority (Q1).** `targetPartyId` must
   equal the sole entry of a caller-supplied `candidatePartyIds` set
   (`google-account-claim.ts:192-200`); `verifiedEmailSha256` is carried
   through the envelope but never read by the evaluator or store as a
   matching key — no email-similarity path exists.
2. **Project/environment/scope crossing (Q1).** Issuer is derived and
   compared exactly against `projectId`
   (`google-account-claim.ts:177-183`); `sourceScope` must equal `projectId`;
   `heartbeatRef.environment` must equal `googleSubject.environment` exactly
   (no same-class collapsing at the evaluator level). Cross-environment reuse
   of one adapter scope is independently fail-closed at the store layer via
   the conditional `ON CONFLICT ... DO UPDATE ... WHERE environment =
   EXCLUDED.environment` in `registerAdapter`
   (`google-account-claim-store.ts:125-166`), proven by the
   `crossEnvironmentClaim` case in the disposable test.
3. **Replay/altered-reuse/global UUID collision (Q2).** Exact replay is a
   verified no-op (evaluator: `google-account-claim.ts:148-159`; store:
   `google-account-claim-store.ts:219-264`, checked for complete evidence
   before returning `duplicate`). Altered reuse of a consumed `claimId`
   is rejected before any write in both the evaluator
   (`CLAIM_ID_PAYLOAD_CONFLICT`) and the store (`claim_id_payload_conflict`,
   which throws pre-write). A late collision on the global
   `decision_uuid` unique constraint rolls back the whole write set, verified
   by the disposable test's `afterFailure` readback.
4. **Migration 167 evidence contract (Q4).** The append receipt uses
   `fn_tandem_identity_store_event_receipt`'s `ON CONFLICT ... DO NOTHING` +
   union-fallback idempotency pattern bound to the same
   `(provider, environment, source_scope, deduplication_key, payload_sha256)`
   uniqueness the store checks first; `auth_accounts` and
   `identity_resolution_decisions` inserts satisfy the migration's
   version-monotonic, binding-basis, and result/resolution-basis coupling
   constraints (`account_version=1` with no prior row;
   `result='resolved_claim_or_operation'` paired with
   `resolution_basis='accepted_claim'`); all target tables carry the
   append-only trigger. No field in the writes bypasses a `CHECK` I could
   find in the migration text.
5. **Dark/disposable boundary (Q3).** `assertDarkDisposableDatabase` gates
   every call on a `nc_tandem_identity_d2_test_*` database-name regex before
   any other statement; the boundary test independently regex-scans both
   source files for network/credential/env-var access and confirms `index.ts`
   never imports this module.

No other material defect found.
