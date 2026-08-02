# NC-20260802-003/004/005 convergence state

- Topic: atomic release activation and durable Heartbeat grading coordination
- Status: converged for commit and owner-authorized deployment
- Current round: R6 complete
- Claude project path: `/Users/xbohdpukc/dev/NanoClaw`
- Current Claude session UUID: `b361d68b-688c-4dd0-bba0-a43188673962`
- Prior Claude session UUIDs: `20f83173-4353-4b8c-9a19-c3661df32899`
- Native handoff path: none
- Latest Codex request:
  `docs/reports/NC-20260802-007-008-CODEX-REQUEST-R6.md`
- Latest Claude response:
  `docs/reports/NC-20260802-007-008-CLAUDE-C5-REVIEW-R6.md`
- Implementation commits: `93e8d00cbe2525436c4202e412af2c278efafff0`
  (NC-003/006) and `aa1c82187b7fbf10050a4863bdbe8d07e87af82c`
  (NC-007/008 closure)
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
  `$13.661564` after one zero-cost network failure. R5's additional run cost was
  `$15.105735` after one zero-cost network failure; R6's was `$7.4639515`.

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

## Round R5 — NC-007/008 follow-up closure

- Owner sequencing: on 2026-08-02 the owner explicitly requested NC-007 and
  NC-008 together and then deployment, superseding R4's earlier suggestion to
  deploy and observe NC-006 first.
- Codex delta: activation now uses atomic `shlock` claiming, rehearses `lsof`
  during dry-run, reports pruned/already-active roots directly, and exercises
  real plist XML. Sales routing now bounds scheduled revisions to six hours,
  serializes same-lead decisions, strips cross-channel threads, requires active
  work-unit context, reports degradation in health, schedules bounded retries,
  and retries only unsent chunks after a partial post.
- Independent checks before review: pinned Node 22.23.2 typecheck, 7-file / 183-
  test focused suite, and 144-file / 1,824-test full suite pass.
- Request: `docs/reports/NC-20260802-007-008-CODEX-REQUEST-R5.md`.
- Next: exact-session Claude R5 review, Codex reconciliation, documentation
  continuity/format checks, commit, exact release build, owner-authorized
  activation, and live verification.

## Round R6 — R5 blocker closure

- R5 verdict: changes required. Claude's direct macOS probe established that
  `shlock` never reclaims an extant stale lock, so the first NC-007 mock and
  four authoritative descriptions were false. NC-008 itself was approved.
- Codex reconciliation: the lock mock now refuses all extant locks, live/dead/
  unreadable owners get distinct errors, dry-run verifies `shlock`, stale
  recovery is a documented operator proof/removal/rehearsal step, and real-path
  equality closes the symlink alias. The Sales prompt clarifies root-creation
  time, health names the process-lifetime counter, and unresolved source groups
  strip thread timestamps fail-closed.
- Accepted follow-up: resolver degradation cannot supply the canonical lead
  email and therefore bypasses per-lead serialization/anchoring. It remains
  visible through the since-start health counter rather than minting a second
  identity from weaker data.
- Independent checks after reconciliation: pinned Node 22.23.2 typecheck,
  7-file / 186-test focused suite, 144-file / 1,827-test full suite,
  documentation continuity, schema sanitizer self-test, formatting, and diff
  whitespace pass.
- Request: `docs/reports/NC-20260802-007-008-CODEX-REQUEST-R6.md`.
- Claude verdict: `APPROVE WITH FOLLOW-UPS`; no commit or deploy blockers. The
  resolver fallback identity is explicitly declined because it would create a
  second authority. The cosmetic tool-probe name was corrected before commit;
  owner intervention during lock cleanup remains a documented bounded residual.
- Next: observe natural Sales traffic for the one-root handoff/draft/revision
  outcome; do not manufacture customer-facing work to close that evidence gap.
- Deployment result: exact artifact `aa1c82187b7fbf10050a4863bdbe8d07e87af82c`
  passed production dry-run and apply. Health, `lsof`, launchd, and `ps`
  converged on PID 14460 serving the exact code root with both channels
  connected and an empty queue. The reviewed Sales prompt hash matches the live
  operational copy. NC-003/007 are complete; NC-006/008 remain
  `deployed_unverified` until natural Sales traffic proves the one-root cycle.
