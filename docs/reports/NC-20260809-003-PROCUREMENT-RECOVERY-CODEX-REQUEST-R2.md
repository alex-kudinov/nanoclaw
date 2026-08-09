# NC-20260809-003 Procurement recovery — Codex request R2

## Assignment

Act as the NanoClaw company-OS owner and perform an adversarial implementation
review of the migration-115 Procurement closure slice. This is the second round
in exact Claude session `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`.

Write only this response file:

`/private/tmp/nanoclaw-nc-20260809-003/docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R2.md`

Do not edit source, schema, configuration, prompts, tests, or any other report.

## Authority and boundaries

Read first: `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
`docs/CHANGE-PROTOCOL.md`, the NC-20260809-003 changelog entry, then:

- `docs/reports/NC-20260809-003-PROCUREMENT-PRODUCTION-PREFLIGHT.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R1.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R1.md`
- `docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CLAUDE-RESPONSE-R2.md`

Inspect every current worktree diff and all new tracked files. The worktree is
based on exact live release `97ca2ccfb9d3185a5b86607fb8118b997e4ef70b`.

Forbidden: `.env*` other than tracked `.env.example`; credentials; settings or
auth stores; browser/session state; raw databases/logs; private solicitation,
proposal, customer, or student content; network or production access. Do not
read the ignored Procurement vault. Do not inspect the dirty operational
checkout except the already-authorized prior audit report named above.

Submission, signature, attestation, portal registration, contractual
acceptance, pricing/customer commitments, and customer-facing sends remain
human-only.

## Implemented claims to challenge

1. No shared email-routing code changed. Migration 115 conditionally flips only
   `MrGru/procurement/rfp` and `MrGru/procurement/rfq` to
   `auto_archive=false`, using the existing live release handoff behavior.
2. Launchd is the sole tracked authority for the four Procurement gates;
   `.env.example` no longer advertises an inert surface. Startup logs resolved
   booleans/reason/count but not UID or epoch values.
3. `process` creates exactly one pursuit inside the same database transaction
   as card consumption and review transition. The host-only programmatic
   transition preserves the same invariant.
4. Pursuits are versioned, event-ledgered, and visible in a queue that never
   hides overdue work. Only exact `ADVANCE #id vN assessing|blocked|passed —
   reason` in the original bound card thread from a named configured operator
   can change state. Future `proposal_ready`/`submitted` states are declared but
   unreachable until migration 116.
5. CaleProcure completeness uses a release-owned nine-unit plan. The container
   reports observed units and bounded public evidence; the host rejects unknown
   units and PostgreSQL derives complete/partial/failed. Same-evidence failed or
   partial runs resume; changed evidence under one run key is rejected.
6. The reconciler is armed only when review policy resolves enabled. PostgreSQL
   owns the sole automatic state transition to `expired_undecided` and exact-once
   alert claims; email backlog is alert-only and never replayed.
7. Base pursuit/event/alert tables and write functions remain inaccessible to
   `nanoclaw_procurement`; it receives only the bounded view.

## Independent evidence already obtained

- Exact Node 22.23.2 root typecheck passes.
- Eight Procurement test files pass, 51 tests total.
- Independent runner builds and its four test files / 29 tests pass after its
  own lockfile install.
- Migration 114 then 115 applied cleanly to a disposable PostgreSQL database on
  the production host. The tracked rollback-only smoke test passed: one process
  decision -> one pursuit; decision replay rejected; pursuit -> passed with two
  events; full zero-result coverage -> complete; missing coverage -> partial;
  same-evidence retry -> running; constraint validated; container base-table
  SELECT denied and bounded-view SELECT granted. The transaction rolled back
  and the disposable database was dropped.
- No live business database, daemon, schedule, Slack message, browser, or
  customer action has changed in this implementation round.

## Required review

Return a severity-ordered verdict (`APPROVED`, `APPROVED WITH FOLLOW-UPS`, or
`CHANGES REQUIRED`) with exact file/line evidence. In particular:

1. Audit migration 115 for PostgreSQL correctness, idempotency, retry math,
   transactionality, RLS/grants, SECURITY DEFINER risks, function replacement
   compatibility, alert deduplication, timezone/deadline behavior, and rollback
   consequences.
2. Try to break decision and pursuit exact-once semantics, thread/epoch binding,
   optimistic versions, named-human authority, terminal-state enforcement, and
   the deliberately unreachable future states.
3. Try to fabricate a complete source run, reuse a run key with changed input,
   lose observations across retry, or cause false counts/status.
4. Audit IPC schemas, TypeScript validation, runner exposure, startup policy,
   scheduler/reconciler wiring, and failure receipts for fail-open behavior.
5. Check the prompt/procedure/database/project-map updates for obsolete legacy
   commands, dangerous ambiguity, or claims beyond implementation.
6. Identify missing tests that block migration/deployment. Distinguish blockers
   from migration-116 follow-ups and the separate shared-CDP security task.
7. State whether this slice is safe to commit, migrate, deploy dark, enable for
   a sanitized canary, and then use for one public non-submission opportunity.

End with changed-file attestation, commands/checks run, elapsed time, and any
observable cost. Do not estimate unavailable cost.
