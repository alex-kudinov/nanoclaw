# NC-20260827-003 bounded Stripe ingress parity review R1

Review the current working-tree implementation for material defects only and
write:

`docs/reports/NC-20260827-003-CLAUDE-INGRESS-PARITY-RESPONSE-R1.md`

Do not edit implementation or other files. No Bash, web, MCP, credentials,
`.env`, logs, database, Stripe, n8n, or runtime access. Report material findings
with exact evidence/correction; otherwise write `NO MATERIAL FINDINGS`.

Allowed paths only:

- `src/contador-stripe-ingress-parity.ts`
- `src/contador-stripe-ingress-parity.test.ts`
- `src/contador-stripe-ingress-parity-config.test.ts`
- `src/index.ts`
- `src/relationship-context-trafft-shadow-wiring.test.ts`
- `src/contador-payment-fulfillment-store.ts`
- `src/stripe-payment-host.ts`
- `.env.example`
- `launchd/com.nanoclaw.plist`
- `setup/launchd/com.nanoclaw.plist`
- `setup/service.ts`
- `docs/programs/company-os/evidence/NC-20260827-003-stripe-payment-ingress-parity.md`
- this request

## Accepted boundary

One succeeded Foundations payment today never reached NanoClaw. A distinct
later payment completed the host-admitted ledger. This slice detects provider
success missing from host ingress and creates an owned exception; it never
replays or processes the event.

Authorized source: both fixed Stripe accounts, rolling 72-hour window,
read-only `/v1/account` plus `/v1/payment_intents`, complete pagination with
strict caps/timeouts, stable double-read. Persist only exact fixed account/
PaymentIntent identity and minimized case/receipt codes.

Forbidden: Stripe/n8n mutation, event replay, Payment Log/roster/
`public.payments`/processor, refund, communication, product/student mapping,
accounting/QuickBooks, broad history, PII/raw payload persistence or health,
minion/query/action activation, unrelated runtime behavior.

## Implementation

- Separate default-off `CONTADOR_STRIPE_INGRESS_PARITY_ENABLED` flag.
- Each account is normalized twice for identical fixed time bounds; account
  identity, row count, and sorted succeeded PI ID/created time must match.
- Duplicate/malformed IDs, missing cursor, page/row caps, HTTP/JSON errors,
  account collision, or content drift fail before DB mutation.
- Both snapshots reconcile in one `withAgentContext` transaction.
- Every PI acquires exactly the same advisory-lock key as natural ledger
  admission (`scope:paymentIntentId`). Existing case or PI alias is no-op.
- Missing authority inspects exact top-level n8n account/stripe_id. It creates
  version-0 `needs_review` with error `provider_delivery_missing` or
  `provider_delivery_unadmitted`, owner/deadline/hash, one PI alias, and six
  receipts: admission/final exception, verified read-only Stripe source,
  not-applicable Payment Log/PostgreSQL/roster.
- Exact replay sees the new case and creates nothing. Later natural webhook
  uses existing ordinary retry to version 1 processing; parity never calls it.
- Startup is nonblocking, in-flight guarded, and timer-unref'ed; health is
  aggregate-only with consumer disabled.

## Verification

- format/typecheck;
- focused parity/config/wiring plus existing store/host 59/59;
- stable/diff/cap/malformed/account/failure/privacy/default-off unit proofs;
- disposable PostgreSQL using live migrations 133/139: two existing cases,
  one missing case created with six receipts/one alias, exact second run zero,
  later natural begin reaches version 1 attempt 2; disposable database removed;
- no production mutation.

## Material questions

1. Can the provider scan silently omit a succeeded payment while reporting
   complete, especially across pages, the 72-hour boundary, or two-pass drift?
2. Can parity race natural webhook admission, conflict aliases, or create a
   partial/duplicate case or receipt set?
3. Are direct needs-review state, timestamps, stage outcomes, owner/deadline,
   and later-natural reopening truthful and schema-compatible?
4. Can any parity path invoke or cause external replay/payment work?
5. Can PII/raw provider values reach persistence, health, logs, or evidence?
6. Is default-off host wiring safe at startup and after failures/overlap?
7. Are material negative/replay/scale tests missing before deployment?
