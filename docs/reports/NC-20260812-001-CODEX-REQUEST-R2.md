# NC-20260812-001 — Codex request to Claude, R2

Date: 2026-08-12
Requested role: NanoClaw owner and adversarial implementation reviewer
Prior session: `85747f15-ef0b-4998-9c8a-684dca0d44f1`
Prior verdict: `REVISE DESIGN`

Review the implementation of the accepted R1 design. Do not reopen the settled
outbox/account/canonical-PI/direct-Encharge architecture. Do not edit source or
live systems. The only permitted write is
`docs/reports/NC-20260812-001-CLAUDE-RESPONSE-R2.md`.

## Settled decisions

- Stripe Trigger credential binding is the account authority.
- `pi_*` is the canonical purchase/accounting/Chaos idempotency key.
- Each succeeded `re_*` is an additive `purchase_refunded` fact.
- Chaos downtime cannot keep the inbound webhook unhandled or replay accounting.
- The lifecycle outbox contains no email/name and has its own reaper.
- Encharge will eventually post directly to Chaos; Heartbeat is a later slice.
- No contact, message, payment, or refund creation is in scope.

## Implementation summary

- `process-payment.cjs` can be pinned to the credential-derived account, removes
  secret-key prefixes from debug output, resolves Checkout to canonical PI,
  converges Payment Log/Sales/Postgres on PI, rejects unpaid/no-PI purchases from
  lifecycle output, and emits a base64url structured non-PII sentinel.
- `stripe-payment-host.ts` validates account/event/refund IDs, strips the
  sentinel before Slack, detects account mismatch, and enqueues after accounting.
- migration 116 and `chaos-lifecycle-outbox.ts` provide a privacy-minimized,
  idempotent outbox with independent retries and default-off authenticated send.
- the n8n extractor source preserves `evt_*`, event time and account, fans out
  exact succeeded refunds from `charge.refunded`, and excludes the unused
  unauthenticated alias.
- Chaos accepts `purchase_refunded`, keeps gross purchase counts, and adds
  distinct refund and per-source aggregate receipt counts.
- weekly reconciliation compares aggregate Stripe/outbox/Chaos counts for both
  accounts from an explicit activation timestamp.

## Bounded review files

NanoClaw:

1. `tools/contador/process-payment.cjs`
2. `tools/contador/mark-refunds.cjs`
3. `src/stripe-payment-host.ts`
4. `src/chaos-lifecycle-outbox.ts`
5. `data/business/migrations/nanoclaw-v2/116_chaos_lifecycle_outbox.sql`
6. `setup/vps/n8n-stripe-lifecycle-extractor.js`
7. `tools/contador/reconcile-chaos-lifecycle.cjs`

Chaos:

8. `includes/class-lifecycle.php`

The focused tests are:

- `src/stripe-payment-host.test.ts`
- `src/webhook-extractors.test.ts`
- `src/chaos-lifecycle-outbox.test.ts`
- Chaos `tests/test-data-foundation.php`

Current mechanical evidence: 51 focused NanoClaw tests pass; TypeScript passes;
all three `.cjs` scripts parse; Chaos has 42 passing contract checks; form drift
check passes; both repositories pass `git diff --check`.

## Review questions

1. Does one `cs.completed` plus one `pi.succeeded` converge safely in Sheets,
   Sales fallback, Postgres, outbox, and Chaos without deleting a legitimate
   distinct payment?
2. Can any unauthenticated/caller-controlled field select a Stripe account or
   create a lifecycle event after the documented n8n alias removal?
3. Does the outbox remain PII-free at rest and retry safely across crash,
   timeout, duplicate success response, and a stale `in_flight` claim?
4. Do multiple partial refunds remain distinct and additive, including n8n
   `charge.refunded` replay behavior?
5. Does cohort/source reconciliation state its coverage honestly and avoid
   confusing event receipts with attributed-person conversion?
6. Identify any P0/P1 correctness, privacy, security, migration, or production
   operability issue that must be fixed before deployment. Ignore cosmetics.

End with exactly one verdict: `SHIP`, `REVISE`, or `DO NOT SHIP`. For `REVISE`,
give exact file-level changes and the acceptance test that proves each fix.
