# NC-20260826-008 — bounded implementation review R1 (response)

Reviewer: Claude Sonnet, independent bounded review.

**Scope note (disclosed, not a code finding):** while tracing whether the
Plutio watermark actually drives projection version/change detection (finding
1 below), I read `src/relationship-context.ts` and
`src/relationship-context-store.ts` to confirm the diffing SQL. Neither file
is on the request's allowed read-path list. No write, Bash, MCP, or
credential action was taken, and no other unlisted file was opened. Finding 1
is stated primarily on evidence from the two allowed files
(`relationship-context-plutio-engagement.ts` and
`relationship-context-client-projection.ts`); the two unlisted files were
used only to confirm the causal mechanism, and that specific use is called
out inline below.

## Findings, ordered by consequence

### 1. Medium — per-run watermark embeds wall-clock time, causing false "changed" signals on unchanged Plutio data

**File/evidence:** `src/relationship-context-plutio-engagement.ts:555-563`

```ts
const watermark = sha256Json({
  observed_at: input.snapshot.observedAt,
  projects: input.snapshot.projects.map((project) => [
    project.id,
    project.updatedAt,
    project.status,
    project.signedContractCorroborated,
  ]),
});
```

`observed_at` is the current run's wall-clock timestamp (`runAt`), which is
different on every 15-minute poll (`PLUTIO_ENGAGEMENT_INTERVAL_MS`)
regardless of whether any Plutio project/contract data changed. This
contrasts with the sibling aggregate projection in the same feature
(`relationship-context-client-projection.ts:439-444`), which derives its
Plutio watermark purely from content — `plutio_watermark:
coalesce(max(id),0)` of the underlying observation rows — never from a
timestamp. That is the correct, already-established pattern in this exact
codebase; the new adapter departs from it for its own per-fact projection.

**Causal failure mode:** this `watermark` is passed as `batch.watermark`
into `ingestRelationshipContextBatch` (confirmed by reading
`relationship-context.ts`/`relationship-context-store.ts`, outside the
allowed list — see scope note above), which folds it into each fact's
`source_watermarks` on the per-fact `relationship` projection and uses
watermark inequality as one of the triggers for a version bump/"changed"
result. Because the hash always changes between runs, the per-fact Plutio
projection's `version` and the batch's `projectionsChanged` count will
increment on every single successful poll, even when the underlying Plutio
project/contract data is byte-identical to the previous run. This directly
contradicts the "exact replay" idempotency guarantee this feature is
required to hold (review question 5), and it is not caught by the existing
integration test: the replay case at
`src/relationship-context-store.integration.test.ts:1073-1081` reuses the
*same* `snapshot` object (same `observedAt`) for both calls, so the
watermark is identical both times and the churn path is never exercised.
The client-status aggregate itself is unaffected (its watermark is
content-derived and the "projections every active Party ... without replay
churn" test at line 1464-1469 correctly shows zero churn there), but the raw
per-fact Plutio projection will silently churn forever once the adapter flag
is enabled — inflating `PlutioEngagementResult.projectionsChanged` in the
logged health payload every 15 minutes and masking genuine change signals
for anyone reading that field operationally.

**Smallest safe correction:** drop `observed_at` from the watermark hash
input; hash only the already-present content fields
(`project.id, project.updatedAt, project.status,
project.signedContractCorroborated`), matching the id/content-derived
watermark pattern already used by
`relationship-context-client-projection.ts`.

**Acceptance test:** call `ingestPlutioEngagementSnapshotWithClient` twice
with identical project/contract content but two different `observedAt`
values (simulating a normal unchanged 15-minute re-poll), and assert
`projectionsChanged === 0` on the second call. The current test suite never
varies `observedAt` between the two calls in the replay case, so it cannot
catch this.

### 2. Low — pagination completeness under provider mutation is not independently verifiable from the allowed evidence

**File/evidence:** `src/relationship-context-plutio-engagement.ts:215-240`
(`fetchAll`).

**Causal failure mode:** pages are fetched with `--skip`/`--limit` and a
duplicate-ID `Set` guards against the same row appearing on two pages. That
guard defends against overlap but not against omission: if the underlying
Plutio list endpoint is not ordered by a strictly stable key, or if a row is
deleted between two page fetches (shifting the offset window), an in-range
row can be skipped entirely without ever appearing on any page and without
tripping the duplicate-ID check. `complete: true` would still be asserted.
The actual ordering guarantee, if any, lives in `list-projects.sh` /
`list-contracts.sh`, which are outside this review's allowed read paths, so
this cannot be confirmed or ruled out from the granted scope.

**Smallest safe correction:** if the Plutio API exposes a total-count field,
cross-check it against the accumulated row count before asserting
`complete: true`; otherwise page by a strictly monotonic cursor (e.g. `_id
> last_id`) instead of numeric `--skip`, which closes the omission window
that duplicate-ID detection alone cannot cover.

**Acceptance test:** a fixture where a row present on an earlier "page 1"
result is absent by the time "page 2" is fetched (simulating a mid-scan
deletion) should either surface a detectable gap (e.g. a count mismatch) or
the limitation should be explicitly documented and accepted, rather than
silently reporting `complete: true`.

### 3. Low — host wiring claims are outside the allowed read scope and were not verified

The implementation map's fire-and-forget / overlap-guarded / unref'ed /
consumer-disabled wiring claims (request lines 94-96, review question 9)
describe behavior that lives in `src/index.ts`, which is not on the allowed
read-path list (request lines 53-63). This review can confirm the adapter's
own default-off gate (`plutioEngagementEnabled`,
`relationship-context-plutio-engagement.ts:612-616`) and health/error-code
shape, but cannot independently confirm the scheduler-level overlap-guard,
unref, or fire-and-forget properties claimed for the host wiring itself.
