# NC-20260829-001 checkout failure implementation correction review R4 — response

Scope: `docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R3.md`,
`src/checkout-recovery-store.ts`,
`/private/tmp/toolbox-n8n-patch.ccYdsX/shared/n8n/tools/n8n/patch-workflow-nodes.sh`,
and this request only. No credentials, environment, databases, logs, or
customer evidence were inspected.

## Finding 1 (closed incident reopening) — CLOSED, with one new residual gap

Both stated guards are present and correct:

- `ensureCheckoutRecoveryIncidentWithClient`'s "already bound" branch
  (`src/checkout-recovery-store.ts:770-779`) now returns immediately when the
  fetched incident's `status==='closed'`, before reaching either the create
  or the "existing incident" UPDATE branch — so `version`, `last_failure_at`,
  and `notify_due_at` are no longer mutated by a sibling case's fresh failure
  once the incident is closed.
- `listDueCheckoutRecoveryOperatorIncidentsWithClient`'s WHERE clause
  (`src/checkout-recovery-store.ts:1176-1190`) now requires, for a closed
  incident, `version=notified_version+1 AND last_failure_at<=last_notified_at`
  — i.e. exactly the one version bump produced by the purchase closure
  itself, with no intervening failure.

The exact repro in R3 (Case B's fresh failure silently reopening and
re-notifying closed Incident I with the stale "no further action needed"
text) is blocked: the early return prevents the version bump, so the due
query's `version>notified_version` test is never satisfied for that path.

**New residual gap (moderate, introduced by the exact-match condition):**
because a closed incident can never mutate again (per the guard above), the
`version=notified_version+1` test only matches a closure that happens with
*no* unnotified reopen in between. If a real reopen occurs (fresh sibling
failure while the incident is still `open`/`notified` — a legitimate,
intended case per the first disjunct) and the purchase closes the incident
*before the next due-sweep notifies that reopen*, the incident jumps from
`version=notified_version` directly to `version=notified_version+2` at
closure. That incident then matches neither disjunct — not
`status<>'closed'` (it is closed) and not `version=notified_version+1` (it's
+2) — and, because closed incidents never mutate further, it can **never**
become due again. The purchase resolution for that incident is silently and
permanently dropped; the operator's last signal remains the earlier
"still open" notification. This is a race (reopen-then-close inside one
sweep interval) rather than the R3 exploit's steady-state pattern, so it is
narrower, but it is a real, silent loss of the promised resolution reply for
a real reopen — not just noise suppression of a duplicate/expired sibling
event. Not raising this to the severity of a reopened finding 1 (the
misleading over-notification is fixed), but it should be tracked before
close-out: e.g. widen the closed-admit clause to
`version>notified_version AND last_failure_at<=last_notified_at` (drop the
exact `=notified_version+1`), which still excludes any closed incident with
a failure *after* the last notification while admitting any clean multi-step
catch-up.

## Finding 2 (n8n rollback signal) — NOT CLOSED (regression: script will crash, not report)

The intent (capture `restore_current`'s exit status, surface
`rollback_succeeded=true|false`) is right, but the implementation places the
`rollback_status()` function definition in the wrong shell scope, so it will
never run.

- `rollback_status()` is defined at lines 98-104, but that text sits *inside
  the heredoc* (`<<'REMOTE'` opened at line 88, closed at line 116) that is
  piped as a script to `ssh "$N8N_SSH_TARGET" /bin/sh -s --` inside
  `restore_current()`. It is remote-shell script content, not a function
  defined in the local bash process — and it is never even called from
  within that remote script (the remote script runs unpublish/copy/
  import/publish/restart/healthz directly, lines 106-115).
- All four call sites — line 149 (apply failure), line 156 (readback
  failure), line 163 (readback mismatch), line 168 (inactive-after-patch) —
  invoke `rollback_status` in the **outer/local** bash script, after the
  heredoc has closed and outside `restore_current`'s own body. In that
  scope no function, alias, or command named `rollback_status` exists.
- Under `set -euo pipefail` (line 3), `rollback_succeeded=$(rollback_status)`
  fails with "command not found" (exit 127), and that failure aborts the
  script immediately — before the intended `fail EXTERNAL_ERROR
  "...rollback_succeeded=$rollback_succeeded..."` line is ever reached.

Net effect: on every one of the four failure paths this correction targeted,
the tool now crashes with an unstructured shell error instead of emitting
the structured `fail` JSON (with or without the rollback signal). This is
worse than the R3 baseline, which reliably emitted a generic `fail` JSON on
every one of those paths. Finding 2 must be reworked: define `rollback_status`
(or inline the exit-code capture) in the outer script's own scope, e.g.
capture `restore_current`'s real exit status directly —
`if restore_current >/dev/null 2>&1; then rollback_succeeded=true; else rollback_succeeded=false; fi`
— at each of the four call sites (or once as a local function defined
top-level, not nested in the heredoc).

## Summary

- Finding 1: closed, with a new narrower residual gap noted above (not a
  reopening of finding 1 — different trigger, different failure mode).
- Finding 2: not closed. The correction introduces a load-bearing defect —
  the rollback-status capture is unreachable and its invocation crashes the
  script on every failure path it was meant to instrument.
