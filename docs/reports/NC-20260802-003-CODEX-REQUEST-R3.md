# NC-20260802-003/006 — Codex request for Claude C5 review R3

- Reviewer: Claude Code, continue exact session
  `b361d68b-688c-4dd0-bba0-a43188673962`
- Model requested: best available (`claude-opus-5`)
- Branch: `codex/nc-20260802-003-company-os-sequence`
- Base: `0f202249b79a02823225a9b03eb6ed2873b5a4cc`
- Prior report: `docs/reports/NC-20260802-003-CLAUDE-C5-REVIEW-R2.md`
- Scope: read-only review. Do not edit source, shared continuity files, stage,
  commit, deploy, invoke launchctl, post to Slack, or mutate Heartbeat.

## Reconciliation to verify

### NC-006 Sales containment

1. Scheduled leading `[FOLLOW-UP]` and `[COLD]` cards start visible work-item
   roots rather than becoming quiet replies in arbitrarily old threads (R2 F1).
2. A caller-supplied thread is accepted for lead work only when the host message
   store proves it is a root in the same channel, has a real Sales work-item
   marker, and derives to the same lead. This preserves two simultaneously open
   cycles for one lead while continuing to reject a mistyped timestamp (R2 F2).
3. Inbound handoff matching is start-anchored and Sales-authored handoff quotes
   cannot start work (R2 F4).
4. A multi-chunk handoff whose first chunk succeeded is requeued with that
   persisted root, preventing a second root on retry (R2 F3).
5. Disconnected queue delivery still re-enters the canonical router.

Please adversarially test valid historical root, wrong/missing/unrelated root,
same-lead concurrent cycles, quoted markers, scheduled-card revisions, and
partial chunk retry. Check that no draft/revision/approval/outbound handoff is
broadcast into the channel timeline.

### NC-003 release activation

1. Apply holds a fixed exclusive lock across rollback capture, replacement,
   launchctl cycle, health proof, and rollback.
2. Rollback health is bounded and reported without masking the original
   activation failure.
3. `--recover-from-down` is apply-only and skips only current health/PID proof;
   target/rollback bundles, interpreter, candidate plist, hostname, listener,
   target health, and rollback remain enforced.
4. The current release root is realpath-normalized before verification and
   health comparison.

Please inspect both happy and failure paths, especially lock cleanup, rollback
error preservation, a failed rollback load, and stopped-daemon recovery.

## Expected evidence

- Run focused tests under pinned Node `22.23.2` if the session permits it.
- Treat Node 26 / native-binding failures as invalid environment evidence, not
  product failures.
- Review the full diff, authoritative docs, and R2 findings.
- Write a new report at
  `docs/reports/NC-20260802-003-CLAUDE-C5-REVIEW-R3.md` with one verdict:
  `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `CHANGES REQUIRED`.
- Separate commit/deploy blockers from residual follow-ups and owner decisions.
