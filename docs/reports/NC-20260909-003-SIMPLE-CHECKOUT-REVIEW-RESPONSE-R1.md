# NC-20260909-003 simple checkout replacement review R1 — response

Reviewed exactly the 7 allowed files plus the request. Two out-of-scope
limitations are noted inline where a full answer would require a file outside
the packet (`165` rollback file, and the fulfillment worker referenced by
`fulfillAttempt`); neither was opened.

## Findings

### HIGH — Terminal-nonpayment purge is not scoped to "no later success on this attempt," so a same-attempt retry that later succeeds can permanently lose the ability to materialize its Party/enrollment

`src/website-checkout-service.ts:433-462` (`cleanupCheckoutSubmissions`) purges
a checkout submission payload for any attempt matching:

```sql
WHERE e.projection->>'state' IN ('refused','payment_failed')
   OR t.attempt_id IS NOT NULL   -- t = payment_session_terminal_nonpayment_receipts
```

`payment_session_terminal_nonpayment_receipts` is append-only, one row per
failed **sub-session** (`session_sequence`), confirmed by its schema in
`src/payment-chaos-observability-disposable.test.ts:83-85` and its
`receipt_sha256` PK usage across `src/payment-store.ts` and
`src/payment-method-reconciliation-store.ts`. Rows are never deleted or
superseded when a later sub-session on the *same* `attempt_id` succeeds — the
coordinator's `retry_payment()` (`class-checkout-dispatch-coordinator.php:884-913`)
explicitly creates a new session on the same `preparationId`/`attemptId` after
a terminal receipt exists, i.e. same-attempt retry-after-failure is a real,
implemented path.

Consequence: once *any* sub-session on an attempt has ever gone terminal, the
`t.attempt_id IS NOT NULL` branch is permanently true for that attempt,
independent of whether a subsequent sub-session on it later authorizes. If
`cleanupCheckoutSubmissions` runs in that window, it deletes the encrypted
`payment_checkout_submission_payloads` row via `purgeForAttempt`
(`src/payment-identity-preparation-store.ts:763-778`). A later successful
retry then calls `materializeForAttempt`
(`src/payment-identity-preparation-store.ts:593-650`), which requires that
same payload:

```ts
ensure(payload.rowCount === 1, 'checkout_submission_missing');
```

This throws inside the `admit()` transaction
(`src/website-checkout-enrollment-adapter.ts:762-770`), so an authorized,
paid attempt can never materialize a Party/order/enrollment — permanently,
since the deleted payload cannot be recreated. This directly contradicts the
owner requirement that confirmed card evidence "may then create distinct
purchase-scoped Parties and continue existing atomic fulfillment."

It also compounds a second gap: `return_payment()` and `payment_status()` in
the PHP coordinator call `admit_checkout()` with no try/catch
(`class-checkout-dispatch-coordinator.php:745, 777`), unlike `start_payment()`
which deliberately swallows the same call
(`class-checkout-dispatch-coordinator.php:688-694`). So once the payload is
gone, every future status/return check for that customer also throws instead
of degrading to a held/pending state.

**Smallest correction:** scope the terminal-receipt branch of
`cleanupCheckoutSubmissions`'s query to attempts that have no confirmed
payment evidence, e.g. add a guard mirroring the one already used in
`currentEvidence()`/`admit()`:

```sql
OR (t.attempt_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM business_v2.payment_method_bindings m
      WHERE m.attempt_id = a.attempt_id
    ))
```

(or an equivalent check against `payment_checkout_evidence`'s current
`payments[].evidence.authorization = 'authorized'`). This keeps the purge
for attempts that are actually dead while protecting an attempt with a later
authorized sub-session.

## Answers to the numbered questions

1. **No.** In the deferred (LIVE) path, `PaymentIdentityPreparationStore.resolve()`
   (`src/payment-identity-preparation-store.ts:282-375`) always inserts
   `payer_party_id`/`participant_party_id` as `NULL` and never calls the
   identity resolver that looks up existing Parties. `materializeForAttempt`
   (same file, lines 663-719) always `INSERT`s a fresh `parties` row per role
   and never looks up by email. `WebsiteCheckoutEnrollmentAdapter.admit()`
   only invokes `materializeIdentity` when `current.readiness.courseAccess === 'eligible'`
   (line 762-770), i.e. after confirmed payment evidence.

2. **Not fully answerable from the allowed packet**, but partially: nothing in
   the allowed files makes `admit()`/materialization depend on the browser
   remaining open — `admit()` re-derives all state from the database and is
   idempotent (`consumedRows` short-circuit, `src/website-checkout-enrollment-adapter.ts:776-796`),
   so any host-side re-invocation of `fulfillAttempt` after the browser closes
   would normally recover. `fulfillAttempt` is exported specifically for this
   (`src/website-checkout-service.ts:427-432`), but the worker that calls it
   (`website-checkout-live-fulfillment-worker.ts`) is outside the allowed
   packet and was not opened. **Caveat:** if that worker's only path to
   materialization is the same `materializeForAttempt`, the HIGH finding above
   still applies regardless of who calls it — a purged payload fails
   permanently no matter which caller retries.

3. **Yes — see the HIGH finding.** Failed/ambiguous evidence does not delete
   PII prematurely for the *current*-state branch (`needs_review` is correctly
   excluded from the purge condition), but the terminal-receipt branch is
   unscoped to "still unresolved," so it can and does delete PII for an
   attempt that later succeeds via retry. Conversely, non-terminal
   pending/`needs_review` PII is correctly retained indefinitely (not
   purged), matching intent.

4. **No duplication found.** Exact attempt replay returns `disposition:
   'duplicate'` via the `payment_enrollment_admissions` lookup keyed on
   `(scope_sha256, attempt_id)` (`src/website-checkout-enrollment-adapter.ts:771-796`)
   and creates nothing. Two distinct deliberate submissions with identical
   emails get two distinct `preparation_id`s and therefore two independent
   `materializeForAttempt` calls, each unconditionally inserting a new Party
   — consistent with the disposable-Postgres evidence cited in the request.

5. **Not answerable from the allowed packet.** Migration164's DDL and both
   rollback files are outside the allowed list; `165_deferred_checkout_identity.sql`
   itself only asserts prerequisites 149/154 via `to_regclass`/`to_regprocedure`
   and does not reference migration164's tables, so no interaction is visible
   from this file alone.

6. **No material issue found within the allowed files.** No call to a
   pre-submit check endpoint (e.g. `/session-submit-checks`) exists in
   `protected-preview-core.js`; `check_payment_submit()` remains defined in
   the PHP coordinator but unused by this browser file. Staleness is already
   guarded client-side by `sessionExpiresAt`/`scheduleExpiry()`/`expireCardSession()`,
   which disables the pay button and unmounts the card before Adyen session
   expiry, and `admit()` is idempotent per attempt regardless of how many
   times a session result is submitted. This is consistent with, not beyond,
   the existing accepted-Session semantics the request describes.
