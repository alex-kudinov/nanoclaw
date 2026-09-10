# Bookkeeper funding to enrollment contract

Task: `NC-20260906-006`. Local synthetic implementation only. This pure adapter
is unwired: it changes neither the live Contador pipeline nor provider state.

## Authority and admission

`NC-20260906-007` implements the local normalized-snapshot caller described in
`docs/STUDENT-ENROLLMENT-INGRESS-ADAPTERS.md`. It verifies independent host proof
records and aliases before calling this contract. Network authentication,
source retrieval, persistence, and runtime activation remain unimplemented here.

`src/bookkeeper-enrollment-contract.ts` composes the existing enrollment
foundation (migration 142) and capacity commands (143–145). It introduces no
parallel database or person, entitlement, assignment, or finance model.

`applyBookkeeperFundingReceipt(state, candidate, trustedAuthority)` returns both
canonical aggregates. Inputs and old state are immutable. In this slice the
caller is a synthetic test. A later production caller MUST authenticate native
receipts, resolve exact source aliases and Party identities, check evidence and
role authority, and load accepted catalog/pool snapshots under the transaction.
Only that host boundary may supply `trustedAuthority`; never copy it from AI,
an HTTP request, agent tool arguments, or a claimed `verified` flag. The exact
accepted receipt hash binds the host decision to every proposed field. A hash
is an integrity binding, not proof of source authenticity or human authority.
The catalog snapshot and Party set likewise come from the host, not the receipt.

The normalized source is the funding object, not a delivery event or email:

| Route | Canonical source |
| --- | --- |
| Website/manual Stripe | `stripe:tandem` or `stripe:heartbeat`, `payment_intent`, exact `pi_` ID |
| Plutio | `plutio:<account>`, `invoice_payment`, exact payment receipt ID |
| Check/ACH/wire | `bank:<account>`, `payment_receipt`, stable external receipt ID |
| Sponsor | One of the payment sources above, plus explicit seat-count and participant evidence |
| Scholarship/complimentary | `owner:<scope>`, `grant`, exact accepted grant ID |

Payment support is intentionally bounded to fully settled receipts whose
amount/currency exactly match the explicit commercial agreement. A partial
payment, unpaid invoice, active installment schedule, refund, dispute, or
correction is not converted into a fully paid order. Unverified terms produce
an owned exception; malformed/unsupported envelopes are rejected before state
changes. Multi-receipt commercial orders and provider alias discovery belong
to the separately governed ingress adapters. Existing source aliases already
bound to an order cause an owned collision instead of another order.

Off-platform and sponsor funding requires a named finance-operator receipt.
Grants require owner-admin authority, no payer, and no invented zero-dollar
payment. Evidence hashes retain source, funding, catalog, seat-count,
participant, and schedule provenance without copying raw customer documents.
Unknown business facts use null values in the bounded envelope, not guessed
names, email-based identity, default quantities, or default classes.

## Transition and retry

1. Admit one order by a SHA-256 of the scoped canonical source tuple. Reject
   extra fields and malformed values; a structurally valid unverified receipt
   creates an owned order exception and cannot create seats or entitlements.
2. Require one exact catalog offer with a frozen bundle/version, accepted
   seat-count evidence, and validated funding. Record the actual agreement and
   paid obligation (or grant agreement) through foundation commands.
3. Create the declared seat slots. Process each slot independently in array
   order; seat numbering is stable and therefore receipt order is material.
4. An explicit catalog-compatible pool/class request creates one durable
   commitment per funded seat. It counts through the delivery block end, even
   if the participant is still unknown. No temporary checkout hold is created.
   A paid oversale remains counted and opens `capacity_overcommitted` for the
   owner; it does not assign a class or request a roster write. Closed, unknown,
   expired, or mismapped pools fail closed into seat exceptions.
5. Exact Party identity, separate participant evidence, and a consistent payer
   relationship permit enrollment and catalog entitlements. Duplicate named
   participants within one order are ambiguous. Valid sponsor slots progress
   independently of missing/invalid ones. One explicit starting assignment is
   supported per slot; full-program labels never invent future assignments.
6. Consume the commitment into the class assignment atomically, so occupancy
   counts one seat once. Future classes produce pending enrollments. Non-class
   offers can materialize without a pool when the catalog requires none.
7. Queue a versioned Student Roster preview containing canonical enrollment,
   participant, bundle, catalog, state, and assignment identifiers. Queued is
   not verified. The existing exact readback command requires the matching
   subject version and expected payload hash. There is no provider executor.

An exact replay returns the original decision without recalculating capacity or
catalog or adding history, seats, commitments, exceptions, or requests. A changed
host-attested receipt on the same source opens `duplicate_source_conflict`, preserves previous
facts, and holds queued/failed projections. Verified target receipts remain
historical evidence. A corrected held receipt needs an explicit versioned
resolution command; changing a proposal and retrying cannot bypass its hold.
Replay compares an immutable `bookkeeper_admission` evidence record, so later
order-term corrections do not invalidate the original receipt. Unattested
conflicting proposals are rejected without changing an existing order or request.
An already recorded conflicting receipt is also a no-op on retry, including
after its exception is resolved; it cannot re-hold later authorized requests.

Capacity commitments retain the established website/invoice/check/sponsor/manual
source category plus the exact order/source reference. Grants use the manual
category and remain explicitly grants on their order. A second funded order
naming the same Party for a currently assigned class (or an active nonscheduled
offer) creates an owner exception instead of another enrollment/roster request;
the genuine funding commitment stays counted until explicitly reconciled.
Completed prior episodes do not prevent a legitimate later enrollment.

All semantic failures have durable typed exceptions with owner, source hash,
first/last observation, version, review time, and canonical subject. No Slack
message is needed to preserve the work. Unexpected programming errors propagate
without returning a partial result. A failed seat materialization is rolled
back while its genuine funding commitment stays counted.

## Persistence and promotion boundary

The returned aggregates are a serializable transition artifact; this slice
does not persist them to a database. The future host must atomically persist
enrollment, capacity, source references, events, exceptions, and outbox under
one serializable transaction/CAS, then acknowledge. A store failure retries the
same receipt against a fresh canonical snapshot. No returned in-memory result
is a durable production receipt. Projection workers must check current holds,
versions, and separately accepted target authority immediately before writing.

The current live `process-payment.cjs`/fulfillment store proves accounting and
roster stages, and `academy-capacity-sale-ingress.ts` already records website
commitments. Those outputs do not contain the independent participant,
commercial, and grant evidence required here. They remain untouched. Activation
must replace or explicitly reconcile that legacy commitment/roster path under
a separate decision; calling both paths for the same payment would double count.
No historical inspection, reconciliation, production schema/data/runtime,
provider/Sheet write, payment/refund, communication, or deployment is included.

Rollback for this slice is removal of the unwired adapter and tests. No live
rollback or schema migration is needed. Validation and independent-review
receipts are recorded in the task evidence and engineering changelog.
