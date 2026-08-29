# NC-20260829-001 capture-first dual identity — bounded review R3

Status: owner-approved third Claude round.

## Objective

Review the capture-first checkout identity extension across NanoClaw, n8n, and
Tandemweb. Report material findings only.

## Owner decision

After validated checkout name/email:

1. create or resolve the canonical Tandem identity;
2. create or resolve a first-class Stripe Customer bound to it;
3. durably record that binding;
4. only then create a PaymentIntent or installment subscription.

Unpaid identity is prospect state, not client/student/paid-customer state.
Historical Guest payments, payment retries, communications, fulfillment,
pricing, coupons, tax, cohorts, and subscription-plan behavior are excluded.

## Verified live facts

- The incomplete and successful Guest examples each already had exactly one
  Chaos-created Party and prospect role before payment, but zero active Tandem
  Stripe Customer refs.
- The website currently stores a transient and emits tracking/recovery facts;
  it does not synchronously consume the Party.
- Stripe Customer Search requires an explicit request-scoped API version on
  this account; `2020-08-27` returned HTTP 200 and matched mixed-case email.
- No Party has more than one active `stripe/tandem/customer` ref now.
- Current n8n exact-node dry-run changes only the verifier Code parameter and
  preserves credential hash `00786c...`.

## Intended mechanics

- Identity operations reuse the existing exact-byte/HMAC, retention-free n8n
  bridge but bypass generic webhook archive and run synchronously.
- Resolve locks the checkout token fingerprint. A prior token interaction must
  have the same email fingerprint. Zero Party candidates calls
  `fn_create_party` and adds prospect; one reuses; two return 409. It records
  one minimized deduplicated capture interaction and returns a 15-minute
  HMAC-signed binding token.
- Resolve also returns the Party's sole active Tandem Stripe Customer ref when
  present; two refs return 409.
- WordPress creates/reuses the Customer. Create idempotency is keyed by Party,
  the Customer stores `tandem_party_id`, and conflicting/blank/duplicate Search
  candidates are never mutated or merged.
- Bind verifies token, source interaction, Party, token/email fingerprints,
  and Customer ownership. It creates/replays the exact external ref and rejects
  a ref owned by another Party.
- WordPress stores session identity only after resolve → Customer → bind. Both
  `/intent` branches upgrade cached older sessions through the same handshake.
  PaymentIntent and first subscription-invoice PI carry `customer` and Party
  metadata.

## Allowed read paths

1. `docs/CHECKOUT-CUSTOMER-IDENTITY.md`
2. `src/checkout-customer-identity.ts`
3. `src/checkout-customer-identity.test.ts`
4. `src/webhook-server.ts` only the checkout-recovery route and dependency type
5. `setup/n8n/checkout-recovery-website-verify.js`
6. `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/includes/class-stripe-checkout.php` only capture, intent/subscription, relay, and customer-identity helpers
7. `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/tests/test-stripe-customer-identity.php`
8. this request

Write only:
`docs/reports/NC-20260829-001-CAPTURE-FIRST-IDENTITY-REVIEW-RESPONSE-R3.md`

## Review questions

1. Can any paid/free outcome or payment object still occur without both
   identities and a durable exact binding?
2. Can token replay, email ambiguity, multiple Customer candidates, concurrent
   sessions, provider Search lag, transient failure, or bind timeout create
   duplicate/wrong association or continue customerless?
3. Does any failure mutate an existing Customer before Party ownership is
   verified, or make a paid/customer role claim prematurely?
4. Is the binding token scoped, unforgeable, bounded, expiry-safe, and replay
   safe? Is the synchronous route free of raw identity archive/log leakage?
5. Are external-ref insert/update/conflict semantics correct under concurrent
   requests and canonical Party rules?
6. Does the n8n allowlist preserve lifecycle behavior and return synchronous
   identity responses without retention or credential/topology drift?
7. Are cached sessions, free coupons, installments, full payments, and policy
   gates ordered correctly relative to identity side effects?
8. Identify any material TypeScript/PHP/Stripe API/runtime/test gap.

## Verification so far

- NanoClaw focused 63/63, format, typecheck, docs continuity.
- NanoClaw full 3,380 pass/32 skip with the unchanged CNPC wrapper and
  date-stale Trafft fixtures.
- Tandemweb identity 22/22 and full 50/51 files with the unchanged exam fixture.
- Live read-only Stripe Search compatibility and n8n exact-node dry-run pass.
- No new Party, Customer, external ref, payment, or historical mutation.
