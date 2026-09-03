# NC-20260903-002 — Runtime wiring closeout R4

Resolve only R3's two packet-scope questions.

Read:

1. `src/ipc.ts` lines 1835-1905 and confirm every `classify_label_write`
   invokes `mailmanClassificationBindingIssue` and quarantines any non-null
   issue, including absent `run_id`.
2. `src/mailman-run-context.ts` and `src/mailman-run-context.test.ts`; confirm
   the validator fails missing/expired/wrong-message/wrong-thread proof and the
   behavior test covers it.
3. `src/host-router.ts` lines 345-430 and `src/classification-policy.ts`;
   confirm `routeClassifiedEmail` obtains and dispatches exclusively through
   `classificationPolicyFor`, including classify-only and support/refund paths.

Do not reopen other findings. Write only
`docs/reports/NC-20260903-002-CLAUDE-RUNTIME-WIRING-RESPONSE-R4.md`.
No Bash, web, MCP, edits, tests, runtime data, or deployment. End with `GO` or
one exact material finding.
