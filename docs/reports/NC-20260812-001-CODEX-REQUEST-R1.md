# NC-20260812-001 — Codex request to Claude, R1

Date: 2026-08-12
Requested role: NanoClaw owner and adversarial architecture reviewer
Change class: C5

## Outcome requested by the owner

Wire the existing lead-lifecycle foundation into the authoritative business
systems so Chaos can measure, by privacy-safe person and acquisition source:

1. purchases and refunds from **both** Stripe accounts;
2. Encharge activation, first email click, real suppression, and sequence exit;
3. Heartbeat course start and completion;
4. trustworthy 7/30/90-day source-to-purchase cohort reconciliation.

This round is deliberately limited to architecture. Do not edit source or live
systems. Recommend changes only when they create durable evidence or correct a
material integrity gap.

The only permitted write is
`docs/reports/NC-20260812-001-CLAUDE-RESPONSE-R1.md` in this isolated NanoClaw
worktree.

## Current evidence

### Chaos

- Production is on schema `2026-08-12.2` and exposes authenticated
  `POST /wp-json/chaos/v1/lifecycle-event`.
- Idempotency is `source_system + source_event_id`.
- Raw email/provider IDs are not retained in the lifecycle ledger; identity
  links use a site HMAC and ambiguous historical Encharge IDs are quarantined.
- Current allowed events omit refunds. They include `captured`, `activated`,
  `course_started`, `course_completed`, `offer_shown`, `email_clicked`,
  `checkout_started`, `purchase_completed`, `suppressed`, `sequence_exited`,
  and `call_booked`.
- Historical normalization is deployed, idempotent, and reviewed. The open
  problem is future producers and source reconciliation.

### Stripe and NanoClaw

- n8n verifies signatures for two Stripe webhook secrets and forwards accepted
  payment events to NanoClaw's `stripe-payment` hook.
- The tracked workflow currently accepts only `payment_intent.succeeded` and
  `checkout.session.completed` and forwards only `{stripe_id,event_type}`.
- It validates but drops the provider `evt_*`, verified-account identity, Stripe
  `created`, and canonical payment identity.
- NanoClaw's host runs a deterministic dual-key payment processor. The primary
  key is documented as the Heartbeat account; the alternate key is the other
  Tandem account. It tries keys until the object resolves, but does not return
  which account matched.
- `checkout.session.completed` and `payment_intent.succeeded` may both describe
  the same sale. The current inbox key spans `{stripe_id,event_type}`, so those
  can be accepted separately. A completed Checkout Session can also be unpaid.
- The host declares refund event types, but the tracked n8n workflow does not
  forward them. The refund script updates the existing accounting record.
- The existing processor writes Sheets and Postgres idempotently by the incoming
  `pi_*` or `cs_*`. It must remain the only fulfillment/accounting path.

### Encharge

- Existing native Stripe-to-Encharge behavior must not be duplicated.
- The active tool sequence has three emails but no Goal, End Flow, suppression
  branch, or lifecycle webhook action.
- Encharge supports a Send Webhook action, Email Activity triggers, Goal, and
  End Flow. A webhook can include `person.id`, `person.email`, and current time.
- A suppression event must correspond to a real eligibility decision; it must
  not be synthesized merely because a sequence ended.

### Heartbeat

- The native free-course completion workflow exists but has zero runs.
- Native workflow actions do not include a generic webhook.
- A legacy WordPress `/heartbeat-webhook` route handles some Heartbeat event
  payloads and forwards to Encharge, but recent logs contain no evidence that it
  receives production deliveries. It also hard-codes course completion as
  unpaid and is not a trustworthy lifecycle producer as-is.

## Design constraints

- No customer email, contact creation, customer messaging, payment, or refund
  action is in scope.
- Never log secrets or full customer payloads. Raw email may be sent transiently
  to the owner-controlled Chaos endpoint solely for immediate HMAC resolution.
- Preserve NanoClaw's webhook inbox/reaper durability and the current accounting
  path. No second fulfillment path and no second Stripe-to-Encharge path.
- Retries must be safe. A sale represented by both `cs_*` and `pi_*` must count
  once. Refunds must be additive facts and must not overwrite purchase history.
- Source account, provider event, canonical transaction, product, occurred time,
  and identity resolution must be reconcilable without persisting unnecessary
  PII.
- External configuration should be fail-closed or kill-switchable and must be
  observable without claiming causal uplift from descriptive cohorts.

## Candidate architecture for critique

1. n8n preserves `event_id`, `event_type`, `created`, verified account label,
   and the relevant Stripe object IDs in the NanoClaw envelope.
2. NanoClaw resolves the object using the account-specific key rather than
   trying both silently, derives a canonical transaction ID (normally `pi_*`),
   and rejects unpaid/failed events as purchases.
3. After the existing deterministic accounting step succeeds, a host-owned
   lifecycle outbox stores a privacy-minimized Chaos event. A separate retrying
   sender posts it to Chaos. This prevents Chaos downtime from blocking payment
   accounting while retaining at-least-once delivery.
4. Chaos adds `purchase_refunded` as a distinct allowed event. Cohort reporting
   retains gross purchase conversion and reports refunds separately/net, rather
   than deleting the original purchase.
5. Encharge sends first-click and sequence-exit events directly to Chaos or to a
   narrow relay. Suppression is added only after a real buyer/current-student
   filter exists. Flow configuration IDs become an auditable inventory.
6. Heartbeat uses a verified API webhook or bounded poller with durable cursor;
   the unproven legacy WordPress route is not treated as authoritative.
7. A weekly reconciliation compares provider/source totals and unmatched rows
   for 7/30/90 days, with freshness and coverage flags.

## Files to inspect (keep review bounded)

NanoClaw:

1. `src/stripe-payment-host.ts`
2. `tools/contador/process-payment.cjs`
3. `src/webhook-extractors.ts`
4. `src/webhook-server.ts`
5. `setup/vps/n8n-stripe-workflow-2026-04-05.json`
6. `docs/WEBHOOK-RELIABILITY.md`

Chaos:

7. `includes/class-lifecycle.php`
8. `docs/lifecycle-data-contract.md`

## Questions requiring a verdict

1. Is the lifecycle outbox after deterministic accounting the right boundary,
   or should Chaos publication be tied directly to the existing webhook inbox?
2. What canonical idempotency key prevents Checkout Session and Payment Intent
   double counting while retaining original provider event IDs for audit?
3. How should the verified Stripe account label be derived and carried without
   trusting a caller-supplied label?
4. Is `purchase_refunded` the correct additive event and what minimum fields are
   required for full and partial refunds?
5. What is the smallest safe implementation slice that can be deployed and
   proven before touching Encharge or Heartbeat configuration?
6. Which parts of the candidate architecture should be rejected, and why?

End with exactly one verdict: `SHIP DESIGN`, `REVISE DESIGN`, or `DO NOT SHIP`.
For `REVISE DESIGN`, give the exact revised design and acceptance tests.
