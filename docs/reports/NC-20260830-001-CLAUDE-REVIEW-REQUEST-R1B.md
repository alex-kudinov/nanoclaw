# NC-20260830-001 narrow review retry

The prior review was stopped for scope drift before it wrote an artifact. This
is the same bounded review, narrowed to the load-bearing change only.

## Review exactly these files

1. `src/grader-run-context.ts`
2. `src/grader-run-context.test.ts`
3. `src/ipc.ts` lines 968-1029 only
4. `src/ipc-grader-boundary.test.ts` lines 275-430 only
5. `groups/grader/CLAUDE.md` lines 124-138 only
6. `src/grader-prompt-contract.test.ts`

Do not Glob or Grep outside those paths/ranges. Do not read continuity files,
other source, runtime state, private data, or prior reports.

## Exact question

An exact, unexpired host-minted `run_id` already maps to one grader JID and one
submission thread. The patch adds `getGraderRunBinding(runId, jid)` and makes
grader-to-grader IPC use that host thread when the model omits or conflicts on
`thread_ts`. Without a valid binding, existing behavior remains. The prompt
also requires discrepancy notices to call `send_message` with `text` and the
triggering thread instead of leaving the notice only in suppressed final text.

Report only a material security/correctness/regression defect in that design or
implementation. In particular check cross-run borrowing, expiry, wrong JID,
post-restart behavior, duplicate student-copy protection, and operator-only
thread placement. Focused 74/74 tests and typecheck already pass.

## Output

Write only
`docs/reports/NC-20260830-001-CLAUDE-REVIEW-RESPONSE-R1B.md`.

Either write `NO MATERIAL FINDINGS` with brief evidence, or list material
findings with exact file/line evidence and the smallest safe correction. Do not
edit any implementation or other path.
