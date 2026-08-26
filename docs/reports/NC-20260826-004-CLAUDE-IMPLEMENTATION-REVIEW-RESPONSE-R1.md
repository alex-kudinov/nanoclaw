# NC-20260826-004 — Provider identity reconciliation review R1 response

Reviewer: Claude Sonnet, high effort, independent pass.

Method: read-only inspection of exactly the allowed packet listed in
`docs/reports/NC-20260826-004-CLAUDE-IMPLEMENTATION-REVIEW-REQUEST-R1.md`.
No Bash, network, database, provider tool, credential, `.env*`, runtime
store, or out-of-packet file was used. No source was edited. This response
is the only artifact produced.

## Answers to the review questions

1. **Wrong-Party binding via ambiguity/duplicate IDs/merge lineage/ordering:**
   partly — see Findings 1 and 4. Genuine per-customer/per-Party ambiguity
   (one Trafft customer ID across >1 canonical Party) is correctly detected
   and excluded (`party_count=1` gate,
   `relationship-context-trafft-shadow.ts:482`); the integration test's
   "ambiguous" and "safe merge" fixtures confirm this. The residual risk is
   narrower: a stale, non-canonicalized read (Finding 4) and no per-row
   isolation on a genuine external-ID collision (Finding 1).
2. **Truthful evidence-tier distinction:** yes for the tiers that are
   reached, but see Finding 2 — rows that never reach any tier (no
   `customerId`, or an internally inconsistent per-appointment party count)
   are silently dropped rather than classified `legacy`, contradicting the
   accepted outcome's "whatever remains will be called legacy."
3. **Replay safety of observations/projections:** well covered by tests
   (duplicate observation dedup, `projectionsChanged` staying stable, the
   fixture's three-pass replay in the integration test). See Finding 3 for
   a durable-classification gap that is a replay/coverage-window issue, not
   a duplication issue.
4. **Raw PII reaching the snapshot/DB/logs/receipts:** no material finding.
   `prepareEnchargeSnapshot`, `parseEnchargeSnapshotFile`, and
   `normalizeTrafftShadowRow` all strip raw email/name/phone/payload before
   persistence, and both the unit and integration tests assert this
   (`not.toContain('customerEmail')`, `not.toContain('raw_payload')`, etc.).
5. **Encharge mutation/send leakage:** no material finding. NanoClaw's
   registry exposes only `encharge-read/bulk-get-people`,
   `include_shared` omits `encharge`, and the wrapper hardcodes the
   `bulk-get` subcommand with no way to smuggle a different one through
   `"$@"` (the shared script's `bulk-get)` case only parses
   `--json-file`/`--output-file`).
6. **Fail-closed and recoverable:** malformed snapshot, existing-output,
   and provider-call failure are all fail-closed and recoverable
   (`RelationshipContextContractError`, `O_EXCL` file guard, `try/catch` +
   degraded health). Different-family ref conflicts are fail-closed but
   **not** partial-batch recoverable — see Finding 1.
7. **Transaction size / sequential writes / scale safety:** not
   demonstrated at the stated scale — see Finding 5. The only automated
   evidence is a 2-row PostgreSQL fixture test; the 1,374/1,242/422-row
   path is fully sequential and unbatched.
8. **Test coverage of load-bearing negative paths:** gaps exist — see
   Finding 6, which lists the three negative paths implied by Q1/Q3/Q7 that
   no test in the packet exercises.

## Findings (material, most severe first)

### Finding 1 — No partial-batch isolation on external-ref binds; one collision aborts the whole reconciliation cycle
- **Files:** `src/relationship-context-provider-reconciliation.ts:188-209`
  (Plutio bind loop), `src/relationship-context-trafft-shadow.ts:494-519`
  and `:556-577` (Trafft customer/appointment bind loops); root cause in
  `src/relationship-context-store.ts:442-492`
  (`PostgresRelationshipContextRepository.bindExternalRef`).
- **Failure scenario:** `bindExternalRef` throws
  `relationship_context_external_ref_conflict` synchronously whenever an
  external ID is already bound to a canonical Party different from the one
  the current pass computes (a genuine, un-merged collision — e.g. a
  recycled Trafft `customerId`, not an ordinary Party merge, which
  self-heals via the canonical-aware `ON CONFLICT ... WHERE` clause). None
  of the three call sites wrap individual binds in a try/catch, so the
  throw propagates out of `ingestTrafftRelationshipContextShadowWithClient`
  and out of the single `withAgentContext` transaction that also holds the
  Plutio binds, the safe Trafft binds, the fact ingestion, and the legacy
  classification pass for that cycle. One bad identifier anywhere among the
  ~1,796 exact refs at current scale rolls back every valid binding and
  reclassification for that run, and the run repeats — and re-fails
  identically — every 15 minutes until an operator manually fixes the
  offending row. This is stricter than "best effort... whatever remains
  will be called legacy" requires: a genuinely resolvable customer should
  not be blocked by an unrelated collision elsewhere in the batch.
- **Bounded fix:** catch the conflict per external reference at each of the
  three call sites, route it to `ensureIdentityException` (already used
  elsewhere in the store contract) instead of aborting, and continue the
  loop so the rest of the batch still commits.

### Finding 2 — Appointments/customers without a resolvable `customerId`, or with an internally inconsistent per-appointment Party count, never receive a terminal classification
- **File:** `src/relationship-context-trafft-shadow.ts:608-634`
  (`classifyTrafftIdentityWithClient`), specifically the filter at line 631:
  `WHERE s.customer_id IS NOT NULL AND s.party_count=1`.
- **Failure scenario:** any Trafft interaction row where
  `metadata->'raw_payload'->>'customerId'` and
  `metadata->>'trafft_customer_id'` are both absent, or any
  (customer_id, appointment_id) pair whose own rows resolve to more than
  one canonical Party, is excluded from this query entirely. It is neither
  bound as an exact reference nor written to
  `business_v2.party_identity_exceptions` as `legacy_identity` — it simply
  never appears in either outcome, and is not counted in
  `legacyCustomerReferences`/`legacyAppointmentReferences`. This
  contradicts the accepted outcome's core promise that the unresolved
  remainder is *durably classified* `legacy`, not silently omitted.
- **Bounded fix:** add an explicit branch (or a second pass) that marks
  rows with a null `customer_id` or `party_count>1` as `legacy_identity`
  with a distinct `reason_code` (e.g. `missing_customer_id` /
  `party_count_conflict`) so every Trafft appointment reaches a terminal,
  durable state.

### Finding 3 — Classification's read window is unbounded while fact ingestion's write window is capped, so old backlog can be reported as legacy in health but never durably recorded
- **Files:** `src/relationship-context-trafft-shadow.ts:717-719`
  (`readRows` is `ORDER BY updated_at DESC, id DESC LIMIT $1`, default 1000,
  ceiling `TRAFFT_SHADOW_MAX_ROWS = 5_000`) versus `:607-634`
  (`classifyTrafftIdentityWithClient`'s query has no `LIMIT` and scans all
  of `business_v2.interactions`), combined with the bare
  `UPDATE business_v2.party_identity_exceptions ... WHERE fingerprint=$1`
  at `:657-670`, which has no existence check or `rowCount` verification.
- **Failure scenario:** `ingestTrafftShadowRows` (and whatever downstream
  logic creates `party_identity_exceptions` rows for `held`/`needs_identity`
  facts) only ever sees the most recent `limit` rows. Once total Trafft
  interaction volume exceeds that limit — an explicit, designed ceiling,
  not a hypothetical — older appointments that were never in a processed
  batch have no corresponding exception row. `classifyTrafftIdentityWithClient`
  still finds and evaluates them (its query is unbounded) and issues an
  `UPDATE ... WHERE fingerprint=$1` against a row that doesn't exist, which
  silently affects zero rows. The function's own return counts
  (`legacyCustomerReferences`, `legacyAppointmentReferences`) are computed
  independently of whether the `UPDATE` matched anything, so health reports
  a classification that was never actually persisted. At today's measured
  scale (400 appointments vs. default limit 1000) this is latent, not
  active — but it is exactly the boundary condition Q7 asks about, and it
  will surface silently as data grows toward the 5,000-row ceiling.
- **Bounded fix:** before the `UPDATE`, check `rowCount`; if zero, fall back
  to `ensureIdentityException` (already present in the store contract) so
  every classified row is guaranteed to persist, independent of which pass
  first observed it.

### Finding 4 — `resolveExternalRef` does not canonicalize, unlike `canonicalParty`, and is used directly by the new Trafft-shadow read path
- **Files:** `src/relationship-context-store.ts:424-440`
  (`resolveExternalRef`, contract context, returns the raw `party_id`
  column) versus `:416-422` (`canonicalParty`, which resolves through
  `canonical_party_id()`); consumed directly at
  `src/relationship-context-trafft-shadow.ts:270-276`
  (`ingestTrafftShadowRows` calls `resolveExternalRef` and treats a
  non-null result as authoritative for `exactIdentity`, feeding
  `identity_state: 'exact_reference'` into the persisted fact value at
  line 176).
- **Failure scenario:** `bindExternalRef` compensates for this asymmetry
  internally (it re-wraps both sides in `canonicalParty` before deciding
  whether a conflict occurred), but a bare read via `resolveExternalRef` —
  as `ingestTrafftShadowRows` performs on every row, every run — does not.
  Between a Party merge event and the next reconciliation cycle that
  happens to re-bind that exact reference, `resolveExternalRef` can return
  a superseded (merged-away) Party ID, and the code treats it as a
  currently-exact identity without re-checking. This is squarely the
  "merge lineage" scenario Q1 asks about, and it is not tested: the
  integration test's merge fixture re-binds and re-checks the *customer*
  reference immediately after the merge, but never exercises
  `resolveExternalRef` against the older *appointment* reference in the
  intervening (unresolved) state.
- **Bounded fix:** have `resolveExternalRef` resolve through
  `canonical_party_id()` before returning, matching `canonicalParty`'s
  behavior, so every caller — present and future — gets a canonical answer
  without needing to know about the merge-lineage hazard.

### Finding 5 — Exact-ref binding is fully sequential and unbatched inside one long-lived transaction, unlike the fact-ingestion paths
- **Files:** `src/relationship-context-provider-reconciliation.ts:188-209`;
  `src/relationship-context-trafft-shadow.ts:494-519`, `:556-577`; root
  cause `src/relationship-context-store.ts:442-492`. Contrast with the
  chunked-by-200 fact ingestion at
  `src/relationship-context-provider-reconciliation.ts:555-556` and
  `src/relationship-context-trafft-shadow.ts:266-267`.
- **Failure scenario:** each `bindExternalRef` call issues one `INSERT ...
  ON CONFLICT`, then (per lines 485-491) a `resolveExternalRef` SELECT plus
  two more `canonicalParty` SELECTs to verify the result — four sequential
  round trips per bind, none batched, all inside the single transaction
  opened by `withAgentContext`. At the evidence section's own measured
  scale (1,374 Plutio + up to 422 Trafft customer/appointment refs ≈ 1,796
  binds), that is on the order of 7,000+ sequential round trips per
  15-minute cycle, plus one `UPDATE` per (customer, appointment) pair in
  the classification pass on top. The only automated evidence offered for
  this path is a single-row PostgreSQL integration fixture — it does not
  exercise the round-trip count or transaction hold time at the stated
  production scale, so nothing in the passed evidence actually bounds the
  transaction duration or lock-hold time this design produces as the
  dataset grows toward `TRAFFT_SHADOW_MAX_ROWS`.
- **Bounded fix:** drop the redundant post-insert verification queries (the
  `INSERT ... RETURNING` can already report whether canonicalization
  changed) or batch the verification, and consider chunking the bind loops
  the same way the fact-ingestion loops already are.

### Finding 6 — Untested negative paths implied directly by Q1/Q3/Q7
- **Files:** `src/relationship-context-provider-reconciliation.test.ts`,
  `src/relationship-context-trafft-shadow.test.ts`,
  `src/relationship-context-store.integration.test.ts` (none of the three).
- **Gaps:**
  1. No test drives a genuine cross-Party external-ID collision through
     `reconcilePlutioReferencesWithClient` or `reconcileSafeTrafftReferences`
     to observe whether the run fails closed *and* preserves the rest of
     the batch (it does not — Finding 1).
  2. No test re-exercises `resolveExternalRef`/`ingestTrafftShadowRows`
     against an *appointment*-type reference that predates a Party merge
     and has not yet been re-bound (Finding 4) — the integration test's
     merge fixture only re-verifies the customer-type reference.
  3. No test exercises the `readRows` limit vs. unbounded-classification
     mismatch (Finding 3) — no test sets `limit` below the total
     interaction count while separately asserting on
     `party_identity_exceptions` durability for the excluded rows.

## Overall verdict

**Material findings: yes — 4 material (Findings 1-4), plus a durability
concern under load-bearing scale (Finding 5) and a test-coverage gap
(Finding 6) that lets Findings 1-4 pass today's evidence undetected.**
Privacy handling (Q4) and least-privilege tool exposure (Q5) are sound.
None of the findings above involve provider mutation, Party merge,
customer communication, payment/contract action, or broad minion access —
all remain within the reviewed, read-only packet.
