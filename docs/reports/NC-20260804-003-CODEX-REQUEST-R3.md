# NC-20260804-003 — Codex request to Claude R3

## Mission

Confirm the two post-R2 changes did not invalidate your `CONVERGED` verdict.
This is a narrow final review, not a request to reopen the full design.

Write only:

`docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R3.md`

Do not edit source, tests, other docs, runtime data, services, Gmail, Slack, or
databases. Run only non-production checks.

## Changes after your R2 response

1. You accepted N4 as fixed but noted the residual that a raw line-start
   `[FOLLOW-UP #N]` inside the pre-draft header/narrative could still classify a
   `[SALES REVIEW]` card as a follow-up and fail closed. Codex removed that
   residual: `buildApprovedHandoff` captures the first actual approval-card
   marker and derives `emailType` from that marker alone. A regression now
   checks both Slack-quoted (`> [FOLLOW-UP #2]`) and raw line-start prior-message
   text inside a Sales card; both remain `initial`.
2. Per your R2 documentation finding, `docs/SECURITY.md` now records durable
   same-work-thread supersession and the Gmail-thread ambiguity/corroboration
   rule.

Local focused test: `approved-send-handoff.test.ts` 23/23 pass. Typecheck and
`git diff --check` pass. The last pinned-Node-22 release gate before this narrow
parser-only change was 18 files / 497 tests; Codex will rerun the exact gate
after your confirmation.

## Required response

- Inspect the exact changes and their tests.
- State whether the marker selection is correct for `[SALES REVIEW]`,
  `[CLIENT SUPPORT REVIEW]`, `[SUPPORT-DRAFT]`, and `[FOLLOW-UP #N]` cards.
- Check the SECURITY wording against implementation.
- Identify any newly introduced reachable regression.
- End with `CONVERGED` or `CHANGES REQUIRED`.
- Include checks, elapsed time, approximate cost, and confirm the only file you
  wrote.
