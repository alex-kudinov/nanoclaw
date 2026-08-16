# NC-20260816-005 — Stripe product attribution implementation review

## Objective

Implement the smallest durable correction that makes authoritative Stripe
purchase receipts carry the canonical Tandem product slug into Chaos, while
preserving the one-purchase/one-accounting-row invariant and literal product
names. This is an implementation-convergence round: edit the allowed NanoClaw
files, run the focused tests, and write the response artifact named below.

## Accepted live facts

- Production is the verified immutable NanoClaw release `55c97d5` under Node
  22.23.2. This branch starts at that exact commit.
- Both account-bound producers work. Chaos has `stripe-tandem` receipts and a
  2026-08-16 `stripe-heartbeat` receipt.
- Four `stripe-tandem` purchases reached Chaos as
  `unmapped-stripe-product`. Read-only reconciliation proves three are the
  website product `mcq-program-a-foundations` at $299 and one is
  `supervision-inaugural` at $999. Do not reopen payment existence or account
  parity.
- Tandem's checkout writes the canonical checkout slug into Stripe PaymentIntent
  metadata key `product`. That metadata is the authoritative source for
  website-originated canonical product identity.
- `src/chaos-lifecycle-outbox.ts` currently derives the slug only from
  `public.payments.product_name`; it deliberately emits
  `unmapped-stripe-product` for blank/invoice/price-bearing names.
- The live `process-payment.cjs` canonicalizes Checkout and PaymentIntent to the
  same `pi_*`, but the later PaymentIntent half can overwrite the richer Checkout
  product name/id. Its shell-built psql command also expands `$` in names.
- A later dirty operational checkout contains NC-20260815-004's tested
  one-row/product-preservation/literal-sql mechanics, but those edits were never
  committed into the immutable live lineage. It is evidence, not an edit target.

## Required behavior

1. Extract and validate the canonical product slug from PaymentIntent metadata
   `product` for both Checkout and PaymentIntent event shapes.
2. Carry that slug in the lifecycle sentinel/fact and persist it in the PII-free
   outbox so retries do not need another Stripe lookup.
3. At Chaos send time, prefer the validated persisted canonical slug. Fall back
   to the existing safe name-derived slug for Heartbeat/off-site payments that
   do not carry Tandem metadata. Invalid metadata must fail closed to the safe
   fallback, never pass arbitrary text.
4. Preserve richer Checkout product name/id when the PaymentIntent twin arrives,
   and remove shell interpolation from the Postgres write. A real Checkout and
   its PaymentIntent twin must converge on one `pi_*` row in both the payment log
   and Postgres.
5. Keep the existing safety contract: Stripe/accounting do not depend on Chaos;
   no new Stripe call creates or changes money; no fulfillment, Encharge,
   customer messaging, or roster-policy expansion.
6. Add focused tests covering valid/invalid canonical slugs, retry persistence,
   website metadata precedence, Heartbeat fallback, event arrival order,
   product preservation, and literal `$`/quotes/command-like product names.

## Authority and paths

Primary implemented-mechanics authority:

- `tools/contador/process-payment.cjs`
- `src/stripe-payment-host.ts`
- `src/chaos-lifecycle-outbox.ts`
- their focused tests
- `data/business/migrations/nanoclaw-v2/117_chaos_lifecycle_outbox.sql`

Read-only cross-project authorities/evidence:

- `/Users/xbohdpukc/dev/tandemweb/wordpress/tandem-snippets/includes/class-stripe-checkout.php`
- `/Users/xbohdpukc/dev/tandemweb/data/checkout/products.json`
- `/Users/xbohdpukc/dev/caos-ext/chaos-tracker/docs/lifecycle-data-contract.md`
- `/Users/xbohdpukc/dev/NanoClaw/tools/contador/process-payment.cjs`
- `/Users/xbohdpukc/dev/NanoClaw/tools/contador/process-payment.test.ts`
- `/Users/xbohdpukc/dev/NanoClaw/docs/ENGINEERING-CHANGELOG.md` section NC-20260815-004

Allowed edit paths in this worktree only:

- `tools/contador/process-payment.cjs`
- `tools/contador/process-payment.test.ts`
- `src/chaos-lifecycle-outbox.ts`
- `src/chaos-lifecycle-outbox.test.ts`
- `src/stripe-payment-host.test.ts` only if its contract changes
- `docs/ACTIVE-WORK.md`
- `docs/ENGINEERING-CHANGELOG.md`
- `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md`

Do not edit another worktree, tandemweb, caos-ext, migrations, generated files,
configuration, secrets, or production state. Do not commit, push, deploy, query
customer rows, or perform any external write.

## Tests

Use the pinned Node version from `.nvmrc`. Run at minimum:

```text
npm test -- --run src/chaos-lifecycle-outbox.test.ts src/stripe-payment-host.test.ts tools/contador/process-payment.test.ts
npm run typecheck
npm run docs:continuity-check
git diff --check
```

If an unrelated baseline failure prevents a command, record the exact scoped
failure and still run every narrower relevant check.

## Response

Write `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md` with:

- outcome: `READY_FOR_CODEX_VERIFICATION` or `BLOCKED`;
- changed files and the design decision;
- material findings or residual risks only;
- exact test results;
- explicit confirmation that no production/external write occurred.
