# NC-20260906-003 Gate D Capacity review — R1 response

## Findings

1. **Medium — `requireOne` collapses every persistence failure into a single
   misleading `stale_version` code, so case/receipt state does not tell the
   truth about the actual failure.**

   Evidence: `src/academy-capacity-operator-store.ts:727-733` defines
   `requireOne(result, code)`, which on `rowCount !== 1` always throws
   `new CapacityCommandError('stale_version', code)` — the descriptive string
   passed at each call site (e.g. `'assignment insert failed'` at line 953,
   `'reservation insert failed'` at line 800, `'waitlist offer insert failed'`
   at line 899, `'seat pool changed during command'` at line 762) is used only
   as the error *message*, never as the error *code*. Every one of these
   distinct failure modes therefore reaches `finalState()`
   (lines 1295-1306) with `error.code === 'stale_version'`, which is in
   `REVIEW_CODES` (line 161), so all of them surface identically as
   `state: 'needs_review', code: 'stale_version'` in the case row, the final
   receipt, and the `[CAPACITY RESULT]` text the minion/operator sees
   (`resultText`, `academy-capacity-ipc-handlers.ts:459-470`).

   Consequence: a true optimistic-concurrency race (safe to retry with a
   fresh version) is indistinguishable, in the persisted receipt and in what
   the operator reads, from an INSERT that matched zero rows because a
   referenced key doesn't exist — for example `assignment insert failed` can
   only occur when the `entitlement_key`/`enrollment_key` join at
   lines 934-939 finds no match, which is a data-integrity mismatch between
   the pure engine's in-memory state and the database, not a version race.
   An operator or any future automation that treats `needs_review` +
   `stale_version` as "safe to resubmit after refreshing versions" (which is
   exactly what the accepted design and `groups/capacity/CLAUDE.md` describe
   for that code) could repeatedly resubmit a case that will never succeed
   because the real defect is a broken key reference, not a stale version —
   masking a genuine bug rather than surfacing it for the review queue this
   table exists to serve.

   Note: this is a truth/observability defect, not a safety defect — the
   transaction still rolls back to the savepoint in every case, so no partial
   or over-capacity domain mutation results (question 1 stands).

   Smallest safe correction: thread a distinct, call-site-specific code into
   `CapacityCommandError` at each `requireOne` invocation (e.g.
   `pool_write_conflict`, `reservation_insert_missing_reference`,
   `assignment_insert_missing_reference`) instead of the shared literal
   `'stale_version'`, and add the new codes to `REVIEW_CODES` so they keep
   routing to `needs_review` rather than changing state-machine behavior.
