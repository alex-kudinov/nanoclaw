# NC-20260919-002 deployment-order correction review — response

## Decision

**CONSUMER_FIRST.**

## Verification against allowed files

- `src/commerce-bookkeeper.ts` (current/new consumer): `environment` and
  `deliveryKind` are each parsed with `text()` and constrained to an enum
  (`['test','live']`, `['payment','refund','fee_reconciliation']`); any
  missing/invalid value throws `CommerceBookkeeperRequestError(..., 422)`
  before any write. Confirms the new consumer cannot silently misprocess an
  old-producer payload — it hard-rejects.
- `class-tandem-commerce-actions.php` `bookkeeper()`: on any non-2xx response
  the job throws (`bookkeeper_delivery_failed` or an
  `academy_capacity_*` code), which propagates to `run()`'s
  `catch (Throwable $error)` → `retry_job(...)`. On 2xx with
  `accepted === true` and a matching `deliveryId`, the job is finished via
  `finish_job(...)` and is not retried. This confirms both halves of the
  packet's argument from the current producer code:
  - A 422 from a strict (new) consumer keeps the job retryable — no
    unrecoverable state.
  - A 200 from a permissive (old) consumer — which the packet states ignores
    unknown top-level fields and branches only on refund vs. payment — would
    finish the `nanoclaw.bookkeeper.fees` job permanently, with no retry,
    even though the reconciliation was never actually recorded.

Producer-first therefore risks an unrecoverable silent loss (old consumer
acks a `fee_reconciliation` envelope as an ordinary payment, job marked
done). Consumer-first only risks bounded, already-supported retryable
unavailability (old producer omits `environment`/`deliveryKind`, new
consumer 422s, job stays retryable until Commerce also deploys). This
matches the packet's proposed bounded consumer-first sequence.

## Blocker

None.
