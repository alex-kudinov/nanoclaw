# Contador and Bizmgr responsibility boundary

Status: accepted operating boundary, documentation only
Decision: `.program/decisions/decision-contador-bizmgr-boundary.json`
Recorded by: `NC-20260822-007`
Live behavior changed by this document: no

## Plain-English definition

**Contador records a Stripe payment as an operational event and updates the
student records that depend on it. Bizmgr keeps the books.**

The name “El Contador” does not make the NanoClaw group the company accounting
system. It is the payment-to-student bridge.

## Contador owns

For a completed Stripe payment or refund event, Contador's bounded job is:

1. accept the host-validated Stripe event;
2. fetch enough Stripe detail to identify the payment, product, payer/student,
   and cohort when Stripe actually names one;
3. leave an idempotent operational receipt in the Payment Log and the
   PostgreSQL payment-processing table;
4. update the Student Roster or refund/fulfillment marker when the product is a
   student purchase;
5. report success, refusal, or an exception to the internal operations channel.

For an emailed vendor invoice, Contador may also perform bounded intake:
capture the exact source message, extract candidate vendor/amount/due-date
fields, and hand the item into the Bizmgr payable queue. That does not make
Contador the owner of the bill after capture.

These outputs answer operational questions such as:

- Did the payment event reach Tandem's automation?
- Which student and product should fulfillment use?
- Which roster/cohort should be updated?
- Did a refund require a student-service change?
- What failed and needs human attention?

## Contador does not own

Contador does not decide or maintain:

- recognized revenue, cash revenue, deferred revenue, reserves, or profit;
- accounting treatment of Stripe fees, adjustments, refunds, or disputes;
- Stripe clearing accounts, payouts, bank deposits, or bank reconciliation;
- Plutio invoice creation, A/R aging, installment balances, or collections;
- payable-queue ownership, QuickBooks bill entry, bill payment, or payment
  scheduling after a vendor invoice is captured;
- QuickBooks customers, items, classes, chart-of-accounts mapping, entries, or
  reconciliation;
- month close, partner allocations/distributions, tax accruals, balance sheet,
  P&L, cash-flow reporting, or monthly statements;
- a management accounting dashboard or a second financial ledger.

The Payment Log is an operational enrichment and diagnostic surface. The
PostgreSQL `public.payments` table is a webhook-processing receipt. Neither is
the accounting ledger, and neither may be presented as company revenue or net
cash without Bizmgr reconciliation.

## Bizmgr owns

Bizmgr is the financial and accounting operating system. Its current authority
and procedures cover:

- raw capture from Stripe, Plutio, Plaid/bank feeds, vendor-bill intake, and
  other approved financial sources;
- deterministic, versioned accounting rules and reproducible batches;
- Plutio billing and transaction records;
- per-charge Stripe booking, fees, refunds, clearing accounts, and payouts;
- bank/card reconciliation and missing-entry repair;
- QuickBooks posting, readback, A/R, A/P, pay runs, and account reconciliation;
- training reserves, accruals, distributions, month close, and financial
  statements/reports.

QuickBooks and the reconciled source/batch/receipt chain are accounting truth.
Bizmgr may use Contador's Payment Log for student name, product, or cohort
enrichment, but it independently reads Stripe for money facts and must not
treat the Payment Log as authoritative cash.

## Interface between them

| Contador produces | Bizmgr may consume it as | Bizmgr must verify independently |
| --- | --- | --- |
| Stripe payment/event identity | Operational receipt and lookup key | Charge/payment/refund in Stripe |
| Student/payer name resolution | Customer-name enrichment | Accounting customer and source transaction |
| Product and cohort resolution | QuickBooks item/class input candidate | Stripe source, versioned mapping rule, effective date |
| Payment Log gross/fee/net fields | Diagnostic comparison | Stripe balance transaction and accounting batch |
| Refund/roster marker | Fulfillment signal | Refund event, amount, fee treatment, and accounting reversal |
| Processing error/exception | Work needing investigation | Source state and final accounting disposition |
| Captured vendor-invoice fields | Candidate payable intake | Original invoice, payable state, QuickBooks entry, payment, and reconciliation |

Company OS may later create a follow-up case from an exact Bizmgr receivable or
exception. In that arrangement, Bizmgr supplies the financial fact and case
identity; Company OS governs pickup/authorization/receipt; Contador is not in
the accounting decision path.

## Current vendor-invoice gap

`groups/contador/CLAUDE.md` currently has a second role: it accepts vendor
invoices from Mailman, parses them, writes inbound documents, notifies Chief,
and schedules reminders. Intake may remain there. The unresolved boundary is
what happens next: the records do not become a visible, owned Bizmgr payable
queue and they never progress beyond `draft`.

The accepted operating split is:

1. NanoClaw/Contador captures the exact email and candidate invoice fields.
2. Bizmgr owns the durable queue immediately after capture.
3. The queue remains visible without QuickBooks or Parallels running.
4. QuickBooks entry, payment, and bank reconciliation stay deliberate manual
   stages whose receipts update the queue.

Do not auto-book or auto-pay an emailed document. Also do not treat a one-time
Chief/Slack reminder as the queue. The missing implementation is persistent
due/missing-information/entered/paid/reconciled state plus a recurring Bizmgr
view or brief. This document does not change the live group prompt.

## Disposition of the first money baseline

`NC-20260822-005` remains useful as cross-system discovery, but it does not
define Contador's roadmap.

Contador-relevant findings are limited to operational capture integrity:

- successful Stripe events missing from Payment Log/PostgreSQL;
- one Payment Log-only miss;
- an unpaid Checkout predecessor recorded beside the successful payment;
- refund events not consistently reflected in operational/student surfaces;
- unstable identity between Checkout Session and Payment Intent rows.

The following findings belong to Bizmgr instead:

- accounting fee/refund/net treatment;
- Plutio receivables and installment accounting;
- vendor-bill/A/P closure;
- Stripe payout, bank, clearing-account, and QuickBooks reconciliation;
- revenue, cash, margin, close, and financial statements.

## Change rule

Any future proposal mentioning Contador must state which of these it advances:

- payment-event capture;
- payment enrichment;
- student roster/cohort fulfillment;
- operational refund/exception receipt.

If it instead changes accounting, invoices, receivables, payables, bank data,
QuickBooks, closing, or statements, it belongs in Bizmgr. A cross-system
workflow must name the interface explicitly rather than assigning both sides
to Contador.
