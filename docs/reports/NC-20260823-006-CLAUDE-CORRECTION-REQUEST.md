# NC-20260823-006 narrow concurrency-correction review

## Context

The initial bounded Sonnet/high review session
`de963310-c9aa-44ff-ac83-0833508359d5` crossed the review drift threshold and
was interrupted before it wrote a response artifact. Its explicit material
finding was independently verified: the admission transaction's advisory lock
ended before the external processor, so a concurrent Checkout/PaymentIntent or
direct/reaper delivery could increment the case version and run a second
processor while the first remained active.

Codex corrected that defect with a persisted five-minute case lease.

## Review objective

Review only whether the lease correction safely prevents concurrent processor
execution while preserving crash recovery, stale-version protection,
action-safety ordering, exact completion/exception receipts, and webhook retry.
Also report any other material defect already apparent within these four files;
do not broaden the review.

Allowed source files:

1. `data/business/migrations/nanoclaw-v2/133_contador_payment_fulfillment_cases.sql`
2. `src/contador-payment-fulfillment-store.ts`
3. `src/stripe-payment-host.ts`
4. `src/webhook-inbox-reaper.ts` — only its Stripe branch and retry loop

Write only:

`docs/reports/NC-20260823-006-CLAUDE-CORRECTION-RESPONSE.md`

Do not edit source, tests, migrations, or other docs.

## Corrected contract

- Action-safety still denies before any ledger or external write.
- Allowed admission creates/updates `processing` with a UUID lease expiring in
  five minutes; the processor timeout is 120 seconds.
- A second delivery while the lease is active binds safe aliases but returns
  `inFlight` without incrementing attempt/version, appending an admission
  receipt, or starting the child. The host throws a typed retryable error, so
  `webhook_inbox` remains failed/retryable.
- An expired lease permits one new version/attempt under the existing
  transaction advisory lock.
- Finalization requires exact case version, `processing` state, and lease token,
  then clears the lease atomically with complete/exception state.
- A verified-complete replay remains no-write and returns the existing case.
- Refund completion remains forbidden.

## Verification

- Focused processor/store/host/webhook/reaper/action-safety suite: 115/115.
- Root typecheck passes.
- Disposable production-shape schema proves processing-without-lease rejection,
  valid leased insertion, append-only receipt rejection, and empty rollback.

## Response format

Start with `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`. For each finding give
severity, exact evidence, failure scenario, and smallest safe correction. No
cosmetic or future-feature suggestions.
