# Capture-first checkout customer identity

Status: implementation design under `NC-20260829-001`

Authority:
`.program/decisions/decision-checkout-capture-first-customer-identity-2026-08-29.json`

## Problem

The website validates name/email and emits tracking facts, but payment creation
does not synchronously consume the canonical Tandem Party. Chaos often creates
that Party independently, while Stripe one-time payments remain guest
PaymentIntents. The two identities therefore exist on different timelines and
are not durably bound before payment.

## Required order

1. WordPress validates product, cohort, name, email, locale, regional pricing,
   consent, rate limits, and creates one opaque checkout token.
2. Through the existing exact-byte/HMAC n8n bridge, NanoClaw synchronously
   resolves canonical Parties by email. Zero candidates creates one person and
   one prospect role; one candidate reuses it; two candidates return an
   identity conflict. No deterministic `best_party_by_email` selection is
   allowed for ambiguity.
3. NanoClaw records one deduplicated, content-minimized checkout-capture
   interaction and returns a short-lived signed binding token containing only
   Party ID, interaction ID, token/email fingerprints, and expiry.
4. WordPress creates or reuses the Stripe Customer. Customer-create
   idempotency is Party-scoped, and the Customer carries the Tandem Party ID in
   metadata. Exact email/name reuse remains fail-closed for conflicting or
   truncated candidate sets.
5. WordPress sends the Customer ID plus signed binding token back through the
   same bridge. NanoClaw verifies the token and durably creates or replays the
   exact `stripe/tandem/customer` external reference. A reference owned by a
   different Party returns conflict.
6. WordPress persists the Party ID, Stripe Customer ID, and bound receipt in
   the checkout session. Only then may `/intent` create a PaymentIntent or
   subscription, always with `customer=<cus_...>` and Party identity metadata.

## State semantics

Party existence is identity, not payment. A net-new checkout Party receives a
prospect role. Existing roles are not rewritten. Client/student/paid-customer
state, fulfillment, enrollment, revenue, and receipts remain downstream of
verified payment success.

## Failure and replay

- Resolve, Customer lookup/create, bind, or session persistence failure blocks
  payment creation with customer-safe retry copy.
- Same checkout token replays one capture interaction.
- Concurrent sessions for one Party use the same Stripe Customer create
  idempotency key.
- A Stripe Customer created before a timeout is recovered by Party-scoped
  idempotency and the exact bind replay; no payment is created until binding is
  durable.
- Pre-deployment sessions are upgraded through the same handshake at `/intent`
  before any paid or free outcome.

## Privacy and authority

The generic webhook archive never stores identity-handshake raw email/name.
Durable handshake evidence uses Party ID, provider IDs, bounded metadata, and
fingerprints. n8n retains no execution payloads. No historical Guest payment
is changed, and no communication, payment retry, refund, enrollment, pricing,
coupon, tax, cohort, or subscription-plan behavior is authorized.

## Deployment order

1. Deploy NanoClaw synchronous resolve/bind support dark on the existing
   checkout-recovery path.
2. Patch/read back n8n normalization for identity operations while preserving
   lifecycle behavior and credentials.
3. Deploy WordPress capture-first caller and verify source/API contracts.
4. Use structural probes only: signed resolve/bind fixtures in rolled-back or
   disposable data, provider Search read, session/PaymentIntent parameter
   tests, and live source hashes. Do not create a live Customer or payment
   canary.
5. Observe the next natural capture and payment as outcome proof.
