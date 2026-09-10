# MCS canonical website checkout admission plan

Status: accepted architecture plan under NC-20260909-003. This document
does not publish a catalog population, apply schema,
activate a route, materialize an enrollment, consume a promotion, grant access,
clear certification, call a provider or communicate with a customer.

## Authority and identity separation

One provider-neutral `website_checkout` channel should serve authenticated web
commerce without changing any existing Stripe, Plutio, bank, sponsorship, grant
or correction channel.

Commerce order identity and funding identity are deliberately different:

- Order: one server-authoritative accepted quote, identified by quote ID,
  fingerprint and one durable checkout attempt/free-order identity. Replays of
  the same accepted quote resolve to the same canonical order.
- Paid funding: the native Adyen PSP reference, scoped by the complete
  company/merchant/store/environment/endpoint-region fingerprint. The writer
  claim is on this scoped PSP, never on the attempt UUID or a generic website
  scope. Attempt, Session and request-operation identities are aliases/evidence.
- Free commercial order: a typed authenticated commerce source with no provider
  funding identity. It is not an Adyen PaymentAttempt, settled payment, bank
  receipt, Stripe object or owner grant.

If one Session exposes more than one successful PSP, the checkout is held as an
owned conflict. It never creates a second order, writer claim, enrollment or
access grant.

## Registered source types

Add explicit registered types under the new channel while keeping full scope in
both registration and evidence:

1. `adyen_payment_acceptance_v1`
   - order source: accepted quote + attempt;
   - funding source: PSP reference + Adyen TEST scope fingerprint;
   - aliases: attempt, Session, provider request operation and admitted event;
   - purposes: funding, commercial and identity-bound participant evidence;
   - acceptance requires immutable quote/attempt, authenticated Session-result
     method binding and consistent admitted provider event projection.
2. `commercial_free_order_v1`
   - order source: immutable free-order ID + zero-total quote;
   - no funding source/writer claim;
   - purposes: commercial and identity-bound participant evidence;
   - acceptance requires exact discount reservation/policy, terms and identity.

Issuer registration binds TEST environment, exact scope, channel, source type,
actor/role/purpose and key. A serialized candidate cannot choose these values.

## Minimal canonical state extensions

Extend the current engine rather than create a parallel order/enrollment model:

- `SourceChannel`: add `website_checkout`.
- `FinancialClassification`: add `provider_accepted_provisional`.
- Future free-order slice: add a dedicated `zero_total_commercial` agreement
  type only when its command/store path is implemented.
- `FinancialObligation.state`: add `accepted_pending_receipt`.

Migration 153 is reserved after a fresh all-ref maximum check for the bounded
paid provisional slice. It updates the matching order and obligation PostgreSQL
CHECK constraints without changing existing rows. Later reviewed migrations are
needed for:

- accepted free commercial orders and their exact quote/policy/terms/identity
  evidence;
- free-order status capabilities/revocations because PaymentAttempt FK-backed
  capabilities cannot represent a free order;
- canonical checkout admission operations/receipts tying order, funding writer
  claim and originating business operation;
- ACH received-funds certificate-clearance evidence supplied only by a future
  authenticated host settlement repository.

No new table is needed merely to duplicate a receipt when an immutable canonical
row plus deterministic reference already provides the required provenance.

## Paid Adyen command sequence

Create a small `website-checkout-enrollment-adapter` that runs inside the existing
SERIALIZABLE store/writer-claim transaction and composes existing commands:

1. Re-read exact quote, attempt, Session-result method binding, PSP/event evidence
   and method-specific readiness decision.
2. Resolve buyer and participant separately with
   `resolveCheckoutCustomerIdentityWithClient` using the injected transaction
   client and isolated TEST identity secret/fixtures.
3. `captureOrder` once from accepted quote/attempt commerce identity.
4. Link the scoped native PSP funding reference and attempt/Session/event aliases.
5. Attach authenticated commercial, funding, buyer, participant and catalog
   evidence.
6. Bind the exact activated/read-back standalone Foundations offer/bundle.
7. `createSeats` for exactly one seat and `assignParticipant` with an explicit
   payer relationship.
8. `recordFinancialAgreement` as one-time `paid_in_full`, state `active`.
9. `recordFinancialObligation` for exact final amount/currency, state
   `accepted_pending_receipt`.
10. Set order classification `provider_accepted_provisional` only after the
    accepted method-specific readiness predicate.
11. `materializeEnrollment` once and request only declared, idempotent projections.

ACH provider acceptance can permit provisional course access under the accepted
return-risk decision. It does not mark the obligation paid or funds settled.
Authenticated received-funds evidence later transitions the obligation to `paid`,
sets financial classification to `settled`, and can clear only the ACH financial
certificate gate. Existing academic and operator issuance gates still apply.

A later return/chargeback transitions the obligation to `disputed`, removes ACH
certificate financial clearance and opens an owned financial exception. It does
not automatically revoke access, recharge, refund, message anyone or revoke/issue
a certificate. Card access remains blocked until verified automatic-capture
configuration evidence exists; this plan does not redefine card certification.

## Identity proof

Buyer and participant use distinct `sourceRequestKey`, checkout token and proof
hashes even when their submitted details match. The adapter never assumes they
are the same person.

- Set `self_purchase_explicit` only when two separately resolved role-bound
  proofs identify the same canonical Party.
- Otherwise require explicit `separate_payer`; ambiguity or missing evidence
  holds admission.
- Keep `exactStripeCustomerId` private and use it only where the protected coupon
  policy requires an exact Stripe customer binding. Never use it as Adyen or
  participant identity.

Tests call only `resolveCheckoutCustomerIdentityWithClient` with a supplied
disposable client. The global resolver that opens production context is excluded.

## Zero-total commercial order

Add a dedicated signed `/internal/payments/free-orders` command/status path with
the same caller/path/body/operation/nonce, bounded I/O, response signature and
guest isolation as paid checkout. Its strict contract contains a free-order ID,
zero-total quote whose original amount remains positive, exact discount
policy/reservation/redemption, terms and separate buyer/participant proofs.

One transaction must:

1. accept the immutable free-order row exactly once;
2. resolve and bind buyer/participant evidence;
3. capture one canonical `website_checkout` order;
4. attach activated standalone catalog evidence;
5. create/assign one seat;
6. record `zero_total_commercial`, state `complete`;
7. create no financial obligation or provider funding/writer claim;
8. classify finance `not_applicable`, materialize once and enqueue declared
   projections.

Do not relax positive PaymentAttempt constraints or fabricate an amount/provider
event. WordPress keeps the promotion reservation until it receives the signed
free-order admission receipt, then performs its own governed consumption step.

## Signed receipt predicates

Response `auth.operationId` always binds the current HTTP request. A business
receipt `operationId` binds its original durable business admission and can differ
on a later status query.

- `attemptAcceptanceReceipt`: existing behavior; produced only from exact durable
  attempt + provider operation + caller/operation capability readback.
- `promotionConsumptionReceipt`: unavailable until canonical financial
  agreement/obligation admission and writer claim bind the exact attempt, quote,
  scoped PSP, policy and accepted evidence class. It retains the originating
  financial-admission operation on later queries.
- `freeOrderAdmissionReceipt`: unavailable until immutable free-order plus
  canonical order/agreement/seat/identity/catalog transaction commits and reads
  back exactly. It retains the originating free-order admission operation.

Receipt fields and namespaces follow the accepted response contract:
`attempt-acceptance:`, `promotion-consumption:`, and `free-order-admission:`.
Missing canonical admission returns no placeholder receipt. A callback, browser
success, `confirming_payment`, fixture, syntactically valid receipt, unsigned
method/date or elapsed time cannot satisfy a receipt predicate.

## Exact implementation change list after review

1. Extend enums/guards/tests in `student-enrollment-foundation.ts`, including
   explicit provisional guards in both `transitionOrderState` and
   `materializeEnrollment`, and matching
   PostgreSQL constraints in the newly reserved migration/rollback.
2. Extend authenticated issuer/channel/source-type registration in
   `student-enrollment-ingress.ts` and `student-enrollment-admission.ts` without
   weakening prior channels.
   `claimEnrollmentWriter` must require an exact registered
   `adyen:<64-hex-scope-fingerprint>` + `payment` source and native PSP; a regex
   match alone is never authority.
3. Add `website-checkout-enrollment-adapter.ts` with pure/fake and disposable
   transaction tests; reuse current store mapping and writer claims.
4. Add a free-order domain/store/controller module, signed route/status capability
   tables and disposable tests; do not touch PaymentAttempt money constraints.
5. Add host-only received-funds repository interface and certificate-clearance
   read model; leave real settlement ingestion unwired until separately reviewed.
6. Extend the signed-response wrapper only when canonical predicates exist;
   preserve current attempt receipt and current-query/origin-operation separation.
7. Update API/enrollment/publication/operations docs and schema reference in the
   same reviewed change.

Pre-quote identity preparation is a separate neutral, signed host command using
the injected WithClient resolver. It returns immutable buyer/participant
role-proof references before quote creation and performs no Stripe mutation.
Admission rechecks both proofs, and an explicit self-purchase action is required;
equal Party IDs alone do not authorize that relationship.

## Verification gates

- Exact replay and altered quote/PSP/scope/identity conflict.
- Concurrent attempt aliases and scoped PSP writer claims; one order/grant only.
- Multiple successful PSPs hold with no materialization.
- Buyer/participant same, different, missing and ambiguous role-bound cases.
- ACH acceptance -> access eligible/certificate blocked; received funds -> finance
  clear; return -> disputed/preserve existing access/certificate blocked.
- Card remains blocked without capture-configuration proof.
- Zero-total exactly once, no PaymentAttempt/provider/funding/obligation rows.
- Projection outage/retry/readback and no duplicate welcome/receipt.
- Lost ACK, fresh query operation, immutable business receipt operation and signed
  response tamper tests.
- Migration empty apply/rollback/reapply, populated rollback refusal, immutable
  grants and no disposable residue.

All tests remain generated/disposable. Real provider, production DB, catalog
publication, route activation, enrollment projection and certificate/customer
effects require their own reviewed authority and live readback.
