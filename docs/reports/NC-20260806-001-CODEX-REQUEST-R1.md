# NC-20260806-001 — Claude review request R1

## Objective

Adversarially review the uncommitted NC-20260806-001 repair for a Sales
approval card that the host rejected while the originating agent incorrectly
reported that the draft had been posted. Determine whether the repair closes
the exact failure without weakening approval, content, thread, or container
isolation boundaries.

Write the review to:

`docs/reports/NC-20260806-001-CLAUDE-RESPONSE-R1.md`

Return exactly one verdict: `CONVERGED` or `CHANGES REQUIRED`.

## Incident evidence accepted as fact

- A syntactically valid Sales card for Lead #1047 contained the banned phrase
  `happy to help`.
- Container-side `send_message` returned `Message sent.` at
  `2026-08-06T21:13:23.420Z`.
- The asynchronous host replaced the card with `[APPROVAL CARD REJECTED]` at
  `2026-08-06T21:13:23.659Z`.
- Sales then emitted `Draft posted ... awaiting approval` at
  `2026-08-06T21:13:25.750Z`; the host relayed it into the same Slack thread.
- The exact rejected card was recovered. Only the banned phrase was corrected;
  the existing deployed parser/content guard accepted it, and the normal Sales
  IPC path posted the corrected approval card in the original work thread at
  Slack ts `1786051860.082149`. No approval or customer email send occurred.

Do not reopen or reproduce customer data beyond the sanitized facts above.

## Proposed repair to review

1. `src/ipc.ts` performs the same content check before calling Slack while it
   still has the directory-derived `source_container`. A failed card is
   quarantined, rejected visibly in the original work thread, and returned to
   that exact container with an instruction to correct/repost and not claim
   success.
2. `container/agent-runner/src/ipc-mcp-stdio.ts` no longer calls an approval-card
   file write `Message sent`; `queuedMessageResult` labels it submission for
   host validation and explicitly says not to claim it awaits approval.
3. `src/index.ts` suppresses narrow model-authored `draft/review card posted or
   ready ... awaiting approval` recaps for card-posting groups even in threaded
   work units, while preserving genuine progress and Gmail receipt text.
4. Sales instructions and architecture/security/project-map documentation are
   updated; `src/approval-recap.test.ts` is added to the shared release-blocking
   email gate.

## Authority order

1. Running code and tests.
2. `CLAUDE.md`, `groups/sales/CLAUDE.md`, and
   `groups/sales/WORKFLOWS.md`.
3. `docs/PROJECT-MAP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and
   `docs/CHANGE-PROTOCOL.md`.
4. This brief and incident records.

## Files in scope

- `src/ipc.ts`
- `src/ipc-handoff-echo.test.ts`
- `src/index.ts`
- `src/approval-recap.ts`
- `src/approval-recap.test.ts`
- `container/agent-runner/src/ipc-mcp-stdio.ts`
- `container/agent-runner/src/send-message-result.ts`
- `container/agent-runner/src/send-message-result.test.ts`
- `scripts/run-email-critical-tests.mjs`
- `groups/sales/CLAUDE.md`
- `groups/sales/WORKFLOWS.md`
- relevant changed documentation

You may write only the requested Claude response artifact. Do not edit source,
tests, prompts, or other documentation.

## Required adversarial checks

1. Prove the exact Marina failure now causes a targeted correction turn and
   cannot leave only a rejection plus a false success recap.
2. Check concurrent Sales containers: the rejection must not reach a sibling.
3. Check an exited/unavailable source container: the card must remain visibly
   rejected and quarantined, never posted or rerouted to a sibling.
4. Check that accepted cards still post once in the original work thread.
5. Check that direct Slack transport retains its independent content guard.
6. Check recap suppression for false positives that could hide real progress,
   questions, errors, Gmail holds, or Gmail receipts.
7. Check every supported approval marker and cross-group behavior of the
   container tool result.
8. Check release packaging includes the new runner source/test and the shared
   email gate includes the new host regression.
9. Identify any remaining route where an approval card can be rejected after
   the IPC preflight without returning targeted feedback.

## Mechanical evidence already produced

- Pinned Node `22.23.2` typecheck: pass.
- Focused host tests: 3 files / 132 tests pass.
- Container agent-runner: build passes; 4 files / 28 tests pass.
- Shared email-critical gate: 19 files / 505 tests pass.
- Full host suite with required loopback/subprocess permissions: 148 files /
  1,935 tests pass.
- Formatting and diff whitespace: pass.

Independently inspect and rerun narrow checks as needed. Report concrete file
and line evidence, residual risks, elapsed time, and any owner decision. Do not
treat existing green tests as proof without examining the paths above.
