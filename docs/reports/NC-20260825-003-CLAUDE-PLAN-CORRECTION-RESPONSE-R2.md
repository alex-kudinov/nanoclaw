# NC-20260825-003 — Relationship Context plan correction review R2

Verdict: MATERIAL FINDINGS

Findings 2, 3, and 4 from R1 are closed. Finding 1 is closed on backfill
behavior but leaves the required conflict-refusal test unnamed.

## Finding 1 (partial) — Backfill conflict-refusal behavior is specified but has no distinctly named test

Evidence:

- Plan §2.1: "`ON CONFLICT` must make replay a no-op and a conflicting
  pre-existing scoped identity must abort the migration rather than silently
  change ownership." This closes the "safe, idempotent, conflict-refusing"
  behavior requirement.
- The migration's test-list sentence (§2.1, "Security and rollback") names
  `idempotent legacy-pair backfill/replay` explicitly — closing the
  idempotency test requirement — but the only other candidate word in that
  same list is `ambiguity`, with no qualifier tying it to the backfill.
- `ambiguity` is elsewhere in this same plan a precisely defined term for a
  different mechanism: §2.2 describes the core resolver's tri-state outcome
  as `ambiguous|needs_identity|not_found`, and §4 describes "shared/unverified
  claim returns ambiguity/hold." Both refer to claim/resolver-level
  ambiguity, tested in `relationship-context.test.ts` /
  `relationship-context-store.test.ts`, not to migration-time backfill
  conflict-abort.

Risk: as written, an implementer can satisfy the test-list literally by
testing only claim-resolution ambiguity (already required elsewhere) and
never write a test that a pre-existing conflicting `party_external_refs` row
correctly aborts the migration 137 backfill. That leaves the conflict-refusal
half of check item 1 asserted in prose but unproven — the same failure mode
R1 Finding 3 flagged for merge coverage ("one bullet" standing in for a
distinct, required proof).

Bounded correction: add a distinctly named test bullet to the §2.1 test list,
e.g. `legacy-pair backfill conflict refusal (pre-existing conflicting scoped
external ref aborts migration)`, separate from `ambiguity`, so the two
mechanisms cannot be conflated during implementation.

## Finding 2 — Closed

Plan §2.1's JSON-bound paragraph names all five required categories (adapter
manifest/config-declaration JSON, observation values, projection
values/missing/conflict codes, query-receipt requested/returned
sections/version/watermark maps, proposed Plutio field metadata), states the
explicit `octet_length(...::text) <= 8192` database bound, requires
source-contract validators to use "the same or stricter" bound before SQL,
and states oversized values fail closed rather than truncate. The test list
names `oversized JSON refusal` explicitly.

## Finding 3 — Closed

Plan §4 now reads: "merge tests cover conflicting identifier claims, duplicate
scoped external refs, open identity exceptions, rollback, and retry, and
prove separately that observations, current projections, query receipts, and
Plutio projection receipts retain original evidence while no active/current
authority in any of those four tables references only a tombstoned loser
Party." All required names (claims, refs, exceptions, observations,
projections, query receipts, Plutio receipts) are present, and the
survives-while-orphan-free proof is stated per table rather than as a single
collapsed bullet.

## Finding 4 — Closed

Plan §2.3 removes the work ID from the model-visible MCP schema entirely
("the model-visible schema has no work ID") and states the work ID's only
legitimate origin: "A host grant is created only after a future authorized
caller resolves one current durable Company Work/pipeline/case record and
binds its canonical work ID to the exact directory-derived group, host-minted
run ID, source container, purpose, subject, allowed sections, and expiry.
Dispatch looks up and consumes that grant, then copies its host-derived work
ID into the query receipt. No trusted host work record means no grant and
therefore denial." The §4 acceptance-test bullet restates this as a
requirement: "the request has no model-writable work ID; the query receipt's
work ID comes only from the exact consumed host grant."
