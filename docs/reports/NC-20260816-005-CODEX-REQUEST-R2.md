# NC-20260816-005 — Codex review request (R2)

## Review result

`CHANGES_REQUIRED`

The R1 direction is accepted, but two integration gaps must be closed before
commit or deployment.

## Required changes

1. **Preserve/upgrade the canonical slug across duplicate-event order and
   retries.** `enqueueStripeLifecycleFact()` currently omits `properties` from
   its `ON CONFLICT` update. A first successful enqueue without a slug followed
   by the Checkout/PaymentIntent twin or a retry with a valid slug therefore
   leaves the durable row permanently without the canonical slug. Merge only
   the safe, re-validated incoming canonical slug into the existing jsonb while
   preserving existing properties. An absent or invalid incoming slug must not
   erase a previously valid slug. Add an assertion covering both upgrade and
   non-erasure behavior at the SQL/parameter contract boundary.

2. **Make the new Contador tests part of the normal suite.** Add
   `tools/**/*.test.ts` to `vitest.config.ts`. This is now an explicitly allowed
   path for R2; do not leave the regression suite dependent on a temporary
   local config edit.

3. Update the active-work/changelog/response evidence so it no longer says a
   follow-up task is needed for the test glob, and write
   `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R2.md`.

## Allowed edits for R2

- `src/chaos-lifecycle-outbox.ts`
- `src/chaos-lifecycle-outbox.test.ts`
- `vitest.config.ts`
- `docs/ACTIVE-WORK.md`
- `docs/ENGINEERING-CHANGELOG.md`
- `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R2.md`

Do not commit, push, deploy, write production data, or contact customers. Run
the focused tests from the tracked config, typecheck, documentation continuity,
and `git diff --check`.
