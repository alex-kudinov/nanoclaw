# Reusable payment domain — MCS Foundations reference

Status: unwired source implementation; NC-20260909-003. No production payment
capability is enabled by this module. Plan accepted after independent Sonnet/high
review in Peri `docs/MCS-FOUNDATIONS-IMPLEMENTATION-PLAN.md`.

## Ownership and first slice

`src/payment-domain.ts` is a pure contract/decision module. WordPress remains
quote/coupon authority. NanoClaw will own durable attempts and admitted financial
evidence, using existing enrollment orders/agreements/obligations rather than
creating a second order master. No runtime imports this module yet.

- Strict versioned quotes use safe integer minor units and exact subtraction.
  Their fingerprint includes offer, locale, country, mapping versions, identity
  references, discounts, redemption reference, terms/consent and timestamps.
  Validation does not establish coupon eligibility or caller authentication.
- One-time paid attempts pin an immutable quote and complete provider scope
  (provider, environment, company, merchant, store and endpoint region). A free
  quote is valid but requires a separate commercial admission path, not a fake
  paid event. Recurring quotes are rejected until an explicit versioned contract
  exists; their future schedule and obligations must not be hidden in metadata.
- Session operations record a stable key and exact outbound-request fingerprint
  before dispatch. Ambiguous results reuse that operation within a configured
  horizon strictly below seven days; the adapter must choose a shorter horizon
  where required. Expired/unknown outcomes require reconciliation, not key
  replacement or switching to Stripe. Available sessions are reused only before
  their provider-reported expiry. Failed operations stop. Contradictory terminal
  results require an exception.
- Projection rebuilds from all admitted facts, never event arrival order.
  Authorization must match the complete payment amount. Distinct partial capture
  and refund operations carry amounts; repeated deliveries/operations deduplicate.
  Conflicting payloads or aggregate overages suppress usable totals and produce
  stable exception codes. Missing earlier evidence remains pending, and a refusal
  plus successful capture or refund conflicts. Authorization/capture never asserts settlement
  or grants access. Returns, disputes and cancellations are not yet modeled and
  are rejected, not silently ignored.

## Mandatory caller boundaries before wiring

These helpers are **not** an authentication, concurrency, persistence, refund
authorization or fulfillment boundary. Their inputs must come from the admitted
commerce/provider services, never directly from a browser.

The next store slice must enforce unique attempt/operation/idempotency/event keys,
CAS/leases, append-only evidence, immutable request/scope binding and commit-before-
dispatch. Only one worker can own dispatch; `retry_same_operation` is permission
to recover the same request, not a lock. Persist the original retry deadline and
request without extending either. Never trust a caller-supplied hash as evidence
that an outbound payload was checked. The adapter must derive the hash from the
exact stored request and keep credentials/tokens out of logs and URLs.

Provider ingress must verify signatures and scope, bind the payment reference to
the persisted attempt, derive stable delivery/child-operation identities and
persist invalid/conflicting evidence as owned exceptions. The pure reducer throws
on malformed/out-of-scope facts; its caller must retain a safe rejection receipt.
Do not filter failures out of the complete evidence set to obtain a clean result.

Standalone Foundations publication, Adyen source admission, scoped runtime policy,
financial agreement/obligation classification and method-specific access readiness
remain launch gates. The module writes none of these records and emits no effects.
Unknown parent evidence must not trigger fulfillment. A capture is not settlement.

## Verification and remaining work

The behavioral suite covers quote tampering/expiry/zero values, scope pinning,
ambiguous/repeated/expired recovery, expired sessions, duplicates, conflicting and
reordered events, missing predecessors, partial amounts and safe-integer overflow.
English Foundations, French and a second product fixture use identical functions;
fixtures do not authorize those routes. See the engineering changelog for exact
test/review receipts. Database race/crash proof, live methods, shared UI, coupons
and fulfillment are subsequent slices, not claimed by these pure tests.
