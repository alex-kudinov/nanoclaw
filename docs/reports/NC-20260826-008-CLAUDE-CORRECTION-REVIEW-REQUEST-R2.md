# NC-20260826-008 — bounded correction review R2

Review mode: Claude Sonnet/high, fresh bounded correction review.

Write only:

`docs/reports/NC-20260826-008-CLAUDE-CORRECTION-RESPONSE-R2.md`

Do not edit code/tests/docs/configuration or use Bash, web, MCP, `.env`,
credentials, databases, Git, or unrelated files.

## Scope

Review only the load-bearing disposition/corrections to R1 Findings 1–3:

1. content-only adapter watermark plus current-snapshot freshness;
2. skip-pagination mutation/omission protection;
3. host startup/overlap/unref/health wiring that R1 could not inspect.

R1 response:
`docs/reports/NC-20260826-008-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

## Allowed read paths

1. this request
2. the R1 response above
3. `src/relationship-context-plutio-engagement.ts`
4. `src/relationship-context-client-projection.ts`
5. `src/relationship-context-store.integration.test.ts`
6. `src/index.ts`
7. `src/relationship-context-trafft-shadow-wiring.test.ts`

The response is the only allowed write.

## Correction 1 — no churn without losing freshness

R1 correctly found that including `observed_at` in the batch watermark caused
per-fact projection churn on every poll. Merely deleting it would have created
a worse defect: observations are immutable/deduplicated, so their original
`fresh_until` would age out even after successful identical polls.

The correction:

- removes poll time from the watermark; it hashes provider content only;
- transactionally updates the adapter registration `last_health_at` on every
  accepted complete snapshot, even when every fact is duplicate;
- the aggregate client projection treats a latest In-progress fact as current
  only when the exact adapter/version/source-scope registration is enabled,
  conformant, closed, failure-free, and refreshed within 26 hours;
- stale current evidence is explicit/non-authorizing; Completed stays
  historical;
- source facts/projections no longer need a semantic version merely to record
  poll time.

Acceptance proof now ingests byte-identical content twice with different
`observedAt` values. The second run is observation-duplicate and
`projectionsChanged=0`; the aggregate remains current immediately after the
second registration refresh, then becomes stale after 26 hours.

## Correction 2 — stable snapshot barrier

Because the provider tools expose offset pagination and no authoritative total
count/cursor, each adapter run now performs two complete bounded reads and
compares hashes of the fully normalized minimized snapshots. Any insertion,
deletion, status/client/custom-field/contract drift, page overlap, duplicate,
cap, malformed row, timeout, or incomplete catalog refuses the run before the
database transaction. A new test changes project state between the two reads
and requires `plutio_engagement_snapshot_drift`.

## Finding 3 — wiring now inspectable

`src/index.ts` and the wiring test are allowed in R2. Verify the new runner is
separately default-off, fire-and-forget, guarded against overlap, clears the
guard in `finally`, uses an unref'ed 15-minute timer, and exposes only aggregate
health with `consumerEnabled=false`.

## Current checks

- focused Plutio/client/read-boundary/wiring: 24/24 pass;
- disposable PostgreSQL: 6/6 pass;
- pinned Node 22.23.2 typecheck passes;
- no production/Mini/provider/database/customer mutation occurred.

## Response contract

Report only material defects in these corrections, with severity, exact
evidence, causal failure, smallest safe correction, and acceptance test. If
closed, write exactly `NO MATERIAL FINDINGS` plus at most one short paragraph
naming the checked load-bearing paths. Do not reopen accepted scope or provide
style/speculative backlog.
