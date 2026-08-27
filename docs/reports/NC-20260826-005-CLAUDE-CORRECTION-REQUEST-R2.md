# NC-20260826-005 focused correction review R2

Review only the three load-bearing corrections to R1. Do not reopen accepted
facts, edit implementation, run Bash/web/MCP/provider tools, or inspect any
other file. Write only:

`docs/reports/NC-20260826-005-CLAUDE-CORRECTION-RESPONSE-R2.md`

Allowed reads:

1. `docs/reports/NC-20260826-005-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`
2. `src/relationship-context-source-enrichment.ts`
3. `src/relationship-context-source-enrichment.test.ts`
4. `src/relationship-context-store.integration.test.ts`
5. `docs/RELATIONSHIP-CONTEXT-STRIPE-CONTACT-CHAOS.md`

## Corrections

1. Contact/Chaos no longer treat 5,000 as an all-time ceiling. They reuse the
   existing admin-only migration-97 `sweeper_watermarks` table with dedicated
   source keys. Contact uses immutable inbox ID. Chaos uses a composite exact
   PostgreSQL microsecond timestamp text plus visitor ID; both read and write
   preserve precision. A tick commits one fully processed page, reports
   `complete=false` while backlog remains, and later ticks drain to a zero-row
   replay. Aggregate exact/legacy/conflict totals come from durable context
   tables.
2. Stripe retains full current-state scans but removes the 10,000-object
   all-time ceiling: each endpoint reads at most 100 pages per half-open
   `created` range and recursively bisects an overflowing range. Tests force a
   one-page cap and prove two non-overlapping child ranges converge. A
   one-second overflow or partition identity collision fails closed.
3. Stripe account admission now uses a pure three-state gate. If either scope
   fetch fails, both scopes skip ingestion with
   `stripe_account_distinctness_unverified`; identical account IDs skip both
   with `stripe_account_scope_collision`.
4. Malformed Chaos visitor IDs are recorded as hashed terminal legacy and
   included in aggregate health. No raw malformed ID is persisted in the
   exception.

## Independent evidence after correction

- pinned Node 22.23.2 typecheck: pass;
- focused unit/wiring correction suite: 7/7 pass;
- disposable PostgreSQL: 4/4 pass, including two-page contact drain, two-page
  Chaos drain, malformed terminal legacy, exact microsecond cursor, and stable
  zero-row replay;
- no provider call/write or production mutation occurred.

Report only a still-material defect in these corrections with exact evidence
and smallest acceptable fix. Otherwise respond `NO MATERIAL FINDINGS`.
