# Claude bounded review request: container timeout severity

## Objective

Review the exact two-file correction for material defects. The change must stop
expected post-output container timeout cleanup from creating critical healer
incidents while preserving error behavior for a true no-output hard timeout.

## Accepted facts and authority

- Owner-approved task: `NC-20260823-005`, first source
  `healer:d0ca940a103136d3` in a sequential `MAX_ITEMS=1` pilot.
- The incident has 46 occurrences. Its verified root cause is the unconditional
  `logger.error` in `killOnTimeout`: the later close handler already treats a
  timeout after streamed output as successful idle cleanup.
- Do not redesign container lifecycle, change timeout durations, alter stop/kill
  behavior, widen healer actions, or address another incident.
- Production deployment and incident closure happen only after Codex validation;
  Claude has review authority only.

## Allowed paths

1. `src/container-runner.ts`
2. `src/container-runner.test.ts`
3. This request file

Do not read `.env`, credentials, auth/session directories, logs, databases,
unrelated private files, or other source files. Do not edit source.

## Exact change

- `killOnTimeout` now logs info when `hadStreamingOutput` is true and error when
  it is false; stop behavior and `timedOut` state are unchanged.
- The existing post-output timeout test now asserts informational/no-error
  logging.
- A new scheduled-task fixture makes the hard timeout precede spawn timeout and
  asserts true no-output timeout logging plus error result.

## Verification already run

- `src/container-runner.test.ts`: 37 passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

## Required response

Write only
`docs/reports/NC-20260823-005-CLAUDE-TIMEOUT-REVIEW-RESPONSE.md`.

Use verdict `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`. Report only defects
that could still emit a false error for post-output cleanup, suppress a real
failure, change timeout/termination semantics, make the tests falsely pass, or
invalidate the stated production closure. Include exact file/line evidence and
the smallest correction. Do not propose unrelated cleanup or a backlog.
