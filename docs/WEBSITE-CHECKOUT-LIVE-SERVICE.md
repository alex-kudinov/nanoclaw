# Managed website checkout LIVE service

Status: source-ready candidate; default off; not configured or deployed

This is the production-shaped host composition for the private signed website
checkout API. It preserves the existing private route and response contract and
admits only `tandem-wordpress-live`, Adyen LIVE, English
`mcq-program-a-foundations:en-US`, and card. The public browser never connects
to this listener and never receives request HMAC material, provider recovery
capabilities, or private status data.

## Host and transport contract

- The process binds only `127.0.0.1` on an explicitly configured non-privileged
  port. There is no default port and no wildcard/interface override.
- It serves HTTP locally. The established trusted reverse proxy and encrypted
  cross-host transport own TLS. The listener must never be exposed as remote
  plaintext.
- WordPress still uses its verified HTTPS public origin and is the sole private
  signed caller.
- `/health` is shallow and returns only service liveness. `/ready` rechecks the
  configured database identity, `nanoclaw_admin` role, required relations, and
  critical 148/154/156 columns. Neither route returns customer, financial,
  credential, host, database, or provider details.
- `SIGINT` and `SIGTERM` stop acceptance, close idle connections, allow active
  requests up to ten seconds, then close remaining connections and the pool.
  Restart opens the same explicitly configured database and never creates,
  migrates, cleans, or drops it.

The executable is:

```text
npm run checkout-live:serve -- --config <APPROVED_ABSOLUTE_PRIVATE_CONFIG_PATH>
```

The normal immutable NanoClaw release/supervisor process remains authoritative.
An inert supervisor entry may use that command only after substituting the
approved release path, private config path, host transport, and port. This
source does not name or install any of those deployment values.

## Private configuration and activation

The private JSON file must be an absolute owner-only `0600` file with
`schemaVersion: 1`, `mode: live`, and purpose
`website-checkout-live-v1`. It requires explicit listener, database,
merchant/store/company, provider endpoint prefix, HTTPS WordPress origin,
return path, terms/privacy hashes, attribution map, capture-policy evidence and
independent key purposes. Request, response, payload-root and webhook keys must
be distinct. TEST callers, TEST key IDs, localhost public origins, URLs in the
endpoint-prefix field, partial webhook event lists, and another offer/locale are
not representable by this composition. Provider-issued endpoint-prefix case is
normalized to the canonical lowercase Adyen DNS label.

Encrypted attribution admission proves only the signed WordPress handoff. LIVE
config explicitly reports external attribution emission as disabled; it does
not claim acquisition or conversion-platform parity. TEST external emitters
remain off. Any later emitter requires its own owner, consent decision,
idempotency/readback and activation evidence.

The shipped publication is
`facts/generated/student-foundations-publication-live-v1.candidate.json`. It
contains only the English route and the natively verified Heartbeat
group/course/cohort mapping. It deliberately says
`runtime_consumer_enabled: false`; it is not an activated publication.

An inert configuration keeps `serviceEnabled`, `recoverExisting`, and
`newAttemptsEnabled` false and may omit the publication activation receipt.
Starting it fails before opening a database or listener. A runnable dark service
requires both `serviceEnabled` and `recoverExisting`, plus a separately accepted
versioned publication receipt whose digest binds the exact publication ID,
revision, payload hash, English offer/locale, caller, decision reference, and
approval time. New attempts additionally require configured and separately
activated Heartbeat access delivery and the concrete Gmail-backed
receipt/welcome owner. Missing owners make the private
configuration invalid before a database or listener opens; a flag alone cannot
take LIVE money into deliberately held fulfillment. Rollback sets only
`newAttemptsEnabled` false and retains status, returns, original-provider
recovery and LIVE webhook intake.

Tentative local migration 157 closes the browser-return dependency in migrations
152/155. A successful HMAC-admitted AUTHORISATION may bind `card` only when the
attempt's immutable capability set is exactly card-only. Exact-one-source
constraints bind either the prior Session-result operation or the new payment
event; unsigned browser and webhook method text remain unused. The public TEST
profile proves card enrollment with no Session-result operation. Migration 157
is uncommitted, unapplied outside disposable PostgreSQL, and requires the normal
separate production migration authority/readback before LIVE configuration.

Heartbeat access is independently default-off. Enabling it requires its own
accepted activation decision receipt binding the pinned English group, course
and cohort. Publication activation does not activate provider writes.

## Enrollment and access behavior

The service reuses the canonical payment, identity, checkout-admission,
attribution, enrollment, promotion and student-projection stores; it does not
create a second ledger. Native webhook handling ends after durable payment-fact
intake and acknowledgment; it never waits for Heartbeat or mail. A managed
restart-safe fulfillment scanner selects only signed checkout+attribution
admissions with durable payment evidence, then idempotently re-evaluates
canonical enrollment, access and the configured receipt/welcome owner. Browser
closure and absence of a later status call therefore do not lose fulfillment.

Immediately before every Heartbeat read or write, the
driver re-reads the exact active canonical enrollment, included English
component, participant Party/email, payment scope, card method and current
payment-readiness projection. Adverse or no-longer-eligible payment evidence
holds access for operator review. It never revokes existing access and never
issues a certificate.

For an exact existing email the driver preserves the user identity, role and
all other groups, adding only group
`4c54983c-0e7b-4dd0-aebc-0f0cb1c82298` when absent. Only when exact email lookup
returns no user does it create a `User`, suppress the introduction thread via
the registered Toolbox default, and include that one group. Lost acknowledgments
and retries use the existing projection idempotency key, lease,
uncertain-acceptance hold, provider operation receipt and exact user/membership
readback. Membership verification remains distinct from learner login, lesson
access, progress, completion and certification proof.

If adverse payment evidence arrives after enrollment/access, the driver performs
no new grant and no revoke. It writes one version-keyed, idempotent canonical
enrollment exception owned by Finance for operator review. If adverse evidence
arrives before enrollment, the canonical payment projection stays
`needs_review`; enrollment, access and receipt/welcome remain held.

## Receipt and welcome owner

The enrollment adapter's `accepted_pending_receipt` value is a funding/payment
receipt state. It is not a customer email obligation and must not be used as
proof that a payer notice or learner welcome was sent. Existing cryptographic
admission/response receipts are also not email receipts.

Tentative local migration 158 and `website-checkout-customer-notices.ts` provide
the single durable customer-notice owner. It independently re-reads canonical
payment/order/seat/Party/access authority, creates self-purchase or separate
payer/learner jobs, leases each exact notice, reuses the canonical Gmail client
plus external-write guard, searches Sent before retry, and requires exact
message/thread/envelope readback. The full service passes the stable root
idempotency key `website_checkout_receipt_welcome:{attemptId}` and the
restart-safe scanner invokes the owner without browser dependence.

The owner remains default-off. New LIVE Sessions require its exact sender,
course URL, decision and activation receipt plus the Heartbeat/publication/
payment gates. No raw SMTP path exists, and no message, Gmail lookup, provider
configuration or production notice row was created while preparing this source.

## Deployment gates still outside this source

- approved exact database/host/port and encrypted proxy configuration;
- migrations 148 and 149-159 applied and read back through the established
  release procedure; startup never applies them;
- private LIVE keys, company/merchant/store and provider webhook settings;
- accepted publication and Heartbeat activation receipts;
- accepted customer-notice sender and activation receipt;
- separately authorized inert deployment, then LIVE canary and genuine learner
  login/access proof.

Build, tests, listener receipt, provider acceptance, deployment, membership
readback and learner outcome remain distinct evidence.
