# NC-20260919-001 minimum-sufficient S1 review

Return one of `KEEP`, `DEFER`, `REMOVE`, or `OWNER`. Identify the largest
avoidable operational burden and the smallest feasible path. Review only this
checkpoint; do not inspect the repository or propose a roadmap. Write only
`docs/reviews/NC-20260919-001-CUSTOM-INVOICE-S1-RESPONSE.md`.

## Current observable result and evidence class

Tandem Commerce 1.44.2 has signed-provider TEST evidence that a custom invoice
with two USD 1.00 obligations charged installment one and the stored-method
worker charged installment two exactly once. The contract is Complete; two
further worker invocations were Idle. No Live payment occurred.

The existing signed Commerce-to-Company-OS activation route rejects this valid
contract before any Company OS write because its strict schema accepts only
`finite_installments`, monthly/quarterly/annual cadence, obligation amount/date,
and no `initialPaymentMethod`. The exact custom contract adds:

- `kind=custom_invoice_installments`, `cadence=custom`;
- `sourceInvoiceId`;
- per-obligation `baseAmountCents` and `feeAmountCents` with
  `base + fee = amount`;
- `initialPaymentMethod=scheme`.

The existing signed Commerce Bookkeeper route accepts both payments but its
recorder requires a Product Map Student Roster destination. Ad-hoc coaching
invoice payments correctly have none, so Payment Log/PostgreSQL work is held
retryable and the sender receives 503. Commerce currently supplies no explicit
roster applicability field.

Required evidence is: signed input validation; same-table idempotent activation
and payment projection; disposable PostgreSQL proof; Payment Log plus
PostgreSQL readback for both retained invoice payments; explicit no-roster
readback; and no provider/customer/fulfillment action.

## Constraints and present hazards

- Preserve the existing two signed routes, one NanoClaw process, finite billing
  tables, due-worker mechanics, Commerce retry jobs and Contador recorder.
- Never place provider tokens in Company OS.
- Never infer roster applicability from payer identity, business billing,
  product title or email.
- Do not coerce a custom schedule to monthly or erase fee/source facts merely to
  satisfy the older schema.
- Keep ordinary catalog payment behavior unchanged.
- Only retained TEST jobs may be replayed in this proof; no new provider call,
  real payment or customer message is authorized.

## Operational-obligation delta

1. Extend the existing signed activation validator with a discriminated custom
   schedule. Reuse the current store and worker. Require source invoice UUID,
   exact base/fee/amount arithmetic, strict due ordering, schedule digest,
   consent digest and exact initial-method/selection-method pairing.
2. Migration 172 alters only the existing `cadence` CHECK to admit `custom`.
   No table, column, index, owner, grant or row is added or changed. Removing
   the migration leaves valid custom activation impossible; delaying it keeps
   only Company OS projection retrying while Commerce payment truth remains
   intact.
3. Add a signed `order.rosterPolicy` enum to the existing Bookkeeper envelope.
   Commerce derives `none` only for its server-owned invoice fulfillment modes
   and `catalog` otherwise. The recorder always requires Payment Log and
   PostgreSQL readback; `none` skips Student Roster entirely and emits an
   explicit not-applicable receipt. Removing this field recreates the current
   failure; deriving from free text would create a new trust hazard.

## Next falsifiable proof and bounded work

- Focused validator tests accept one exact custom contract and reject wrong
  kind/cadence, source ID, base/fee arithmetic, initial-method pairing and
  digest.
- Migration 172 applies twice against disposable PostgreSQL with unchanged
  rows/owner/grants and a guarded rollback that refuses after any custom row.
- Bookkeeper tests prove `rosterPolicy=none` writes/reads Payment Log and
  PostgreSQL, performs zero roster calls, returns verified true, and keeps
  `catalog` unchanged.
- Then typecheck, focused/full suites, bounded payment-boundary review,
  immutable release, backed-up migration, health verification and exact
  replay/readback of the retained TEST jobs.

## Explicit non-goals

No new table, route, process, queue, scheduler, worker, credential, provider
adapter, payment, Live canary, customer message, Product Map row, roster row,
Party identity, entitlement, enrollment, fulfillment or generic invoice
accounting redesign.
