# NC-20260826-006 — bounded implementation review R1 response

Review mode: independent bounded review, Sonnet/high.

## Finding 1 — client-projection query joins on raw `party_id` / `current_party_id`, not `business_v2.canonical_party_id()`, so a merged-away Party's roles and Stripe evidence are dropped rather than credited to the surviving canonical Party

**Severity:** High.

**Evidence:**

- `src/relationship-context-client-projection.ts:161-162` — `role_evidence` joins
  `business_v2.party_roles r ... JOIN page p ON p.id=r.party_id`.
- `src/relationship-context-client-projection.ts:171-172` and `:182-183` —
  `latest_payment_intents` / `latest_subscriptions` join
  `business_v2.party_context_observations o ... JOIN page p ON p.id=o.current_party_id`,
  and the `DISTINCT ON (o.current_party_id, o.source_scope, o.source_record_id)`
  grouping key is likewise the raw column.
- `page` (`:145-151`) is restricted to `merged_into IS NULL`, i.e. canonical
  Parties only.
- Contrast with the established pattern in the same PR's allowed read set,
  `src/relationship-context-store.ts:417-423` (`canonicalParty`),
  `:425-441` (`resolveExternalRef`), and `:496-510` (`resolveIdentifierClaim`):
  every other merge-sensitive lookup in this repository explicitly resolves
  through `business_v2.canonical_party_id(...)` before comparing to a Party
  ID, and the integration test's merge case
  (`src/relationship-context-store.integration.test.ts:435-477`) confirms that
  `party_external_refs.party_id` is *not* rewritten on merge — resolution is
  late-bound via the function, not physical FK rewrite.

**Causal failure mode:** `business_v2.party_roles.party_id` and
`business_v2.party_context_observations.current_party_id` are exactly the
kind of merge-sensitive foreign keys the codebase otherwise never compares
without `canonical_party_id()`. If a Party that holds an active client role
or a succeeded PaymentIntent/active-subscription observation is merged into
another canonical Party (a normal, already-supported operation in this
system), that role/observation keeps pointing at the now-non-canonical
(merged-away) Party ID. The merged-away ID is excluded from `page`
(correctly, since it is no longer active), but the raw-equality joins in
`role_evidence`, `latest_payment_intents`, and `latest_subscriptions` never
pick that evidence up under the surviving canonical Party's ID either — it
simply vanishes from both sides. The surviving Party's projection is
computed as if the absorbed evidence never existed: a real paying
customer or recorded client merged from a duplicate identity would be
projected as `unknown` or `recorded_prospect` instead of `paid_customer` /
`recorded_client`. The final coverage check
(`:368-393`) only verifies that every active Party got *a* projection row,
not that the row's evidence is complete, so this run reports
`complete: true` and a healthy status while silently misclassifying the
affected Party — a false negative on `customer_or_client` with no error
signal.

**Smallest safe correction:** resolve every party-identifying column through
`business_v2.canonical_party_id(...)` before joining to `page`, and use the
same canonical value as the `DISTINCT ON`/`GROUP BY` key, e.g.:

```sql
JOIN page p ON p.id = business_v2.canonical_party_id(r.party_id)
...
SELECT DISTINCT ON (
         business_v2.canonical_party_id(o.current_party_id),o.source_scope,o.source_record_id
       )
       business_v2.canonical_party_id(o.current_party_id) AS party_id, ...
JOIN page p ON p.id = business_v2.canonical_party_id(o.current_party_id)
```

**Acceptance test:** add a case to the existing
`projects every active Party from defensible client evidence without replay
churn` test in `src/relationship-context-store.integration.test.ts`: create a
merge-loser Party with an active `client` role and a succeeded-PaymentIntent
observation, create a merge-winner Party, call
`business_v2.fn_merge_parties(loser, winner, ...)`, run
`projectClientRelationshipsWithClient`, and assert the winner's
`relationship.client_status.v1` projection shows
`relationship_state='paid_customer'` and `recorded_client_role=true` (not
`unknown`), while the loser receives no new projection row.

## Scope note

This review was bounded to the allowed read set (request, decision JSON,
`docs/RELATIONSHIP-CONTEXT-CLIENT-PROJECTION.md`,
`src/relationship-context-client-projection.ts`,
`src/relationship-context-store.integration.test.ts`,
`src/relationship-context-store.ts`, `src/index.ts`). The definition of
`business_v2.canonical_party_id(...)` and `business_v2.fn_merge_parties(...)`
(migration 137 and related DDL) were out of scope and were not read; Finding
1 is based on the query text in the reviewed file plus the merge-resolution
convention directly observable in the reviewed repository class and
integration test, not on inspection of the merge function's body.

No other material findings against the reviewed precedence logic,
watermark/upsert idempotency, advisory-lock/in-flight overlap guard, health
exposure, or default-off/rollback wiring were found within the allowed read
set.
