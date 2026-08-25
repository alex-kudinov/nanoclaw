# NC-20260825-004 — Relationship Context correction review R2 response

Verdict: NO MATERIAL FINDINGS

## Q1 — Is the R1 startup/event-loop finding closed?

Yes. `src/index.ts:2312-2319`:

```ts
if (trafftRelationshipContextShadowEnabled()) {
  void runRelationshipContextTrafftShadowTick();
  const relationshipContextTrafftShadowTimer = setInterval(
    () => void runRelationshipContextTrafftShadowTick(),
    TRAFFT_SHADOW_INTERVAL_MS,
  );
  relationshipContextTrafftShadowTimer.unref();
}
```

The initial tick is fire-and-forget (`void`, not `await`), and the interval
timer is `.unref()`'d — matching the accepted `CHECKOUT_RECOVERY_ENABLED`
sibling pattern R1 cited. `main()` no longer stalls on a slow/hung first
Trafft query before registering later schedulers.

## Q2 — Does the in-flight guard release after both success and failure, without blocking other startup work?

Yes. `src/index.ts:2297-2311`:

```ts
let relationshipContextTrafftShadowInFlight = false;
const runRelationshipContextTrafftShadowTick = async (): Promise<void> => {
  if (relationshipContextTrafftShadowInFlight) {
    logger.warn('relationship context Trafft shadow tick already running');
    return;
  }
  relationshipContextTrafftShadowInFlight = true;
  try {
    await runTrafftRelationshipContextShadow();
  } catch (err) {
    logger.error({ err }, 'relationship context Trafft shadow tick failed');
  } finally {
    relationshipContextTrafftShadowInFlight = false;
  }
};
```

`finally` releases the flag on every exit path (success, rejection). The
guard is a synchronous boolean check at tick entry, read/written only inside
this closure — nothing in `main()` awaits it, so it cannot block other
startup registrations; it only prevents a slow run from overlapping with the
next 15-minute interval tick.

`relationship-context-trafft-shadow-wiring.test.ts` asserts the exact source
strings for all four invariants (`void` call, `.unref()`, guard check, guard
release) and asserts the blocking form is absent. This is a source-text
assertion, not a runtime/behavioral test, but it directly encodes the fix R1
prescribed.

## Q3 — Are the three R1 non-material acceptance-test gaps now covered?

Two of three are covered as originally specified; one is covered only
partially (non-material either way, consistent with R1's own classification):

- **Catch-path gap — closed.** `relationship-context-trafft-shadow.test.ts`
  ("records transaction failure truthfully...") mocks `withAgentContext` to
  reject and asserts the call rejects and `getTrafftRelationshipContextShadowHealth()`
  reports `status: 'degraded'`, `errorCode: 'relationship_context_trafft_shadow_failed'`.
  This exercises the real `catch` block in `runTrafftRelationshipContextShadow`.
- **Invalid-limit gap — closed for the exercised branch.** The same test
  drives `limit: 0` and asserts a throw of `relationship_context_trafft_limit_invalid`.
  Only the lower-bound branch (`limit < 1`) is exercised; the upper bound
  (`limit > TRAFFT_SHADOW_MAX_ROWS`) shares the same guard clause and is not
  separately tested, but this was already a single combined acceptance gate
  in R1, not two.
- **Limit-boundary gap — not closed as originally specified.** The new test
  ("reports an incomplete limit-bound run as degraded") stubs
  `businessDb.withAgentContext.mockResolvedValue({ complete: false, ... })`
  directly, bypassing `ingestTrafftRelationshipContextShadowWithClient`
  entirely. It proves `runTrafftRelationshipContextShadow`'s health-mapping
  logic (`result.complete === false` → `status: 'degraded'`,
  `errorCode: 'trafft_shadow_limit_reached'`), but it does not drive the
  actual `rows.length === limit` → `complete: false` computation at
  `relationship-context-trafft-shadow.ts:379`
  (`complete: rows.length < input.limit`). That boundary computation itself
  is still asserted only by reading the source, exactly as R1 found. Since R1
  already classified this as non-material, this is reported per Q3's request
  and not elevated to a material finding.

## Q4 — Does `withAgentContext` provide one transaction across registration and all observation batches, with rollback on any failure?

Yes. `src/business-db.ts:67-100`: `withAgentContext` delegates to
`withTransaction`, which issues a single `BEGIN` before invoking `fn`, a
single `COMMIT` after `fn` resolves, and `ROLLBACK` in the `catch` if `fn`
throws — one `PoolClient` for the whole call. In
`relationship-context-trafft-shadow.ts:363-382`,
`ingestTrafftRelationshipContextShadowWithClient` receives that one `client`
and passes it through unchanged to `readRows`, `registerAdapter`, and every
iteration of `ingestTrafftShadowRows`'s 200-row loop (via
`new PostgresRelationshipContextRepository(client)`); no intermediate
`COMMIT`/`BEGIN` occurs anywhere in that path. A failure in any chunk
propagates up through the same call stack `withTransaction` wraps, so all
prior chunks in that run roll back together. This resolves the R1 source
ambiguity: it is a single transaction, not per-chunk commits.

## Q5 — Is `ObservationBatch.complete` consistently a whole-collection signal, or still ambiguous?

Consistent within the reviewed code, but the deeper contract question is
unresolved because it depends on an out-of-scope file. In
`ingestTrafftShadowRows` (`relationship-context-trafft-shadow.ts:222-275`),
`complete` is computed once per run — `rows.length < input.limit` from
`ingestTrafftRelationshipContextShadowWithClient:379` — and the identical
scalar (`input.complete ?? true`) is passed unchanged into every 200-row
chunk's `batch.complete` field inside the `for` loop. There is no per-chunk
recomputation and no divergence between chunks in a single run, so the value
is applied consistently as a whole-collection signal, not accidentally
varied per chunk.

Whether `ingestRelationshipContextBatch`'s consumer (in `relationship-context.ts`,
out of scope per the allowed packet) treats `ObservationBatch.complete` as
"this call's data is the final/complete slice" versus "the overall
collection this call belongs to is complete" cannot be verified from the
allowed packet. This is the same ambiguity R1 flagged and explicitly did not
restate as a finding; nothing in this delta's in-scope files changes that —
it remains an unresolved but non-material ambiguity outside this review's
scope.
