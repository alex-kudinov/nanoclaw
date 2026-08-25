# NC-20260825-003 — Relationship Context dark-foundation plan review R1

Verdict: MATERIAL FINDINGS

Findings are correctable within the existing plan shape; none require a
redesign of the overall table set, adapter boundary, or rollout sequence.

## Finding 1 — Migration 137 drops the control plane's required legacy-pair backfill, risking a second, unpopulated identity authority

Evidence:

- Control plane §4.2: "Migration B backfills every valid scoped value into
  `party_external_refs` with an explicit provenance receipt. Once that row
  exists, `party_external_refs` is authoritative for external identity; new
  resolvers and adapters must not consult the legacy pair to select a Party."
  This backfill is explicitly scoped to the same migration as the new
  identity tables, distinct from the separately-gated "deprecate/remove"
  cleanup that follows it.
- Implementation plan §2.1 ("Migration 137") lists the eight new tables, the
  merge/guard contract, and security/rollback requirements, but contains no
  step that reads `parties.source_provider`/`source_id` and writes the
  corresponding `party_external_refs` rows, and no acceptance test proving
  that backfill. Plan §5 ("Explicit exclusions") also does not name this as a
  deferred item.

Risk: without the backfill step (or an explicit, reasoned deferral), building
`party_external_refs` as an inert, never-populated table alongside the
existing `parties.source_provider/source_id` pair is exactly the "second
authority" the control plane warns against (§1.2, §4.2) — a future caller
could treat the new table as canonical while it silently contains nothing,
or reintroduce the legacy pair as a fallback out of necessity. This bears
directly on review question 1.

Bounded correction: add the backfill step to migration 137 (idempotent
`INSERT ... SELECT` from `parties.source_provider/source_id` into
`party_external_refs` with a provenance receipt, safe to run against an
empty or populated `parties` table) and one acceptance test proving it is
idempotent on replay. If backfill is intentionally deferred to a later slice,
state that explicitly in plan §2.1 and §5 with the reason, rather than
leaving the omission unstated.

## Finding 2 — No stated byte bound on observation/projection/manifest JSON, contrary to the control plane's explicit anti-scrapbook rule and existing precedent

Evidence:

- Control plane §5.1: "Values must follow a versioned fact catalog; the
  system must not become an unbounded JSON scrapbook."
- Implementation plan §2.1 items 5–6 describe `party_context_observations`
  ("content-minimized value") and `party_context_projections` ("no raw
  provider payload") without any stated size cap, and item 4
  (`party_context_adapter_registrations`) describes the tracked manifest
  without a size cap either.
- The reviewed live precedent in this exact lineage,
  `134_student_lifecycle_community_dark.sql`, enforces this with a concrete
  constraint: `facts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(facts) = 'object' AND octet_length(facts::text) <= 8192)`.

Risk: without a stated numeric bound carried into the actual `CHECK`
constraints, an implementer has no fixed target and the resulting migration
may admit unbounded observation/projection/manifest payloads — directly the
condition review question 2 asks about ("sufficiently bounded against ...
unbounded JSON").

Bounded correction: add an explicit byte-size `CHECK` (e.g. mirroring
migration 134's `octet_length(...) <= 8192` pattern, or a value picked for
this table's largest legitimate fact) to `party_context_observations.value`,
`party_context_projections.value`, and the adapter manifest/config columns
in `party_context_adapter_registrations`, and add a test proving oversized
input is rejected.

## Finding 3 — Acceptance-test coverage for merge lineage is narrower than the control plane's required proof set

Evidence:

- Control plane §4.2: "Merge tests must cover conflicting email claims,
  duplicate scoped source references, open exceptions, rollback, and retry;
  and must prove that a merge leaves no active observation, projection,
  context-query receipt, or Plutio-projection receipt referencing only a
  tombstoned loser Party."
- Implementation plan §4 ("Adapter and identity" acceptance tests) reduces
  this to one bullet: "merge preserves original evidence and moves current
  authority safely." The migration's own structure-test bullet (§2.1,
  "Security and rollback") likewise only says tests exercise "... ambiguity,
  merge, populated rollback refusal ..." without naming the four
  receipt/projection tables individually.

Risk: as written, the acceptance criteria could be satisfied by a test suite
that checks only one of the four receipt-bearing tables (e.g. observations)
for orphaned tombstoned-loser references while leaving query receipts or
Plutio projection receipts unchecked — the exact failure mode the control
plane's sentence is written to prevent. This is material to review question 1
("without corrupting merge lineage").

Bounded correction: expand the acceptance-test bullet in plan §4 to name the
four tables explicitly (observations, projections, query receipts, Plutio
projection receipts) and require a test that a merge leaves no active row in
any of them referencing only a tombstoned loser Party, plus the conflicting-
claim/duplicate-ref/open-exception/rollback/retry cases named in the control
plane.

## Finding 4 — `work_item_id` binding is asserted as a policy dimension but never shown to be host-derived, unlike run/container

Evidence:

- Control plane §6.1: the `party_context_get` request schema lists
  `work_item_id: "host-bound-work-id"`, and the surrounding text states
  "`actor_group`, purpose, work item, exact source resource, and subject
  candidates are host-bound."
- Implementation plan §2.3 describes the MCP tool as accepting "bounded
  purpose, work item, exact subject selector" as request fields, then
  separately says the host will "stamp `groupFolder`, `source_container`,
  and host-minted `run_id` outside the model-writable schema" — `work` is
  omitted from that stamped list.
- Plan §2.2 (`relationship-context-policy.ts`) then lists "run/container/
  work/subject grants" as one bound tuple, treating `work` as equally
  host-trustworthy as `run_id`/`container`, which the container source
  (`container/agent-runner/src/ipc-mcp-stdio.ts`) confirms are read from
  non-model-writable environment variables (`NANOCLAW_RUN_ID`,
  `CONTAINER_NAME`).

Risk: the plan does not state how a model-supplied `work_item_id` string
becomes trustworthy enough to sit in the same policy-binding tuple as
host-minted `run_id`/`container`. Nothing is enabled in this task, so there
is no live exposure, but left unresolved this is exactly the kind of gap
review question 4 asks about ("bind ... host run/container/work/subject").

Bounded correction: state explicitly in plan §2.2/§2.3 how `work_item_id`
is resolved/verified host-side before it is used as a grant-binding
dimension (e.g., validated against a host-tracked work record the same way
`getGraderRunContext` resolves grader run context from `data.run_id`, rather
than trusted as opaque model input), or narrow the policy tuple to only the
dimensions that are genuinely host-minted until that resolution mechanism is
designed.
