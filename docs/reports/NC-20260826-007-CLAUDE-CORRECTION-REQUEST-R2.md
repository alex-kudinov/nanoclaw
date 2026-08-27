# NC-20260826-007 bounded enforcement correction review R2

## Objective

Review one load-bearing correction prompted by the live canary. Prompt policy
correctly defined pipeline-free support, but a generic retry still produced an
approvable `[SALES REVIEW] Lead #(none)` with `Route: SERVICE`. The operator
approved that exact card and Gmail confirmed one send. A later explicit host
reprocess produced the correct `[CLIENT SUPPORT REVIEW]`; it remains
unapproved behind a host stop and no pipeline row was created.

New approval cards must fail closed on this semantic drift before Slack
approval and again when an existing/split card is approved. Historical already-
approved card parsing must remain available for exact execution receipt and
replay reconciliation.

## Accepted boundaries

1. `[SALES REVIEW]` represents genuine pipeline work and requires one numeric
   `Lead #`; it may not carry `Route: SERVICE`.
2. `[CLIENT SUPPORT REVIEW]` requires exactly one `Route: SERVICE` and does not
   require a Lead/Entry ID.
3. `SUPPORT-DRAFT` and scheduled follow-up behavior are outside this semantic
   correction and must remain compatible.
4. `buildApprovedHandoff` remains a historical/execution parser. Semantic
   validation applies at new IPC/Slack admission and action arming, not inside
   historical execution rehydration.
5. No database, Gmail, permission, schema, credential, customer-send, approval,
   or Relationship Context change is part of this correction.

## Review files

- `src/approved-send-handoff.ts`
- `src/approved-send-handoff.test.ts`
- `src/channels/slack.ts`
- `src/channels/slack.test.ts`
- `src/ipc.ts`
- `src/ipc-handoff-echo.test.ts`
- `src/send-watchdog.ts`
- `src/send-watchdog.test.ts`

Do not inspect runtime databases, Slack history, customer content, `.env*`,
credentials, auth/session stores, or unrelated repository files.

## Material questions

1. Does `approvalCardSemanticIssue` parse only structured header state and
   reject the three intended invalid combinations without breaking current
   Sales, support, Chief support, follow-up, or historical execution paths?
2. Are IPC admission, Slack defense in depth, and approval arming all covered,
   with visible rejection and no action creation?
3. Can any malformed card still expose its customer body as the rejection post,
   arm a send action, or bypass through a pre-existing Slack card?
4. Are the tests sufficient at each enforcing boundary?

## Verification

Focused parser, watchdog, Slack, and IPC suites pass 222/222 under pinned Node
22.23.2. Formatting and broader gates will run after review.

## Response contract

Write only
`docs/reports/NC-20260826-007-CLAUDE-CORRECTION-RESPONSE-R2.md`.
Report material findings only with exact file/evidence references and concrete
corrections. If none remain, state `NO MATERIAL FINDINGS` and name the checked
invariants. Do not edit implementation, tests, prompts, or other docs.
