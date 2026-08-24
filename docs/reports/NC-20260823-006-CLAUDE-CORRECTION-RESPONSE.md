# NC-20260823-006 narrow concurrency-correction review — response

## NO MATERIAL FINDINGS

Reviewed only the four allowed files against the corrected contract.

## What was verified

- **Concurrency exclusion.** `beginContadorFulfillmentWithClient` holds
  `pg_advisory_xact_lock(hashtextextended('{account}:{payment_intent_id}', 0))`
  for the full admission transaction, which commits *before* the external
  processor runs. A second admission attempt while the row is `processing`
  and `lease_active` (`lease_expires_at > now()`) is serialized behind that
  lock, observes the active lease, and returns `inFlight: true` — no version
  bump, no attempt increment, no admission receipt, no `execFile` call
  (`src/contador-payment-fulfillment-store.ts:442-447`,
  `src/stripe-payment-host.ts:358-360`).
- **Expired-lease reclaim.** A `processing` row whose lease has expired falls
  through to the same `UPDATE` branch used for exception-state retries,
  under the same advisory-lock-held transaction, producing exactly one new
  version/attempt/lease (store:448-473).
- **Stale-version/lease protection at finalize.** `finalizeContadorFulfillmentWithClient`
  requires `version = expectedVersion AND state = 'processing' AND
  lease_token = leaseToken` in the same `UPDATE`'s `WHERE` clause
  (store:560-562); a reclaimed case (version bumped, new lease token) makes a
  late finalize from the original caller fail with "stale case version,
  state, or lease" rather than silently overwriting the reclaiming attempt's
  result. This holds regardless of lease expiry, which is correct: version
  identity, not wall-clock expiry, is what must gate the ledger write.
- **Action-safety ordering.** `assertExternalWriteAllowed` runs after
  `resolveStripePaymentSource` but before `beginContadorFulfillment` (the
  first ledger write) and before `execFile` (the external write) in both the
  live and reaper-retried call path, since both share
  `handleStripePayment` (stripe-payment-host.ts:325-346).
- **Lease TTL vs. processor timeout.** Lease = 5 minutes
  (`now() + interval '5 minutes'`, migration + store); processor timeout =
  120s (`timeout: 120_000`, stripe-payment-host.ts:382). The 3-minute margin
  covers ordinary `execFile` SIGTERM-kill latency before a second admission
  could legally reclaim an actually-still-running processor's lease.
- **Refund completion still forbidden.** Enforced independently at both
  layers: `assertReceiptCompleteness` in the store (store:298-302) and
  `assertProcessorFulfillment` in the host (stripe-payment-host.ts:270-278).
- **Exact receipts.** `assertFinalize`/`assertReceiptCompleteness` require
  `stripe_source` + `payment_log` unconditionally and
  `postgres_payment` + (`student_roster` or `refund_fulfillment`)
  conditionally on event type, with `complete` additionally requiring every
  required stage's outcome to be `verified` (store:290-310). Migration's
  append-only triggers on the receipts/aliases tables back this with DDL,
  not just application logic.
- **Webhook retry preserved.** `StripeFulfillmentInFlightError` thrown from
  `handleStripePayment` on an `inFlight` admission propagates unchanged
  through `dispatchRow` into `runReaper`'s per-row catch, which calls
  `markFailed` (not `markDeadLettered`) unless the attempt count is already
  at `MAX_ATTEMPTS` (webhook-inbox-reaper.ts:199-211, 305-327) — same
  treatment as any other dispatch failure, so the row remains retryable on
  the existing dead-letter threshold.

No defect was found in the lease correction's ability to prevent concurrent
processor execution, and no other material defect was found in the four
reviewed files' Stripe branch/retry loop, store, host, or migration.
