# NC-20260907-005 bounded review response R1

Reviewer: Claude Code Sonnet/high, fresh session
Scope: the seven allowed artifacts named in
`docs/reports/NC-20260907-005-CLAUDE-REVIEW-REQUEST-R1.md`. No Bash, network,
MCP, or other repository file was used.

## Finding 1 — Heartbeat existence claim for the two supervision offers lacks an evidence citation, unlike the parallel PCC claim in the same packet

**Where:** `docs/work-packets/NC-20260907-005-FIRST-APPLICATION.md`, "Exact
proposed fixture" table, rows `Heartbeat observations` ("declared group exists;
declared course exists in native list and managed source") and `Heartbeat
relationship limit`, applied identically to both `supervision-inaugural` and
`supervision-regular`.

**Contrast:** `docs/reports/NC-20260907-005-TECHNICAL-GAP-RESOLUTION.json`,
`resolutions[]`. Every other claim in the fixture table has a matching
resolution entry with an `evidence.method`, native IDs, and an explicit status
(`stripe_account_alias`, `supervision_product_default_price_identity`, and even
the unrelated `pcc_practice_test_group_course_attachment`, which names a
`native_course_id`, a `candidate_group_id`, and its evidence method). No entry
resolves Heartbeat group/course existence for the CSS supervision offers
themselves — there is no `gap_id`, native group/course ID, evidence method, or
`observed_at` for this specific claim anywhere in the allowed corpus.

**Why it matters:** `docs/STUDENT-CATALOG-PUBLICATION-CONTRACT.md`'s authority
table requires, for exactly this fact class, "Store separate existence
observations" before publication treatment, and the "Required typed reference"
table makes `evidence_ref`/`observed_at` mandatory for any provider-backed
claim. `FIRST-APPLICATION.md`'s "Future implementation prerequisites" list
(items 1-7) enumerates the account-alias probe as an explicit required gate
(item 3) but has no analogous item requiring that the CSS supervision
Heartbeat group/course existence be observed and recorded before it enters the
fixture. As written, the claim sits in the same table, with the same
declarative confidence, as facts that do have cited native evidence — creating
a real risk that an implementer copies it into the future coordination
manifest at a `relationship_status` stronger than the evidence supports (e.g.
`source_declared` or `accepted` rather than `candidate`/`unverified`), which
the contract's own manifest-rejection rule ("relationship states stronger than
their evidence permits") is designed to prevent only if the missing citation is
caught first.

**What would close it:** either cite the specific evidence (native
group/course IDs, read method, observation time) already used to write
"declared group exists ... in native list and managed source" for these two
offers, the same way the PCC gap entry does, or add an explicit prerequisite
step (parallel to the alias probe) requiring that observation before the
Heartbeat facts for `supervision-inaugural`/`supervision-regular` enter any
future fixture.

## Reviewed and found consistent (no material finding)

- Authority-separation table and the "current authority" / "publication
  treatment" columns do not copy source facts into a new master anywhere in
  the packet.
- `nanoclaw-v1-exact` compatibility-profile bullets in the contract match
  `resolveProductIdentity`/`compileProductBindings` in
  `tools/contador/lib/product-identity.cjs` line-for-line: duplicate-index
  rejection, scope-conflict vs. identity-conflict branching, projection
  conflict on a differing live Product Map target, and legacy fallback for an
  entirely unregistered population.
- The account-alias treatment (`stripe:alt` native identity vs. `tandem`
  consumer key) is stated identically and correctly hedged across the
  contract, the work packet, and the gap-resolution JSON; none of the three
  claims the alias is proven.
- Native default-price identity vs. native amount/recurrence is consistently
  scoped as verified-identity-only, unverified-amount, in all three documents;
  the installment arithmetic in the fixture table (4 × 99,900 = 399,600; 4 ×
  119,900 = 479,600) is correct.
- Non-atomic cross-repository activation, partial-failure handling, and
  rollback are stated compatibly between the contract and the work packet,
  including that an earlier consumer's activation does not imply the later
  one's.
- Deterministic-payload scope correctly excludes the receipt's wall-clock
  fields from the hashed envelope, and the file paths/responsibilities table
  matches between the contract and the work packet.
- D-01, D-02, and D-05 in `NC-20260907-005-BUSINESS-DECISIONS.md` are genuine
  business-promise or operational-policy questions; D-03 and D-04 are
  correctly kept out of the owner-decision queue as evidence/provenance work,
  consistent with the contract's "no invented owner decision" rule.
- All hex identifiers checked (four Git revisions, two catalog-input digests,
  one checkout-file digest) are well-formed 40- or 64-character hex strings;
  no truncation or formatting defect found.
- Implementation-entry and activation-exit conditions in `FIRST-APPLICATION.md`
  ("Implementation entry and activation exit") are internally consistent with
  the contract's six-state coverage vocabulary and this task's own
  "unapplied" status.
