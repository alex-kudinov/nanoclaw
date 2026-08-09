# NC-20260809-003 — Procurement durable-action-receipt review request, Codex R4

- Requested reviewer: Claude Code Opus 5, exact project session
  `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Base/live release: `97ca2ccfb9d3185a5b86607fb8118b997e4ef70b`
- Authorization: read the non-secret tracked source/docs in this request; write
  only
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R4.md`.
- Prohibited: production/database/browser/network access; secrets; raw customer
  or proposal content; edits outside the named response; commits or deployment.

## Why this round exists

Claude R3 returned `CONVERGED`. Codex then found one success-receipt edge case
that the R3 text incorrectly described as closed: the database transition and
Slack success post shared an outer `try`. A post failure after commit could
enter the catch and emit `[PROCUREMENT ACTION NOT RECORDED]`, contradicting the
committed state. This round reviews the narrow post-R3 remedy and its interaction
with the already-converged recovery slice.

Give one verdict: `CONVERGED`, `CHANGES REQUIRED`, or
`OWNER DECISION REQUIRED`. Do not preserve the R3 verdict if the new design is
wrong.

## Post-R3 changes to verify

1. Migration 115 adds `channel_jid` and `thread_ts` routing to the acknowledged
   alert outbox, a route-pair constraint, and a partial pending index.
2. The bound-card decision and pursuit-advance functions now insert their exact
   success receipt into that outbox in the same transaction as the state/event
   write. `process` receipts contain exact versioned `ADVANCE` commands.
3. The host separates transition rejection from receipt delivery. After a
   commit it looks up the durable receipt, posts with `postTracked`, and
   acknowledges only after Slack returns a timestamp. Any lookup, Slack, or ack
   failure logs that the action **was recorded** and leaves the receipt pending;
   it never posts `NOT RECORDED`.
4. The hourly/startup reconciler delivers routed receipts in their exact bound
   thread and ordinary alerts in the Procurement channel. It returns at most 50
   pending rows per run and has a partial pending index.
5. The email backlog bucket is now computed in PostgreSQL with
   `America/Chicago`; count/query failure is logged at error and increments
   `alertsFailed` while already-claimed alerts still deliver.
6. The ack function now uses database `now()` and accepts only the alert ID.
7. Forward migration, idempotent reapply, transactional smoke, rollback, and
   rollback smoke passed again on a fresh schema-only/no-row/no-privilege
   disposable production-host database. The database and temporary files were
   removed. No production object or row changed.
8. Exact Node 22.23.2 typecheck passes; 8 focused files / 64 tests pass after
   this remedy. The focused count differs from R3 because this command names
   the current eight test files explicitly.

## Required review

Read the R3 response, then inspect the current diffs and full relevant files,
especially:

- `data/business/migrations/nanoclaw-v2/115_procurement_pursuit.sql`
- `rollback_115_procurement_pursuit.sql`
- both 115 smoke files
- `src/procurement-review.ts` and test
- `src/procurement-reconciler.ts` and test
- `src/index.ts`, `src/ipc.ts`, `src/procurement-ipc-handlers.ts`
- `src/channels/slack.ts` (`postTracked` and `storeOutbound`)
- `src/procurement-migration-contract.test.ts`

Answer precisely:

1. Is a successful action receipt now transactionally durable with its state
   transition, and can any post-commit branch still claim `NOT RECORDED`?
2. Does immediate delivery plus reconciler retry provide accurate at-least-once
   semantics, including disconnected Slack, post success/ack failure, duplicate
   delivery, and a backlog greater than 50?
3. Can a routed outbox row escape its bound Procurement thread or wake the
   Procurement agent?
4. Are the schema change, RLS/grants, reapply behavior, rollback, and ack
   signature coherent?
5. Is any remaining defect blocking commit, production migration, dark deploy,
   sanitized denial canary, or one public non-submission canary bounded to
   `passed`?

End with the five-gate table. Include inspected files, commands, changed-file
attestation, elapsed time, and observable cost. Write only the named R4 response.
