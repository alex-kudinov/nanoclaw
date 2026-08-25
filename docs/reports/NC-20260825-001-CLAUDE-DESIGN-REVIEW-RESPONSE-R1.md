# NC-20260825-001 — Independent Relationship Context design review R1 — Claude response

Reviewer: Claude (independent, read-only per allowed packet)
Candidate: `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`
Scope read: `PROGRAM.md`, `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`,
`docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`, `src/identity-join.ts`,
`src/booking-host-write.ts`, `src/plutio-outbox-reaper.ts`,
`data/business/migrations/nanoclaw-v2/03_parties.sql`,
`data/business/migrations/nanoclaw-v2/11_helpers.sql`.

## Verdict: MATERIAL FINDINGS

## Findings, ordered by consequence

### 1. (Major) No slice or gate closes the gap between the live ambiguity-blind write path and the new fail-closed identity contract

**Candidate section:** §4 (Canonical identity contract) and §9 (Implementation
sequence and gates), Slices A–I.

**Evidence:** `src/identity-join.ts:1-17` documents the *currently live*
contract used on every Trafft booking: "Plutio is the system of record for
person identity. Email is the join key," and `fn_create_party` is "idempotent
on email (advisory lock + best-party-by-email lookup)." `src/booking-host-write.ts:170-186`
calls this path (`resolveTrafftCustomer` → `resolveOrCreateParty`) for every
live `booked` webhook today, unconditionally attaching the interaction to
whichever party `best_party_by_email` picks. The candidate's own audit
(§3.1) states `best_party_by_email` "returns one row by ordering when an
email maps to multiple parties. It converts ambiguity into an apparently
certain match," and that "callers generally do not surface that ambiguity."

The candidate's target precedence (§4.1) requires a verified or
provider-confirmed identifier and returns `ambiguous`/`needs_identity`
otherwise — the opposite behavior. But Slices A–I (§9) build and shadow-test
the new resolver entirely alongside the existing write path; nothing in the
sequence, the gates, or the seven owner decisions in §12 states whether
`bookingHostWrite`/`resolveTrafftCustomer` keeps running unchanged through
that build window, or how newly-created ambiguous-email parties from that
window are later reconciled into `party_identifier_claims`/
`party_identity_exceptions` once those tables exist.

**Why it matters:** Without an explicit decision, the write side will keep
silently picking a party via `best_party_by_email` for the entire build
period (Slices A–I have no defined end date), while the read side is being
built specifically to refuse that same behavior. The two paths can disagree
about the same email indefinitely, and every party created or reused this way
during the build window becomes retroactive debt for the new identity-claims
model. This directly touches the design's own review question 2
(fail-closed identity resolution for shared/reused/unverified identifiers)
and question 6 (separating build stages) — the target state fixes this for
new code but the design is silent on the live path.

**Bounded correction:** Add an explicit statement to §9 (or a new row) on
whether Booking's write path is left unchanged, given an interim mitigation
(e.g., logging/flagging multi-party-email creates), or migrated in a named
slice — and add a corresponding item to §12 owner decisions.

### 2. (Moderate) New identity tables are not accounted for in the existing merge function

**Candidate section:** §4.2 (Required identity records) and §9, Slice B.

**Evidence:** `data/business/migrations/nanoclaw-v2/11_helpers.sql:74-142`
(`fn_merge_parties`) redirects child rows across eleven named tables
(`party_emails`, `party_roles`, `party_contact_roles`,
`party_relationships`, `engagement_participants`, `pipeline_entries`,
`interactions`, `documents`, `plutio_outbox`) when a party is merged. The
candidate proposes three new party-scoped tables — `party_external_refs`,
`party_identifier_claims`, `party_identity_exceptions` (§4.2) — but §9 Slice
B's deliverable ("reversible schema for source refs, identifier
claims/exceptions, observations/projections, context-query receipts, Plutio
projection receipts") does not name updating `fn_merge_parties` (or the
`fn_reject_writes_to_merged_*` trigger family) as part of that slice.

**Why it matters:** If the three new tables ship without a corresponding
`fn_merge_parties` update, a merge will tombstone a party while its external
refs, identifier claims, and open identity exceptions remain attached to the
now-merged (unwritable) loser row — exactly the "wrong merge is much harder
to reason about than a held identity claim" risk the candidate names in
§3.1, now reproduced in the tables the design adds to fix it.

**Bounded correction:** Add "extend `fn_merge_parties` and the
merged-party write-rejection triggers to the three new identity tables" as
an explicit Slice B deliverable line.

### 3. (Minor) No stated disposition for the existing single-value `parties.source_provider`/`source_id` columns

**Candidate section:** §3.1 (Current gaps) and §4.2.

**Evidence:** `data/business/migrations/nanoclaw-v2/03_parties.sql:10-26`
shows `parties.source_provider`/`source_id` as single nullable columns on
the party row itself. §3.1 correctly names the resulting gap ("can describe
only one origin and cannot represent multiple workspaces/accounts,
identifier history, or verification"), and §4.2 proposes
`party_external_refs` as the multi-row replacement. Neither §4.2 nor §9
states whether the legacy columns are deprecated, one-time backfilled into
`party_external_refs`, or retained indefinitely as first-seen provenance
once the new table exists.

**Why it matters:** Left unstated, future code (and existing callers such as
`identity-join.ts`) has no documented rule for which of the two
representations is authoritative, reintroducing a dual-source-of-truth
pattern the design is otherwise built to eliminate.

**Bounded correction:** Add one sentence to §4.2 stating the intended
disposition of `parties.source_provider`/`source_id` relative to
`party_external_refs` (e.g., "retained as first-seen provenance; not
authoritative once a scoped external ref exists").

## Owner decisions that remain genuinely required

The candidate's §12 list (1–7) stands. Add, per the findings above:

8. Whether `bookingHostWrite`/`resolveTrafftCustomer` continues unchanged
   through Slices A–I, or requires an interim mitigation, before Slice C
   begins (Finding 1).
9. Confirm Slice B's schema deliverable explicitly includes extending
   `fn_merge_parties` and the merged-party write-rejection triggers to the
   three new identity tables (Finding 2).
10. The disposition of `parties.source_provider`/`source_id` relative to
    `party_external_refs` (Finding 3).

No finding in this review contradicts the candidate's stated authority
order, its C1 read-only boundary, or its treatment of the handoff's
PostgreSQL counts as historical.
