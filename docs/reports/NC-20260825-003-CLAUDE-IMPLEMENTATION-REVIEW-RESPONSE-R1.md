# NC-20260825-003 — Relationship Context implementation review R1 — Response

Verdict: **MATERIAL FINDINGS**

Reviewed only the eight allowed artifacts. Findings below are ordered by
consequence.

## 1. Query receipt records "allowed / resolved" success before the
   size-bound and delivery guards run, leaving a permanently false
   immutable audit row on every oversized or undelivered response

`src/relationship-context.ts:373-399` (`getRelationshipContext`) calls
`repository.recordQueryReceipt({..., policyDecision: 'allowed', resultStatus:
resolution, ...})` and returns the pack **before** the caller has confirmed
the pack could actually be delivered. The caller,
`src/relationship-context-ipc.ts:111-129` (`dispatchRelationshipContextIpc`),
only *after* that receipt is already committed:

- serializes the pack and throws `relationship_context_response_too_large`
  if it exceeds 32 KiB (lines 114-119), and
- throws `relationship_context_source_container_unavailable` if
  `deps.deliverSourceInput(...)` returns false (lines 120-129).

Both tables involved (`party_context_query_receipts`) are append-only/
immutable by trigger (`137_relationship_context_dark.sql:669-676`,
`fn_relationship_context_query_receipt_immutable` at lines 480-510, which
permits only `current_party_id` to change). There is no subsequent write
path that can mark the receipt as failed, undelivered, or oversized — the
row permanently asserts `policy_decision='allowed'`, `result_status='resolved'`
(or whatever the true resolution was) for a request whose result was never
actually handed to the requesting container.

**Failure path:** any Party whose requested sections' combined projections
exceed 32 KiB (easily reached with a few sections of near-8 KiB projection
values), or any transient `deliverSourceInput` failure (source container
already exited/recycled), produces an immutable receipt that says the
request succeeded and was resolved, while the model never received the
context and the call itself threw.

**Correction:** compute the serialized size (and, if feasible, confirm
deliverability) before calling `recordQueryReceipt`, and encode the true
outcome (`unavailable` / a distinct `response_too_large` error code) in the
one receipt row that gets written, rather than writing a success receipt and
then throwing.

## 2. Observation `current_party_id` is fixed at first insert and never
   corrected on replay after later identity resolution — permanent lineage
   loss that also escapes the merge sweep

`src/relationship-context-store.ts` writes `current_party_id` only on the
first insert of a given `(source_system, source_scope, source_fact_key)`:

- In-memory: `recordObservation` (lines 232-250) stores `partyId` once in
  the map entry and never updates it on a duplicate.
- Postgres: `recordObservation` (lines 491-560) inserts
  `original_party_id`/`current_party_id` both from `$8` (line 506-507) with
  `ON CONFLICT (source_system,source_scope,source_fact_key) DO NOTHING`
  (line 509); on conflict it reads back and returns the **existing**
  `current_party_id`, never rewriting it to the new value.

`src/relationship-context.ts:193-263` (`ingestRelationshipContextBatch`)
calls `resolveFactParty` fresh on every batch (lines 213-231), so a fact
that was `needs_identity`/`ambiguous` on first ingest (party unresolved,
`recordObservation` called with `partyId: null`) and later becomes uniquely
resolvable (an identifier claim now matches exactly one Party) will, on
replay, compute a real local `partyId` and proceed straight to
`upsertProjection` for that Party (lines 240-258) — but the underlying
observation row's `current_party_id` in the database is never touched and
stays `NULL` forever, because the replayed `recordObservation` call is a
no-op conflict.

This is a genuine lineage defect, not merely a stale field: the migration's
own merge trigger (`fn_relationship_context_party_merged`,
`137_relationship_context_dark.sql:570-572`) reattaches observations to a
merge winner via `UPDATE ... WHERE current_party_id = NEW.id`. An
observation stuck at `current_party_id = NULL` can never be matched by that
`WHERE` clause, so it is permanently excluded from any future merge
sweep-up even after its true Party is established and later merged. The
append-safe evidence row and the query-facing projection row for the same
source fact diverge permanently: the projection is correctly attributed to
the resolved Party on every re-ingest, but the observation's own lineage
pointer is not.

**Correction:** on the `DO NOTHING` conflict path, follow up with an
explicit `UPDATE ... SET current_party_id = $partyId WHERE id = existing.id
AND current_party_id IS NULL` (guarded, not violating the immutability
trigger's exclusion of `current_party_id`), so identity resolution reached
after first ingest is retroactively applied to the original evidence row.

## 3. Query-time resolver never returns `ambiguous` / `needs_identity`,
   diverging from the documented single resolver contract

`docs/RELATIONSHIP-CONTEXT-IMPLEMENTATION-PLAN.md:138-139` specifies
`relationship-context.ts` as "core resolver and service: exact scoped ref ->
unique verified claim -> `ambiguous|needs_identity|not_found`." The
ingestion-side resolver, `resolveFactParty`
(`src/relationship-context.ts:63-139`), implements exactly that: exact ref,
then unique-verified-claim fallback, then ambiguous/needs_identity exception
recording.

`getRelationshipContext` (`src/relationship-context.ts:315-335`), the
query-time path actually reachable from `party_context_get`, does not call
`resolveFactParty` or perform any claim-based fallback. It only tries
`canonicalParty` (party subject) or `resolveExternalRef` (external-ref
subject) and collapses every non-exact-match case — including a genuinely
ambiguous one with multiple verified claims — to `resolution = 'not_found'`
(line 335). The `denied`/`unavailable` members of
`RelationshipContextResolution` (lines 20-26) are likewise never produced
here.

This fails safe (no misattribution — an ambiguous subject simply returns
`not_found`, no projection), so it is not a leakage risk. It is, however, a
concrete gap between the implementation plan's stated resolver contract and
the shipped `getRelationshipContext`, worth correcting before the "dark"
foundation is treated as satisfying its own completion condition: either
narrow the plan's description of `relationship-context.ts` to the ingestion
resolver only, or implement the same claim-based fallback at query time.

## 4. Packet-boundary gaps on two of the request's own named risk categories

- The request lists **unsafe rollback** as an explicit required concern and
  Q1 asks about rollback lineage loss, but
  `rollback_137_relationship_context_dark.sql` is not among the eight
  allowed read paths. Rollback safety cannot be independently confirmed from
  the given packet.
- Q2 asks whether a malformed/new adapter can bypass catalog/privacy/size/
  scope rules. That catalog enforcement (duplicate/version/privacy/target
  refusal) is implemented in `relationship-context-registry.ts`, imported by
  `src/relationship-context.ts:13` but not included in the allowed packet;
  `relationship-context-reference-adapter.ts` is similarly excluded. Within
  the given files, `validateObservationBatch`
  (`src/relationship-context-contract.ts:360-447`) correctly checks facts
  and references against whatever `manifest`/`catalog` the registry hands
  it, but whether the registry itself refuses duplicate/unversioned/
  undeclared-privacy adapters cannot be confirmed without reading the
  excluded file.

Per the response contract, these are reported as source ambiguity rather
than resolved by reading outside the allowed packet.

## Non-material observations (not counted above)

- `fn_relationship_context_observation_immutable`
  (`137_relationship_context_dark.sql:448-478`) excludes `current_party_id`,
  `conflict_state`, and `updated_at` from its equality check, so those
  columns could be freely rewritten by any future `UPDATE`. No code path in
  the packet ever updates `conflict_state`, so this is currently inert, not
  exploitable — worth tightening if a future conflict-resolution writer is
  added.
- `src/relationship-context-store.ts`'s `RelationshipContextRepository`
  interface has no method exercising
  `party_context_adapter_registrations`; that table's lifecycle is entirely
  outside the reviewed packet.
