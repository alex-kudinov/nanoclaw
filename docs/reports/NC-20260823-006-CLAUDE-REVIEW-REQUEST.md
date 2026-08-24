# NC-20260823-006 bounded implementation review request

## Review objective

Review the local Contador payment/refund fulfillment implementation for
material correctness, security, durability, privacy, migration, retry, and
acknowledgement defects. Report only findings that could cause a payment/refund
to disappear, duplicate unsafe work, close without required readback, corrupt
case identity/history, leak protected content, defeat the external-write brake,
or make deployment/rollback unsafe.

Write the response only to:

`docs/reports/NC-20260823-006-CLAUDE-REVIEW-RESPONSE.md`

Do not edit implementation, tests, migrations, prompts, or other docs.

## Authority and accepted facts

1. `docs/CONTADOR-BIZMGR-BOUNDARY.md` is accepted authority: Contador is the
   Stripe-payment-to-student operational bridge; Bizmgr owns accounting and
   QuickBooks remains manual.
2. The accepted program decision is
   `decision:contador-fulfillment-case-ledger-authority`.
3. One case is keyed by `(stripe_account, payment_intent_id)`; Checkout,
   charge, invoice, refund, and provider event IDs are aliases.
4. A webhook may be handled only after verified operational completion or a
   durable explicit exception is committed.
5. Completion requires exact Stripe source, Payment Log, `public.payments`, and
   mapped-roster readback. A child-process exit or Slack post is not proof.
6. Missing product/student identity and write failures are durable exceptions.
   Refunds remain `needs_review` in this slice because refund/student closure is
   separate work.
7. Global/system action-safety denial must occur before any database or
   external write. The archived webhook remains retryable and no fulfillment
   case is created on denial.
8. The ledger may contain opaque provider IDs, state/version/attempts, owner,
   deadlines, bounded codes, hashes, and timestamps only. It must not store
   names, email, product text, amount/card data, raw webhook or Slack content,
   or accounting facts.
9. Historical replay/repair, product-ID mapping, payer/student redesign,
   customer communication, schedules, credentials, payable work, and
   QuickBooks are out of scope and not authorized.
10. Production currently has 249 Stripe inbox rows (248 handled, one
    dead-lettered), 261 `public.payments` rows, and no target tables. No live
    Stripe or business write was used for implementation proof.

## Files allowed for review

The transaction spans nine load-bearing source artifacts; all are necessary
because the correctness boundary crosses DDL, host state, two deterministic
processors, and both webhook acknowledgement paths:

1. `data/business/migrations/nanoclaw-v2/133_contador_payment_fulfillment_cases.sql`
2. `data/business/migrations/nanoclaw-v2/rollback_133_contador_payment_fulfillment_cases.sql`
3. `src/contador-payment-fulfillment-store.ts`
4. `src/stripe-payment-source.ts`
5. `src/stripe-payment-host.ts`
6. `tools/contador/process-payment.cjs`
7. `tools/contador/mark-refunds.cjs`
8. `src/webhook-server.ts` — inspect only the `stripe-payment` branch
9. `src/webhook-inbox-reaper.ts` — inspect only the `stripe-payment` branch

You may also read this request and
`docs/programs/company-os/evidence/NC-20260823-006-contador-payment-fulfillment-cases.md`.
Do not inspect `.env*`, credentials, service-account files, webhook definition
secrets, runtime databases, logs, auth/session stores, unrelated private data,
or broad repository history.

## Implemented flow to verify

1. Parse exact `pi_`/`cs_`, typed event, host-derived account, and optional
   exact provider/refund IDs.
2. Resolve `cs_` read-only to a canonical `pi_` under that exact account.
3. Run the existing action-safety check. Denial performs no ledger or external
   write.
4. Transactionally admit/lock one case and append its source receipt/aliases.
5. Execute the account-pinned release-owned payment or refund script.
6. Strip and validate the private fulfillment sentinel against host admission.
7. On processor/receipt failure, persist `write_failed` and rethrow so the
   webhook remains retryable.
8. On valid output, append exact stage receipts and transition to `complete` or
   one explicit exception.
9. Only complete cases may enqueue the ancillary Chaos lifecycle fact; failure
   of that analytics enqueue is logged and does not undo fulfillment closure.
10. Direct/reaper webhook paths bind `related_entity` to exact case/version
    before marking handled. A complete replay skips processor writes.

## Verification already performed

- Focused migration/store/source/processor/host/webhook/reaper/safety suite:
  113/113 passed under Node 22.23.2.
- Root typecheck passed.
- Both CommonJS processors pass `node --check`.
- Documentation continuity and `git diff --check` passed before this request.
- Schema-only production-shape disposable rehearsal:
  - migration 133 creates three tables;
  - zero non-admin grants;
  - synthetic case/alias/receipt inserts succeed under `nanoclaw_admin`;
  - receipt update is rejected append-only;
  - empty rollback removes all three tables;
  - populated rollback refuses and retains all three tables.
- The installed action-safety boundary drill initially exposed admission before
  denial; that defect was corrected. The current order resolves read-only,
  denies before any write, and admits only after allowance.

## Review response format

Start with one of:

- `NO MATERIAL FINDINGS`
- `MATERIAL FINDINGS`

For each material finding include severity, exact file/evidence, failure
scenario, why existing tests miss it, and the smallest safe correction. Do not
add cosmetic suggestions, speculative future features, product/student mapping
work, accounting design, or a general restatement.
