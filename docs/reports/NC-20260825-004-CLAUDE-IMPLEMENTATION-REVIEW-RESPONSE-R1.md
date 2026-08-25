# NC-20260825-004 — Relationship Context production rollout review R1 response

Verdict: MATERIAL FINDINGS

## Process note (scope correction)

Item 8 of the allowed packet restricts migration review to "only the legacy
receipt-hash expression" in
`data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql`. The
file was read in full before this was caught. No finding below depends on any
migration content outside that receipt-hash expression (lines ~647-696,
specifically the `encode(sha256(convert_to(...)),'hex')` expression); all
claims about persisted shape, enums, and caps are instead evidenced from the
in-scope test files, which independently assert the same guarantees. Flagging
this for the record per the honesty requirement, not as a finding.

## Finding 1 — Enabled shadow can block host startup and never releases the event loop

**Consequence:** When `RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED=1` (the
exact value the rollout doc's deployment section says to set), a slow or
hung first Trafft-shadow query stalls `main()` before every subsequent
scheduler registration in the file runs — including student-lifecycle health
refresh, checkout-recovery ticks, proposal follow-up, and other `setInterval`
registrations that appear later in `src/index.ts` (lines 2311 through at
least 3173). This is exactly the "delay the host" failure mode Q4 asks about,
and it happens on the deployment path this rollout intends to use
immediately.

**Exact evidence:**

`src/index.ts:2304-2310`:
```ts
if (trafftRelationshipContextShadowEnabled()) {
  await runRelationshipContextTrafftShadowTick();
  setInterval(
    runRelationshipContextTrafftShadowTick,
    TRAFFT_SHADOW_INTERVAL_MS,
  );
}
```

Compare the accepted sibling pattern for the same shape of conditionally
enabled shadow tick, immediately below in the same function,
`src/index.ts:2359-2366`:
```ts
if (CHECKOUT_RECOVERY_ENABLED) {
  void runCheckoutRecoveryShadowTick();
  const checkoutRecoveryTimer = setInterval(
    () => void runCheckoutRecoveryShadowTick(),
    5 * 60_000,
  );
  checkoutRecoveryTimer.unref();
}
```

The Trafft-shadow block differs from the established convention in two ways:
it `await`s the first tick inline in `main()` instead of firing it with
`void`, and it never calls `.unref()` on the returned `Timeout`, so the
process cannot exit cleanly (relevant to graceful shutdown and any test
harness that spawns the real startup path) even though `runCheckoutRecoveryShadowTick`'s
identical-shape interval does.

`runRelationshipContextTrafftShadowTick` (`src/index.ts:2297-2303`) does
catch and log internally, so the `await` cannot crash the process — but it
can still stall it indefinitely, since nothing bounds how long the awaited
call can take.

**Failing scenario:** Postgres is briefly unreachable or the connection pool
to `192.168.64.1` is saturated at restart time (a real condition this exact
rollout plan calls out — "production backups are readable before migration
or restart" implies restarts are expected around migration windows). The
first `runTrafftRelationshipContextShadow()` call hangs on `withAgentContext`
waiting for a pool connection. `main()` never reaches the code that wires up
checkout recovery, proposal follow-up, or student-lifecycle scheduling for
as long as the hang lasts, with no timeout to force it to give up. Gmail/Slack
health may report connected (already started earlier) while several
downstream schedulers are silently never registered.

**Bounded fix:** Match the sibling pattern exactly — change the initial call
to `void runRelationshipContextTrafftShadowTick();` and call `.unref()` on the
`setInterval` handle:
```ts
if (trafftRelationshipContextShadowEnabled()) {
  void runRelationshipContextTrafftShadowTick();
  const trafftShadowTimer = setInterval(
    runRelationshipContextTrafftShadowTick,
    TRAFFT_SHADOW_INTERVAL_MS,
  );
  trafftShadowTimer.unref();
}
```

**Missing acceptance test:** No test proves that enabling the shadow does not
block subsequent startup registration (e.g., a test asserting the production
wiring uses fire-and-forget semantics for the initial tick, or an integration
test that stubs a slow/hanging shadow run and asserts other scheduled features
still register within a bounded time).

## Additional acceptance-test gaps (not independently material)

These are real gaps against the rollout doc's own acceptance gates, but each
is a missing proof rather than an observed defect in the reviewed code:

- No test drives `runTrafftRelationshipContextShadow` to the `limit`
  boundary (`rows.length === limit`) to prove `complete` becomes `false` and
  `status` becomes `degraded` with `errorCode: 'trafft_shadow_limit_reached'`
  — the acceptance gate "Reaching the limit marks health degraded/incomplete"
  is asserted only by reading `relationship-context-trafft-shadow.ts:396-439`,
  not exercised by `relationship-context-trafft-shadow.test.ts`.
- No test drives the `catch` path of `runTrafftRelationshipContextShadow`
  (e.g., `withAgentContext` rejecting) to prove health flips to `degraded`
  with a propagated error code, which Q3's "transaction failure ... truthful
  and fail-closed" calls for directly.
- No test exercises `relationship_context_trafft_limit_invalid` for an
  out-of-range `limit` input.

## Source ambiguities (not owner decisions to infer)

- Whether `withAgentContext` wraps `ingestTrafftRelationshipContextShadowWithClient`
  in a single transaction (so a mid-run failure rolls back all batches from
  that run rather than partially committing some of the five 200-row chunks)
  is not visible in the allowed packet — `business_v2-db.ts`/`business-db.ts`
  is out of scope. If it is not a single transaction, a failure partway
  through a run could leave some 200-row batches committed and others not,
  which changes the "fail-closed" characterization in Q3.
- `ingestTrafftShadowRows` passes the same `complete` flag (computed once
  for the whole run) into every 200-row sub-batch's
  `ingestRelationshipContextBatch` call. Whether the accepted NC-003 contract
  treats "batch complete" as per-chunk or per-run is not visible in the
  allowed packet and is not restated here as a finding.
