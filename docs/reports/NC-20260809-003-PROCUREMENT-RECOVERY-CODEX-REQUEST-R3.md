# NC-20260809-003 — Procurement recovery post-fix review request, Codex R3

- Requested reviewer: Claude Code Opus 5, exact project session
  `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Base/live release: `97ca2ccfb9d3185a5b86607fb8118b997e4ef70b`
- Authorization: read the non-secret tracked source/docs in this request; write
  only
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R3.md`.
- Prohibited: production/database/browser/network access; secrets; raw customer
  or proposal content; edits outside the named response; commits or deployment.

## Why this round exists

R2 returned `CHANGES REQUIRED`. Independently verify the post-R2 tree and give
one verdict: `CONVERGED`, `CHANGES REQUIRED`, or `OWNER DECISION REQUIRED`.
Treat passing tests as evidence, not proof. Look for a new silent-loss path,
false receipt, privilege expansion, dead end, or rollback hazard.

## R2 findings and claimed disposition

1. **F-1 alert loss:** `procurement_reconciler_alerts.delivered_at` now forms an
   acknowledged outbox. `fn_reconcile_procurement` returns every undelivered
   row. The host isolates each Slack failure, acknowledges only after a
   receipt-returning `postTracked`, and leaves failed/unacknowledged rows pending.
2. **F-2 one-alert-ever:** deadline, overdue, and stale-run condition versions
   now include an America/Chicago date bucket; state-change expiry remains
   version-keyed.
3. **F-3 rollback:** tracked non-auto-discovered
   `rollback_115_procurement_pursuit.sql` restores both verbatim migration-114
   bodies and removes 115. `smoke_rollback_115_procurement_pursuit.sql` verifies
   object removal and both restored decision paths.
4. **F-4 unusable programmatic pursuit:** both TypeScript and PostgreSQL reject
   programmatic `process`; only the bound-card transaction may create a pursuit.
5. **F-5 deadline:** near-deadline alert is 14 days.
6. **F-6 stale run:** resume updates `started_at`; time-driven stale alerts also
   receive the daily bucket.
7. **F-7 self-attestation:** IPC and both host layers require exactly one
   `{resultCount, pagesVisited}` receipt per observed unit. Batch identity binds
   rows, units, receipts, and adapter version. Documentation now says this is an
   auditable container report, not independent proof of browser execution.
8. **F-8 agent wake:** reconciler uses `SlackChannel.postTracked`; its stored
   outbound is a bot/no-`from_group` message, and the existing router
   `isUntaggedBotNoise` guard suppresses a spawn. A source contract test requires
   the receipt-returning path and the existing router test proves bot-noise
   suppression.
9. **F-9 malformed receipt:** DECIDE/ADVANCE-prefixed malformed commands now get
   `[PROCUREMENT ACTION NOT RECORDED]` in the bound thread.
10. **F-10 clock authority:** caller time more than five minutes from PostgreSQL
    is rejected before expiry.
11. **F-11 timezone:** pursuit queue and reconciler use America/Chicago dates.
12. **F-12 event conflict:** expiry event no longer ignores a conflict; a
    conflict aborts the transaction.
13. **F-13 counts:** a validated source-run count constraint plus cumulative
    bound prevents `new > seen`.
14. **F-14 backlog query:** still logs failure and continues delivering already
    claimed alerts. Decide whether this is enable-blocking; justify precisely.

Additional Codex hardening:

- `procurement_source_run_opportunities` records the exact run/opportunity
  association even when an immutable observation was created in an earlier
  run. Completed idempotent retry receipts no longer depend on the observation's
  first `source_run_id`.
- After a named human records `process`, the host queries the created pursuit
  and posts exact versioned `ADVANCE` commands in the same thread. A lookup
  failure produces a truthful "decision recorded, receipt unavailable" message,
  never a false rejection.
- No shared Gmail/classifier/router source changed.

## Independent evidence already obtained

- Pinned Node 22.23.2: `npm run typecheck` passes.
- Pinned Node focused gate: 9 files / 67 tests passes (8 Procurement files plus
  `message-loop-pipe.test.ts`).
- Runner independent build passes; 4 files / 29 tests pass.
- On the production PostgreSQL host, an empty disposable database received a
  schema-only/no-row/no-privilege export. Migration 115 applied, reapplied
  idempotently, and its tracked transactional smoke passed pursuit replay,
  terminal event ledger, receipted zero/partial coverage, retry, exact run
  association, RLS, 14-day/daily alerts, expiry/event, pending outbox, and ack.
  The rollback then passed and its smoke proved 115 objects absent and both 114
  decision paths restored. The database and temporary SQL files were deleted.
- No production data row, taxonomy row, service, gate, schedule, browser, Slack
  message, or deployment changed.

## Required review

Read fully:

- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R2.md`
- all current diffs from `97ca2cc`, especially migration/rollback/smokes,
  `src/procurement-{intake,ipc-handlers,review,reconciler}*`, `src/index.ts`,
  runner IPC, configuration tests, group procedure, project map, active work,
  and changelog.

Answer:

1. Did each R2 blocker close without introducing another silent gap?
2. Can outbox delivery now be accurately described as at-least-once until
   acknowledgment, including Slack disconnected/failure behavior?
3. Do daily time buckets and 14-day escalation behave as claimed?
4. Is the card-only `process` boundary useful and fail-closed, and is the exact
   pursuit receipt truthful under its partial-failure cases?
5. Are coverage receipts, batch identity, repeated-run associations, and count
   invariants coherent under retry, empty result, duplicate observation, and
   malformed IPC cases?
6. Is the rollback complete, non-auto-discovered, and safe enough to rehearse
   and use during an immediate incident?
7. Are schema grants/RLS and the Slack wake boundary still least privilege?
8. What exact test or implementation gap blocks commit, production migration,
   dark deploy, enablement, or the public non-submission canary?

End with a gate table for commit, migrate, deploy dark, enable sanitized
canary, and one public non-submission canary. Include inspected files, commands,
changed-file attestation, elapsed time, and any observable cost. Do not soften a
real blocker to reach convergence.
