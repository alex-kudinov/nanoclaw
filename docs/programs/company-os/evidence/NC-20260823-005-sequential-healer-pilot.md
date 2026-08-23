# NC-20260823-005 sequential healer pilot evidence

Date: 2026-08-23
Program item: `work:self-healing-sequential-expansion-pilot`
State: waiting on source-three safe-state decision; sources one and two complete

## Release and review

- Source one `healer:d0ca940a103136d3` had 46 occurrences because
  `killOnTimeout` logged every hard timeout at error before the close handler
  distinguished successful post-output cleanup from a true no-output failure.
- `src/container-runner.ts` now logs post-output cleanup at info and preserves
  error logging plus error result for no-output hard timeout. Tests cover both
  branches without changing timeout or stop semantics.
- Focused verification passes 86/86; typecheck, documentation continuity,
  agent-runner build and 43/43 tests pass. The full suite is 3,021 passed / 12
  skipped / the unchanged unrelated CNPC wrapper-literal failure.
- Claude Sonnet 5/high bounded review session
  `ca3bcffa-9278-45a1-8ea7-631f197d2068` returned
  `NO MATERIAL FINDINGS` in one round. Usage: 5 model calls, 10 input, 84,751
  cache-create, 247,866 cache-read, 14,681 output tokens, maximum context
  93,317, cost $0.8031108.
- Immutable release `d4f4289126797b07dd3731ff6bffe755ef2277bd` has
  source tree `a9e2928a4cf126efd9a6c68a466a59b78a992393`, 880-file artifact
  SHA-256 `fe8ceefce60e2ca507f3676dba7dbe37db320765f2364e1c23500b197387d79f`,
  and archive SHA-256
  `e6f3a189b01809a58301e30bb4f8e3ee125d14fe94a1d4498a0814f50e21b7c8`.
  It verified locally and on `mini-claw.local` under Node 22.23.2.
- Fast/main activations changed only their three release pointers and retained
  rollback plists
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-23T22-12-00-255Z`
  and `com.nanoclaw.plist.rollback-883f375f5ceb-2026-08-23T22-12-01-938Z`.
  PID 90570, listener, health, code root, Gmail, Slack, and empty queues converge
  on the exact release; main/fast error lines remain 273/24.

## Sequential source receipts

- Concurrency remained `MAX_ITEMS=1`. Configuration backups are
  `.env.rollback-company-healer-work-2026-08-23T22-12-38-647Z` for source one
  and `.env.rollback-company-healer-work-2026-08-23T22-23-53-241Z` for source
  two.
- Source one bound the reviewed release as `reviewed_release_deployed`, posted
  one internal correction receipt, passed the six-minute no-recurrence verifier,
  and reached `resolved/verified_fixed`. Company Work is
  `outcome_validated/completed` version 2 with three observations, events
  `accepted,blocked,outcome_validated`, and one recovery receipt. Replay was one
  duplicate with zero transition/observation/error.
- Source two `healer:d3c78b967b64588f` was a one-occurrence runner sync race.
  `ipc-turn-policy.ts` is tracked and byte-identical in the live release at
  SHA-256 `027c092b22169eb3382038a503120118aadde28584bbd565af9f3ac9b5a2d974`;
  the independent runner is green and no recurrence occurred. It posted one
  internal recovery receipt and reached the same terminal Company Work shape;
  replay was duplicate-only.
- All three admitted-to-date healer items, including NC-004's first source, are
  completed version 2 with 3 observations / 3 events / 1 receipt each. Catalog
  summary is now 134 pending decisions and 12 verified fixed.

## Source-three decision gate

- `procurement-caleprocure-collector` is scheduled daily at 08:00
  America/Chicago and enabled in `data/jobs.json`, while collector, ingest, and
  review gates are all off. The job therefore fails by design.
- Historical authority says the deterministic collector still awaits the
  three-shadow gate; enabling it would overclaim readiness.
- Proposed safe state: leave all three gates off and disable only the
  contradictory daily job through the release-owned registration helper. Then
  record a named no-action disposition for `healer:458c0d2b7dc15d5b`.
- No schedule or CaleProcure feature state changed. Proposed decision:
  `.program/decisions/decision-caleprocure-safe-disabled-state.json`.
