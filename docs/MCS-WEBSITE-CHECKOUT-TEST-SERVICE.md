# English MCS Foundations card TEST service

Status: executable disposable composition under `NC-20260909-003`. It is not
mounted in the daemon, connected to a production database, configured with real
LIVE secrets, or authorized for a LIVE provider/payment/business action.

## Executable composition

`createWebsiteCheckoutTestService` returns one listener-ready Node HTTP handler.
It composes the existing reviewed
kernels rather than introducing another payment engine:

- signed `POST /internal/payments/sessions`, `/attempts`, `/returns`, `/status`;
- signed `POST /internal/payments/identity/resolve` and `/identity/status`;
- signed `POST /internal/payments/enrollment-admissions` for checkout evidence,
  encrypted attribution admission, canonical enrollment and promotion verifier;
- native `POST /hook/adyen-test-payments` through the existing HMAC-verified,
  durable Adyen event boundary. Exact plain-text `[accepted]` is returned only
  after durable admission; unconfigured ingress returns 503 before body read.
- default-off exact TEST Heartbeat membership delivery after canonical admission,
  using migration148's durable outbox and the registered bizmgr toolbox only.

The factory accepts only TEST/eu/full-store scope, exactly
`mcq-program-a-foundations:en-US`, `paymentMethodCapabilities:['card']` and
dispatch mode. It requires independently supplied request, response, payload,
identity, checkout-evidence and field-map pins. Secrets must be distinct. The
scope's `store` value is the Checkout Store Reference; it must not be replaced
with a Management API store ID.

`/returns` accepts the existing attempt capability and opaque browser
`sessionResult`. The browser never supplies Session ID, PSP or payment method.
Authenticated core success and error responses use
`tandem-payments-response-v1`; unauthenticated/malformed transport failures stay
unsigned. Session response/capability are private WordPress recovery state and
must not enter URLs or logs.

## Same-route admission and replay

The strict `/enrollment-admissions` command retains schema version 1 and adds a
required field in this composed service:

```json
{
  "attribution": {
    "snapshotId": "uuid",
    "snapshotSha256": "sha256",
    "snapshotJsonBase64": "canonical UTF-8 JSON bytes",
    "bindingReference": "attribution-binding:v1:{quoteId}",
    "bindingSha256": "sha256",
    "bindingJsonBase64": "canonical UTF-8 JSON bytes"
  }
}
```

The host checks canonical base64, exact byte hashes, strict nested schemas,
trusted field-map ID/hash, snapshot request fingerprint and all overlapping
snapshot -> binding -> attempt quote -> identity -> Terms/privacy fields. The
payment binding must use the exact attempt, the original signed Session business
operation, one-time payment, and null free-order fields. Invalid or poisoned
attribution rejects before immutable checkout evidence is created.

The attribution row is encrypted at rest and never returned. It contains no raw
tracker-session token, contacts, role proofs, card/bank fields, Session result,
capability or raw promotion code. Nullable/absence tracking remains explicit and
does not block checkout.

An exact immutable admission request/business operation may be retried with a
fresh transport nonce. Before native payment evidence, checkout/attribution
evidence remains stable and `enrollmentResult` is held. After authenticated card
method/result plus signed authorization, the same call returns accepted; later
replay returns duplicate with the same enrollment and promotion references.

The signed inner response is exactly:

```json
{
  "schemaVersion": 1,
  "status": "accepted",
  "checkoutAdmissionEvidence": {},
  "enrollmentResult": {},
  "promotionConsumptionReceipt": null
}
```

No-promo and regional-only discount produce a null promotion field. A slash
reference may contain at most one `promotion:` component; its stripped raw value
must match the host registry or admission fails before canonical enrollment. For
a configured promotion policy and a durably materialized card
enrollment, it is the reviewed stable
`promotion_consumption` object with caller, original Session operation, quote,
scope, attempt, policy, fixed `adyen_card_authorization_v1` evidence class and
canonical enrollment admission receipt. It is a verifier for WordPress to commit
its existing policy use, not a second coupon counter. Unlimited promotions may
legitimately have null `redemptionReference`; limited/restricted promotions bind
their non-null reservation through the immutable quote fingerprint.

## Storage and transaction boundary

Tentative local-only migration 156 adds one immutable admin-only
`payment_checkout_attribution_admissions` table with exact checkout/capability
foreign keys, unique attempt/snapshot/binding identities, encrypted canonical
snapshot/binding bytes and a reconstructable evidence reference. Empty
rollback/reapply passes; populated rollback refuses. The migration number is not
globally published or applied until root resolves shared namespace authority.

Checkout evidence and encrypted attribution use replay-safe transactions. The
canonical adapter independently requires the matching attribution row before its
existing disposable-only serializable enrollment transaction can write. A failure
between checkout and attribution leaves no enrollment and an exact retry completes
the missing stage without changing the immutable request.

## Evidence boundary

The disposable HTTP/PostgreSQL proof executes identity, card-only Session,
lost-response replay, held admission, authenticated return, signed webhook,
status, accepted/duplicate canonical enrollment and stable promotion receipt.
It asserts one attempt/operation/method/event/checkout/attribution/admission/order/
enrollment, one exact QA-only Heartbeat projection, encrypted private attribution, no response PSP
or role proof, wrong-method review hold, attribution tamper refusal and migration
rollback behavior.

The private TEST service and WordPress6.9.7 runtime created one native Session,
which expired without Pay or provider payment. Same-attempt status recovery kept
one operation and created no replacement. TEST webhook/admin authority, capture
proof, payment and membership outcome remain separate staging gates. Production
schema apply, LIVE routing/charge/refund, general access delivery, certificate
action, external attribution emission and customer communication remain forbidden.

The later anonymous public TEST profile reached a genuine Adyen 3DS challenge
and returned through the shared callback with HTTP 200. The intentionally
declined cardholder fixture produced one durable Session-result operation in
`conflict` with `method_verification_pending`; it created no verified method,
payment, enrollment, access or notice. This proves the native 3DS/return
transport only. It is not a successful authorization or positive method-binding
proof. The preserved refused evidence must not be rewritten when a separately
authorized positive TEST case runs.

That separately authorized positive native TEST case then completed logged-out
public USD 299 card checkout with the official Visa fixture, native 3DS and
public return HTTP 200. PostgreSQL readback contains exactly one verified
Session-result and one `card`/`session_result` method binding; the earlier
DECLINED conflict remains separately preserved. There are still zero webhook
events and zero enrollment admissions, so server state is truthfully
`confirming_payment` / `payment_evidence_pending`. This proves the real provider
and method-return boundary, not webhook, canonical enrollment, access, notice or
learner-login outcomes.

## Local staging runner

The explicit runner is:

```text
npm run checkout-test:serve -- --config /absolute/private/runtime.json
```

It accepts only an owner-mode-0600 config under `{root}/private/`, binds HTTPS to
`127.0.0.1:3443`, loads owner-only `localhost.key` plus non-writable
`localhost.crt`, and pins `http://localhost:3000`. The optional
`backend.checkoutProfile` defaults to `protected_preview`, preserving return
path `/checkout/preview/return/`. The dedicated `public_anonymous` QA profile
uses `/checkout/mcs-foundations/return/` while preserving the same TEST caller,
signed private routes and existing TEST records. NanoClaw serves no browser page
and performs no guest/staff redirect; the WordPress public controller owns that
boundary. It requires caller `tandem-wordpress-test`, request
key ID `wordpress-request-v1`, response key ID `nanoclaw-response-v1`, quote
authority `tandem-wordpress-commerce-v1`, exact TEST company/merchant/Checkout
Store Reference, current Terms/Privacy version+content hashes and the explicit
promotion-policy list. Card-capture readback may be null during Session/return
staging; canonical enrollment then remains held with
`card_capture_configuration_unverified`.
Management `storeId` is parsed only as required source context and is never used
as Checkout `store`.

The runner derives separate payload/identity/checkout keys from the private
encryption root using fixed HKDF labels, connects only to PostgreSQL 16+ over
`/tmp`, creates a random `nc_student_enrollment_store_{32hex}` database, applies
the exact local migration chain and starts the composed handler with bounded
connection/header/request/keep-alive settings. A mode-0600 private manifest pins
that exact name, initialization state and a secret-digest-only configuration
receipt. SIGINT/SIGTERM closes HTTPS/pool while preserving the database, and a
restart verifies database owner/schema lineage before reusing it. Only explicit
`npm run checkout-test:serve -- --cleanup --config ...` drops the manifest-pinned
fixture, and cleanup refuses any active connection or wrong owner. Its only
stdout is a READY/CLEANED line with localhost port and generated database name;
no config, secret, request, capability,
Session/provider body or customer value is logged.

For anonymous native form QA, the only backend fixture delta is:

```json
{
  "backend": {
    "checkoutProfile": "public_anonymous"
  }
}
```

That field is added to the existing complete owner-only fixture; it is not a
standalone config. Changing it does not authorize ordinary startup to rewrite
the existing manifest. After a coordinated stop, switch the exact manifest
binding first:

```text
npm run checkout-test:serve -- --switch-profile protected_preview public_anonymous --config <APPROVED_ABSOLUTE_PRIVATE_CONFIG_PATH>
```

The switch performs no database connection or write. It requires a ready
manifest whose digest exactly matches the same full config under the prior
profile (including the legacy pre-profile protected hash), creates an exclusive
owner-only backup, and updates only the manifest's config digest. Unknown
mismatch is refused unchanged. Ordinary startup now refuses every manifest/
config mismatch. Launch then uses the same `checkout-test:serve -- --config`
command above. The profile does not enable Heartbeat delivery, synthesize
payment evidence, replace the TEST caller, reset the disposable database, or
create a second service contract.
Every startup/config/cleanup failure is caught at the CLI and emits only fixed
`ERROR website-checkout-test code=startup_failed`; exception text, config path,
JSON parse context and database/driver detail never reach stdout/stderr.

The runner permits only one explicit native-ingress-disabled state:
`webhookConfigured:false` with no HMAC field. Sessions, return verification and
status remain available. With no event row, status uses the same existing
`projectCheckoutPaymentEvidence({attempt,facts:[]})` policy as the configured
event store and truthfully returns `awaiting_payment`; it does not invent payment
evidence. The native route fails closed as
`payment_webhook_unconfigured`; no synthetic HMAC or authorization is created.
Configured ingress requires the real key. The runner also refuses an inconsistent
flag/key pair, absent company scope, unknown caller/key IDs, missing policy hashes
or malformed non-null TEST capture evidence. It must not substitute LIVE/fixture
hashes or synthetic authorization. Root operates it only after adding the exact
private staging values. Migration156 remains local-only and must not be published
or applied to a shared/production namespace without root's separate authority.

TEST attribution uses a code-owned profile registry, never caller-supplied map
bytes. Existing configs default to `legacy_v1`, whose digest intentionally
remains identical to the pre-profile manifest contract. The English public-card
profile pins ID `checkout-attribution-fields-en-mcs-card-v2` and SHA-256
`0d7fbf7d6c3b548e7ba6cf3249418e50f14fb315d1dfee5cc597a4c748a8456e`.
Only `backend.attributionProfile` is configured; the pair cannot be overridden
in private JSON.

After a coordinated stop and separately approved private-config edit, switch
the ready manifest explicitly:

```text
npm run checkout-test:serve -- --switch-attribution-profile legacy_v1 english_mcs_card_v2 --config <APPROVED_ABSOLUTE_PRIVATE_CONFIG_PATH>
```

The switch verifies the exact full prior configuration hash (including current
checkout profile), creates an exclusive backup named with that source hash, and
rewrites only the manifest hash. It opens no database and changes no accepted
attribution row. An unknown source mismatch is refused unchanged. New admissions
must match the active pin; accepted immutable v1 attribution remains readable by
enrollment/fulfillment without relabeling or re-encryption.

The optional `backend.heartbeatAccess` block is default-off. Its enabled form is
literal-pinned to the owner-approved QA email, existing Heartbeat user, English MCS
group/course/cohort and `main` workspace. See
`docs/MCS-WEBSITE-CHECKOUT-HEARTBEAT-TEST-DELIVERY.md`. Membership delivery still
requires canonical payment admission; it does not convert the current
AUTHORISATION-only happy-path proof into refund/reversal lifecycle readiness.

## Final isolated TEST acceptance — 2026-09-11

The preceding checkpoints are historical. The preserved TEST fixture is now
running the reviewed current source and frozen browser artifact with migration159,
the exact 11-event card lifecycle, authenticated native HMAC ingress, immediate-
capture configuration evidence, `public_anonymous`, the English MCS card v2
attribution map, September 11 Terms and the exact QA-only Heartbeat driver.
This is an isolated TEST deployment; LIVE remains default-off and unconfigured.

The final fresh native checkout completed the official Adyen TEST 3DS simulator
and durably produced exactly:

- one sequence-1 Session operation and one verified Session result, with no
  result conflict on the attempt;
- one `AUTHORISATION=true` event and one `card` method binding whose immutable
  `card_scope_webhook` source resolves to the same operation and sequence;
- one checkout admission and one encrypted attribution admission using
  `checkout-attribution-fields-en-mcs-card-v2`;
- Terms version `2026-09-11`, content SHA-256
  `91fcf0d0d083f17eaed708d63d141b3c78225557b7ee19b97eb7980c0359fd0b`;
- one canonical active enrollment, one included component entitlement and one
  verified Heartbeat projection.

The retained-v1 correction permits only an exact already-accepted encrypted
snapshot/binding replay before current field-map/document-policy enforcement.
A changed prior payload, new v1 attribution, or current-v2 attribution with old
Terms rejects. The matching-method correction reuses but never rewrites an
existing webhook-first binding only when scope, attempt, PSP, method, payment
operation and Session sequence all agree. Two earlier global Session-result
conflicts remain immutable.

Owner bizmgr CLI readback independently confirmed the exact QA user/email and
target group membership; the user's total group membership count remains 13.
One fresh status reload after the success left each newest-attempt operation,
result, event, binding, admission, enrollment and projection singular.

Review acceptance was staged rather than inferred from execution:

- combined corrections R1 `e765b90a-8dad-4ad9-a471-c26bea17037f`: 3
  Sonnet/high calls, 6 input, 45,338 cache-create, 41,267 cache-read, 17,870
  output, maximum context 46,878; found the cross-attempt DDL gap;
- corrected R2 `394c52d0-431f-44ba-ab81-bf03bb4eb6f4`: 3 calls, 6 input,
  39,389 cache-create, 28,317 cache-read, 24,900 output, maximum context 40,929;
  `NO MATERIAL FINDINGS`;
- native-defect review `139235e8-8b73-467b-9ebf-8c080c95d2e0`: 3 calls, 6
  input, 34,033 cache-create, 21,061 cache-read, 17,101 output, maximum context
  34,035; its conditional concurrency concern was closed by existing database
  uniqueness constraints, with no unresolved verified material finding.

After the two test-harness corrections, the payment/checkout suite is 433
passed, 8 skipped, 0 failed; typecheck and diff checks pass. The last broad
suite retained established unrelated and parallel-only failures and is not
reported as globally green.

This proves TEST result verification, authorization intake, method provenance,
canonical enrollment and exact group membership. It does not prove financial
settlement, customer receipt/welcome email delivery, learner login, course
visit/progress, certificate issuance or LIVE/production readiness. No LIVE
configuration, migration, provider charge or deployment is implied.
