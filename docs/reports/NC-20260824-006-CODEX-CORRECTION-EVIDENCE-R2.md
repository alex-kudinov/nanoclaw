# NC-20260824-006 correction evidence R2

## Finding 1: terminal precedence

Current `recordPreparedCheckoutRecoveryWithClient` now evaluates terminal state first:

```ts
const terminalPrecedence = ['purchased', 'recovered', 'closed'].includes(
  current.state,
);
let forcedHold: string | null = null;
if (!terminalPrecedence) {
  if (current.email_sha256 && input.event.email_sha256 &&
      current.email_sha256 !== input.event.email_sha256) {
    forcedHold = 'identity_conflict';
  } else if (current.product_slug && input.event.product_slug &&
             current.product_slug !== input.event.product_slug) {
    forcedHold = 'product_conflict';
  }
}
const transition = terminalPrecedence
  ? nextCheckoutRecoveryState(current.state, input.event)
  : forcedHold
    ? { state: 'held' as const, resultCode: forcedHold }
    : nextCheckoutRecoveryState(current.state, input.event);
```

The disposable integration test now purchases the case and then delivers a late failure with both a different email and different product. The case remains `purchased`, result is `terminal_precedence`, and the fourth normalized event is appended. Disposable PostgreSQL 3/3 passed.

## Finding 2: shared webhook archive token

`checkoutRecoveryArchiveEnvelope` now hashes exact source event/case keys and exposes alias kinds only:

```ts
return {
  eventId: `checkout-recovery:${sha256(source_event_key)}`,
  body: {
    source_event_sha256,
    source_case_sha256: sha256(source_case_key),
    // normalized non-token fields
    alias_kinds: uniqueSortedKinds,
    recovered_from_present: event.recovered_from !== null,
  },
};
```

The dedicated website handler passes `archive.eventId` and `archive.body` to `archiveWebhook`; the exact prepared event remains in memory for the admin-only recovery store. Unit and HTTP tests assert that neither the raw 32-character token, exact source case key, source event key, nor alias IDs appears anywhere in the archived input. The exact token remains only in migration-135 admin-owned aliases/case processing.

## Finding 3: Encharge producer claim

This was not a verified defect. The current PHP already contains the pre-existing call:

```php
$this->fire_encharge_event(
    'checkout-payment-failed',
    $email,
    $first_name,
    [/* product, amount, currency, PaymentIntent, failure context */]
);
```

The task separately adds `fire_checkout_recovery_shadow('payment.failed', ...)`; it does not replace the Encharge producer. The live 106-flow audit found no consumer, which is why registry status remains `flow_planned`.

The registry wording is now explicit: `fired_from` names `fire_encharge_event('checkout-payment-failed')`, the trigger description says the pre-existing Encharge producer continues, and notes distinguish emitted event, absent consumer, and NanoClaw shadow case.

## Finding 4: failure timing

The five-minute failure path is intentional and comes from the accepted recovery strategy. Reporting is now explicit:

```ts
timeout_coverage: {
  tandem: {
    captured_or_payment_created: '45_minutes_after_server_capture',
    payment_failed: '5_minutes_after_provider_failure',
  },
  heartbeat: 'stripe_events_only',
}
```

`/health` declares `tandemCaptureTimeoutMinutes: 45` and `tandemPaymentFailureDelayMinutes: 5`. `CHECKOUT-RECOVERY-CONTROL.md` states both windows. A static report test verifies all three account/signal distinctions and the absence of person-level fields.

## Verification after corrections

- correction-focused NanoClaw: 58 passed, 3 disposable-only skipped;
- disposable PostgreSQL: 3/3 passed;
- typecheck and build passed;
- Tandemweb PHP lint, shadow contract, JS parse, JSON parse, and diff check passed;
- no provider or production mutation occurred during corrections.
