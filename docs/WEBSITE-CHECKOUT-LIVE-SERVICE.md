# Managed website checkout LIVE service

Status: dedicated English MCS LIVE canary service is deployed and active;
ordinary MCS product routing remains off.

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
<PINNED_NODE> <IMMUTABLE_RELEASE>/dist/website-checkout-live-entrypoint.js \
  --config <APPROVED_ABSOLUTE_PRIVATE_CONFIG_PATH>
```

Before start, the same compiled entrypoint accepts `--check-config` with the
absolute owner-only config. It validates the complete strict config and exact
publication artifact and emits only `VALID ... config=accepted`; it does not
open a database, listener, provider connection, Gmail or Heartbeat operation.
Both check and start first run the existing full compiled-artifact release
verifier. The rendered service plist must set
`NANOCLAW_REQUIRE_RELEASE_MANIFEST=1`, the exact full expected commit and a
release-matching `NANOCLAW_CODE_ROOT`; missing/mutated/unlisted artifacts, wrong
commit, wrong Node or mismatched root fail before config/DB/listener work.

The clean-release builder executes that compiled entrypoint's `--help` and
relative-config refusal paths before inventorying the archive, and packages the
exact forward/rollback migrations 146-165. The inert
`launchd/com.nanoclaw.website-checkout-live.plist` template contains only
unresolved node, immutable release, private config, non-release working
directory and log-root placeholders. It supplies no port, remote host, tunnel,
credential or activation value and cannot be installed as shipped. The normal
immutable NanoClaw release process remains authoritative; root must render and
validate a machine-local supervisor definition from separately approved values.

The separately authorized transport assignment is Mini
`127.0.0.1:3445` to VPS loopback `127.0.0.1:15680`. Both were unoccupied at
read-only preflight; existing TEST port 15679 remains separate. The inert
`com.nanoclaw.website-checkout-live-tunnel.plist` template pins only that reverse
forward, VPS SSH port 2225, strict host checking, fail-fast forward setup and
keepalives. Its identity path and working/log directories remain unresolved.
The Mini's existing approved identity was verified mode 0600 by an explicit
read-only handshake; no tunnel was opened.

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

## Payment observability

The optional Adyen-to-Chaos projection is source-only and default-off. It scans
committed checkout admission, attempt/Session, authorization, terminal-
nonpayment/review and canonical enrollment facts independently of the browser.
It never runs inside payment or webhook transactions. Its schema check,
transaction and retry loop are isolated so an absent table, route outage or
delivery failure cannot fail payment readiness, webhook acknowledgment or
fulfillment.

Tentative local migration 160 adds a separate admin-only minimized outbox and
append-only delivery receipts. Migration 117 cannot be reused because its
schema is restricted to Stripe `pi_` purchases/refunds and retains provider
identifiers. Migration 160 stores an internal attempt foreign key, scope and
deterministic evidence hashes, bounded action/outcome/reason/sequence fields,
lease/retry state and HTTP/error categories. It stores no email, name, card,
Session result, return binding, provider Session/PSP/reference, signature,
request/response body or Chaos credential. Populated rollback refuses.

Projection is restricted to the exact LIVE scope, accepted
`tandem-wordpress-live` checkout plus attribution admission and English MCS
offer. Other products sharing a merchant/store scope cannot be labeled as MCS.
Owned exceptions project only when their attempt resolves inside that exact
population; unmatched hints remain in the payment exception ledger and do not
starve valid candidates.

External delivery requires the immutable attribution snapshot to say tracking
consent was granted. Denied or unknown consent remains operationally visible
in the authoritative payment ledgers but cannot reach Chaos. Immediately before
delivery, the worker resolves the current canonical payer Party (also for a
gift) and derives only Chaos's exact lowercase-email `chaos-person-v1` HMAC;
email is transient and is never stored, sent or logged. The Chaos webhook token
and identity-HMAC secret are separate purposes.

Attempts, Session/retry transitions and failures/review map to
`checkout_started`. `purchase_completed` requires both a verified HMAC
authorization and canonical enrollment admission and still declares settlement
unproven. There is no refund, settlement, notice, access or learner-login claim.
Delivery claims one row at a time under a two-minute lease, bounds each request
to ten seconds, rejects redirects, accepts only Chaos `recorded|duplicate`, and
records bounded retry/dead-letter receipts without raw error text.

Activation requires an applied/read-back migration 160, schema contract
`nanoclaw-v2:148,149-162` or its exact migration163-164 descendants, the exact HTTPS Chaos lifecycle endpoint and distinct
secrets in an owner-only LIVE config. Omission resolves to disabled. TEST has no
external-emission path; fixture transports and generated disposable databases
are the only TEST evidence in this source boundary.

## Deployment gates still outside this source

- approved exact database/host/port and encrypted proxy configuration;
- migrations 148 and 149-165 applied and read back through the established
  release procedure; startup never applies them;
- private LIVE keys, company/merchant/store and provider webhook settings;
- accepted publication and Heartbeat activation receipts;
- accepted customer-notice sender and activation receipt;
- separately authorized inert deployment, then LIVE canary and genuine learner
  login/access proof.

Build, tests, listener receipt, provider acceptance, deployment, membership
readback and learner outcome remain distinct evidence.

## Owner-directed pre-payment replacement

The source implementation now stops materializing or deduplicating
Party/identity, order and enrollment state before Adyen confirms payment. The
replacement contract is deliberately small:

1. validate the editable browser form, email and promotion;
2. store one temporary encrypted submitted-form snapshot and create one Adyen
   Session from the server-owned price;
3. treat every deliberate submission as a new purchase even when all fields
   match a prior order;
4. use idempotency only for replay of that exact submission or provider event;
5. on confirmed payment, materialize people/order/documents/enrollment and
   deliver access;
6. on terminal unconfirmed payment, purge the temporary PII and return to the
   editable form; on pending/ambiguous payment, retain it only until provider
   resolution and do not invite another payment.

Migration165 stores the submitted contact/business form only in an encrypted,
deletable payload. Its purchase-scoped references bind the immutable payment
attempt without pretending a Party already exists. Exact eligible card evidence
causes the enrollment transaction to create new purchase-scoped Parties,
record an immutable materialization receipt, delete the temporary payload, and
continue into order, documents, enrollment, access and notices. A repeated
identical email is a distinct deliberate purchase; only replay of the same
attempt is idempotent. Terminal refused/failed payment purges the payload.
Pending or ambiguous payment retains it until provider resolution and cannot
start a second payment.

The browser no longer calls a separate pre-submit status endpoint before
submitting a valid card to the accepted Adyen Session, and it no longer offers
same-order successor Sessions after failure. Terminal nonpayment returns to the
editable form for a new deliberate submission. Unfinished pre-payment setup is
discarded automatically instead of exposing draft/re-entry language. This is
deployed in immutable backend `60e1ff16` with migration165 and Tandemweb
checkout implementation `e4ada3df9`, currently served in descendant
`08c466778`. Health/ready, zero-row schema baseline, rendered direct-checkout
UI, clean console and main-page Stripe routing are verified. A synthetic
no-card submission opened the $299 Adyen form with one encrypted submission and
zero materialized Party/interactions; no card data/payment was entered, and the
exact synthetic temporary PII was deleted with final counts back at zero. The
next natural purchase remains end-to-end outcome proof.

## Confirmation and billing preparation

Capability-protected status can now return a minimized purchase summary only
from one conflict-free durable authorization projection. It contains the exact
offer, quote amount/currency, server-recorded timestamp and a SHA-derived Tandem
reference; it never exposes the PSP reference. Information presents independent
gift and business-invoice checkboxes. One Additional details page appears only
when either is selected, contains only the selected sections, and is otherwise
skipped; Payment and Confirmation numbering follows the active path.

The authenticated successful Session return includes that same minimized
summary immediately. This lets the browser activate Confirmation and present
the existing receipt and paid-invoice actions without waiting for a later status
poll. Review and terminal-nonpayment returns never receive the summary.
The correction is live in immutable backend `d1704c30`; health/readiness and
the original authorized attempt's recovered Confirmation view are verified
without replaying payment or generating a document.

Optional company, invoice-email, address and tax/VAT details are normalized in
WordPress, bound into the exact signed identity request and stored only as an
encrypted payload with a digest under migration161. They are not provider
metadata and are not emitted to Adyen in this slice.

## Receipt and paid-invoice document self-service

Migrations163-164 and `payment-checkout-documents.ts` provide the document
boundary. One successful English MCS payment under the exact immediate
automatic-capture policy can own one immutable receipt and one immutable paid-
invoice version. The v2 canonical snapshot binds the server quote, discount
arithmetic, factual USD0 tax amount, successful provider event/capture mode,
derived Tandem reference, payer, optional pre-payment billing profile, seven-
year purge date and exact Terms/Privacy versions. Snapshot JSON and the polished
Tandem-logo PDF bytes are encrypted under separate purpose keys; no card number
is stored.

Receipt generation is enabled for the consumer path. Paid-invoice generation
remains disabled by default and cannot allocate a number unless a private
activation hash exactly binds the owner-approved seller/address, omitted seller
EIN, annual `TCA-YYYY-######` sequence, immediate-capture evidence, USD0 tax
policy with no printed legal classification, seven-year retention and
replacement-or-credit-note correction semantics. Missing business billing
details remain a separate refusal. Existing documents are returned byte-for-
byte; no replay mutates payment evidence or consumes another invoice number.

Downloads require both the original checkout status capability and a fresh
attempt/document-bound opaque capability that expires within fifteen minutes.
Capabilities and customer/tax data never enter a URL. WordPress verifies the
signed host response, PDF framing and digest before creating a local browser
download.

Email actions create one recipient-hash-bound job per document, reconcile Gmail
Sent before any retry, attach the exact stored PDF, and require message/thread,
recipient, sender, subject, filename and attachment-digest readback. A lost or
ambiguous acknowledgement becomes an immutable hold and is never blindly
resent. Migration164 adds ordered legal-hold events and a daily bounded
retention sweep. At seven years, the worker verifies and permanently removes
any exact retained Gmail attachment, deletes encrypted customer/snapshot/PDF/
recipient rows and capabilities, and leaves only an immutable non-customer
tombstone containing document identity, date, amount, currency and hashes. A
current legal hold blocks purge, and the tombstone prevents regeneration.

Backend immutable `d160195d` with migration164 and tandemweb `f439cece6` are
deployed. The private activation hash binds the approved seller, capture, tax,
retention and correction policy; paid invoice generation is enabled, while no
document or sequence row exists until an eligible business-invoice purchase
requests the artifact. Desktop/mobile nonfinancial browser verification passed.
No real payment, document, invoice number or email was created; natural post-
payment proof remains owner-operated and ordinary MCS traffic remains Stripe.
