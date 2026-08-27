# NC-20260826-007 bounded implementation review request R1

## Objective

Review the route-aware Sales support correction for material defects. An
active-client/student support email reached Sales with no pipeline entry. The
operator supplied the exact answer in the Slack work thread, but Sales followed
stale instructions to perform forbidden base-table DML and blocked instead of
posting an approval draft.

The implementation must let Sales post an approval-gated
`[CLIENT SUPPORT REVIEW]` for evidence-supported `SERVICE` work without an
Entry ID or pipeline mutation. Genuine sales inquiries must retain their Entry
ID requirement while using the existing least-privilege view/helper boundary.

## Accepted authority and facts

1. `groups/sales/CLAUDE.md` is the runtime Sales behavior authority;
   `WORKFLOWS.md` supplies the detailed procedure and `CLAUDE-MAIN.md` is a
   compatibility surface that must not contradict it.
2. The host already parses and tracks `[CLIENT SUPPORT REVIEW]` cards. An Entry
   ID is optional in `buildApprovedHandoff`; the action ledger, exact approved
   recipient/subject/body, Action-ID, Gmail receipt, and one-time execution are
   the durable support-email lifecycle.
3. PostgreSQL deliberately denies Sales direct base-table access. Sales can
   SELECT `business_v2.v_active_pipeline` and execute
   `business_v2.fn_create_pipeline_entry(...)`.
4. Relationship Context is read-only and remains disabled for minion queries;
   it is not a pipeline-creation fallback.
5. Customer sending remains behind exact operator approval. This task may post
   a draft canary later but must not approve or send it.

## Review files

- `groups/sales/CLAUDE.md`
- `groups/sales/CLAUDE-MAIN.md`
- `groups/sales/WORKFLOWS.md`
- `groups/mailman/OUTBOUND-EMAIL.md`
- `src/approved-send-handoff.ts`
- `src/approved-send-handoff.test.ts`
- `src/sales-prompt-contract.test.ts`
- `docs/PROJECT-MAP.md` section `Sales request-first behavior`

Do not inspect `.env*`, credentials, auth/session stores, runtime databases,
Slack history, customer content, unrelated dirty work, or other repository
areas.

## Material review questions

1. Can an evidence-supported active-client/student `SERVICE` turn now reach one
   parseable approval card without resolving/creating/advancing a pipeline
   entry?
2. On approval, does the documented path preserve Thread-ID, exact approved
   bytes, Action-ID, and one handoff without pipeline mutation?
3. Does genuine sales work use only the granted view/helper and retain the
   Entry ID/pipeline transition invariant?
4. Do any instructions still contradict the new support exception, encourage a
   database grant expansion, misuse Relationship Context, or allow an
   unapproved customer send?
5. Do the tests pin the load-bearing behavior sufficiently for this prompt-only
   correction over an existing host capability?

## Verification already performed

- Pinned Node 22.23.2.
- `src/sales-prompt-contract.test.ts`,
  `src/approved-send-handoff.test.ts`, and `src/send-watchdog.test.ts`: 87/87
  pass.
- `npm run typecheck`: pass.
- `git diff --check`: pass.

## Response contract

Write only
`docs/reports/NC-20260826-007-CLAUDE-REVIEW-RESPONSE-R1.md`.
Report material findings only, ordered by consequence, with exact file/section
evidence and a concrete correction. If there are no material findings, state
`NO MATERIAL FINDINGS` and briefly name the invariants checked. Do not edit any
implementation, test, prompt, or documentation file.
