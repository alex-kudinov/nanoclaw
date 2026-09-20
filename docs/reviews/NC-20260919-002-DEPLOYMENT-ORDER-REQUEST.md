# NC-20260919-002 deployment-order correction review

## Decision requested

Choose `PRODUCER_FIRST` or `CONSUMER_FIRST` for this exact two-release cutover.
Report a material blocker only. Write
`docs/reviews/NC-20260919-002-DEPLOYMENT-ORDER-RESPONSE.md`; edit nothing else.

## Why the prior recommendation is disputed

The first correctness response recommended Commerce producer first because the
new NanoClaw consumer strictly requires `environment`. That considered only
the new consumer's response to the old producer. It did not account for the old
consumer's response to the new producer:

- Exact currently live NanoClaw commit: `041fe20e9525`.
- Its signed-envelope validator ignores unknown top-level fields and returns no
  `environment`, `deliveryKind`, or `economics`.
- Its recorder branches only on refund vs. payment. A new
  `deliveryKind=fee_reconciliation` envelope from Commerce would therefore be
  processed as an ordinary payment by the old consumer.
- The old path would rewrite the idempotent payment/roster/PostgreSQL surfaces,
  run Capacity, leave G/H blank, return 200, and let Commerce mark the unique
  `nanoclaw.bookkeeper.fees` job complete. After the consumer deploy, that job
  would not retry. This silently loses the requested reconciliation.

By contrast, if the strict consumer deploys first, an old-producer delivery
omitting `environment` returns 422. Commerce's existing job runner retains the
job and retries with bounded exponential backoff. It cannot be acknowledged or
misrecorded. Once Commerce 1.44.12 deploys, the same retained job sends the new
signed contract and completes.

## Proposed bounded consumer-first sequence

1. Build and stage both verified releases without activation.
2. Require NanoClaw active/waiting queues empty and Commerce pending/processing
   Bookkeeper job counts zero immediately before cutover.
3. Activate NanoClaw first.
4. Immediately activate the already-staged Commerce archive and read back
   version/hashes. Target interruption is under two minutes.
5. Any delivery created in the gap remains retryable; do not manually replay or
   manufacture payment/refund/provider events.
6. Verify signed retained TEST envelope exclusion, then insert only guarded
   existing-runner fee jobs for exact current LIVE settled projections whose PSP
   still exists uniquely in Payment Log. Verify G/H readback and zero protected
   payment/roster/PostgreSQL/Capacity changes beyond the intended fee cells.

## Decision criteria

- Incorrectly acknowledged work is worse than bounded retryable unavailability.
- No payment/provider/customer action occurs in either sequence.
- No new flag, third release, queue, worker or scheduler should be added merely
  to make producer-first safe.
- Existing retry semantics are already part of the accepted contract.

## Allowed evidence

- This packet.
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/src/commerce-bookkeeper.ts`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/src/webhook-server.ts`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/tools/contador/process-commerce-payment.cjs`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/bookkeeper-test-fees-20260919/wordpress/tandem-commerce/includes/class-tandem-commerce-actions.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/bookkeeper-test-fees-20260919/wordpress/tandem-commerce/includes/class-tandem-commerce-store.php`

Do not inspect other files, history, configuration, credentials, payloads or
customer data.
