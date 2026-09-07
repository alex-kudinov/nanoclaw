# Student product identity across systems

Task: NC-20260907-001. Version 1. Status: implementation under verification.

## Ownership and identity

The existing `facts/catalogs/student-entitlements-v1.json` owns stable offer
keys and frozen bundle/component relationships. It is not replaced by another
product master. `student-product-bindings-v1.json` is the versioned join from
those offers to provider namespaces and legacy roster destinations. It reads
provider IDs from the referenced entitlement catalog, rather than copying them.

| Identity               | Authority                                               | Meaning                                                              |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| Offer key              | Accepted commercial/entitlement catalog                 | What was bought; inaugural and regular offers remain distinct        |
| Bundle key/version     | Entitlement catalog                                     | The frozen promises associated with that offer                       |
| Provider object        | Provider + account/community + object type + ID         | An alias or provider fact, never the universal product identity      |
| Price/payment plan     | Native checkout agreement and Stripe/Plutio receipt     | How the order is funded; an installment is not a fully paid order    |
| Order/source reference | Enrollment ledger + canonical funding receipt           | The commercial episode, not the payer's name or event delivery ID    |
| Participant/enrollment | Source-bound Party + explicit seat/participant evidence | Who receives the purchased promises                                  |
| Delivery block/pool    | Accepted dated schedule + capacity configuration        | Which class consumes the seat; never derived from a product name     |
| Provider projection    | Explicit target and verified writeback                  | Roster/access/progress/CRM representation; not an independent master |

Display names, translated titles and sheet labels are not aliases from which a
new commercial identity may be inferred. Shared Heartbeat groups cannot be
reverse-mapped to purchases. Neither a Stripe product nor a price uniquely
identifies a dated class. Course completion and certificates retain their own
evidence and authorization.

## First live bridge

The initial migration covers the inaugural and regular Coaching Supervision
Mastery offers. Exact Tandem-account PaymentIntent metadata or bound native
Stripe product/price IDs route to CSS / Coaching Supervision Mastery, even when
the display name changes or the name-based Product Map row is absent. These
are provider-authenticated facts fetched by the existing host processor, not
browser claims. All supplied known/unknown identifiers must agree once any
migrated identity is recognized. Cross-account reuse, mixed invoice lines,
unknown companion IDs, incomplete invoice evidence, or an incompatible live
name mapping holds roster writes in an owned `needs_review` case. Payment Log
and PostgreSQL accounting continue independently.

Unregistered identities use the existing Product Map path; missing mappings
remain owned exceptions. They are explicitly reported as coverage gaps, not
claimed as migrated. The bridge creates no new enrollment, access, class,
capacity, financial-agreement, or communication action. It does not activate
the local authenticated enrollment admission/store work or migrations 146/147.

The provider product IDs in the supervision entitlement offers identify the
installment products. Full-payment website PaymentIntents have a stable offer
slug but may have no native product or price ID. Both can identify the offer;
neither changes the financial terms. The regular offer's catalog status does
not authorize enabling it in checkout.

## Management and rollout contract

1. Assign or reuse an offer key before creating a sellable provider variant.
   Freeze bundle versions; never repurpose historical keys or provider aliases.
2. Reconcile each account-scoped product and price with explicit agreement
   semantics. Retire aliases by effective period while keeping historical
   reconciliation possible; never guess a price-to-offer link from its amount.
3. Bind required roster, Heartbeat, Plutio and other projections explicitly.
   Existing labels/IDs can remain; changes update mappings, not student identity.
4. Bind dated class selections to a delivery block and confirmed pool separately.
   A funded class promise must remain counted while roster projection is down.
5. Check coverage before publishing a new offer or payment option. Run
   `scripts/audit-student-product-identity.mjs` against source-controlled checkout
   and a read-only Product Map snapshot. `--require-active-coverage` exits 2
   until every active checkout has a canonical route. This is an executable
   admission check; website CI adoption remains a tracked follow-up.
6. Promote one source-bound population at a time through independent review,
   exact writer ownership, rollback and provider readback. Maintain a queue of
   paid-but-unregistered exceptions; duplicates never create new orders/seats.

## Known remaining scope

The audit must distinguish source catalog coverage from live provider coverage.
The current local checkout has 47 products / 37 active; the entitlement catalog
has eight offer definitions, and its `mcs-full` key is absent from that checkout
snapshot. This is drift requiring source reconciliation, not evidence that MCS
is unavailable or that its historical alias should be deleted. Supervision
capacity has no live delivery block; the processor's cohort helper and automatic
capacity sale admission do not cover supervision. A roster correction alone
does not resolve those class/capacity gaps.

Canonical remainder: Company OS `work:student-product-identity-coverage-rollout`
owns complete provider/offer coverage, payment-plan semantics and publication
checks; `work:student-enrollment-production-admission-pilot` owns integration
with the new transactional enrollment writer;
`work:supervision-enrollment-capacity-reconciliation` owns the exact dated
supervision block and confirmed capacity. See current
program state for authorization; this document is not a second task queue.

## Repair evidence

The exact supervision payment was repaired by adding Product Map row 157 and
calling the deployed host handler on case 63. It reached version 1 / complete;
CSS row 6 was independently read back, Sales row 16 was cleared by the existing
processor, and exactly one $3,996 PostgreSQL payment remained. Payment Log row
469 preserved the original transaction date and updated its recorded date.
The replay suppressed lifecycle enqueue and sent no customer communication.
The original release was aa73538c84505212767628b81477e7d287e98af9.

Rollback of the mapping repair is limited to the added A157:C157 values after
checking their exact content. Do not remove the verified student or payment to
simulate rollback. Software rollback uses the prior immutable release and
does not reverse already verified business records.
