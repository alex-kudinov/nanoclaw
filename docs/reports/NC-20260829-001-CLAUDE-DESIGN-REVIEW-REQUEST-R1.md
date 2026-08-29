# NC-20260829-001 checkout failure correction design review

## Objective

Independently review the confirmed root cause and proposed correction before
implementation. Report only material findings that could make the design lose
source authority, expose private data, duplicate customer/operator action,
weaken consent, miss a failure mode, or become undeployable.

## Authority

- Current owner instruction: identify why the newly deployed checkout loop is
  not working, return to the design decision, validate with Claude, design the
  proper solution, implement, review, release, deploy, and live-verify.
- Accepted decision:
  `decision:checkout-failure-customer-recovery-2026-08-29`.
- Program work: `work:checkout-failure-customer-recovery` under
  `outcome:inbox-resolution`.

## Accepted facts

- Website code is live and has matching configured path/secret fingerprints.
- The website queue holds 99 failed facts, 57 exhausted, from August 24 onward.
- Exact-body WordPress HMAC differs after n8n parse/re-serialize when escaped
  URLs/Unicode are present; this is reproduced against a real queued body.
- Live Stripe Code nodes extract useful fields, but the HTTP node forwards only
  IDs/type/account. The August 29 raw host receipts prove the loss.
- Cases 30/31 are distinct PaymentIntents with three failure events each. They
  posted both `payment_failed` and `shadow_ready` lines and retained no customer,
  Party, product, amount, consent, or decline context.
- Stripe retained exact product/amount/customer/card/`do_not_honor` evidence.
- Party Context resolved the returning person independently, but broad minion
  query remains disabled and must stay so.

## Review files

Read only:

1. `docs/CHECKOUT-FAILURE-RECOVERY.md`
2. `docs/CHECKOUT-RECOVERY-CONTROL.md`
3. `src/checkout-recovery.ts`
4. `src/checkout-recovery-store.ts`
5. `setup/vps/n8n-stripe-lifecycle-extractor.js`
6. `setup/n8n/checkout-recovery-website-shadow-workflow.json`
7. `/private/tmp/tandemweb-checkout-recovery.rilpAe/wordpress/tandem-snippets/includes/class-stripe-checkout.php`
8. `/private/tmp/tandemweb-checkout-recovery.rilpAe/wordpress/tandem-snippets/assets/js/checkout.js`

Do not inspect environment files, credentials, raw customer/provider payloads,
runtime databases, Slack history, browser sessions, auth stores, unrelated
worktree changes, or historical transcripts.

## Required review

Challenge these load-bearing choices:

- exact raw-body signature repair;
- full Code-node-to-HTTP relay parity and failure-field minimization;
- exact-reference/unique-email Party binding without merging;
- migration 140 failure/incident shape;
- customer-safe decline mapping and sensitive-code suppression;
- one durable 30-minute operator incident over multiple cases/attempts;
- consent-preserving separation of immediate inline guidance from outbound
  reminders;
- historical queue quarantine/no replay;
- backup, patch, activation, canary, and rollback sequence.

## Non-objectives

Do not propose retroactive customer contact, historical replay, payment retry,
raw payload storage, broad Party Context activation, generic CRM redesign,
marketing-flow expansion, or unrelated checkout changes.

## Response

Write only
`docs/reports/NC-20260829-001-CLAUDE-DESIGN-REVIEW-RESPONSE-R1.md`.
Use `NO MATERIAL FINDINGS` or an ordered list of material findings with exact
evidence and the minimum required correction. Do not implement.
