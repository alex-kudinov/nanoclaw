# NC-20260825-001 — Relationship Context correction review R2 — Claude response

Reviewer: Claude (independent, read-only per allowed packet)
Candidate: `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`
Scope read: `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`,
`docs/reports/NC-20260825-001-CLAUDE-DESIGN-REVIEW-RESPONSE-R1.md`.

## Verdict: MATERIAL FINDINGS (1, minor; carried forward from R1 finding 2)

## Check 1 — Booking email-first write path interim boundary: CLOSED

`docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` §9, the paragraph immediately
after the Slice table, states an explicit interim boundary: "Until D2 is
separately authorized, implemented, and live-verified, the existing Booking
write path remains historical production behavior and may continue to select
`best_party_by_email`; this design does not silently change it." Divergence
and backlog treatment are stated in the same paragraph: "every multi-Party
email candidate and every disagreement between the legacy selection and
proposed resolver becomes a privacy-minimal identity exception/divergence
receipt," and "D2 must ... reconcile the build-window backlog before
activation." The migration is separately gated: §9's D2 row is scoped as
"separate host behavior/schema authority; staged shadow comparison first; no
context capability activation while divergence remains unexplained," and
§12.8 makes the same condition an owner decision. Activation dependency is
stated twice (D2 row gate; end of §9 paragraph). R1 finding 1 is resolved.

## Check 2 — Slice B merge/write-guard semantics and tests for every new Party-scoped table: PARTIALLY CLOSED

**Section:** §4.2 (Required identity records), paragraph beginning "Migration
B must update `fn_merge_parties`..."

Semantics are now stated for every new table category: "Source references,
identifier claims, open exceptions, observations, projections, and
query/projection receipts must either follow the accepted survivor or retain
an explicit immutable loser-to-winner reference according to their audit
meaning." This closes the semantics half of R1 finding 2 for all six
categories, not just the three identity tables R1 named.

The following sentence narrows back to three: "Merge tests must cover
conflicting email claims, duplicate scoped source references, open
exceptions, rollback, and retry." These scenarios map only to
`party_identifier_claims`, `party_external_refs`, and
`party_identity_exceptions`. No test scenario is named for the
observations/projections tables, context-query receipts, or Plutio
projection receipts named earlier in the same sentence and in the Slice B
deliverable list (§9). The semantics rule for those tables ("follow the
accepted survivor or retain an explicit immutable loser-to-winner
reference") is therefore asserted but not committed to a test.

**Bounded correction:** Append one clause to the "Merge tests must cover ..."
sentence in §4.2 naming a test scenario for the non-identity new tables,
e.g. "...rollback, and retry; and that a merge does not leave an
observation, projection, or query/projection receipt referencing only a
tombstoned loser party."

## Check 3 — Legacy `parties.source_provider`/`source_id` disposition: CLOSED

**Section:** §4.2, final paragraph.

One paragraph states all five elements as a single unambiguous rule:
compatibility ("retained during a compatibility window as first-seen
provenance only"), backfill ("Migration B backfills every valid scoped value
into `party_external_refs` with an explicit provenance receipt"), authority
("Once that row exists, `party_external_refs` is authoritative for external
identity; new resolvers and adapters must not consult the legacy pair to
select a Party"), deprecation ("Writes to the legacy pair are deprecated
after adapter migration, drift-tested during the window"), and removal
("removed only in a separately reviewed cleanup after all callers are proven
migrated"). R1 finding 3 is resolved.
