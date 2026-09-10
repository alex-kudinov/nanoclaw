# Adyen TEST payment webhook

Status: source implemented; deployment and provider configuration pending

Task: `NC-20260909-003`

## Purpose and boundary

`POST /hook/adyen-test-payments` admits Adyen Standard payment notifications
into `business_v2.webhook_inbox`. It is a test-foundation receiver only. It does
not enroll a student, send a message, update accounting, refund, capture,
transfer, pay out, or invoke an agent.

The public endpoint remains the existing n8n/Cloudflare perimeter:

```text
Adyen TEST
  -> https://webhooks.tandemcoach.co/webhook/adyen-test-payments
  -> n8n raw JSON relay
  -> http://100.115.115.206:8088/hook/adyen-test-payments
  -> provider-native whole-batch HMAC and exact-merchant verification
  -> discard verified non-Tandem TEST references when explicitly enabled
  -> minimized business_v2.webhook_inbox row for Tandem references only
  -> 202 [accepted]
```

n8n must not acknowledge the provider until the NanoClaw receiver returns
success. Both successful and failed execution-data retention are disabled on
the workflow. The Standard
webhook HMAC survives JSON parsing and reserialization because it signs the
specified notification fields, not the raw request bytes.

## Admission contract

The host fails closed unless all of these are true:

- the environment field is TEST (`live` is false);
- every notification item has a valid SHA-256 HMAC from a configured current or
  previous hexadecimal key;
- `merchantAccountCode` matches the dedicated TEST configuration;
- the HMAC-signed `merchantReference` starts with `tandem-poc-tsv1-`, binding
  the event to Tandem's test-store integration identity;
- the reported `additionalData.store` matches `tandem_test_ecom_v1` as a
  defense-in-depth routing check (Adyen Standard HMAC does not sign this field,
  so it is not an independent authentication boundary; the provider webhook
  must still enable **Include Store**);
- `eventCode` is currently `AUTHORISATION` only; and
- the durable archive and terminal-state update both succeed.

The shared-feed filter is a separate TEST-only opt-in. Its default is off, so a
signed reference outside the Tandem prefix is rejected exactly as before. When
enabled, the receiver first parses every item's HMAC-signed fields and verifies
every HMAC and exact merchant across the complete batch. Only then may it
acknowledge and discard items whose signed `merchantReference` does not use the
Tandem prefix, including an empty signed reference. Those items produce no
archive row, identifier retention, log entry, agent dispatch, or downstream
payment-event write. Optional foreign metadata such as store, event date,
payment method, and reason is not parsed or retained.

Filtering never uses the unsigned reported store to decide ownership. Any item
with a Tandem-prefixed reference still has to pass the store, event-code, date,
and bounded optional-field checks above. A bad HMAC, wrong merchant, LIVE
envelope, or invalid Tandem item rejects the entire batch before any write. A
verified mixed batch archives only its valid Tandem items; a verified
foreign-only batch returns `202 [accepted]` with zero writes.

The deterministic event identity is
`pspReference:eventCode:success`. A retry reuses the existing inbox row.
Storage drops the HMAC, shopper fields, card details, and unrecognized
`additionalData`; it retains only provider references, event type/date/outcome,
amount/currency, payment-method label, bounded reason, and store.

## Host configuration

The local `.env` on the production Mac Mini needs:

```text
TANDEM_ADYEN_TEST_HMAC_KEYS=<current hex key>[,<previous hex key>]
TANDEM_ADYEN_TEST_MERCHANT_ACCOUNT=<exact TEST merchant account>
TANDEM_ADYEN_TEST_STORE_REFERENCE=tandem_test_ecom_v1
TANDEM_ADYEN_TEST_REFERENCE_PREFIX=tandem-poc-tsv1-
TANDEM_ADYEN_TEST_EVENT_CODES=AUTHORISATION
TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED=0
```

Set `TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED=1` only when this TEST webhook
must share an Adyen merchant feed with other platforms. Leave it `0` for a
dedicated Tandem feed. The setting accepts only `true`, `false`, `1`, or `0`.

Never put values in Git, review packets, logs, or task handoffs. The `/health`
response exposes only `adyenTestWebhook.configured`.

## Safe rollout

1. Build and deploy the reviewed NanoClaw source with the receiver unconfigured;
   verify `/health` reports `configured: false` and the route returns 503.
2. Import `setup/n8n/adyen-test-payments-workflow.json` inactive. Verify its
   public path and Mini target, no stored secret, no success-or-error execution
   retention, and response-after-relay behavior.
3. In Adyen TEST, create a Standard webhook for the public URL, JSON format,
   `AUTHORISATION`, HMAC, and Include Store. Store the generated HMAC key only in
   the private Peri and Mini configuration.
4. If and only if the TEST webhook is shared, set
   `TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED=1`. Restart the exact NanoClaw
   release and verify `/health` now reports
   `configured: true`.
5. Activate the n8n workflow and use Adyen's configuration test. A `202` proves
   the signed delivery reached the receiver. If Adyen uses a default/non-Tandem
   reference, verify that it produced zero inbox rows; that proves the discard
   path, not durable Tandem admission.
6. Create and complete a TEST Session from the accepted Tandem Components POC.
   Read back one `source='adyen-test-payment'` inbox row with status `handled`,
   the exact TEST merchant/store/Tandem reference, and no HMAC or shopper data.
   A browser result remains provisional; this owned inbox event is the receiver
   proof.

## Rollback

### Private first-key installation

`scripts/configure-adyen-test-webhook.py` is an operator-only first-install
helper, not a daemon dependency. Invoke its dry-run against the exact private
Peri or Mini env path first. Applied mode requires `--apply --confirm-host`
matching that host. The default reads without echo from a native TTY; explicit
`--key-stdin` accepts a bounded64-hex key from a non-TTY encrypted SSH pipe, with
at most one LF or CRLF terminator. Dry-run never consumes input in either mode.
Documented Studio/Mini SSH access removes any need for native Terminal UI control.
Only use the freshly copied, specifically authorized TEST key; reject missing
or malformed input rather than guessing or printing clipboard contents. Never put a
key in command arguments, chat, review files, or logs. It refuses existing
plural/legacy HMAC assignments rather than rotating a credential, preserves
unrelated bytes and matching quoted fixed settings, and creates a private
backup outside the repository before an atomic0600 update. A cooperative lock
and final re-read detect concurrent changes; keep other config editors stopped
during the operation. The helper does not restart or activate anything.

The helper is distributed as an exact-hash, tracked operator artifact separately
from the host runtime archive. Verify its source hash after transfer before use.
It adds only the HMAC key plus missing fixed TEST merchant/store/reference/event
settings and the explicitly approved shared-feed opt-in.

### Disable delivery

Deactivate the n8n workflow and the Adyen TEST webhook. The NanoClaw route then
has no public sender. If necessary, clear the TEST HMAC configuration and
restart; the route fails 503 while all prior inbox evidence remains intact.
