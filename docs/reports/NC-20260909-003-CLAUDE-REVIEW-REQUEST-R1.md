# NC-20260909-003 bounded security review

## Objective

Review the TEST-only Adyen Standard webhook admission slice. Report only
material defects that could accept forged/live/wrong-tenant events, acknowledge
before durable admission, leak payment/shopper data or HMAC keys, break
idempotency, dispatch agents/fulfillment, misconfigure the n8n relay, or prevent
safe deployment and rollback.

## Authority and boundaries

- `/Users/xbohdpukc/dev/peri/PROGRAM.md` and the accepted TEST-foundation work
  item govern.
- TEST only. Stripe, live Adyen, payments/refunds/payouts, enrollment,
  lifecycle, accounting, messaging, and customer communication remain unchanged.
- n8n/Cloudflare stays the public perimeter, but NanoClaw must independently
  verify the provider HMAC and exact environment/merchant/store/reference/event.
- No secret value is in the review packet. Never read `.env`, auth stores,
  runtime databases, browser state, logs, or unrelated repository paths.
- Do not edit implementation. Write only the response artifact.

## Allowed sources

1. `src/adyen-webhook.ts`
2. `src/adyen-webhook.test.ts`
3. `src/webhook-server.ts`
4. `src/webhook-server.test.ts`
5. `src/config.ts`
6. `src/index.ts`
7. `setup/n8n/adyen-test-payments-workflow.json`
8. `docs/ADYEN-TEST-WEBHOOK.md`

## Accepted implementation facts

- Adyen Standard HMAC signs the colon-joined fields in documented order using
  SHA-256 and a hex-decoded key; the official sample vector is a passing test.
- The provider expects a 2xx acknowledgement such as 200 or 202 only after the
  event is safely accepted.
- Standard JSON normally has one notification item, but the parser validates
  the complete batch before any write.
- Existing `archiveWebhook` enforces `(source,event_id)` uniqueness and
  `markWebhookHandled` makes the test-only receipt terminal.
- No payment has been submitted and no provider/runtime/database mutation has
  occurred.

## Current verification

- Node 22.23.2 typecheck and build pass.
- Focused receiver/server tests: 47/47.
- Full NanoClaw suite: 129 files / 1,655 tests pass.
- Documentation continuity and n8n JSON parsing pass.

## Acceptance questions

1. Is HMAC comparison correct and constant-time for current/previous keys?
2. Does every invalid or out-of-scope condition fail before archive/ack?
3. Is persisted data sufficiently minimized and secret-free?
4. Can a duplicate/race or archive/terminal-state failure look accepted?
5. Does the n8n workflow wait for the receiver and avoid successful execution
   retention while preserving the Standard HMAC fields?
6. Does `/health` expose only non-secret readiness?
7. Are the config and rollback boundaries safe for an inert-first release?

Write material findings, ordered by consequence with exact file/line evidence
and a concrete correction, to
`docs/reports/NC-20260909-003-CLAUDE-REVIEW-RESPONSE-R1.md`. If none, say
`No material findings.` and list at most three genuine release-time residual
risks. Do not restate the implementation or add a speculative backlog.
