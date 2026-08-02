# NC-20260802-003/006 Codex request for Claude implementation review R2

## Review mandate

Perform an independent, adversarial implementation review of the two ready
slices in this worktree:

1. `NC-20260802-003`: atomic, rollback-safe release activation and runtime
   code-root proof.
2. `NC-20260802-006`: Sales Slack work-item containment, including reconnect
   queue delivery.

Do not modify implementation or shared continuity files. Write the complete
review only to
`docs/reports/NC-20260802-003-CLAUDE-C5-REVIEW-R2.md`. Lead with one verdict:
`APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `CHANGES REQUIRED`. Every blocking
finding must include severity, file/line evidence, a concrete failure trace, and
the smallest safe correction.

## Repository and authority

- Worktree: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Branch/base: `codex/nc-20260802-003-company-os-sequence` at `0f20224`
- Production lineage: runtime release `23ffb07`; deployment-record commit
  `0f20224`
- Read first: `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
  `docs/CHANGE-PROTOCOL.md`, the current unreleased changelog entries,
  `groups/inbox/CLAUDE.md`, `groups/sales/CLAUDE.md`, and
  `docs/RELEASE-INTEGRITY.md`
- Prior architecture review:
  `docs/reports/NC-20260802-003-CLAUDE-ARCHITECTURE-REVIEW-R1.md`

The original shared checkout is dirty operational state and is not review
scope. Do not stage, commit, deploy, post to Slack, touch Heartbeat, edit an
installed plist, or operate launchd.

## NC-003 properties to prove or refute

- The candidate is derived from the installed plist and changes exactly
  `ProgramArguments.1`, `EnvironmentVariables.NANOCLAW_CODE_ROOT`, and
  `EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT`.
- The current rollback release, target release, target manifest, installed Node
  interpreter, candidate plist, and current health are validated before the
  installed plist changes.
- Dry-run cannot mutate the installed plist or call launchctl.
- Apply requires an exact local-host confirmation, creates an exclusive exact
  rollback artifact, atomically replaces the plist, performs one bounded legacy
  `unload`/`load` candidate cycle, and requires health to prove target commit,
  resolved code root, and match state.
- Any post-replacement failure restores the exact original plist and attempts
  one bounded rollback cycle. Examine process/listener races, incorrect
  rollback targeting, symlink/path behavior, concurrent activators, stale
  health, and failure between each side effect.
- Production startup fails closed when its executing code root is outside the
  verified release; `/health` exposes enough evidence to prove the activated
  root.

## NC-006 properties to prove or refute

- A new inbound `[HANDOFF: *→sales]` or ASCII-arrow equivalent is the only
  top-level channel post for that received work item and deliberately rolls the
  current lead anchor.
- Drafts, revisions, questions, approval/status updates, and outbound handoffs
  resolve quietly inside the work-item root: no `reply_broadcast`, no generic
  TTL rollover, and no reliance on a model-retyped timestamp.
- A Sales message queued while disconnected re-enters the same routing logic on
  reconnect and cannot bypass containment. A failed flush is bounded and leaves
  the item queued for a later attempt.
- Specifically analyze two simultaneous work items for the same lead. Determine
  whether a human reply in an older thread can cause the next Sales output to be
  redirected to the newer lead anchor. If so, classify whether this violates
  the operator contract and identify the narrowest host-verifiable fix.
- Examine handoffs missing an address, multi-chunk posts, send failures, queue
  ordering, anchor record/roll races, and messages supplied with a wrong or
  source-channel timestamp.

## Intentionally blocked follow-on work

`NC-20260802-004` and `NC-20260802-005` are not implementation-review scope.
Read-only Heartbeat observation found no stable submission ID in the visible
queue/detail URL or DOM. They remain dark pending an owner choice; do not treat
their non-implementation as a defect in NC-003/006.

## Codex verification evidence

Under pinned Node `22.23.2`:

- typecheck: pass
- focused release suite: 3 files / 19 tests
- focused Sales lead/Slack/IPC suite: 3 files / 127 tests
- full application suite: 143 files / 1,795 tests
- independent runner: build pass; 3 files / 22 tests
- source formatting: pass
- schema sanitizer and documentation continuity: pass (34 active/ready rows,
  32 changelog entries)
- `git diff --check`: pass
- production build and activation CLI help load: pass from the same worktree

Independently reproduce the highest-risk focused tests and any additional
adversarial checks needed. Distinguish a demonstrated defect from an accepted
residual risk or future hardening recommendation.
