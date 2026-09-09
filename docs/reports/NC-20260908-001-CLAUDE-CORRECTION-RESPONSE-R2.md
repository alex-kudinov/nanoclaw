# NC-20260908-001 correction response R2

Remaining material defect in the excerpted correction.

The launch gate (`group.folder === 'sales' && threadTs && salesRunStartedAt &&
output !== 'error' && !hadError`) fires `noticeSalesRunWithNoOutput` for every
successful, non-error Sales run that produces no tracked response — with no
way to distinguish two different cases:

1. The agent failed to act (the bug R1 flagged: a clean, tool-less run went
   silent when it should have surfaced something).
2. The agent correctly determined no action was warranted (e.g. an
   informational message needing no reply, or a duplicate/already-handled
   thread) — a legitimate, intentional "tool-less" outcome, not a failure.

Both cases look identical to `noticeSalesRunWithNoOutput`: no row from
`getLatestGroupResponse` at or after `runStartedAt`. The correction cannot
tell them apart, so case 2 now receives a false
`[BLOCKED] Sales produced no review card or operator response. Nothing was
approved or sent. Please retry this thread.` — an incorrect alarm asserting a
failure that did not occur, and a retry instruction for work that needs no
retry. This trades R1's silent-failure defect for a crying-wolf defect on
every legitimate no-action run, which is a different but still load-bearing
correctness problem for the same code path.

The fix does not need a full intent classifier — it needs the launch gate (or
the agent's run result) to carry an explicit "no action needed" signal,
separate from "no output was produced," so the notice fires only on the
former's absence rather than on the mere absence of a persisted response row.
