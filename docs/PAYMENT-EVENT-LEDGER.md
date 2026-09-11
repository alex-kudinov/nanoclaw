# TEST payment event ledger — NC-20260909-003

Status: source/disposable only; migration151 is not applied to production and
the class is not daemon/public wired. No settlement, access or financial action.

`PaymentEventStore.recordWebhook` is the only event-write entrypoint. It calls
the reviewed Adyen TEST HMAC parser for the entire batch before any write,
requires the exact signed integration reference prefix and UUID, and accepts
AUTHORISATION only. Signed merchant/reference are primary identity; reported
store remains unsigned defense in depth. No HMAC key/signature, shopper data,
free-text reason or event date enters persisted facts. Event date is not signed
and does not determine ordering. HMAC keys are in a private class field.

One checkout Session can contain failed retries and a successful provider payment.
Scope + PSP reference binds each distinct payment immutably to one checkout.
The existing payment reducer runs separately for each PSP, followed by a checkout
projection. Refused siblings cannot erase a later success. Contradictory facts
for the same PSP, multiple successful payment exposures, changed delivery payload,
wrong amount/scope or crossed reference claims hold for review. This first full-
amount card pilot does not support split tenders/partial authorizations; it never
issues an automatic refund or grants access to resolve ambiguity.

Four admin-only tables retain provider-reference bindings, minimized immutable
events, append-only exceptions and a versioned evidence projection. The event
FK includes scope, PSP and checkout identity. A reference lock followed by UUID-
ordered checkout locks prevents crossed-reference transactions from deadlocking.
Each event/exception and projection update commits together; duplicate deliveries
do not advance the projection version. Conflicts are sticky until a separate
reviewed resolution process exists. A TEST event naming a LIVE/foreign-scope
checkout may create a TEST exception hint, but cannot mutate that checkout or
its projection. Unknown references never create an order from a webhook.

Evidence is bounded at 100 distinct events per checkout; excess produces a
durable review exception. Reads are internal only and scope-checked; the public
handler must validate the guest capability and return only an appropriate
minimal state, never this full evidence object. `authorization_recorded` is not
`paid`, `settled`, or fulfillment eligibility. The final readiness policy, financial
obligation and source-admission gates remain mandatory before delivery.

Tests cover 25-way deduplication, failed/successful PSP ordering, same-PSP
contradiction, multiple successes, changed payloads, unknown/wrong-scope targets,
crossed-reference concurrency, HMAC tampering/key rotation, money/currency mismatch,
commit failure, evidence bound, immutability/grants and guarded rollback/reapply.
Fixtures create only generated local `nc_payment_event_disposable_*` databases,
drain their connections and drop without FORCE. No provider calls or live data.

The distinct-payment model follows the v72 Session result's payments array and
the documented per-attempt webhook behavior:
- https://docs.adyen.com/api-explorer/Checkout/72/get/sessions/(sessionId)
- https://docs.adyen.com/standard/integration/hosted-checkout
