# NC-20260826-005 focused correction review response R2

Reviewed only the five allowed artifacts plus the request. No files edited, no
Bash/web/MCP/provider tools used, no other file inspected.

## Finding — the Chaos watermark bounds the reported/counted work per tick,
but the underlying SQL still fully aggregates all-time Chaos data on every
tick, so query cost is not actually incremental

- File/function: `src/relationship-context-source-enrichment.ts:1423-1473`
  (`ingestChaosVerifiedLedgerWithClient`'s `interaction_rows`/`inbox_rows`
  CTEs).
- What changed vs R1: correction 1 is accurate that a durable
  `sweeper_watermarks` cursor now exists, that `contact_form` is genuinely
  incremental (`ingestContactFormLedgerWithClient`'s query filters
  `WHERE ... id>$1::bigint` before any aggregation, `:1239-1248`), and that a
  tick now drains to a stable zero-row replay instead of throwing forever once
  cumulative volume passes 5,000. That part of the correction is correct and
  verified against the disposable-PostgreSQL two-page-drain assertions.
- What is not fixed: for Chaos, the composite `(observed_at, visitor_id)`
  cursor is applied only in the *outer* `SELECT ... WHERE (...) > ($1,$2)
  ... LIMIT $3` (`:1463-1473`). The two CTEs that feed it —
  `interaction_rows` (`GROUP BY i.source_id` over every row where
  `i.source_provider='chaos'`, `:1424-1435`) and `inbox_rows` (`GROUP BY
  w.raw_body->>'visitor_id'` over every row where `w.source='chaos'`,
  `:1436-1451`) — carry no watermark predicate at all. Every 15-minute tick
  re-aggregates the entire all-time `business_v2.interactions` and
  `business_v2.webhook_inbox` Chaos rows to produce the per-visitor rollup,
  then discards everything except the next page after the cursor.
- Realistic failure mode: the visible symptom R1 flagged — a tick that
  throws forever once cumulative volume exceeds the row cap — is fixed. But
  the query cost this correction was meant to bound ("the 5,000-row limit
  bounds *incremental* work per tick instead of total historical volume", per
  R1's own smallest-acceptable-correction language) is not bounded for
  Chaos: cost grows with total historical Chaos interaction/inbox volume,
  not with rows added since the last watermark. Chaos is an actively growing
  ledger (1,331 interactions today per the shipped baseline in
  `docs/RELATIONSHIP-CONTEXT-STRIPE-CONTACT-CHAOS.md:42`), so every tick's
  full-table `GROUP BY` cost rises indefinitely even though the reported
  `scanned`/`complete` numbers stay small. This does not reproduce the
  original all-or-nothing failure, but it is a materially different query-cost
  profile than the one the correction claims to have delivered for Chaos, and
  the asymmetry with the now-genuinely-incremental contact-form query
  (`:1239-1248`) confirms the gap is specific to Chaos, not a shared
  constraint.
- Smallest acceptable correction: pre-filter to the set of `visitor_id`s with
  at least one row newer than the watermark (an indexed range scan on
  `interactions.updated_at` / `webhook_inbox.received_at`) before joining back
  to compute each affected visitor's full-history rollup — instead of
  `GROUP BY`-ing every Chaos row unconditionally on every tick.

## Independently confirmed correct

- Correction 2 (Stripe pagination): `listStripeObjects`
  (`:726-796`) caps each half-open `created` range at
  `maxPagesPerPartition` (default 100) pages, bisects on overflow
  (`:769-796`), fails closed on a sub-one-second overflowing range
  (`width<=1`, `:772-774`) and on cross-partition id collisions
  (`:788-794`). Matches the test at
  `relationship-context-source-enrichment.test.ts:227-269`.
- Correction 3 (Stripe scope gate): `stripeAccountScopeGate`
  (`:1750-1762`) and its use in `runRelationshipContextSourceEnrichment`
  (`:1799-1826`) correctly skip ingestion for *both* scopes whenever either
  scope's account id is missing (`unverified`) or identical
  (`collision`) — `if (stripeGate !== 'verified') continue;` applies to
  every scope uniformly, not only the failed one. Matches
  `relationship-context-source-enrichment.test.ts:100-107`.
- Correction 4 (malformed Chaos visitor id): `:1501-1519` routes the
  non-numeric `visitor_id` through `recordTerminalLegacy` with reason code
  `legacy_identity` and evidence tier `chaos_visitor_id_malformed`, hashing
  the raw id into `externalId: malformed:${sha256Json(row.visitor_id)}`
  and never persisting it raw. `legacyVisitors` is incremented before the
  `continue`, so it reconciles against `scanned` in health. Matches the
  disposable-PostgreSQL assertion that malformed exceptions count is `'1'`
  (`relationship-context-store.integration.test.ts:807-813`).
