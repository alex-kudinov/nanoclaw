# Narrow correction review: unsigned optimization evidence R2

## Decision requested

Review only the correction that isolates Adyen ESD/3DS `additionalData` from
canonical payment facts. Write the result to
`/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/reviews/NC-20260909-003-MCS-OPTIMIZATION-RESPONSE-R2.md`.

Use `GO` if there is no remaining material issue. Otherwise report only a
failure that could let unsigned supplemental evidence change authorization,
confirmation, fulfillment, or financial conflict state; be lost under retry;
cross attempts/scopes; expose PII; or make migration/rollback unsafe.

## Correction and invariants

The R1 response said supplemental fields were not persisted into the canonical
fact. Codex independently found they were present in `PaymentFact`, which meant
unsigned changes could affect event fingerprinting and payment projection. The
correction removes them from `PaymentFact` and writes them to a separate
admin-only append-only table keyed by scope, delivery ID, and evidence digest.
The payment event commits first; a later supplemental-write failure causes
provider retry, where financial intake is duplicate and supplemental evidence
can still be inserted. Supplemental evidence must never be consulted by
payment projections or confirmation.

## Exact allowed files

1. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/payment-event-store.ts`
2. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/payment-domain.ts`
3. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/data/business/migrations/nanoclaw-v2/162_payment_provider_optimization_evidence.sql`
4. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/data/business/migrations/nanoclaw-v2/rollback_162_payment_provider_optimization_evidence.sql`
5. `/Users/xbohdpukc/dev/NanoClaw-adyen-webhook-live-20260909/src/payment-event-disposable.test.ts`

You may read this request and those five files and write only the named
response. Do not inspect private config, `.env`, auth stores, database rows,
logs, unrelated files, or implementation history. Do not edit implementation.

Focused payment/event/runtime tests pass 130/130 after the correction,
including populated rollback refusal, empty rollback/reapply, 25-way duplicate
intake, and confirmation minimization.
