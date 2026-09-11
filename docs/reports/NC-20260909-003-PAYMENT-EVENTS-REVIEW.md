# Bounded review — R1 — scoped TEST payment event ledger

**Verdict: ACCEPTED** within the stated unwired TEST scope. No material findings, no source edits proposed.

Reviewed exactly the 7 files listed in REQUEST-R1.md, nothing else, no shell/MCP/web/history. Accepted dependencies (Adyen TEST HMAC parser, `validateAttempt`, `projectPaymentEvidence`, `paymentScopeFingerprint`, `PaymentTransaction`, migration 149) were treated as correct per the stated contracts and not re-derived.

## Dimension-by-dimension

- **Scope isolation** — `PaymentEventStore` constructor rejects any scope not matching `provider:adyen/environment:test/merchant/store` plus config prefix/event-code invariants (`payment-event-store.ts:50-61`). `recordFact` checks `paymentScopeFingerprint(attempt.scope) !== this.scopeHash` before any mutation and routes mismatches to a `scope_conflict` exception with `attemptId: null` (`payment-event-store.ts:259-266`), so a TEST event naming a LIVE attempt cannot mutate it. Confirmed against the "does not change a LIVE or other-scope checkout" test (`payment-event-disposable.test.ts:341-367`), including that the crossed-scope prior-owner is nulled out (`scopedPriorOwner`, `payment-event-store.ts:244-249`) so a foreign-scope attempt's evidence is never refreshed either.

- **Signature-to-UUID mapping** — `adyenTestAttemptReference`/`parseAdyenTestAttemptReference` are symmetric, both zod-`uuid()`-validated (`adyen-payment-identifiers.ts:5-17`). Case handling: attempt IDs are explicitly lowercased before DB comparison/locking (`payment-event-store.ts:226,239`), matching Postgres's canonical lowercase `uuid` output — no mismatch risk there.

- **Per-payment vs. per-checkout semantics** — `projectCheckoutPaymentEvidence` groups facts by `paymentReference` and evaluates each PSP reference independently via `projectPaymentEvidence`, then aggregates exposure across PSPs (`payment-checkout-evidence.ts:33-61`). Verified against both the "failed retry then different successful PSP, either order" and "same-PSP contradiction" tests — behavior matches in both directions.

- **Concurrent dedup / crossed references** — dedup is by `(scope_sha256, event_id)` where `event_id` already encodes psp+code+success, so retries with unsigned field changes (e.g., `eventDate`) correctly collapse to `duplicate`. Crossed-reference concurrency is handled by UUID-ordered `FOR UPDATE` locking of all involved attempts (`payment-event-store.ts:224-237`) rather than the per-reference advisory lock (which only serializes same-reference races) — traced both concurrent transactions in the crossed-reference test and confirmed they lock `{a,b}` in identical sorted order, so no deadlock is possible.

- **Atomicity** — event insert, provider-reference insert, exception insert, and evidence-projection upsert all happen inside the single `this.transaction(...)` per fact (`payment-event-store.ts:211-349`); the injected-failure test confirms all four tables roll back together. Note: a webhook batch with multiple facts is still one transaction *per fact*, not one transaction for the whole batch — by design, since facts can target different attempts and the parser already rejects the whole batch pre-write on any signature failure.

- **Sticky conflicts** — no code path clears a previously durable `payment_event_exceptions` row; `refresh()` unions the domain-level projection exceptions with the durable table's reasons for that attempt (`payment-event-store.ts:150-162`), so a conflict stays surfaced until a separate resolution process exists, as the docs claim.

- **Resource bounds** — write path checks `count(*) >= 100` before insert (`payment-event-store.ts:305-321`), verified the 101st event is rejected and the table caps at exactly 100. The `> 100` overflow branch inside `refresh()` (`payment-event-store.ts:114-122`) is unreachable given that invariant — harmless defense-in-depth, not a bug.

- **SQL composite identities** — `payment_events` FK `(scope_sha256, payment_reference, attempt_id)` references `payment_provider_references`' matching UNIQUE constraint, and the code always inserts/confirms the provider-reference row before the event row within the same transaction (`payment-event-store.ts:322-338`), satisfying the FK on first use and on every subsequent fact for an already-bound reference.

- **Minimization** — the fact object built in `recordWebhook` only carries `deliveryId, scope, attemptId, paymentReference, operationReference, kind, success, amount, currency` — no `hmacSignature`, `shopperEmail`, free-text reason, or `eventDate` (`payment-event-store.ts:74-93`). Confirmed against the test's explicit `not.toContain('must-not-store')` / `not.toContain('hmacSignature')` assertions, and that HMAC keys never appear in `JSON.stringify(events)` (private `#config` field is correctly non-enumerable).

- **Disposable/rollback safety** — test DB name is regex-locked to a `nc_payment_event_disposable_*` pattern before use (`payment-event-disposable.test.ts:17-19`), connections are drained before drop, and drop has no `FORCE`. Rollback script refuses to run while any of the 4 tables holds data (lock + existence check, `rollback_151_payment_event_ledger.sql:4-11`) and is proven empty-safe via a truncate → rollback → reapply → rollback round trip in the last test.

## Minor, non-blocking observations (no action required)

1. `refresh()`'s event-history query (`payment-event-store.ts:110-113`) filters by `attempt_id` alone, not also `scope_sha256`. This is safe today only because every write path already enforces scope match before any event is persisted for that attempt — there's no way for a cross-scope event to exist under a given `attempt_id`. Pure defense-in-depth if someone later adds a write path that skips the scope guard; not a defect in the reviewed code.
2. The two exception vocabularies — the store's SQL-constrained `payment_event_exceptions.reason` enum (7 values, `payment-event-store.ts:31-38`, matching the migration's CHECK) vs. the domain-level projection exceptions (e.g. `operation_payload_conflict`, surfaced only inside the unconstrained `payment_checkout_evidence.projection` jsonb) — are correctly namespaced and never cross-contaminate the CHECK-constrained column. Worth a one-line doc note if this project grows, since the naming similarity ("...conflict") invites future confusion, but nothing to fix now.

No reproducer found for any of the listed inspection points. Recommend proceeding; nothing in this slice blocks the pending HTTP-route-composition and provider-proof work called out as separately gated.
