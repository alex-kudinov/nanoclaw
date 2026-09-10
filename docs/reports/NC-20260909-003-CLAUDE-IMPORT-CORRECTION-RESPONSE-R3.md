# NC-20260909-003 — n8n import correction review R3

Reviewed: `setup/n8n/adyen-test-payments-workflow.json`,
`src/adyen-webhook-n8n-contract.test.ts`, `docs/ADYEN-TEST-WEBHOOK.md`,
`/Users/xbohdpukc/dev/toolbox/shared/n8n/tools/n8n/import-workflow.sh`,
`/Users/xbohdpukc/dev/toolbox/shared/n8n/lib/n8n-ssh.sh`,
`docs/reports/NC-20260909-003-CLAUDE-CORRECTION-RESPONSE-R2.md`.

## Q1 — ID validity, stability, collision safety

`workflow.json:1` sets `"id": "adyen-test-payments"` (20 chars). It matches
both the importer's `n8n_validate_workflow_id` regex
(`n8n-ssh.sh:31`, `^[A-Za-z0-9_-]{1,36}$`) and the contract test's identical
assertion (`adyen-webhook-n8n-contract.test.ts:14`). The same literal is used
consistently for `id`, `nodes[0].webhookId`, and `nodes[0].parameters.path`
(`workflow.json:1,8,19`) — one stable identity, no drift between fields.

Collision safety is enforced procedurally, not by the string itself:
`import-workflow.sh:78-81` performs a create-only import — it first attempts
`n8n_export_to_file "$expected_id"` and fails closed with `CONFLICT` if that
ID already exists, before any write. So an accidental collision with an
existing workflow ID is refused rather than silently overwritten.

## Q2 — Load-bearing property coverage in the test

All four properties named in the request are asserted directly against the
committed JSON, not just implied by convention:

- **Disabled-first:** `workflow.active === false`
  (`contract.test.ts:15`, source `workflow.json:101`).
- **Response-after-relay:** `responseMode: 'responseNode'` on the webhook
  node (`contract.test.ts:32`, source `workflow.json:9`) plus explicit
  connection-order assertions, webhook → relay → response
  (`contract.test.ts:47-52`, source `workflow.json:70-93`). n8n only fires
  the `respondToWebhook` node after the relay node completes under
  `responseMode: responseNode`, so the ordering is both structurally encoded
  and asserted.
- **Exact path/target:** `path: 'adyen-test-payments'` and
  `url: 'http://100.115.115.206:8088/hook/adyen-test-payments'`
  (`contract.test.ts:31,37`, source `workflow.json:8,24`) — matches the
  Mini-target hop documented in `docs/ADYEN-TEST-WEBHOOK.md:20`.
- **No retention / no credentials:** all four `settings` flags
  (`contract.test.ts:57-60`, source `workflow.json:96-99`) plus a
  case-insensitive scan of the full serialized workflow for
  `credentials`/`api_key`/`client_secret`/`authorization`
  (`contract.test.ts:62-64`). Manual read of `workflow.json` confirms no
  `credentials` key and no matching literal anywhere in the file.

The importer (`import-workflow.sh:53-67`) independently re-checks a subset
of the same properties at import time (`active`, no `credentials` object, all
three retention settings, plus a broader inline-secret regex including Slack
tokens and bearer/api-key/client-secret patterns) — this is defense-in-depth
against the test being bypassed, not a substitute for it, and the two checks
agree on the same file.

## Q3 — Material reason to block this exact import

None found. `active: false`, `pinData: {}`, `tags: []`, and
`meta.templateCredsSetupCompleted: true` (a template-UI flag, not a stored
credential) are all consistent with an inert, pre-provider-configuration
import per the rollout sequence in `docs/ADYEN-TEST-WEBHOOK.md:70-76`.

**Verification note:** I did not have shell access in this review and could
not independently recompute the SHA-256 digest cited in the request's
evidence section (`5d61ffdf...ea937d`, 64 hex chars — correctly sized for
SHA-256). This is a limitation of this review pass, not a finding against the
workflow file itself, which I did read and check by hand against both the
test and the importer's jq contract.

ACCEPTED — no material finding.
