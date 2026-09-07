# Local multi-source enrollment adapters

Task `NC-20260906-007`, following reviewed contract `2755a284`.
`src/student-enrollment-ingress.ts` is pure, synthetic-only source. It has no
runtime registration, activation flag, IPC, CLI, database connection, provider
client, or writer. No existing consumer is changed.

## What this slice implements

One versioned bounded envelope adapts independently verified host snapshots into
the existing Bookkeeper/enrollment/capacity engine. Every supported input creates
canonical state or an owned exception. It rejects raw webhook/email bodies,
personal text, extra fields, malformed identifiers, invalid numbers and versions.
It does not retrieve source records or authenticate a network event. Signature
verification and provider retrieval remain separate production admission work.

| Channel | Accepted local disposition |
| --- | --- |
| Website Stripe | Account-scoped Payment Intent and its exact Checkout/event/charge aliases; independently evidenced commercial terms, participant, and class |
| Manual Stripe | Same canonical funding object; explicit commercial and participant confirmation, no payer inference |
| Plutio invoice/contract | Exact invoice-payment receipt plus optional invoice alias; settlement and contract/intake facts remain independent |
| Check/ACH/wire | Stable external payment receipt with finance-operator confirmation |
| Sponsored cohort | Finance-confirmed funding, explicit quantity, per-seat participant/class evidence; valid seats progress while others remain owned |
| Scholarship | Owner-confirmed grant and commercial scope; no invented payment or payer |
| Complimentary owner grant | Same grant boundary, distinct commercial route |
| Migration/correction / operator correction intake | Canonical unverified intake order plus `correction_requires_resolution` owned by owner_admin; no historical read or state replay |

Ordinary operator-assisted NEW orders use their underlying payment/grant channel
with the named operator proof. The eighth route intentionally admits a review
case, not an unversioned correction. Existing correction commands and their
exact subject versions need a separately implemented/authorized caller.
Partial payments/unpaid invoices, unknown product, invalid participant, missing
assignment, or overcapacity do not silently become successful enrollments.

## Independent evidence contract

`applyEnrollmentIngress(state, candidate, host)` separates the candidate from
trusted host evidence and catalog/Party authority. The host proof registry must
be populated by authenticated native observations or exact named decisions,
never copied from candidate input or model output. Local tests supply synthetic
records for that boundary. A digest checks an existing proof; computing it
does not authenticate facts or authorize an action.

Each proof contains a stable proof key, purpose, exact payload hash, actor,
role, and observation time. It must be unique by key, not future-dated, match
the required purpose/role, and bind the exact structured payload:

- funding: canonical source, payment/grant status, payer, amount/currency,
  effective time, and sorted aliases;
- commercial: source, channel, exact offer, seat count and agreed amount/currency;
- participant: source, channel, offer, seat count, slot number, Party and explicit
  relationship to payer;
- assignment: source, channel, offer, seat/Party, exact pool and component.

Bank/check/sponsor funding requires finance_operator; grants require owner_admin.
Other payment funding accepts source_adapter or finance_operator. Grant scope
also requires owner_admin commercial proof. Manual/bank/sponsor commercial and
participant facts require enrollment_operator/owner_admin; native website and
Plutio facts additionally accept source_adapter. Class assignment always needs
enrollment_operator/owner_admin proof. The catalog and Party registry are
separately trusted host inputs; missing mappings/identity fail closed in the
existing engine. Exact used proofs, hashes, actors and observed times become
append-only canonical evidence; unused registry entries are never copied.

No hashing or normalization can turn an AI proposal into a trusted observation.
The host must perform the real authenticity/identity/role checks before this
function is connected to an external source. Proof keys/hashes reference the
protected evidence store; raw records are not carried into canonical state.

## Aliases, retries and exceptions

Funding scope/type/ID derives the canonical order identity. Selecting a known
Checkout Session, event, charge or Payment Intent does not create another order.
Stripe aliases must be transaction/event types with matching ID prefixes and
account scope; customer IDs cannot be funding aliases. Plutio accepts only
invoice-payment/invoice identities; bank and grant sources retain their exact
canonical reference. Cross-account and cross-provider inference is excluded.
Any existing alias bound to another order produces `source_alias_conflict`
before enrollment/capacity changes. All source-reference linking uses the
foundation's versioned append-only command.

Every delivery has an opaque intake key. An immutable admission marker binds
its normalized envelope; exact retries return prior state without effects,
including after exception resolution or catalog evolution. Object property and
alias ordering are nonmaterial; seat ordering is material. Reusing an intake
key for changed input produces an owned intake conflict and preserves the
earlier enrollment/projection. New verified aliases on a new delivery can link
to the original order without changing its canonical funding fingerprint.

Missing source/commercial proof is quarantined in an unverified canonical
enrollment order with a typed owner exception. It does not claim native payment
aliases or create seats/entitlements. That held intake remains visible until
an explicit evidence-backed resolution; later successful separate intake does
not silently close it. Quarantine entries reuse their deterministic identity
on retry. No parallel exception database or source truth is introduced.

For a new funding order, invalid participant proof withholds the student's
enrollment, entitlements, class assignment and roster projection. An independently
verified funded class commitment remains counted even for a named participant
whose identity proof fails; this is funding/seat-pool evidence, not an assigned
student. This applies to every payment channel, not just anonymous sponsor slots.
Suppressing that verified commitment would undercount an actual paid promise.
Invalid class proof prevents even the class commitment; other valid sponsor
seats may progress. A supplied but
unverified optional assignment cannot be dropped to grant nonscheduled access.
For an existing funding order, incomplete participant/assignment evidence that
would change the normalized receipt is quarantined separately instead of
freezing or rewriting a valid prior enrollment. Independently proved conflicting
facts still pass through the Bookkeeper contract's owned source-conflict path.

The returned state includes orders, source aliases, evidence, seats, financial
agreements/obligations, enrollments, entitlements, class assignments, capacity
events/commitments, projection requests and exceptions. `accepted` means local
admission; `held` means owned open work; `duplicate` returns the existing
disposition/state. A queued roster request remains unverified until the exact
readback contract succeeds. Nothing here writes a Sheet or provider.

## Remaining implementation gates

`NC-20260906-008` supplies a local disposable-only persistence proof in
`docs/STUDENT-ENROLLMENT-TRANSACTIONAL-STORE.md`. Production source admission,
pool/migration selection and runtime activation remain separate gates.

The later host must persist BOTH canonical aggregates and aliases/evidence/
exceptions/outbox atomically under serializable transaction/CAS before receipt
acknowledgement. This local slice provides no database durability or concurrent
transaction guarantee by itself. Runtime admission, normalized snapshot
retrieval, transactional persistence, real-data pilots, replacement of legacy
Bookkeeper/website commitment writers, provider projections/readback, and any
history/correction execution remain later work. Never run both old and new
funding paths for one payment. Rollback is removal of these unwired files.
