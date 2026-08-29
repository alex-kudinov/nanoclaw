# NC-20260829-001 enrollment raw-body emergency

State: enrollment restored and live-verified

## Impact and root cause

- Eighteen observed Step-1 captures failed from 15:27-15:39 CT with HTTP 502
  `customer_identity_error`; enrollment could not continue to payment.
- n8n failed every request in `Verify Normalize and Sign Checkout Recovery`
  with `invalid_checkout_raw_body [line 8]` before NanoClaw.
- Live n8n 2.1.4 did not expose the Webhook node's configured string
  `rawBody` for real application/json requests. The prior structural canary did
  not reproduce that production parsing behavior.

## Correction

- NanoClaw/setup commit `483bd7cc`: verifier accepts exact bytes only from a
  pre-existing string `rawBody` or string `body`; it never serializes a parsed
  object before HMAC verification.
- Tandemweb/main `b1ab5a3b97f30aed721f6fee7e57e7090c891bfb`:
  identity and lifecycle producers send the same signed JSON bytes as
  `text/plain; charset=utf-8` so n8n preserves them in `body`.
- n8n patch backup:
  `~/.local/share/n8n-toolbox-backups/20260829T204709Z-checkout-recovery-website-shadow-node-patch`.
- Live n8n projection `8d990587`; credential projection `00786ca0` unchanged.

## Verification

- Focused NanoClaw 63/63, typecheck, full 3,383 pass/32 skip with only the two
  known unrelated fixtures.
- Tandemweb identity 23/23, recovery contract/JS syntax, full 57/58 with only
  the known unrelated exam fixture.
- Claude Sonnet/high `fd0adc64-2b95-4b72-acb6-092b4c1499af` returned
  `NO MATERIAL FINDINGS`; Codex independently preserved the real two-sided
  deployment order.
- Invalid signed canary passed n8n verification and reached NanoClaw, which
  rejected it without identity work.
- Exact ACC Step-1 capture succeeded at 399900 USD cents.
- n8n executions 37477, 37478, and 37479 succeeded for Party resolve, Stripe
  Customer bind, and checkout capture.
- Minimized host readback: one Party, one identity interaction, one active
  Tandem Stripe Customer ref.
- WordPress active recovery queue zero, protected held history 99, no retry
  cron, no payment or customer communication created by the verification.

## Cross-path Step-1 matrix

The owner requested live first-page coverage beyond ACC. Using the same exact
internal Party/Customer identity with reminders explicitly disabled, these
public production captures all returned `success=true`:

| Path | Product | Expected live result | Outcome |
| --- | --- | --- | --- |
| Required MCS cohort + installment-capable | `mcs-full` | 299700 USD cents; `mcs-practicum` retained | passed |
| Required AACS cohort + installment-capable | `supervision-inaugural` | 399600 USD cents; `supervision` retained | passed |
| Spanish regional pricing | `mcs-foundations-es`, Mexico | 19900 USD cents; regional applied | passed |
| Spanish standard fallback | `prac-tools-es`, United States | 19900 USD cents; regional not applied | passed |
| Japanese localized | `mcs-foundations-ja` | 29900 USD cents | passed |
| French localized | `mcs-foundations-fr` | 29900 USD cents | passed |

Post-matrix readback found 34/34 successful and zero failed n8n workflow
executions across repeated resolve/bind/capture operations, one canonical
Party, one active Tandem Stripe Customer ref, zero new purchased cases, zero
active WordPress recovery queue, and no retry cron. No PaymentIntent,
subscription, coupon, payment, enrollment, or reminder was created; this matrix
stopped at the requested first-page boundary.
