# NC-20260827-003 — Stripe payment ingress parity

Date: 2026-08-27

Program item: `work:stripe-payment-ingress-parity`

Decision:
`.program/decisions/decision-stripe-payment-ingress-parity-2026-08-27.json`

## Accepted outcome and boundary

Detect a succeeded Payment Intent that never reached NanoClaw and persist one
host-owned, privacy-minimized `needs_review` exception. Never replay the event
or invoke payment fulfillment from parity.

The source is authorized for both fixed Stripe accounts, a rolling 72-hour
window, strict pagination/row/time caps, and stable double-read. It retains only
account scope, account ID, opaque Payment Intent ID, and provider-created time
in transient process memory. It stores no name, email, customer, amount,
currency, product, card, raw payload, checkout URL, or accounting fact.

Explicitly excluded: Stripe/n8n mutation, event replay, Payment Log, roster,
`public.payments`, payment/refund processor, customer communication, product/
student identity, refund closure, accounting/QuickBooks, broad history,
credentials, minion/query/action grants, or unrelated live-system change.

## Triggering live evidence

On 2026-08-27 two distinct Foundations charges succeeded on the Tandem Stripe
account. The later payment reached exact live release `6778be02` and completed
the host ledger. The earlier payment has no `stripe-payment` inbox row,
fulfillment case, or `public.payments` row. Current n8n workflow and Stripe event
destination readback are active/enabled, but historical delivery cause is not
proven. This task records visibility only and does not repair that payment.

## Implementation

- `CONTADOR_STRIPE_INGRESS_PARITY_ENABLED` is separately default-off in all
  supported environment/launchd/setup templates.
- Each run reads `/v1/account` and paginates `/v1/payment_intents` for the exact
  72-hour bounds twice per account. Duplicate IDs, malformed rows, cursor loss,
  caps, account collision, HTTP/JSON failure, or content drift fail the run
  before database mutation.
- Only `status=succeeded` plus bounded Payment Intent ID/provider-created time
  survives normalization. All other provider fields are discarded.
- Both account snapshots reconcile in one host transaction. Each Payment Intent
  uses the same advisory-lock key as natural Contador admission, closing the
  parity/webhook race.
- An existing case or Payment Intent alias is a no-op. A missing case inspects
  exact inbox account/Stripe ID and becomes `provider_delivery_missing` or
  `provider_delivery_unadmitted`.
- A new version-0 `needs_review` case has owner `contador`, a one-day review
  deadline, one exact Payment Intent alias, and six receipts: admission/final
  exception, verified read-only Stripe source, and not-applicable Payment Log/
  PostgreSQL/roster stages because no processing ran.
- Exact parity replay sees the case and creates nothing. A later natural
  webhook uses the existing ledger retry transition to version 1 processing;
  parity itself never calls that path.
- Startup is fire-and-forget with an in-flight guard and unref'ed 15-minute
  timer. Health is aggregate-only and fixes `consumerEnabled=false`.

## Verification so far

- format and TypeScript typecheck pass;
- focused parity/config/wiring plus existing ledger/host: 59/59;
- unit proof covers stable double-read, succeeded-only normalization, provider
  drift, duplicate/malformed rows, pagination/row caps, account collision,
  existing-case skip, inbox-without-case classification, six receipts,
  default-off, aggregate privacy, and bounded degradation;
- disposable PostgreSQL over live migrations 133/139 proves one exact existing
  case per account, one missing Tandem case creation, six receipts/one alias,
  exact second-run no-op, owner/deadline/error state, and later natural
  reopening to version 1/attempt 2; the disposable database was removed;
- bounded independent Claude Sonnet/high static review R1 returned **NO
  MATERIAL FINDINGS**. The only note is non-material at the fixed caps: raising
  them later would require reconsidering the single-transaction lock duration;
- pinned Node 22 formatting, typecheck, build, documentation continuity, and
  capability checks pass; the independent agent-runner package builds and
  passes 45/45 tests;
- the full root suite reaches 3,359 passing and 31 skipped tests. Its two
  failures are pre-existing/unrelated: the known CNPC source-wrapper assertion,
  plus a Trafft shadow fixture whose hard-coded 2026-08-26 timestamp crossed
  its 24-hour freshness boundary on 2026-08-27. The Trafft source and test are
  unchanged from the task base; the new parity-focused set remains green;
- no production provider/database/config/runtime mutation occurred.

Immutable release, backup, off-first deployment, one-key enable, known
missing-payment capture, exact replay, and live non-interference remain pending.
