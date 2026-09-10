# NC-20260909-003 — n8n import correction review R3

## Objective

Review one load-bearing correction discovered by the real disabled-first n8n
import preflight: the Adyen TEST workflow template previously had no stable
workflow ID, while the guarded importer requires an explicit 1–36 character
ID. Confirm that the correction is sufficient and does not weaken the already
accepted TEST-only webhook boundary.

Report material findings only. Do not reopen accepted architecture or propose
unrelated improvements.

## Authority and accepted facts

- Production receiver release `02073e66217f5a5d772a1fdee99eec6419363fb8`
  is live but intentionally unconfigured; health reports
  `adyenTestWebhook.configured=false` and the route fails closed with HTTP 503.
- R1 found two material issues: unsigned store semantics and n8n error-data
  retention. Signed reference-prefix identity, defense-in-depth store wording,
  and no success/error retention fixed both; R2 accepted those corrections.
- The new workflow remains inactive. Provider configuration, workflow
  activation, payment submission, fulfillment, messages, refunds, transfers,
  and payouts are outside this review.

## Exact review scope

Read only:

1. `setup/n8n/adyen-test-payments-workflow.json`
2. `src/adyen-webhook-n8n-contract.test.ts`
3. `docs/ADYEN-TEST-WEBHOOK.md`
4. `/Users/xbohdpukc/dev/toolbox/shared/n8n/tools/n8n/import-workflow.sh`
5. `/Users/xbohdpukc/dev/toolbox/shared/n8n/lib/n8n-ssh.sh`
6. `docs/reports/NC-20260909-003-CLAUDE-CORRECTION-RESPONSE-R2.md`

Do not read `.env*`, credentials, auth stores, other workflows, other task
history, or unrelated repository files. Write only the response path below.

## Evidence

- Focused receiver/route/workflow tests: 67/67 passed.
- Guarded importer dry run: accepted ID `adyen-test-payments`, inactive false,
  three nodes, SHA-256 `5d61ffdf9ef5009bf5b9bb6d3af147b941bbd31cd71d8c9c4a044e312bea937d`.
- `git diff --check`: passed.

## Questions

1. Is `adyen-test-payments` a valid, stable, collision-safe ID under the
   importer and n8n contract?
2. Does the test protect the load-bearing disabled-first, response-after-relay,
   exact-path/target, and no-retention/no-credential properties?
3. Is there any material reason this exact inactive workflow must not be
   imported?

Write the answer to
`docs/reports/NC-20260909-003-CLAUDE-IMPORT-CORRECTION-RESPONSE-R3.md`.
Use `ACCEPTED` if there is no material finding; otherwise list each material
finding with exact file evidence and the minimum correction.
