# NC-20260826-004 — Provider identity reconciliation correction review R2 response

Reviewer: Claude Sonnet, high effort, independent pass, resuming from the R1
review.

Method: read-only inspection of exactly the allowed packet listed in
`docs/reports/NC-20260826-004-CLAUDE-CORRECTION-REVIEW-REQUEST-R2.md` — the
R1 response, the corrected `bindExternalRef`/`resolveExternalRef` in both
repositories, `bindExternalRefOrRecordConflict` and the Plutio/Encharge bind
paths, the Trafft customer/appointment bind loops and
`classifyTrafftIdentityWithClient`, and the named test portions. No Bash,
network, database, provider tool, credential, or out-of-packet file was
used. No source was edited. This response is the only artifact produced.

## Verification of each correction

1. **Per-row conflict isolation.** `bindExternalRefOrRecordConflict`
   (`relationship-context-provider-reconciliation.ts:160-211`) catches only
   `Error` with message `relationship_context_external_ref_conflict` and
   rethrows everything else unchanged; on that specific conflict it resolves
   the existing owner, writes an `ensureIdentityException` with
   `reasonCode: 'external_ref_conflict'` and both candidate Party IDs, and
   returns `false` instead of throwing. All four call sites (Plutio loop at
   `:256`, Encharge bind at `:586`, Trafft customer loop at
   `relationship-context-trafft-shadow.ts:512`, Trafft appointment loop at
   `:594`) route through it, so no bind conflict aborts the run. **Verified
   — matches the claim, and other error types (e.g.
   `relationship_context_party_unknown`) still propagate and abort, per the
   `!(error instanceof Error) || error.message !== ...` guard.**
2. **Every appointment ID reaches a terminal, distinctly-reasoned
   classification.** `classifyTrafftIdentityWithClient`'s query
   (`relationship-context-trafft-shadow.ts:662-683`) now groups by
   `i.source_id` alone with no `customer_id`/`party_count` filter, so every
   distinct Trafft appointment ID is included exactly once regardless of
   customer ID presence or Party-count. The JS classification
   (`:700-718`) assigns a distinct reason per case: `missing_customer_id`,
   `customer_id_conflict`, `party_count_conflict`,
   `exact_ref_source_conflict`, `uncorroborated_unique_historical_party`, or
   `exact_reference_bound`. **Verified against the integration test's
   `missingCustomerParty`/`appt-missing-customer-pg` fixture (metadata with
   no `customerId` at all): it is correctly counted in
   `legacyAppointmentReferences` and produces a
   `no_action`/`legacy_identity` row, closing R1 Finding 2 exactly.**
3. **Unresolved appointments persist before being counted.** In the
   `!resolved` branch (`:719-736`), `ensureIdentityException` is called
   first (guaranteeing the fingerprint row exists), then the terminal
   `UPDATE ... WHERE fingerprint=$1` runs, and `update.rowCount !== 1`
   throws for the unresolved case (`:773-775`). **Verified functionally by
   the integration test's "limited" pass: `readRows`/`ingestTrafftShadowRows`
   is capped at `limit: 1`, yet `classifyTrafftIdentityWithClient` (which is
   intentionally unbounded) durably persists all 4 legacy appointments —
   the `party_identity_exceptions` count query independently confirms
   `4` rows with `status='no_action'`. This directly demonstrates the fix
   for R1 Finding 3 (durability outside the ingestion window), not just an
   assertion about it.** (Resolved rows do not call `ensureIdentityException`
   and are not rowCount-checked; that is consistent with the correction's
   own wording, which scopes the guarantee to "an unresolved appointment,"
   and is sound because a resolved appointment's durable record of truth is
   the `party_external_refs` row, independently verified by the
   `exactCustomerReferences`/`exactAppointmentReferences` COUNT queries at
   `:617-633`, not the exceptions table.)
4. **Canonicalized reads, single-canonicalization writes.** Both
   `InMemoryRelationshipContextRepository.resolveExternalRef`
   (`relationship-context-store.ts:187-192`) and
   `PostgresRelationshipContextRepository.resolveExternalRef` (`:425-441`)
   now resolve through `canonicalParty`/`canonical_party_id()` before
   returning. `PostgresRelationshipContextRepository.bindExternalRef`
   (`:443-494`) computes `inputCanonical` once, then does a single
   `INSERT ... ON CONFLICT ... RETURNING`, replacing the previous
   post-write `resolveExternalRef` + two `canonicalParty` reads — 2 round
   trips instead of 4. **Verified directly: `relationship-context-store.test.ts`'s
   "rebinds a reference to the winner after its Party is merged" test calls
   `resolveExternalRef` immediately after a merge, with no intervening
   rebind, and gets the canonical winner. The integration test repeats this
   at the Postgres level against the actual `appt-safe-pg` appointment
   reference right after `fn_merge_parties`, before any
   `bindExternalRef` call (`:439-446`) — this is the exact untested gap
   flagged in R1 Finding 4 / Finding 6.2, now closed with a real assertion,
   not just a customer-type re-bind.**
5. **Steady-state skip + scale evidence.** The Plutio query now
   left-joins existing active refs and only surfaces rows where none
   exists or the canonical Party differs
   (`relationship-context-provider-reconciliation.ts:238-249`); the Trafft
   customer and appointment loops skip the bind call outright when
   `existing_party_id === party_id`
   (`relationship-context-trafft-shadow.ts:509-511`, `:591-593`). This is
   only safe because of correction 4 (canonicalized reads mean a skipped,
   still-stale-looking row is not actually stale). **Verified against the
   new integration test "bounds first-run Plutio import and isolates a
   conflicting ref": 1,400 fresh Plutio refs plus 1 pre-existing
   different-Party conflict; first run completes in under 10s
   (`exactPlutioReferences >= 1402`, `plutioReferenceConflicts === 1`), and
   the replay completes in under 2s with identical counts, one persisted
   exception, and no valid ref lost. This is real, at-scale evidence, not
   a restated claim — it substantively closes R1 Finding 5.**
6. **Test coverage.** Each of the five named coverage gaps has a
   corresponding, directly-inspected test: per-row isolation
   (`relationship-context-provider-reconciliation.test.ts` "isolates a
   different-Party ref collision" + the integration test's 1,400-row
   variant), pre-rebind canonical read (`relationship-context-store.test.ts`
   "rebinds a reference to the winner after its Party is merged" +
   integration-level equivalent), missing-customer legacy (integration
   test's `missingCustomerParty` fixture), ingestion-limit-excluded
   exception durability (integration test's `limit: 1` pass), and
   scale/replay (the 1,400-row test). The pass-count claims
   ("Focused 31/31, typecheck, and PostgreSQL 3/3") were not independently
   re-executed (Bash/test execution is outside this review's allowed
   tools), but every test file named in the packet was read in full and its
   assertions were traced by hand against the corrected source, including
   working through the integration test's cumulative fixture state across
   its five sequential `ingestTrafftRelationshipContextShadowWithClient`
   calls to confirm the reported counts (3/4 → 3/4 → 2/3 →
   `{no_action: 3, resolved: 1}`) are internally consistent with the
   corrected classification logic rather than merely plausible.

## Residual, non-material observation

A conflicting Trafft customer-type external ref
(`bindExternalRefOrRecordConflict` inside the customer loop) and the
appointment it blocks from ever reaching an exact ref
(`classifyTrafftIdentityWithClient`, reason
`uncorroborated_unique_historical_party`) produce two separate
`party_identity_exceptions` rows on two different fingerprints for what is
one underlying cause. Both rows are individually accurate, neither
misrepresents state, and nothing in the six corrections asked for
single-row consolidation. Not material; noted only for completeness.

## Verdict

**NO MATERIAL FINDINGS.**

All four R1 material findings (per-row conflict isolation, complete
appointment classification coverage, durable legacy persistence beyond the
ingestion window, and canonicalized merge-safe reads) are closed and
independently demonstrated by tests that exercise the exact previously-gapped
paths — not merely re-asserted. The R1 scale concern (Finding 5) is
substantively mitigated (round trips halved, steady-state work skipped) and
validated against a 1,400-row Postgres fixture within the stated time
bounds. The R1 test-coverage gap (Finding 6) is closed. No identity,
privacy, transaction, or provider-action boundary was weakened to achieve
any of this: conflicts are still never forced through, no raw provider
payload handling changed, the same transactional wrapper is used, and no
new provider-mutation capability was introduced.
