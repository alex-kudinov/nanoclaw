# Claude bounded review response: container timeout severity

Task: `NC-20260823-005`. Reviewed only `src/container-runner.ts` and
`src/container-runner.test.ts` against the request file's stated exact change.

## Verdict

**NO MATERIAL FINDINGS**

## Evidence reviewed

- `src/container-runner.ts:1254-1276` (`killOnTimeout`): `timedOut = true` is
  set unconditionally (line 1255), then branches only on `hadStreamingOutput`
  for the log level/message — `logger.info` at line 1257 when true,
  `logger.error` at line 1262 when false. The `exec(stopContainer(...), ...)`
  call (line 1267) sits outside the if/else and runs unconditionally in both
  branches. Stop behavior and `timedOut` state are unchanged, matching the
  stated scope.
- `src/container-runner.ts:1403-1448` (close handler): pre-existing branch on
  `hadStreamingOutput` is unchanged — `logger.info` + `status: 'success'` for
  post-output timeout (lines 1422-1434), `logger.error` +
  `status: 'error'` for true no-output timeout (lines 1437-1447). The new
  `killOnTimeout` logging now agrees with this existing downstream branch
  instead of contradicting it.
- `hadStreamingOutput` (line 1233) is set exactly once, monotonically, only on
  a fully parsed `OUTPUT_START`/`OUTPUT_END` marker pair (lines 1197-1200), and
  is read by reference in the `killOnTimeout` closure — no reset or
  reassignment path exists between spawn and either log site.
- `src/container-runner.test.ts:500-543` ("timeout after output resolves as
  success"): emits an output marker, advances the fake clock to the
  `Math.max(CONTAINER_TIMEOUT, IDLE_TIMEOUT + 30_000) = 1_830_000ms` hard
  deadline, and asserts `logger.info` was called with
  `'Container timeout after output, stopping gracefully'` and that
  `logger.error` was never called with a `'Container timeout'`-prefixed
  message. This exercises the now-conditional `killOnTimeout` info branch
  correctly.
- `src/container-runner.test.ts:545-570` ("hard timeout with no output logs an
  error and resolves as failure"): fixture sets
  `containerConfig: { timeout: 1_000, spawnTimeout: 2_000 }` with
  `isScheduledTask: true`, so `effectiveContainerTimeoutMs` returns the raw
  `1_000ms` config value (scheduled tasks skip the idle floor), placing the
  hard timeout strictly before the 2,000ms spawn timeout. No output is
  emitted, so `hadStreamingOutput` is false when the 1,000ms timer fires;
  the test asserts the exact new error message and a final
  `status: 'error'` result containing `'timed out'`. Traced against the
  source, this correctly exercises the true no-output error path end to end
  (`killOnTimeout` error log → close handler error log →
  `error: 'Container timed out after 1000ms'`).
- No other log or resolution site in either file reads or is affected by
  `hadStreamingOutput`; the spawn-timeout path (lines 1284-1297) and its test
  (lines 622-643) are untouched and still unconditionally error, as expected
  for "no output markers within window."

## Scope notes

No defect was found that is attributable to this exact two-file change. A
theoretical race between the poll-based stdout tail and the absolute
`killOnTimeout` deadline (output landing in the log file but not yet drained
at the instant the hard timer fires) is architectural, predates this change,
identically affects the pre-existing close-handler branch this fix now
mirrors, and depends on `log-tail.ts` behavior outside the allowed paths — it
is not evaluated here per the bounded scope.
