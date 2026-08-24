# NC-20260824-001 bounded review request

## Objective

Review the presentation-only change that makes internal Slack notification
previews state the human business event before identifiers, classification
slugs, and diagnostics. Report only material correctness, safety, regression,
or truthfulness findings.

Examples of the intended first lines:

- `Payment received: Lin Chen — Mentor Coaching Foundations — $999.00 USD`
- `New website lead: Lin submitted the contact form on the mentor coaching foundations page`
- `Form submitted: Hanne requested the MCQF brochure`

## Authority and boundaries

- Repository instructions and the accepted NC-20260824-001 scope govern.
- This change may alter only operator-facing message presentation and focused
  tests/docs.
- It must not alter payment processing, fulfillment decisions, lead creation or
  classification, routing, customer-facing messages, provider state, schemas,
  schedules, credentials, or external systems.
- Treat all names, emails, page paths, intent summaries, product names, and
  Stripe-derived text as untrusted presentation data.
- Do not inspect `.env*`, auth stores, runtime databases, customer records,
  browser/session state, or unrelated private files.

## Review paths

Review only these changed paths and their direct imports when necessary:

1. `src/chaos-activity.ts`
2. `src/chaos-activity.test.ts`
3. `src/webhook-server.ts`
4. `src/webhook-server.test.ts`
5. `tools/contador/process-payment.cjs`
6. `tools/contador/process-payment.test.ts`
7. `docs/chaos-activity-handler-plan.md`
8. `docs/ACTIVE-WORK.md`

Use `git diff --` on those paths as the bounded implementation evidence.

## Questions that matter

1. Do the first lines truthfully explain what happened without overclaiming a
   download, signup, lead, refund, or completion state?
2. Are diagnostics and identifiers preserved where operationally useful but
   kept out of the notification preview?
3. Can untrusted input create misleading multiline/control-character output or
   an unreasonable preview?
4. Does changing the Contador summary break any sentinel/parser or durable
   fulfillment behavior?
5. Do focused tests cover the load-bearing formatting and host-send path?

## Verification already run

- Node 22.23.2 focused notification/host suites: 105/105 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run docs:continuity-check`: passed.
- Full root suite: 3,088 passed, 12 skipped, one unchanged failure in
  `src/cnpc-prompt-contract.test.ts` because the existing source-checkout
  wrapper does not contain the literals owned by its compiled implementation.
  NC-20260824-001 does not touch CNPC files.

## Response contract

Write only `docs/reports/NC-20260824-001-CLAUDE-REVIEW-RESPONSE-R1.md`.
Order findings by severity and cite exact path/line evidence. Report only
material findings; if none exist, state `NO MATERIAL FINDINGS` and briefly name
the invariants checked. Do not edit implementation, tests, or other docs. Do
not commit, push, deploy, send Slack messages, or access external systems.
