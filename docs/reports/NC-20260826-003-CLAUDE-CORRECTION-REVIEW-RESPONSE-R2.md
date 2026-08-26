# NC-20260826-003 — Trafft exact identity correction review R2 (response)

Scope reviewed: exactly the allowed packet listed in the R2 request (R1
response; `bindExternalRef` in `relationship-context-store.ts`; the merge
test in `relationship-context-store.test.ts`; merge/canary portions of
`relationship-context-store.integration.test.ts`;
`relationship-context-live-canary.ts` and its test; the appointment
agreement query in `relationship-context-trafft-shadow.ts`). No Bash,
network, database, or secret access was used; no source was edited.

## Verdict: NO MATERIAL FINDINGS

## Finding 1 (R1) — resolved

`bindExternalRef` now canonicalizes both sides of its post-write check
(`resolvedCanonical` vs `inputCanonical`), and the PostgreSQL `ON CONFLICT`
branch updates `party_id` to `canonical_party_id(EXCLUDED.party_id)` when
the existing and incoming refs already resolve to the same canonical
family, instead of a no-op gated purely on raw-id equality. A genuine
different-family conflict still throws (as designed) rather than
overwriting.

Verified:
- `InMemoryRelationshipContextRepository.bindExternalRef` compares
  `canonicalParty(existing)` against `canonicalParty(input.partyId)` and
  always stores the canonical winner.
- `PostgresRelationshipContextRepository.bindExternalRef`'s `ON CONFLICT`
  `WHERE` clause is family-scoped, and its post-write check re-resolves and
  re-canonicalizes before deciding conflict vs. success.
- Both the in-memory `'rebinds a reference to the winner after its Party is
  merged'` test and the PostgreSQL integration test's merge-then-rebind
  sequence (`fn_merge_parties` → `bindExternalRef` with the winner →
  `resolveExternalRef` returns the winner) exercise exactly the
  re-canonicalization scenario Finding 1 described, and both pass with the
  new logic.
- The customer-bind loop in `reconcileSafeTrafftReferences` only ever
  re-derives a candidate's party via `canonical_party_id(i.party_id)`, so
  any party-id drift for a given `customer_id` across runs is definitionally
  a merge (same canonical family), which the fix now handles without
  throwing — closing the batch-abort path Finding 1 identified for the
  merge/re-canonicalization case. Conflict refusal for genuinely different
  families (rejection-by-design) is unchanged and still tested.

## Finding 2 (R1) — resolved

`runRelationshipContextExactReadCanary` now wraps the readiness check (and
the success-path `markQueryDelivery` call) in try/catch. On any not-ready
path it calls `markQueryDelivery` with `status: 'failed'` and the bounded
`errorCode: 'exact_read_canary_not_ready'` before rethrowing.

Verified:
- The unit test's new `'marks the receipt failed when exact context is not
  ready'` case asserts the receipt transitions to
  `{ status: 'failed', errorCode: 'exact_read_canary_not_ready' }`.
- The existing success-path test and the PostgreSQL integration test's
  canary call both still assert `deliveryStatus: 'delivered'`, proving the
  happy path is unaffected.
- `markQueryDelivery`'s single-transition guard (`WHERE ...
  delivery_status='pending'`) means no receipt can now be silently left
  `pending`, satisfying the R1 "truthful delivery recording" concern.

## Correction 3 (appointment/customer-ref mismatch) — not an R1 finding, reviewed as background for the allowed file

The appointment-binding query in `reconcileSafeTrafftReferences` already
gates on `binding_safe = (legacy_party_count=1 AND legacy_party_id=r.party_id)`
and only counts (never binds) when false; this logic is unchanged by the R2
corrections and was not one of R1's two findings, so it is not scored here.
It is noted only because a mismatch could theoretically arise from the same
class of party_id staleness Finding 1 addressed — but the customer loop
that populates `r.party_id` always runs immediately before the appointment
loop within the same `reconcileSafeTrafftReferences` call, re-canonicalizing
every qualifying ref first, so no residual staleness reaches the appointment
query in the reviewed code path.
