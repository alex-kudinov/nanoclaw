# NC-20260922-003 bounded consent and routing review

## Objective

Review the smallest load-bearing change that preserves the contact form's
already-authoritative structured context through the existing WordPress -> n8n
-> NanoClaw Inbox -> Sales/Chief path.

Report only material correctness, privacy, authority, injection, field-loss,
or approval-boundary findings. Do not broaden into CRM, lifecycle, contact-form
UX, response copy, or a new architecture.

## Accepted facts

- The live form and WordPress contract already validate, persist, and emit:
  `service_intent`, `buyer_type`, `company`, `preferred_next_step`,
  `business_line`, `journey_engine`, and `marketing_consent` alongside the
  legacy contact fields and bounded `entry_page`.
- Live n8n workflow `1` is active. Its tracked `Sanitize & Extract` source is
  `setup/n8n/contact-form-sanitize-extract.js`; the guarded patch changes only
  that Code node and preserves credentials, topology, settings, and every other
  node.
- The existing NanoClaw contact prompt renders selected payload fields to
  Inbox. The changed prompt adds one line for each structured field. Do not read
  `webhooks.json` or `data/webhooks.json`; they contain unrelated credential
  material. The exact added labels are asserted in
  `src/contact-form-context-contract.test.ts`.
- Inbox is the normal contact-form owner. Sales receives qualified handoffs.
  Chief sees a contact only when Inbox explicitly escalates it. No new Chief
  fan-out is intended.
- Sales drafts remain human-approval gated and Mailman remains the only send
  executor. This change must not authorize a customer email.

## Intended authority boundaries

- `Service-Intent`, `Buyer-Type`, `Organization`, and
  `Preferred-Next-Step` are customer selections/text from the same submission.
  They may help understand what the person chose, but do not prove fit, budget,
  readiness, legal authority, or prior relationship. The more-specific message
  controls; material conflict requires clarification or human review.
- `Business-Line` and `Journey-Engine` are host-derived routing metadata only.
- `Marketing-Consent` is separate optional permission for occasional
  resources. It must not become purchase intent, reply permission, route
  selection, approval, or send authority.
- `Entry-Page` retains its existing privacy-reduced, non-authoritative boundary.

## Non-objectives

- No schema, table, CRM write, new queue, worker, scheduler, service, provider
  call, browsing history, customer message, or backfill.
- No changes to WordPress, contact persistence, n8n dedupe, webhook archive,
  Sales approval, or Mailman execution.
- No synthetic customer identity and no production send.

## Allowed review sources

Read only these files plus this request:

1. `setup/n8n/contact-form-sanitize-extract.js`
2. `setup/n8n/contact-form-intent-patch.json`
3. `src/contact-form-n8n-contract.test.ts`
4. `src/contact-form-context-contract.test.ts`
5. `groups/inbox/CLAUDE.md`
6. `groups/sales/CLAUDE.md`
7. `groups/sales/WORKFLOWS.md`
8. `groups/chief/CLAUDE.md`

Do not read `.env*`, `webhooks.json`, `data/webhooks.json`, credentials, auth
stores, runtime databases, Slack/customer records, or unrelated repository
files.

## Evidence already passed

- Pinned Node: `v22.23.2`.
- Focused tests: 15/15 across the n8n mapper and downstream contract suites.
- Guarded live-workflow dry run: workflow active before patch, eight nodes,
  exactly one changed path (`Sanitize & Extract.parameters.jsCode`), candidate
  inactive for safe import, and unchanged credential-binding hash.
- Fresh-context minimum-sufficient reviewer returned `KEEP` and rejected a new
  validator subsystem.

## Review questions

1. Does the n8n mapper preserve every intended field while failing closed on
   unknown enums and failing open for an otherwise valid inquiry?
2. Can HTML, booleans, omitted values, or conflicting structured fields cross
   a trust/consent boundary unexpectedly?
3. Do Inbox, Sales, and Chief preserve the fields without turning derived
   routing or marketing consent into customer-facing or send authority?
4. Is any material test missing that could allow the reported field-loss to
   recur?

## Response contract

Write only
`docs/reports/NC-20260922-003-CLAUDE-REVIEW-RESPONSE-R1.md`.

Begin with `NO MATERIAL FINDINGS` or a numbered list of material findings,
ordered by consequence. Cite exact file and line evidence. For each finding,
state the smallest correction and the regression proof. Do not edit any source,
test, prompt, config, or documentation other than the response artifact.
