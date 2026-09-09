# NC-20260908-001 correction review R2

Review only the load-bearing correction to your R1 material finding and the two
minor clarifications. Read:

- `docs/reports/NC-20260908-001-CLAUDE-REVIEW-RESPONSE-R1.md`
- `src/index.ts` lines 465-535 and 1190-1235
- `src/index-final-text-suppression.test.ts` from `Sales missing-output notice`
- `src/sensitive-url-redaction.ts` and its test
- the pipeline-free support-escalation additions in `groups/sales/CLAUDE.md`
  and `groups/sales/WORKFLOWS.md`

Correction behavior:

- A successful threaded Sales run starts a detached five-IPC-poll drain.
- `getLatestGroupResponse(chat, 'sales', thread)` is checked against the run
  start; any real Sales tool post suppresses the notice.
- If no real post exists after the drain, the host posts exactly one fixed
  `[BLOCKED]` notice saying no review card/operator response was produced and
  nothing was approved or sent.
- Error runs do not call this path and retain normal cursor rollback/retry.
- Tests cover fixed-notice delivery and a real post arriving during drain.
- Redaction now preserves immediate period/comma punctuation.
- Pipeline-free support HUMAN work uses a support escalation header with no
  Lead or Entry ID.

Focused corrected checks pass 172/172 and typecheck passes. No external action
or runtime state changed.

Report only material remaining findings. Write
`docs/reports/NC-20260908-001-CLAUDE-CORRECTION-RESPONSE-R2.md`. If none, write
`NO MATERIAL FINDINGS` and a concise scope statement.
