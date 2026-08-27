# NC-20260826-005 late-commit cursor correction review response R4

Reviewed only the three allowed artifacts plus the request. No files edited,
no Bash/web/MCP/provider tools used, no other file inspected. R2's and R3's
accepted findings were not reopened.

## Finding — the "necessarily read in the next bounded cycle" guarantee only
holds if both Chaos lanes reach `done` on the *same* tick; a lane that
finishes early and then waits can still permanently drop a row that commits
late, if the other lane never catches up in lockstep

- File/function: `src/relationship-context-source-enrichment.ts:1464-1491`
  (per-lane query short-circuit on `cursor.interactionDone`/`cursor.inboxDone`
  and the `interactionComplete`/`inboxComplete`/`complete` computation) and
  `:1724-1734` (`nextCursor` construction inside
  `ingestChaosVerifiedLedgerWithClient`).
- What the correction gets right: the cursor no longer snapshots a separate
  `MAX(id)` and jumps to it. `interactionId`/`inboxId` now advance only to
  `selectedInteractionChanges.at(-1)?.id` / `selectedInboxChanges.at(-1)?.id`
  (`:1727-1731`) — an ID that was actually read from a committed,
  currently-visible row, exactly like `ingestContactFormLedgerWithClient`'s
  `lastRow?.id` (`:1380`). And when `complete` (both lanes drained on the
  same tick) both cursors reset to `'0'` and both done flags to `false`
  (`:1726-1733`), so the very next tick re-scans the full table from the
  start. That reset is what makes the correction's core claim true in the
  common case: a row that lost a commit race is invisible to *this* cycle's
  bounded page, but the *next* full-from-zero cycle will see it once its
  transaction has settled.
- What is not fixed: the reset only fires when `interactionComplete &&
  inboxComplete` are true **simultaneously** (`:1488-1491,1557`). If one lane
  finishes its drain first, it is marked `done` and stops being queried at
  all (`:1465-1466,1476-1477` — `Promise.resolve({ rows: [] })`), holding its
  cursor pinned at the last ID it actually read while it waits for the other
  lane. If the other lane never completes a page in the same tick as the
  first lane is sitting idle — e.g. `business_v2.webhook_inbox` rows tagged
  `source='chaos'` keep arriving faster than `perSourceLimit` per 15-minute
  tick while `business_v2.interactions` rows do not — the interaction lane's
  cursor never resets to `'0'`. Any `interactions` row whose `nextval()` was
  taken before the interaction lane's last read but that commits *after* the
  interaction lane was marked `done` now has an id below the frozen cursor
  and is excluded by `WHERE i.id>$1::bigint` (`:1470`) on every subsequent
  tick, indefinitely — for as long as the inbox lane keeps failing to
  finish in the same tick as the interaction lane. This is the identical
  failure mode R3 found (a completed lane's cursor advancing past a
  not-yet-committed row and then never looking back), just gated on
  cross-lane throughput asymmetry instead of applying unconditionally.
- Why this is a still-material gap in the R4 correction specifically: the
  correction's own stated design ("a lane that reaches its current end
  waits while the other drains; when both are done, both positions/done
  flags reset") is exactly the mechanism that creates the conditional hold;
  the correction's conclusion ("cannot be skipped permanently") does not
  follow from that design unless simultaneous completion is guaranteed, and
  nothing in the code guarantees it — a persistently busier lane can hold
  the other lane's cursor frozen indefinitely.
- Not exercised by the cited evidence: the disposable-PostgreSQL 4/4 proof
  drains a static, synchronously-inserted fixture set with three interaction
  rows and three inbox rows; both lanes finish together within the same
  handful of pages because nothing is being inserted concurrently. It never
  constructs a sustained imbalance where one lane repeatedly re-fills past
  `perSourceLimit` while the other sits `done`, so it cannot observe whether
  the "wait" state ever actually resolves, or how long a frozen cursor
  survives under that condition.
- Realistic impact: lower than R3's version of the bug (it requires a
  sustained cross-table volume imbalance rather than any single commit
  race), but the failure signature is the same — a Chaos interaction or
  inbox row is silently dropped from all future ticks, `complete`/health
  counters report a clean drain, and a Party that should have received
  `attribution.chaos.verified_visitor@1` never does.
- Smallest acceptable correction: don't let a `done` lane's cursor go
  unrevisited indefinitely while waiting on the other lane. Either (a) reset
  a lane's own cursor to `'0'` on its *own* completion rather than waiting
  for the paired lane (each lane independently loops the same table
  perpetually, decoupling the two full-rescan cycles), or (b) apply R3's
  originally suggested settled-horizon bound (age margin / xmin snapshot) to
  each lane's own head so a lane never marks itself `done` past an ID whose
  writing transaction isn't guaranteed committed, removing the need for the
  reset to be simultaneous at all.

Report only a still-material correctness, skip/replay, scale, or privacy
defect in this late-commit correction with exact evidence, per the request.
The finding above is that defect; no other material issue was found in the
allowed packet.
