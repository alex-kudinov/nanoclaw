# NC-20260806-001 — Claude review request R3

## Objective

Verify the exact repair to R2's remaining F3 objection and return `CONVERGED`
or `CHANGES REQUIRED` in:

`docs/reports/NC-20260806-001-CLAUDE-RESPONSE-R3.md`

Use R2 as the finding authority:
`docs/reports/NC-20260806-001-CLAUDE-RESPONSE-R2.md`.

Write only the requested response artifact. Do not edit source or other docs.

## Repairs to verify

1. `src/slack-limits.ts` now owns both the group-prefix calculation and the
   complete prefix-aware over-limit predicate.
2. `src/ipc.ts` and `src/channels/slack.ts` call that same predicate with the
   same text and `fromGroup`; Slack also obtains the actual prefix from the
   shared helper.
3. The exact leading-newline reproduction is a real IPC regression: a valid
   3,995-character Sales card is rejected while source identity is available,
   targeted back to only the exact container, visibly rejected in its work
   thread, quarantined, and never submitted as the original card.
4. The two R2 residual safety improvements are included: interrogative and
   `still` recaps remain visible, and the shared immutable email release gate
   now runs the independent container runner build and 29-test suite.

## Required checks

- Re-run the R2 leading-whitespace reproduction against the real shared
  predicate and actual IPC branch.
- Verify there is no remaining length/prefix predicate drift between IPC and
  Slack.
- Verify the email release gate actually fails if the runner build or tests
  fail, without relying on root Vitest discovery.
- Check that the recap additions do not unsuppress Marina's exact false recap.
- Report any blocking defect, residual risk, elapsed time, and owner decision.

## Current independent evidence

- Pinned Node 22.23.2 typecheck: pass.
- Post-R2 email-critical gate: 19 files / 513 tests plus runner build and 4
  files / 29 tests pass.
- Final complete suite: 148 files / 1,943 tests pass.
