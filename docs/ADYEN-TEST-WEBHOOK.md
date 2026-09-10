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
  -> provider-native HMAC and exact allowlists
  -> minimized business_v2.webhook_inbox row
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
```

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
4. Restart the exact NanoClaw release and verify `/health` now reports
   `configured: true`.
5. Activate the n8n workflow and use Adyen's configuration test. Read back one
   `source='adyen-test-payment'` inbox row with status `handled`, the exact TEST
   merchant/store/reference, and no HMAC or shopper data.
6. Create a TEST Session from the accepted Tandem Components POC. A browser
   result remains provisional; the inbox event is the receiver proof.

## Rollback

Deactivate the n8n workflow and the Adyen TEST webhook. The NanoClaw route then
has no public sender. If necessary, clear the TEST HMAC configuration and
restart; the route fails 503 while all prior inbox evidence remains intact.
