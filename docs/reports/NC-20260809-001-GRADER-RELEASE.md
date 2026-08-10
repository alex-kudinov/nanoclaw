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

## Verification and release proof

- Node 22.23.2 root and agent-runner typechecks: pass;
- focused grader boundary: 10 files, 235 tests pass;
- full root suite: 160 files, 2,186 tests pass;
- release gate: 19 files, 513 tests pass;
- agent runner: 5 files, 34 tests pass;
- documentation continuity and `git diff --check`: pass.

The immutable production release is
`bc9312522aba8a584fdce6af26a9b0434862bf59`, integrated on the exact prior live
base `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`. The Mac Mini reports the exact
release, source-tree and artifact hashes under Node 22.23.2, with PID 92532
executing that release's `dist/index.js`. Both final-text suppression flags are
live and the operational grader prompt matches the release-owned prompt.

A no-network canary imported the gate from the installed artifact: concrete
evidence-based feedback passed and stock praise was blocked. The installed
Heartbeat assignment client remains GET-only. The release made no Slack student
post, Heartbeat write, approval, learner communication, or certificate action.

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
