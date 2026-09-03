# NC-20260903-002 — Live scheduler correction review R5 — Response

## Scope

Read only the allowed packet: this request, `src/gmail-classification-reaper.ts`,
`src/gmail-classification-reaper.test.ts`, and the import/scheduler call in
`src/index.ts` (lines 195-209, 3073-3123). No Bash, tests, Git, or edits were
run.

## Findings

**Single scheduling primitive replaces the duplicate registration.**
`src/index.ts:202` imports only `startGmailClassificationReaperLoop`; the
prior `runGmailClassificationReaper` symbol is not imported or called
directly. `src/index.ts:3092` calls `startGmailClassificationReaperLoop()`
exactly once, with no other call site in the reviewed file. The `setInterval`

- `setTimeout` dual registration named in the accepted facts is gone.

**At most one in-process sweep at a time.**
`gmail-classification-reaper.ts:110-120`: `schedule()` arms a single
`setTimeout`. Inside the callback, `timer` is nulled, then `run()` is invoked
and chained with `.catch(...).finally(schedule)`. The next `schedule()` call
only happens once the `run()` promise has settled (via `.finally`), whether
it resolved or rejected. No second timer or invocation can be armed while a
sweep's promise is still pending, since `schedule()` is only ever reached
from the initial call or from the `.finally` of the prior run.

**Scheduled after both success and failure.**
The `.catch((err) => logger.error(...))` (line 115-117) absorbs a rejection
into a resolved promise before `.finally(schedule)` runs (line 118), so
`schedule()` fires identically on success and on failure. Fail-loud logging
is preserved — the error is still logged via `logger.error` with the `err`
field, matching the existing pattern used elsewhere in this file (e.g.
`webhook-inbox-reaper`, `contador-name-reaper` catch blocks at
`index.ts:3084-3086`, `3115-3117`).

**Stop function is correct and side-effect-free on future scheduling.**
`stop()` (lines 123-127) sets `stopped = true` and clears any pending timer.
Because `schedule()` checks `stopped` first (line 111), a `stop()` call
either cancels a not-yet-fired timer directly, or — if called while a sweep
is in flight — is honored on the next `.finally(schedule)` attempt, since
that `schedule()` call will see `stopped === true` and return without arming
a new timer. No sweep is left able to reschedule itself after `stop()`.

**Test coverage matches the guarantee.**
`gmail-classification-reaper.test.ts:100-129` uses fake timers to hold a
first `run()` unresolved across an elapsed interval, asserts `run` is still
only called once, then resolves it and asserts the second invocation follows
the next full interval — directly exercising the "no overlap, reschedule
only after settlement" property described above.

**Note (non-material):** `src/index.ts:3092` discards the returned stop
function, so nothing in the reviewed range can stop the loop at runtime.
This matches the existing convention for the other cron-style loops in this
file (webhook-inbox reaper, Trafft sweeper, contador name reaper), none of
which retain their timer handles either, and does not affect the overlap,
reschedule, or fail-loud guarantees under review.

## NO MATERIAL FINDINGS
