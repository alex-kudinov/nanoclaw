# NC-20260829-001 checkout failure implementation review R3

## Objective

Perform an independent, bounded implementation review of the converged checkout
failure correction. Report only material correctness, privacy, authority,
idempotency, concurrency, customer-safety, deployment, or rollback findings.

## Accepted authority and design

- Owner authorized root-cause analysis, Claude validation, implementation,
  release, deployment, and live verification under
  `decision:checkout-failure-customer-recovery-2026-08-29`.
- Design R1 found and R2 closed the historical-queue replay race and atomic
  incident-grouping race.
- No retroactive customer contact, historical queue replay, payment retry,
  raw provider payload storage, guessed identity, consent weakening, or broad
  Party Context activation is authorized.

## Implemented result

- n8n website HMAC uses exact raw bytes and parses only after verification.
- Stripe Code-node output plus safe decline/card fields is forwarded whole.
- Migration 140 adds source-bound Party/failure context and one dedicated,
  fixed-window incident with advisory-lock find-or-create and unique case
  membership.
- Failed webhooks do not post Slack. The sweep waits five quiet minutes and
  sends one human-first root with a stable thread key; later material changes
  are replies and purchase closes the incident.
- Frontend error copy uses a localized six-key safe mapping; raw Stripe message
  and sensitive decline reasons are never rendered.
- Affirmative policy-v2/v3 decisions are accepted; opt-out/strict/unknown and
  legacy-denied variants remain refused.
- WordPress can quarantine the exact old queue, clear retry cron, set a source
  epoch, and hold stale overlapping facts.
- A generic n8n exact-node patch tool preserves credential bindings,
  connections, settings, and unrelated nodes with full backups/readback and
  rollback attempt.

## Review files

Read only these eight core implementation artifacts plus this request:

1. `data/business/migrations/nanoclaw-v2/140_checkout_failure_incidents.sql`
2. `src/checkout-recovery.ts`
3. `src/checkout-recovery-store.ts`
4. `setup/vps/n8n-stripe-lifecycle-extractor.js`
5. `setup/n8n/checkout-recovery-website-verify.js`
6. `/private/tmp/tandemweb-checkout-recovery.rilpAe/wordpress/tandem-snippets/includes/class-stripe-checkout.php`
7. `/private/tmp/tandemweb-checkout-recovery.rilpAe/wordpress/tandem-snippets/assets/js/checkout.js`
8. `/private/tmp/toolbox-n8n-patch.ccYdsX/shared/n8n/tools/n8n/patch-workflow-nodes.sh`

Do not inspect `.env*`, credentials, auth/session stores, raw customer/provider
payloads, runtime databases/logs, Slack history, browser state, unrelated dirty
worktrees, or transcripts.

## Evidence already passed

- NanoClaw focused checkout/host tests: 71/71; typecheck pass.
- Migration 140: production-shape schema-only disposable apply, 2 tables/10
  columns, zero non-admin grants, empty rollback pass.
- Tandemweb focused PHP/JS/consent/quarantine contracts pass; full plugin
  50/51 with one exact pre-existing exam-fulfillment failure.
- Toolbox n8n contracts: 17/17 plus exact-node credential-preservation fixture.
- Live n8n patch dry-run changes only five named node paths across two
  workflows and preserves credential-binding hashes.

## Questions that must be answered

- Can two concurrent/out-of-order cases still create duplicate incidents or
  attach one case to the wrong fixed episode?
- Can a terminal purchase or late failure reopen/noisily re-notify an incident?
- Can any raw/sensitive Stripe detail reach Slack/customer copy or durable
  non-admin evidence?
- Can affirmative v3 consent be accepted without accidentally accepting an
  opt-out/no-consent variant?
- Can the queue quarantine or n8n patch lose/replay work, alter credentials,
  leave a workflow inactive, or fail rollback silently?
- Does any source/SQL/runtime mismatch make the deployment unsafe?

## Response

Write only
`docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R3.md`.
List material findings in descending consequence with exact evidence and the
minimum correction. If none, state `NO MATERIAL FINDINGS`. Do not implement.
