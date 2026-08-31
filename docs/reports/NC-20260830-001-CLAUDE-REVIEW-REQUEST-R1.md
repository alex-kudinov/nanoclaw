# NC-20260830-001 bounded implementation review

## Objective

Review the exact-live-lineage correction for two grader discrepancy runs that
produced no usable thread result. Report only material correctness, security,
regression, or release-blocking findings.

## Incident facts accepted for this review

1. One grader turn called `mcp__nanoclaw__send_message` without `thread_ts`.
   The host accepted the operator-only message and posted it at the channel
   root even though the same host had already registered the exact run/thread
   binding. The submission thread later received the fixed
   `final-text-without-thread-output` notice.
2. A second discrepancy turn called no staging tool and left the operator
   decision only in suppressed final text.
3. Student records have been resolved separately through the guarded Heartbeat
   operator workflow. This review must not inspect student files, Slack content,
   credentials, runtime databases, or session transcripts.

## Authority and invariants

- Root `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT-MAP.md`, and
  `docs/CHANGE-PROTOCOL.md` govern repository work.
- `groups/grader/CLAUDE.md` governs grader behavior.
- Host-minted `run_id` and `src/grader-run-context.ts` are the authority for an
  exact grader turn's destination and submission context.
- The model must not choose or override `run_id`.
- Student staging stays fail-closed without exact run context; final assistant
  text stays suppressed and must never be wrapped or copied to Slack.
- Cross-group traffic, grader-to-certifier handoffs, non-grader channels,
  duplicate-student-copy prevention, and expired/post-restart behavior must not
  change.
- Operator-only help/status output without a live submission context may still
  work through its existing path.

## Changed implementation to inspect

1. `src/grader-run-context.ts`
2. `src/grader-run-context.test.ts`
3. `src/ipc.ts`
4. `src/ipc-grader-boundary.test.ts`
5. `groups/grader/CLAUDE.md`
6. `src/grader-prompt-contract.test.ts`
7. `docs/ACTIVE-WORK.md`

The patch adds `getGraderRunBinding(runId, jid)`. When the exact unexpired run
binding exists, grader output uses its host-recorded thread instead of an
omitted or conflicting model-supplied `thread_ts`. The prompt now explicitly
requires discrepancy notices to call `mcp__nanoclaw__send_message` with `text`
and the triggering thread, rather than leaving the notice only in final text.

## Evidence already passed

- Pinned Node 22.23.2.
- Focused tests: 4 files, 74 tests passed.
- Root TypeScript typecheck passed.
- Prettier completed on every changed implementation/test/prompt file.

## Review questions

1. Can an untrusted grader turn use the new binding lookup to redirect output,
   borrow another run's authority, revive expired context, or weaken the exact
   destination/thread requirement?
2. Does binding the thread before calling `deliverGraderOutput` correctly fix
   operator-only messages while preserving student-copy and restart/adoption
   fail-closed behavior?
3. Are the regression tests sufficient for omitted thread, conflicting thread,
   overlapping run IDs, wrong destination, expiry, and no-context cases?
4. Does the prompt correction address the skipped-tool failure without
   introducing a conflicting output contract?

## Response contract

Write only
`docs/reports/NC-20260830-001-CLAUDE-REVIEW-RESPONSE-R1.md`.

Use one of:

- `NO MATERIAL FINDINGS`, followed by brief evidence; or
- material findings ordered by consequence, with exact file/line evidence and
  the smallest safe correction.

Do not edit implementation, tests, prompts, continuity files, or any other
path. Do not use Bash, web, MCP, credentials, runtime state, or private data.
