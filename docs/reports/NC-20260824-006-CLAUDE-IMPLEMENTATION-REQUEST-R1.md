# NC-20260824-006 implementation review request

Review the checkout-recovery implementation across NanoClaw, Tandemweb, and the shared Stripe toolbox. This is a cross-repository control, so the three bounded patch artifacts total about 137 KB; direct repository archaeology is forbidden. Report material correctness, privacy, security, data-integrity, release, or no-send-boundary findings only.

## Authority and invariants

- Owner authorized implementation, deployment, provider failure/expiry event capture, and internal shadow readback.
- Customer recovery sends, historical outreach, Encharge activation/category mutation, synthetic purchases, spending, accounting, roster/access, CRM, and booking changes are forbidden.
- Pre-payment recovery is a new host lifecycle, not Contador payment fulfillment or Sales follow-up.
- `tandem` gets a signed website start plus a 45-minute timeout. `heartbeat` is Stripe-event-only; the report must preserve that asymmetry.
- Purchase/recovered completion is terminal and outranks late failure, expiry, abandon, or timeout.
- Slack is a content-minimized projection. PostgreSQL cases/events/receipts are canonical.
- Email may exist only in the admin-only case table. Event facts, reports, and Slack must omit it, raw checkout tokens, recovery URLs, endpoints, and secrets.
- Shadow readiness is not send eligibility. No send outbox/handler exists.
- Provider mutation is additive-only: preserve every enabled event and add only `payment_intent.payment_failed` and `checkout.session.expired`, with readback.

## Accepted plan corrections

The prior Sonnet/high plan review found two material issues and both are implemented:

1. Heartbeat has no 45-minute pre-state; its cases are event-driven and account-separated in reports.
2. Production release explicitly requires the complete NanoClaw protected-backup, ordered migration, three-pointer activation, exact health/code-root/Node, Gmail/Slack/queue/protected-ledger non-interference, error-baseline, and rollback protocol.

Do not reopen those accepted corrections unless the patch contradicts them.

## Verification already completed

- NanoClaw focused checkout/webhook surface: 70 passed, 3 disposable-only skipped.
- Disposable PostgreSQL store: 3/3 passed.
- Migration chain through 135: apply passed; zero non-admin grants; replay failed closed with unchanged fingerprint; populated rollback refused; empty rollback removed all four relations.
- NanoClaw typecheck/build passed.
- Full NanoClaw suite: 3,185 passed, 17 skipped, one unchanged pre-existing CNPC wrapper-contract failure.
- Tandemweb: PHP lint; installment 11/11; regional pricing 60/60; shadow static contract; JS parse; JSON parse; diff check all passed.
- Toolbox: shell parse, registry validation, static contract, and live read-only calls passed.
- Read-only provider evidence: last 30 days showed primary/Heartbeat 22 Checkout Sessions (20 expired, one open, one complete), zero recovery-enabled; alt/Tandem zero Checkout Sessions because that path uses PaymentIntents. Both exact n8n Stripe destinations dry-run from three events to the same five-event additive set.
- No production provider, schema, runtime, WordPress, n8n, Slack, Encharge, or customer state has changed yet.

## Files Claude may read

1. This request.
2. `/private/tmp/nanoclaw-checkout-recovery.r238U0/docs/CHECKOUT-RECOVERY-CONTROL.md`
3. `/private/tmp/nanoclaw-checkout-recovery.r238U0/docs/reports/NC-20260824-006-CODEX-NANOCLAW-DIFF-R1.patch`
4. `/private/tmp/nanoclaw-checkout-recovery.r238U0/docs/reports/NC-20260824-006-CODEX-TANDEMWEB-DIFF-R1.patch`
5. `/private/tmp/nanoclaw-checkout-recovery.r238U0/docs/reports/NC-20260824-006-CODEX-TOOLBOX-DIFF-R1.patch`

Do not use Glob, Grep, Bash, web, MCP, memory, `.env`, credentials, provider endpoints, customer data, or any other path.

## Response

Write `/private/tmp/nanoclaw-checkout-recovery.r238U0/docs/reports/NC-20260824-006-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`.

For each material finding give severity, exact patch/file evidence, consequence, and correction. If none remain, write `NO MATERIAL FINDINGS`. Do not edit source or any other artifact.
