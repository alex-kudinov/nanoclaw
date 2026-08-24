# Checkout recovery shadow control

Status: implementation in review under `NC-20260824-006`
Authority: Growth decision `decision:abandoned-checkout-recovery-implementation-2026-08-24`
Mode: host-owned production shadow; customer sends disabled

## Plain-English contract

Starting checkout is now durable work, not only a Slack notification. NanoClaw
stores one privacy-minimized case, updates it from exact website and Stripe
facts, and surfaces a bounded internal shadow item when the attempt remains
unpaid. The system does not email the buyer.

This is not Contador. Contador begins with a completed payment or refund and
owns payment-to-student fulfillment receipts. Checkout recovery is a separate
pre-payment lifecycle and does not touch accounting, rosters, student access,
or Sales follow-up cases.

## Account coverage

| Stripe account | Start evidence | Abandonment decision | Completion evidence |
| --- | --- | --- | --- |
| `tandem` | signed Tandemweb server capture and PaymentIntent creation | host timeout 45 minutes after capture/payment creation; explicit payment failure uses a five-minute fast path; client abandon is context only | exact PaymentIntent/Checkout completion alias |
| `heartbeat` | none from Tandemweb | provider event only: PaymentIntent failure or Checkout Session expiry | exact Checkout/PaymentIntent completion alias |

Reports must keep those guarantees separate. “Both accounts represented” does
not mean Heartbeat attempts receive a 45-minute signal.

## Source contract

### Website

Tandemweb sends version-1 facts to an n8n ingress. WordPress signs the exact
JSON with a dedicated ingress secret. The tracked workflow verifies that
signature, allowlists fields, and signs a second exact body with a distinct
NanoClaw relay secret. The host route is opaque, HMAC-authenticated,
size-bounded, and default off.

Accepted website facts are `checkout.captured`, `payment.created`,
`checkout.client_abandoned`, `payment.failed`, and `payment.succeeded`.

The WordPress producer keeps a bounded retry queue. Successful relay receipt or
exhausted retry remains distinguishable. Checkout and Stripe webhook success
never depend on the shadow observer.

The n8n website webhook responds only after its final NanoClaw POST succeeds.
It must not use an immediate/on-receipt response mode: WordPress removes a retry
only after a 2xx response, so an early acknowledgment would turn a downstream
relay failure into silent event loss.

### Stripe

The existing fixed-account n8n code owns the `heartbeat` or `tandem` account
label; a Stripe payload cannot choose it. The current payment/refund allowlist
is preserved. Shadow recovery additionally accepts PaymentIntent failure and
Checkout Session expiry; existing success/completion events close recovery.

The two n8n Stripe Trigger nodes must declare the same five-event set as the
extractor: charge refund, Checkout completion, Checkout expiry, PaymentIntent
failure, and PaymentIntent success. Treat the trigger definitions as the
durable provider contract. A direct edit to a current Stripe event destination
is only temporary because n8n recreates the destination from those definitions
after workflow republication or restart.

Failure/expiry never enters `process-payment.cjs`. Success still finishes the
Contador path and then binds/closes the recovery case before the webhook inbox
is terminal. A failed recovery close leaves the inbox retryable; Contador's
existing idempotency makes the replay safe.

## Identity and precedence

A website case begins on `tandemweb:<checkout-token>`. Exact aliases bind later:
checkout token, PaymentIntent, Checkout Session, charge, Stripe event, and
`recovered_from`. Alias ownership is unique per account/kind/id; aliases that
span cases fail closed.

Heartbeat cases begin on an exact Stripe alias because no Tandemweb capture
exists. Email/product/time similarity is never exact purchase proof.

Exact purchase/recovery is terminal for the recovery lifecycle. Later failure,
expiry, client abandon, or timeout facts append evidence but cannot reopen or
regress the case. Refunds remain outside this lifecycle.

## Privacy and consent

The host case table is admin-only. It may retain normalized email for future
separately authorized delivery, plus a stable HMAC digest for dedupe. Events,
reports, and Slack projections contain no email, name, checkout token, raw
payload, recovery URL, provider endpoint, or secret.

Tandemweb presents an unchecked reminder choice in English, Spanish, Japanese,
and French with policy version `checkout-reminder-v1`. Consent is granted,
denied, or unknown. Shadow readiness is not send eligibility. No customer-send
outbox, handler, Encharge consumer, CRM write, or message body exists in
migration 135.

## Durable state

Migration 135 creates cases, aliases, events, and receipts. Cases distinguish
captured, payment-created, failed, client-abandoned, shadow-ready, purchased,
recovered, suppressed, expired, held, and closed. Events and receipts have
immutable core fields. Rollback refuses after any case/evidence exists.

## Owner readback

The five-minute host sweep selects due Tandem cases with row locks, records a
`checkout.shadow_timeout` event, determines consent eligibility, and returns a
content-minimized projection. One transition-only line goes to the registered
Inbox group and is acknowledged in the case receipt only after Slack accepts
the post. The canonical case, not Slack, owns closure.

Captured, payment-created, and client-abandoned cases become due after 45
minutes. An exact `payment.failed` fact is a stronger signal and becomes due
after five minutes. Health and aggregate reports expose both windows.

`npm run checkout-recovery:report` emits aggregate account/state/consent/
eligibility counts and explicitly labels Tandem timeout versus Heartbeat
event-only coverage. It contains no person-level fields.

## Configuration

NanoClaw host-only values are `CHECKOUT_RECOVERY_ENABLED` (default false), an
opaque `CHECKOUT_RECOVERY_WEBHOOK_PATH`, `CHECKOUT_RECOVERY_RELAY_SECRET`, and a
distinct `CHECKOUT_RECOVERY_IDENTITY_SECRET`. WordPress/n8n use separately
managed ingress/relay references. No live path or secret belongs in Git,
workflow exports, logs, or reports.

## Deployment and rollback

Release follows `docs/RELEASE-INTEGRITY.md` without abbreviation: clean exact
commit, provenance-bearing archive, protected backups, zero-work drain,
migration 135 dry-run/apply/readback, three-pointer activation, exact
health/code-root/Node checks, Gmail/Slack/queue and protected-ledger
non-interference, error-baseline comparison, and retained rollback.

Disable provider/website ingress first for rollback. Runtime can be disabled
without deleting evidence. SQL rollback is allowed only while all four tables
are empty; otherwise use a separately reviewed archival migration.

## Explicit non-authority

This control cannot send recovery email, activate an Encharge flow, contact a
historical abandoner, create a Stripe transaction, change Heartbeat behavior,
book a call, alter CRM, grant course access, update rosters, refund, account,
or spend money.
