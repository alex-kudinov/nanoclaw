# NC-20260824-006 Claude implementation review response

Reviewed against the five allowed files only: the request, `CHECKOUT-RECOVERY-CONTROL.md`, and the three Codex diff patches (NanoClaw, Tandemweb, toolbox). No other repository access was used.

## Finding 1 — Severity: High. Conflict-forced `held` transition bypasses terminal precedence for `purchased`/`recovered` cases

**Evidence:** `src/checkout-recovery-store.ts`, `recordPreparedCheckoutRecoveryWithClient`:

```ts
let forcedHold: string | null = null;
if (current.email_sha256 && input.event.email_sha256 && current.email_sha256 !== input.event.email_sha256) {
  forcedHold = 'identity_conflict';
} else if (current.product_slug && input.event.product_slug && current.product_slug !== input.event.product_slug) {
  forcedHold = 'product_conflict';
}
const transition = forcedHold
  ? { state: 'held' as const, resultCode: forcedHold }
  : nextCheckoutRecoveryState(current.state, input.event);
```

`nextCheckoutRecoveryState` is the only place that implements the control document's terminal-precedence rule (`current === 'purchased' || 'recovered' || 'closed'` → stay put, `resultCode: 'terminal_precedence'`, `src/checkout-recovery.ts`). The `forcedHold` branch skips that function entirely, so a late-arriving event with a conflicting `email_sha256` or `product_slug` on an already-`purchased`/`recovered` case forces `transition.state = 'held'` unconditionally.

**Consequence:** This contradicts an explicit accepted invariant: "Exact purchase/recovery is terminal for the recovery lifecycle... cannot reopen or regress the case." In practice, for `purchased`/`recovered` cases the follow-on `UPDATE` will collide with the migration's own `checkout_recovery_case_terminal_chk` CHECK constraint (`(state IN ('purchased','recovered')) = (purchased_at IS NOT NULL)` — `purchased_at` stays set via `COALESCE` while `state` would become `held`), so the write throws and the transaction rolls back. No silent state corruption occurs, but that specific conflicting event will repeatedly fail to record (thrown error → `markWebhookFailed`/error logs on every delivery or replay) instead of being appended as evidence against an unregressed terminal case, which is the behavior the control document promises.

**Correction:** Check `current.state` for terminal precedence (`purchased`/`recovered`/`closed`) before evaluating `forcedHold`, and short-circuit to the existing `terminal_precedence` no-op path (recording a receipt only) rather than attempting a `held` transition on a terminal case.

## Finding 2 — Severity: Medium. Raw checkout token persisted into the general `webhook_inbox` archive, outside the admin-scoped tables

**Evidence:** `src/webhook-server.ts`, website relay handler:

```ts
parsed = prepareWebsiteCheckoutRecoveryEnvelope(JSON.parse(rawBody.toString('utf8')), checkoutRecovery.identitySecret);
...
const archived = await this.deps.archiveWebhook({
  source: 'checkout-recovery-website',
  event_id: parsed.prepared.source_event_key,
  event_type: parsed.prepared.event_type,
  raw_headers: req.headers,
  raw_body: parsed.prepared,      // includes parsed.prepared.aliases
  delivery_path: 'n8n',
});
```

`prepareWebsiteCheckoutRecoveryEnvelope` (`src/checkout-recovery.ts`) puts the raw 32-character `checkout_token` into `aliases: [{kind: 'checkout_token', id: checkoutToken}, ...]`, which is part of `prepared` and is therefore written verbatim into `webhook_inbox.raw_body`.

**Consequence:** The control document's "Privacy and consent" section names only cases/aliases/events/receipts as the durable, data-minimized state, and migration 135 applies `REVOKE ALL ... FROM PUBLIC` to exactly those four tables. `webhook_inbox` is a pre-existing, multi-source table (also used by Stripe payments, student lifecycle, Gmail push, etc.) that is not touched by migration 135 and whose grants are not part of this patch set. This change durably copies a sensitive per-checkout identifier (functionally a bearer-like token — it also keys the WordPress `tc_checkout_{token}` transient) into that shared table, which is not accounted for anywhere in the stated privacy boundary.

**Correction:** Either strip `aliases` (or at minimum the `checkout_token` alias) from the object written to `webhook_inbox.raw_body`, or confirm and document that `webhook_inbox`'s access grants match the same admin-only posture as the four new `checkout_recovery_*` tables before relying on this boundary claim.

## Finding 3 — Severity: Medium. `encharge-automations.json` misdescribes the new shadow relay call as firing an Encharge event

**Evidence:** `data/marketing/encharge-automations.json`, `checkout-payment-failed` entry:

```json
"fired_from": [
  "wordpress/tandem-snippets/includes/class-stripe-checkout.php (payment_intent.payment_failed webhook)"
],
"trigger_description": "The authenticated on-site Stripe webhook emits checkout-payment-failed with exact product, amount, PaymentIntent, and bounded failure context.",
```

versus the actual code change at that call site (`class-stripe-checkout.php`, `handle_intent`/payment-failed webhook path):

```php
$this->fire_checkout_recovery_shadow(
    'payment.failed',
    $shadow_token,
    $shadow_session,
    $product,
    'tw:v1:' . $shadow_token . ':payment_failed:' . sanitize_key(...)
    ...
);
```

`fire_checkout_recovery_shadow` posts only to `$this->checkout_recovery_url` (the shadow n8n relay), never to `self::ENCHARGE_INGEST`. No Encharge event named `checkout-payment-failed` is emitted by this diff.

**Consequence:** `status` correctly remains `flow_planned` and the `notes` field even states "shadow case capture is not a send or an active Encharge flow" — but `trigger_description` and `fired_from` directly assert the opposite (that the webhook "emits checkout-payment-failed"). Since this file is the system of record consulted before any Encharge/no-send-boundary decision, a future reader who trusts `trigger_description` in isolation could believe the Encharge producer already exists and skip building it, or wrongly treat `flow_planned` as ready to flip to `flow_active`.

**Correction:** Rewrite `trigger_description`/`fired_from` to state that the webhook now records a shadow-only internal fact via the NanoClaw relay, and that no Encharge event is fired for this case yet.

## Finding 4 — Severity: Low-Medium. Undocumented 5-minute shadow window for `payment.failed`, contradicting the stated single 45-minute Tandem timeout

**Evidence:** `src/checkout-recovery-store.ts`, `shadowDueAt`:

```ts
function shadowDueAt(event, nextState) {
  if (event.stripe_account !== 'tandem') return null;
  const observed = Date.parse(event.observed_at);
  if (event.event_type === 'payment.failed') {
    return new Date(observed + 5 * 60_000).toISOString();   // 5 minutes
  }
  if (['captured', 'payment_created', 'client_abandoned'].includes(nextState)) {
    return new Date(observed + 45 * 60_000).toISOString();  // 45 minutes
  }
  return null;
}
```

versus `docs/CHECKOUT-RECOVERY-CONTROL.md` ("`tandem` gets a signed website start plus a 45-minute timeout") and the shipped static claims: `src/index.ts` health payload (`tandemTimeoutMinutes: 45`) and `src/checkout-recovery-report-cli.ts` (`tandem: '45_minutes_after_server_capture'`).

**Consequence:** An explicit card decline on the Tandem account is surfaced to the shadow sweep in 5 minutes, not 45. This may be an intentional fast-path for a stronger signal (a decline is more actionable than a mid-flow capture), but neither the control document nor `/health` nor the report CLI describe this bifurcation — both self-report a single flat 45-minute figure for every Tandem case. This is exactly the class of report-accuracy gap the accepted plan corrections were meant to close for the Tandem/Heartbeat asymmetry, now recurring one level down inside Tandem's own states.

**Correction:** Either document the 5-minute fast path for `payment.failed` in `CHECKOUT-RECOVERY-CONTROL.md` and make the health/report fields reflect both numbers, or align `shadowDueAt` to the single documented 45-minute value if the 5-minute branch was unintentional.
