# NC-20260809-001 grader release record

Date: 2026-08-10

## Release boundary

Deploy the reviewed grader recalibration while keeping Heartbeat result
writeback disabled. The host may read six allowlisted lesson records to ground
grading in the current assignment. It has no automatic submission approval,
feedback-write, retry, or certificate side effect in this release.

## Included

- deterministic human-voice/process-trace output gate;
- one strict, prefix-free Slack staging path;
- whole-thread duplicate-delivery proof;
- current read-only Heartbeat assignment grounding for six Foundation lessons;
- explicit student identity and salutation check;
- per-Claude-turn host proof across initial, warm, retry, and fallback turns;
- fail-closed restart/adoption behavior;
- unconditional grader raw-final-text suppression;
- tracked grader registration and prompt contract.

## Verification before build

- Node 22.23.2 root and agent-runner typechecks: pass;
- focused grader boundary: 121 tests pass;
- full root suite: 160 files, 2,178 tests pass;
- agent runner: 5 files, 34 tests pass;
- documentation continuity and `git diff --check`: pass.

## Activation order

1. Build and verify one immutable release from this clean commit.
2. Install the release on the Mac Mini.
3. Rebuild/refresh the grader runner source before host enforcement goes live.
4. Activate the host release with manifest verification.
5. Run the grader registration script so both final-text suppression flags are
   live.
6. Verify health identity, Slack connectivity, config, prompt hash, and a
   synthetic operator-only/no-write canary.

Rollback restores the prior immutable release pointer, prior grader prompt, and
prior registration row, then restarts once and rechecks health.
