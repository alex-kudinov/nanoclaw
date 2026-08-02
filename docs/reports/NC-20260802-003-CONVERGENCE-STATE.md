# NC-20260802-003/004/005 convergence state

- Topic: atomic release activation and durable Heartbeat grading coordination
- Status: converged for commit; follow-ups tracked
- Current round: R4 complete
- Claude project path: `/Users/xbohdpukc/dev/NanoClaw`
- Current Claude session UUID: `b361d68b-688c-4dd0-bba0-a43188673962`
- Prior Claude session UUIDs: `20f83173-4353-4b8c-9a19-c3661df32899`
- Native handoff path: none
- Latest Codex request: `docs/reports/NC-20260802-003-CODEX-REQUEST-R4.md`
- Latest Claude response:
  `docs/reports/NC-20260802-003-CLAUDE-C5-REVIEW-R4.md`
- Implementation commit: `93e8d00cbe2525436c4202e412af2c278efafff0`
- Verified agreements: production lineage `23ffb07` plus record `0f20224`;
  activation derives from the installed plist and changes exactly three fields;
  runtime health must prove the code root; Heartbeat remains authoritative;
  SQLite may hold operational correlation only
- Open defects: no NC-003/006 commit blocker; NC-007 owns the stale-lock
  double-reclaimer and activation follow-ups, NC-008 owns scheduled-cycle and
  remaining Sales hardening, and NC-004/005 cannot use a real submission ID
  because the visible Heartbeat queue/detail UI exposes none
- Owner decisions: choose read-only backing-ID discovery, a collision-detecting
  derived key with an explicit semantic downgrade, or keep NC-004/005 dark
- Last independent checks: isolated worktree at `0f20224`; original dirty
  checkout preserved; Node 22 typecheck, post-R3 focused delta 7 files/178
  tests, full 143-file/1,810-test suite, and agent-runner build/3 files/22 tests
  pass; live Heartbeat observation was read-only and is recorded separately
- Elapsed/cost notes: first Claude session failed before a model call with zero
  cost. Claude Opus 5 architecture review session
  `b361d68b-688c-4dd0-bba0-a43188673962` completed at max effort; recorded cost
  was `$6.5559585`; the same session's R2 cumulative cost was `$11.8184935`.
  R3's additional run cost was `$10.710246`; R4's additional run cost was
  `$13.661564` after one zero-cost network failure.

## Round R3 — implementation reconciliation

- R2 reviewer session: `b361d68b-688c-4dd0-bba0-a43188673962`
- R2 verdict: NC-003 approve with follow-ups; NC-006 changes required.
- Codex reconciliation: scheduled work cards now start visible roots; explicit
  same-lead historical roots require host-store validation; handoff markers are
  start-anchored and author-gated; partial retries reuse established roots.
  Activation now holds a fixed lock, verifies/reports rollback health, supports
  explicit stopped-daemon recovery, and normalizes the rollback root.
- Request: `docs/reports/NC-20260802-003-CODEX-REQUEST-R3.md`
- Next: pinned-Node verification, exact-session Claude R3, reconciliation, then
  commit. No deployment is authorized in this round.

## Round R4 — post-R3 reliability delta

- R3 verdict: approve with follow-ups; no commit or deploy blockers.
- Codex reconciliation: active Sales work-unit thread provenance is now
  host-originated through container identity; repeated scheduled cards are
  deduplicated; the dead anchor branch and partial-retry fixture are corrected;
  message-root lookup is channel-scoped. Activation reclaims a dead-PID lock,
  proves `lsof` before mutation, and prevents cleanup from masking evidence.
- Remaining review debt is tracked explicitly as planned tasks NC-007/008.
- Claude R4 verdict: approve with follow-ups; no commit or deploy blockers.
  N1/N3 are assigned to NC-007 and N2/N4/N5 to NC-008. The focused delta was
  independently reproduced at 7 files / 178 tests and the `lsof` preflight
  command shape was verified on the host.
- Commit: the reviewed NC-003/006 implementation and all R1-R4 evidence were
  committed as `93e8d00cbe2525436c4202e412af2c278efafff0`.
- Next: no deployment is authorized in this round. Close and re-review the
  stale-lock takeover race under NC-007 before the first production `--apply`;
  NC-006 may be deployed separately and then live-observed before NC-008 begins.
