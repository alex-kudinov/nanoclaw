# NC-20260802-003/006 — Codex request for Claude C5 review R4

- Reviewer: Claude Code Opus 5, exact session
  `b361d68b-688c-4dd0-bba0-a43188673962`
- Base: `0f202249b79a02823225a9b03eb6ed2873b5a4cc`
- Prior verdict: R3 `APPROVE WITH FOLLOW-UPS`; no commit/deploy blockers
- Class: C0 review only. Do not change source, shared continuity files, stage,
  commit, deploy, invoke launchctl, post to Slack, or mutate Heartbeat.

## Delta after R3

Codex deliberately closed the R3 items most likely to recreate the operator's
Sales-thread mess or defeat incident recovery:

1. The runner stamps `send_message` IPC output with `source_container`.
2. The host resolves that value only against the directory-derived source
   group and queue-registered container. Sales output to its own Slack channel
   defaults to that active work unit's thread when the model omits `thread_ts`;
   cross-group sends do not inherit it.
3. A repeated scheduled `[FOLLOW-UP #N]`/`[COLD]` card whose stored current root
   has the same normalized marker and lead stays in that root.
4. The unreachable requested-root branch was removed/hoisted, partial-retry
   fixture now uses the actually posted first chunk, and root lookup is scoped
   by channel.
5. Activation reclaims a lock only when its numeric PID is dead, re-acquires it
   exclusively, proves `/usr/sbin/lsof` is executable before mutation, and
   guards lock cleanup from masking activation/rollback evidence.
6. Every still-open lower-risk item is represented by planned NC-007 or NC-008.

## Evidence already produced

- pinned Node 22.23.2 typecheck: pass
- focused delta suite: 7 files / 178 tests pass serially
- no external or production mutation

## Required adversarial review

Please inspect the complete post-R3 diff and answer these explicitly:

1. Can `source_container` be forged or stale in a way that makes the host
   select another Sales thread? Check queue lifecycle, concurrent same-group
   containers, adopted containers, task containers, and cross-group routes.
2. Does the work-unit default actually cover human feedback/approval replies
   without altering initial handoff roots or scheduled root creation?
3. Can scheduled-card dedup collapse two distinct cycles or still create a
   duplicate root on retry/revision?
4. Does channel-scoped message lookup preserve all existing non-Slack/Gmail
   callers?
5. Is stale-lock recovery race-safe and fail-closed for unreadable, malformed,
   live-PID, permission-denied, and concurrent-reacquire cases?
6. Does the `lsof -v` preflight distinguish executable availability from the
   normal no-listener exit behavior without breaking macOS?
7. Are the NC-007/008 dispositions sufficient under CHANGE-PROTOCOL, and do
   authoritative docs state mechanics and boundaries accurately?

Re-run the focused tests if useful. Write the final report to
`docs/reports/NC-20260802-003-CLAUDE-C5-REVIEW-R4.md` with one verdict:
`APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `CHANGES REQUIRED`. Separate blockers
from follow-ups and cite exact file/line evidence.
