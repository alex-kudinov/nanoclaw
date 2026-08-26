# NC-20260826-003 — Trafft exact identity implementation review R1 (response)

Scope reviewed: exactly the allowed packet listed in the request. No Bash,
network, database, or secret access was used; no source was edited.

## Verdict: MATERIAL FINDINGS

## Finding 1 (High) — Party re-canonicalization after an exact customer bind throws and aborts the whole reconciliation transaction, contradicting the documented "held/conflict" behavior

`reconcileSafeTrafftReferences` recomputes each candidate customer's Party as
`business_v2.canonical_party_id(i.party_id)` on every run
(`src/relationship-context-trafft-shadow.ts:415`, `:487`) — i.e. it always
resolves through the *current* canonical mapping, anticipating that a Party
can be superseded (merged/re-attributed) after the fact.

`bindExternalRef` (`src/relationship-context-store.ts:439-483`), however,
never updates `party_id` on an existing ref — the `ON CONFLICT` clause only
touches `last_seen_at`/`verified_at`/`updated_at` and is itself gated by
`WHERE party_external_refs.party_id = EXCLUDED.party_id` (`:455-465`). The
post-write consistency check then re-reads the ref with
`resolveExternalRef` (`:421-437`), which returns the **raw stored**
`party_id` — it does not pass it through `canonical_party_id()` the way
`canonicalParty()` does (`:413-419`) or the way `identity-join.ts`'s read
path does (`resolveTrafftCustomer`, `:128-134`, which wraps the stored value
in `canonical_party_id(party_id)`).

Consequence: once a customer's exact ref is bound to Party A, if that
customer's underlying interactions are later re-canonicalized to Party B
(a Party merge, or any other re-attribution of `interactions.party_id`),
the next 15-minute run recomputes `candidate.party_id = B`, calls
`bindExternalRef({ partyId: B, ... })`, the `WHERE` clause blocks the
no-op update, `resolveExternalRef` still returns the stale `A`, and
`bindExternalRef` throws `relationship_context_external_ref_conflict`
(`:480-482`). This exception propagates out of the customer loop
(`relationship-context-trafft-shadow.ts:458-478`) **before** the
appointment-binding query even runs (`:480-536`), aborting the shared
transaction for the entire run, every 15 minutes, until someone manually
edits `party_external_refs`.

This directly contradicts the documented design in
`docs/RELATIONSHIP-CONTEXT-TRAFFT-EXACT-IDENTITY.md:20-21`: "Any
disagreement is counted as a conflict and remains unbound" — the doc
describes a held/counted outcome, not a fatal, whole-run exception. It also
means health will report a generic `errorCode:
'relationship_context_trafft_shadow_failed'` (the catch-all in
`runTrafftRelationshipContextShadow`, since a plain `Error` is not a
`RelationshipContextContractError`), masking the true cause and making
`exactReferenceConflicts` (which never gets incremented for this path,
since the throw happens before that counting code runs) untrustworthy for
diagnosing it — directly bearing on request question 6 ("are health
counters truthful").

No test in the reviewed packet exercises re-running reconciliation after a
Party's canonical mapping changes for an already-bound customer; none of
the three test files construct that scenario.

**Bounded fix:** in `bindExternalRef`'s post-write check, canonicalize both
sides before comparing (`canonicalParty(resolved)` vs
`canonicalParty(input.partyId)`), and/or have
`reconcileSafeTrafftReferences` catch a same-Party-family conflict per
candidate and count it rather than let it abort the batch — consistent with
the "remains unbound"/counted design already used for appointment
conflicts.

## Finding 2 (Medium) — Canary failure path leaves the query receipt permanently `pending` instead of recording a failed delivery

`runRelationshipContextExactReadCanary`
(`src/relationship-context-live-canary.ts:25-85`) records a query receipt
inside `getRelationshipContext` (`pack.receiptId` is used afterward), then
validates readiness (`:63-70`) and only calls `markQueryDelivery` on the
success path (`:71-76`). If the readiness check fails — e.g. the resolved
section isn't `current`/`stale`, or `projections.length < 1` — the function
throws `relationship_context_exact_read_canary_not_ready` before
`markQueryDelivery` runs. The receipt that was already recorded as pending
is never transitioned to `failed`; it is left indistinguishable from an
in-flight request. `markQueryDelivery` itself enforces single-transition
(`relationship-context-store.ts:776-792`, throws on a non-`pending`
current state), so nothing later can repair this once the exception is
swallowed by a caller.

This bears directly on request question 5 ("record truthful delivery"):
a failed canary run is not truthfully recorded as failed. The reviewed
test (`relationship-context-live-canary.test.ts`) only covers the success
path; no test exercises the not-ready/throw path, so this gap is
untested as well as unhandled.

**Bounded fix:** wrap the readiness check/`getRelationshipContext` call in
a `try/catch` (or `try/finally`) that calls
`markQueryDelivery({ receiptId, status: 'failed', errorCode: ..., deliveredAt: null })`
before rethrowing, whenever `pack.receiptId` was already obtained.

## Answers to the request's questions

1. **Can any legacy/shared/mismatched row bind or project through these
   rules?** No — the source-created/window/party-count/legacy-match gates
   correctly exclude them, and this is exercised by the integration test's
   "ambiguous" and "safe" fixtures (`ref_count: '0'`,
   `attached_count: '0'` for the ambiguous customer).
2. **Are concurrency, transaction rollback, ref ownership conflict, Party
   merge, replay, and late observation linking safe?** Replay and simple
   ref-ownership conflicts (two different real customers) are handled
   safely and are tested. **Party merge/re-canonicalization is not safe**
   — see Finding 1. Cross-process concurrency between two overlapping
   shadow runs is untested in the reviewed packet.
3. **Can exact-first resolution redirect a customer incorrectly or
   regress the no-ref legacy fallback?** No. `resolveTrafftCustomer`
   canonicalizes on read, falls through to the existing email-based
   `resolveOrCreateParty` path whenever no exact ref exists, and the
   `exact.length > 1` branch is unreachable given the unique constraint
   implied by `bindExternalRef`'s `ON CONFLICT` target.
4. **Is `verified_at` justified and monotonic for the strict rule?** Yes —
   it is set once from the provable `first_seen_at` and preserved via
   `COALESCE` on every subsequent write (`relationship-context-store.ts:460-463`).
5. **Does the canary truly consume one policy grant, avoid
   context/identity value output, and record truthful delivery?** Grant
   consumption and value-minimization are correct and tested. Truthful
   delivery recording has a gap on the failure path — see Finding 2.
6. **Are health counters truthful, and do tests prove safe, held,
   ambiguous, exact-first, current projection, replay, and delivered
   receipt behavior?** Most of these are proven by the integration and
   unit tests. Health truthfulness has a specific gap under Finding 1's
   scenario, where a real conflict is reported as a generic shadow
   failure rather than as a counted reference conflict.
