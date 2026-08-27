# NC-20260826-005 independent-cycle correction review response R5

Reviewed only the three allowed artifacts plus the request. No files edited,
no Bash/web/MCP/provider tools used, no other file inspected. R2/R3/R4's
accepted findings were not reopened.

## Verification of the correction's claims against the code

- `src/relationship-context-source-enrichment.ts:1464-1483` — the
  `interactionChanges`/`inboxChanges` queries run unconditionally inside the
  same `Promise.all` on every call. The `cursor.interactionDone`/
  `cursor.inboxDone` short-circuit that R4 found (previously gating one lane
  to `Promise.resolve({ rows: [] })` while it waited for the other) is gone.
  Both lanes always read their next bounded `WHERE id>$1::bigint ORDER BY id
  LIMIT perSourceLimit+1` page every tick. This matches the request's first
  claim.
- `:1720-1730` — `nextCursor.interactionId` resets to `'0'` whenever
  `interactionComplete` (this tick's own page came back `<= perSourceLimit`)
  is true, independent of `inboxComplete`/`interactionCovered`/
  `inboxCovered`; `inboxId` resets on `inboxComplete` the same way. Neither
  reset reads or waits on the sibling lane's state. This matches the second
  claim, and it is exactly option (a) of R4's "smallest acceptable
  correction."
- Because each lane's own reset no longer depends on the other, the R4/R3
  failure mode (a lane parks at `done`, freezing its cursor above a
  not-yet-committed id while the other lane keeps it waiting indefinitely)
  cannot recur: there is no `done` state left to park in, and a quiet lane's
  own bounded cycle completes and restarts at `'0'` on its own schedule,
  regardless of the sibling's throughput. This matches the third claim.
- `interactionCovered`/`inboxCovered` (`:1551-1553`) are sticky OR-accumulate
  flags feeding only the aggregate `complete` health signal; they do not
  gate, delay, or otherwise participate in either lane's own
  `interactionId`/`inboxId` cursor advance or reset, so the per-row
  skip/replay guarantee does not depend on them. `interactionPageComplete`/
  `inboxPageComplete` (`:1744-1745`) are the plain per-tick
  `interactionComplete`/`inboxComplete` values, unchanged in meaning from
  R4. Matches the fourth claim.
- Numeric ordering (`ORDER BY i.id`/`ORDER BY w.id`, cursor advances only to
  an actually-read `selectedInteractionChanges.at(-1)?.id`/
  `selectedInboxChanges.at(-1)?.id`, never a snapshotted `MAX(id)`),
  changed-visitor evidence expansion (`:1491-1550`), the single
  `advanceSourceWatermark` write on `input.client` alongside the fact
  ingest, the malformed-visitor-id legacy path (`:1579-1596`), and the
  `party_context_observations`/`projections` PII-negative readback are all
  unchanged from the R4 version reviewed previously. Matches the fifth
  claim.

## Residual conditions checked and found not material

- A single lane that receives more than `perSourceLimit` new matching rows
  in every tick forever would never see `interactionComplete`/
  `inboxComplete` go true and so would never reset independently either —
  but this is an inherent capacity property of any bounded-page cursor (the
  R2 baseline included), not a defect this correction introduces or fails
  to fix; it requires sustained per-source volume in the thousands per
  15-minute tick indefinitely, and the correction's fix is specifically
  about removing the cross-lane wait, not about unbounded arrival rates.
  Not reported as material.
- The cited evidence's fixture uses equal (3 vs 3) interaction/inbox counts,
  so it does not exercise a page-count asymmetry between lanes end-to-end.
  Unlike the R4 correction under review at the time (whose reset correctness
  depended on cross-lane synchronization, making that gap load-bearing),
  this correction's per-lane reset is independent by construction and
  verifiable from the code alone without an asymmetric fixture. Noted, not
  reported as material.

## Conclusion

`NO MATERIAL FINDINGS`
