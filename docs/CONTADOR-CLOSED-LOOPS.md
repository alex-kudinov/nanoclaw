# Contador closed-loop design

Status: current-state diagnosis plus accepted target; invoice-routing foundation
is live in the current lineage and payment-fulfillment cases are deployed under
`NC-20260823-006`; natural payment/refund outcome pending
Boundary: `docs/CONTADOR-BIZMGR-BOUNDARY.md`
Accounting authority: `/Users/xbohdpukc/dev/bizmgr/agent_docs/RULEBOOK.md`

## Objective

Make two operational outcomes reliable:

1. An emailed vendor bill becomes durable Bizmgr-owned work without requiring
   a manual drag, and eventually closes against QuickBooks and the bank.
2. A Stripe payment either updates the correct student/product/roster or leaves
   a durable exception that stays visible until corrected and replayed.

Contador remains the payment-to-student bridge. None of this gives it
accounting authority.

Vendor-invoice capture may remain in Contador. Ownership changes at the queue
boundary: once captured, the bill is Bizmgr work. QuickBooks does not need to
be running for the queue to exist or for due/overdue work to stay visible.

## Current evidence

Observed read-only on 2026-08-22:

- 224 emails were classified `financial/bill`; 215 carry `routed_at`, but only
  15 inbound documents exist.
- All 15 inbound documents are still `draft`; none has a source ID and none has
  a later paid/closed state.
- Bizmgr can read those documents and preserve immutable raw captures, but the
  capture runs during a manual true-up rather than as continuous intake.
- Product Map contains 152 mapping rows for 132 unique product names.
- The live Sales catch-all contains eight unresolved payments totaling
  $11,346.30: seven Plutio-invoice descriptions and one ordinary Stripe product
  whose name differs from an existing mapping by an `ICF ` prefix.
- Across 2026, 14 Payment Log rows do not exactly match Product Map: eight
  Plutio-invoice descriptions, one `Unknown`, and five ordinary product names.
  Three are dated August: two invoice descriptions and the ordinary product
  alias above.
- Payment Log contains 18 literal `Unknown` names, all dated February 2026 or
  earlier. The current name reaper handles blank/`Unknown` races, but it cannot
  detect a plausible payer name that is not the student.

These counts are diagnostic. A `financial/bill` classification is not proof
that the email is a payable invoice, and a Sales catch-all row is not proof of
the correct student placement.

## Loop A — emailed vendor bill

### Current path

```text
Gmail email
  -> Mailman/rule classification
  -> host writes mailman-to-Contador IPC and sets routed_at
  -> Contador model parses vendor/amount/due date
  -> model creates party and inbound document
  -> Bizmgr manually runs raw capture
  -> operator/batch enters QuickBooks bill
  -> separate pay-bills and bank-reconcile procedures
```

### Current failure points

1. `routed_at` means the handoff file was written, not that a bill was captured.
2. Before `NC-20260822-008`, an operator Gmail label correction taught Mailman
   for future messages but did not route the corrected email itself.
3. The model is the admission gate. A parse/tool/container failure can leave no
   document even though the classification is marked routed.
4. `fn_issue_document` does not record Gmail Message-ID as `source_id`; all 15
   current documents therefore lack an idempotency/source key.
5. Documents remain `draft`; no durable transition proves Bizmgr capture,
   QuickBooks booking, payment, bank match, or closure.
6. Bizmgr capture is a manual true-up step, so a captured bill can wait unseen.

### Target path

```text
Gmail email or operator label correction
  -> host creates vendor-intake row keyed by Gmail Message-ID
  -> optional extractor enriches vendor/invoice/amount/due date
  -> ready or needs-review state, never silent failure
  -> visible Bizmgr payable queue/worklist
  -> when Parallels + correct company file are available:
       deterministic QuickBooks Bill batch + human apply
  -> QuickBooks TxnID receipt
  -> manual bank payment + BillPayment receipt
  -> bank reconciliation receipt
  -> closed
```

### Host-owned intake contract

Create a purpose-built intake relation rather than forcing an unresolved email
into `business_v2.documents`, which requires a Party immediately.

Minimum fields:

- immutable Gmail Message-ID, Thread-ID, sender address, subject fingerprint,
  and received timestamp;
- state and version;
- extracted vendor, invoice number, amount, currency, issued/due dates;
- Party/document IDs only after canonical resolution;
- attempt count, last error code, owner, review deadline;
- Bizmgr capture receipt, QuickBooks TxnID, payment receipt, bank-match receipt;
- created/updated/resolved timestamps.

Do not store the arbitrary email body in the work relation. Keep the exact
Gmail resource as source authority and grant bounded read access when needed.

States:

```text
captured -> extracting -> ready_for_review -> ready_for_bizmgr
         -> needs_review / rejected
ready_for_bizmgr -> captured_by_bizmgr -> booked -> paid -> reconciled -> closed
```

Every transition uses expected version/idempotency. `closed` requires the
accounting receipt chain; a Slack post or Contador turn never closes it.

### The queue is not QuickBooks

QuickBooks remains the accounting authority, but it is an intermittent
execution dependency: Parallels must be running and the correct company file
must be open. The payable queue therefore lives outside QuickBooks and must show
at least:

- new bills and source email;
- missing vendor/amount/due-date information;
- due soon and overdue bills;
- ready/not-ready for QuickBooks entry;
- entered in QuickBooks with TxnID;
- selected for payment, paid, bank-posted, reconciled, and closed.

The minimum useful presentation is a deterministic Bizmgr command/worklist
grouped `Needs information / Ready to enter / Due soon / Overdue / Awaiting
payment / Awaiting bank match`. A daily brief or Things view may mirror it, but
neither Slack nor Things is canonical state.

### Manual correction rule

An operator label drag is an instruction about the exact existing email. It
must both update the durable classification and route the corrected message
once. It must not merely create a future sender rule.

The local `NC-20260822-008` source now:

- updates the existing classification only when its old label still matches;
- starts one `operator-label-v1` routing epoch by clearing `routed_at`;
- skips downstream work for auto-archive labels;
- routes a corrected `financial/bill` label from stored message context;
- marks the corrected epoch routed only after successful dispatch;
- refuses stale/duplicate correction events;
- grants Contador the exact invoice Message-ID before handoff and fails closed
  if that grant cannot be created.

This source is not deployed and does not yet create the host-owned intake row.
Other actionable correction labels deliberately keep their prior behavior in
this bounded slice; their replay semantics were not broadened implicitly.

## Loop B — Stripe payment to correct student

### Current path

```text
Stripe webhook
  -> host runs process-payment.cjs
  -> Payment Log
  -> exact-name Product Map lookup
  -> roster tab or Sales catch-all
  -> public.payments upsert
  -> host marks webhook handled
  -> one Slack summary
```

### Current failure points

1. Product routing compares the Stripe product name to Product Map exactly,
   case-insensitive. The fetched `product_id` is not used for mapping.
2. An unmatched product is considered a successful run if the Sales catch-all
   write succeeds. It creates no owned exception, deadline, or retry.
3. Missing email, missing target column, and per-tab Sheet errors are reduced
   to summary text. The process can still exit successfully and the webhook is
   marked handled.
4. The name reaper repairs only blank/`Unknown`. It deliberately preserves any
   nonblank name, so a sponsor/payer name can remain attached to the student.
5. `payments.email/name` and roster columns conflate payer and student. A
   Plutio/company/sponsor payment may represent one or many students.
6. Plutio invoice descriptions contain an invoice reference, not the purchased
   product or participants. Hard-coded historical placements do not scale.
7. Slack is presentation, not ownership. If the summary is missed, no system
   keeps asking for resolution.

### Payment-fulfillment case

Create one host-owned case keyed by `(stripe_account, payment_intent_id)`.
Checkout Session and charge IDs are aliases of that same case.

`NC-20260823-006` implements this host seam before the external-write boundary:

- a Checkout Session is resolved read-only to its canonical Payment Intent;
- the host commits a `processing` case and admission receipt before invoking
  the deterministic payment/refund script;
- a persisted five-minute lease prevents concurrent Checkout/PaymentIntent or
  direct/reaper deliveries from running a second processor; expired recovery
  creates one new version and finalization requires its exact lease token;
- the script returns private content-minimized stage results after exact
  Payment Log, PostgreSQL payment, and mapped-roster readback;
- the webhook is handled only after `complete` or a durable `needs_student`,
  `needs_product`, `write_failed`, or `needs_review` case is committed;
- provider-event, Checkout, Payment Intent, charge, invoice, and refund IDs are
  append-only aliases; names, email, product text, amounts, cards, webhook
  bodies, and accounting data remain outside the case ledger;
- a verified complete replay does not repeat the external writes;
- refunds remain `needs_review` even after Payment Log readback because the
  separate refund/roster fulfillment slice is not implemented here.

Exact release `b131071c74fc…` and migration 133 are live with empty tables and
unchanged payment/webhook aggregates. No historical event was replayed; the
first natural typed payment/refund remains the outcome gate.

Natural observation on 2026-08-27 supersedes that empty-table checkpoint. One
natural admitted Foundations payment is exact-readback complete in one attempt
with all six stages and handled webhook binding; refund proof is not required
for the payment path. Ledger-wide state also exposes two expired
admission-only `processing` cases whose source inbox rows dead-lettered on
`invalid_charge_alias`, plus a separate succeeded course payment with no host
inbox/case/PostgreSQL row. The happy path is proven, but terminalization and
ingress parity remain open. Do not replay or repair either payment under the
observation task.

Minimum fields:

- source account plus Payment Intent, Checkout Session, charge, invoice, and
  refund aliases;
- payer identity kept separately from student/participant identity;
- Stripe product ID/account as primary product key, product-name alias as
  fallback evidence;
- resolved operational product, roster target(s), column(s), and cohort;
- state/version, attempts, owner, error code, and review deadline;
- Payment Log, PostgreSQL, roster-target, refund/fulfillment, and final readback
  receipts.

States:

```text
captured -> payment_recorded -> resolving_identity -> resolving_product
         -> writing_roster -> verifying -> complete
         -> needs_student / needs_product / write_failed / needs_review
```

The webhook may be marked handled only after either:

- `complete` is source/readback verified; or
- a durable exception state has been committed successfully.

### Product resolution

1. Match `(Stripe account, product_id)` first.
2. Fall back to an explicit, versioned product-name alias.
3. Never silently normalize arbitrary text into a product.
4. A Plutio invoice reference becomes `needs_student`/`needs_product` until
   Bizmgr supplies exact invoice line and participant evidence.
5. A new mapping replays open cases and closes only after roster readback.

The current Google Product Map can remain the operator-facing editor, but it
needs stable account/product-ID columns and validation. Product name alone is
not a durable identity.

### Student identity

Store payer and student separately.

Evidence order:

1. explicit checkout/application participant identity;
2. exact enrollment or Plutio invoice participant evidence;
3. customer/payer identity only when the purchase contract says payer equals
   student;
4. otherwise `needs_student`.

Waiting for Stripe to populate `customer.name` solves a timing race; it does
not prove who the student is. A real-looking payer name must never automatically
overwrite an operator-confirmed student.

### Durable exception presentation

- Each exception has an ID, age, reason, exact source, and current owner.
- Slack shows a compact view with that ID, but the database remains the queue.
- Open exceptions repeat in an internal daily brief until resolved.
- Resolution commands bind to exact case/version and named operator.
- Reprocessing is idempotent; closure requires Payment Log/PostgreSQL/roster
  readback, not a successful script exit.

## Implementation slices

1. **Local routing foundation — implemented, uncommitted/undeployed.** Corrected
   labels route once; Contador receives exact Message-ID grants.
2. **Vendor-intake migration and host admission.** Add keyed intake/state and
   make host capture precede model extraction.
3. **Bizmgr payable queue and worklist.** Extend the least-privilege read
   contract, keep the queue visible independently of QuickBooks, and keep
   QuickBooks entry/payment human-controlled.
4. **Payment-fulfillment case and stage receipts — deployed under
   `NC-20260823-006`.** The host admits before writes, requires exact stage
   readback for completion, binds webhook acknowledgement to the case, and
   converts unresolved identity/product/write/refund outcomes to durable state.
5. **Stable product mapping.** Add account/product ID plus explicit aliases;
   replay open unmapped cases.
6. **Payer/student separation.** Add participant evidence and operator review
   for sponsor/Plutio cases.
7. **Refund and roster closure.** Operational fulfillment only; Bizmgr owns the
   accounting refund.
8. **Natural canaries.** One corrected invoice, one new mapped purchase, one
   unmapped product exception, one delayed name, and one sponsor-paid case.

Each slice gets its own task, migration/deployment state, rollback, and live
proof. Do not combine schema, external repair, QuickBooks, and prompt cutover in
one release.

## Success measures

- every classified/corrected bill has a durable intake row or explicit reject;
- zero bills disappear between `routed_at` and Bizmgr capture;
- every payment reaches `complete` or a durable exception within one host turn;
- zero unresolved cases rely only on Slack;
- product-ID coverage and exception age are measurable;
- payer/student ambiguity is explicit rather than silently guessed;
- roster closure is verified by readback;
- Bizmgr accounting totals and QuickBooks remain independent of Contador's
  operational mirrors.
