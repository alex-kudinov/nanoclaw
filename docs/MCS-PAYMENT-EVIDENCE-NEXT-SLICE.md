# MCS card/ACH payment evidence — next implementation slice

Status: accepted design direction for NC-20260909-003; source-only TEST work.
This document is not a migration, deployment, fulfillment activation, certificate
approval, payment operation or customer communication.

## Evidence boundaries

Adyen Standard-webhook HMAC covers the merchant/reference/original-reference,
PSP reference, event code, success and amount fields used by the existing parser.
It does not sign `paymentMethod`, `additionalData` or `eventDate`. Therefore:

- never choose card-versus-ACH readiness from webhook `paymentMethod`;
- never use `eventDate` for trusted aging, settlement or a waiting period;
- reported store remains unsigned defense in depth, as in the existing receiver;
- use signed `originalReference` to correlate modification/dispute events to the
  already-bound payment PSP reference;
- use an authenticated provider result to establish the actual method.

The provider-authenticated v72 Session-result endpoint returns authorised
payments with PSP reference, amount and `paymentMethod.type`. It is a static
result lookup requiring the browser-returned `sessionResult`; it is not a status
poller. The browser token remains untrusted until Adyen accepts it and the
response matches the exact persisted Session, attempt, money and allowed method.
Never log the full provider URL, `sessionResult`, API response or API key.
The adapter's `sessionId` input must be decrypted from the attempt's durable
stored Session response, never accepted from a browser field. The provider must
echo that ID, return coherent `status: completed`, exactly one payment with
`resultCode: Authorised`, and the exact attempt-derived merchant reference.
These checks prevent a valid same-amount Session/result pair from another
attempt from being rebound to this attempt. One deadline covers both the GET and
the complete streamed response body.

Primary references:

- [Session result API](https://docs.adyen.com/api-explorer/Checkout/latest/get/sessions/%28sessionId%29)
- [Standard webhook types](https://docs.adyen.com/development-resources/webhooks/webhook-types/)
- [Capture behavior](https://docs.adyen.com/online-payments/capture/)
- [Refund behavior](https://docs.adyen.com/online-payments/refund)
- [ACH Direct Debit](https://docs.adyen.com/payment-methods/ach-direct-debit/)
- [ACH chargebacks](https://docs.adyen.com/risk-management/chargeback-guidelines/ach-chargebacks)

## Accepted access and certificate policy

Course access and certificate financial clearance are separate gates.

- ACH course access: allowed after verified provider acceptance under the
  owner's accepted return-risk policy. This is provisional access based on
  authorization/acceptance, not settlement or irreversible funds.
- ACH certificate financial clearance: blocked until confirmed received-funds
  evidence exists. Authorization and capture alone do not satisfy it. All
  existing academic and explicit operator certificate gates still apply.
  The current pure gate accepts only an opaque host-branded value; its structural
  settlement-report fixture is not authentication. Actual certificate-clearance
  wiring stays disabled until a separately reviewed host-only report repository
  and admission boundary establishes provenance. No public JSON body may create
  this trusted value.
- Later ACH return/chargeback: remove financial clearance, block any pending
  certification and open an owned financial exception. Do not automatically
  revoke course access, recharge, refund, message the customer or issue/revoke a
  certificate.
- Card course access: preserve current timeliness only after verified
  authorization plus independently verified merchant automatic-capture
  configuration. Do not assume capture settings from the webhook. Automatic
  capture has no separate CAPTURE webhook by default.

No fulfillment or certificate action belongs in the event reducer. The reducer
produces evidence; separate governed adapters consume an explicit eligibility
decision later.

## Event model

Extend immutable facts and order-independent projection for:

- `pending` and `authorization` on the payment PSP reference;
- `capture`, `capture_failed`, `cancellation`, and `expire` linked by signed
  original payment reference and immutable child operation PSP reference;
- `refund`, `refund_failed`, and `refund_reversed` with amount-bearing child
  operations;
- `chargeback`/return and `chargeback_reversed` as separate dispute operations.

A successful CAPTURE means the request was valid/submitted and can still be
followed by CAPTURE_FAILED. A successful REFUND validation can still be followed
by REFUND_FAILED or REFUNDED_REVERSED. ACH AUTHORISATION is not real-time bank
finality; a later CHARGEBACK is durable return evidence. Conflicting amounts,
currencies, parent references, operation reuse, methods or multiple successful
payments remain sticky review exceptions rather than last-event-wins updates.

Customer-safe status remains minimized and can distinguish:
`awaiting_payment`, `payment_pending`, `confirming_payment`, `payment_failed`,
`payment_reversed`, `refund_pending`, `refunded`, and `needs_review`. It exposes
no PSP references, method details, return/refusal reasons or identities.

## Planned source and migration boundary

The first source-only sub-slice is the standalone
`adyen-session-result-adapter.ts`: fixed TEST endpoint, one bounded/deadlined
provider GET, no polling, and a minimized verified method/PSP/amount binding.
It performs no persistence, webhook, fulfillment or native provider call in
tests.

After refreshing all migration refs, reserve the next free migration for:

- encrypted durable Session-result lookup operation/receipt and retry evidence;
- authoritative payment-method binding by scope + attempt + payment PSP;
- child event-operation lineage by scope + operation PSP + original payment PSP
  + attempt;
- new bounded exception reasons for unknown/crossed parents, method conflicts
  and lifecycle conflicts.

Then update `payment-domain.ts`, `payment-checkout-evidence.ts`,
`payment-event-store.ts`, the authenticated controller/return command, TEST
runtime composition and focused contracts. Do not edit the current generic
webhook listener/parser until the exact event packet and shared-feed behavior
are separately reviewed.

## Required proof

- Provider-result fakes: card, ACH, wrong Session/PSP/money/currency/method,
  empty/multiple authorised payments, browser-token tamper, timeout, oversized
  response and retry after lost response.
- Reducer permutations: PENDING -> AUTHORISATION, CAPTURE -> CAPTURE_FAILED,
  REFUND -> REFUND_FAILED/REFUNDED_REVERSED, ACH CHARGEBACK, duplicate/reordered
  events and wrong/crossed original references.
- Security regression: mutate unsigned webhook `paymentMethod`, `additionalData`
  and `eventDate`; none may alter method classification, aging, settlement or
  eligibility.
- Disposable PostgreSQL: concurrency, immutable lineage, crash boundaries,
  rollback/reapply, status isolation, no non-admin grants and no cleanup residue.
- Eligibility: ACH acceptance can produce provisional course-access eligibility
  only under the accepted policy; certificate clearance stays false until
  received-funds evidence. A later return removes clearance/opens an exception
  without emitting an access, recharge, refund, message or certificate action.

Real TEST Session-result and event sequences follow reviewed fake/disposable
proof. No LIVE credentials, migration apply, customer/student data or production
activation is authorized by this design.
