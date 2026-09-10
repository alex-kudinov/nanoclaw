# NC-20260909-003 bounded security review — response R1

Reviewed: `src/adyen-webhook.ts`, `src/adyen-webhook.test.ts`,
`src/webhook-server.ts`, `src/webhook-server.test.ts`, `src/config.ts`,
`src/index.ts`, `setup/n8n/adyen-test-payments-workflow.json`,
`docs/ADYEN-TEST-WEBHOOK.md`.

## Finding 1 — `additionalData.store` is not covered by the Standard HMAC and is admitted as if it were authenticated

**Consequence:** wrong-tenant admission. A validly-signed AUTHORISATION
notification for one store can be admitted as `tandem_test_ecom_v1` by
anyone able to alter the request body in transit between Adyen and the
receiver, without knowing the HMAC key.

**Evidence:**

- `src/adyen-webhook.ts:129-140` — `standardWebhookSigningPayload` signs
  exactly `[pspReference, originalReference, merchantAccountCode,
  merchantReference, amount.value, amount.currency, eventCode, success]`.
  `additionalData` (and therefore `store`) is not part of the signed
  payload — this matches Adyen's own Standard-notification HMAC spec, so
  the signature genuinely provides no integrity guarantee over `store`.
- `src/adyen-webhook.ts:156-174` (`verifyStandardWebhookHmac`) verifies
  only those eight signed fields. It returns `true` for an item regardless
  of what `additionalData.store` contains.
- `src/adyen-webhook.ts:209-223` runs `verifyStandardWebhookHmac` first,
  then checks `item.additionalData.store !== config.storeReference` at
  line 215 as if it were an authenticated allowlist check.

**Demonstrable exploit path:** take any validly-signed TEST notification
(from any store under the same merchant account, or one replayed/relayed
with a tampered body by a compromised or misconfigured n8n/Cloudflare hop),
overwrite `additionalData.store` to `tandem_test_ecom_v1` before it reaches
the receiver. The signature still verifies (line 209) because `store` was
never part of what was signed, and the store check at line 215 now passes.
`merchantAccountCode` and `merchantReference` *are* signed and remain a
real tenant boundary, but the review's admission contract
(`docs/ADYEN-TEST-WEBHOOK.md:39`) lists `store` alongside them as an
independently-verified field, which overstates what the code actually
enforces.

**Correction:** stop treating `additionalData.store` as a security
boundary. Either (a) confirm operationally that the dedicated TEST merchant
account has exactly one store, so the field can never legitimately differ,
and update `docs/ADYEN-TEST-WEBHOOK.md`'s admission contract to say the
store check is informational/defense-in-depth only, not authenticated; or
(b) drop the store check from the admission path entirely and rely on the
signed `merchantAccountCode` + `merchantReference` prefix as the actual
tenant/environment boundary. Do not describe the store check as
"independently verified" alongside HMAC/merchant/reference/event in
documentation or acceptance criteria — it is not equivalent.

## Finding 2 — n8n retains full webhook payloads (HMAC + notification body) on error executions

**Consequence:** leak of HMAC signature and notification data (the
review's own leakage criterion) into a third-party workflow tool's storage,
on any failure path — not just success.

**Evidence:**

- `setup/n8n/adyen-test-payments-workflow.json:95` sets
  `"saveDataErrorExecution": "all"`, while
  `setup/n8n/adyen-test-payments-workflow.json:96` sets
  `"saveDataSuccessExecution": "none"`.
- `docs/ADYEN-TEST-WEBHOOK.md:27` claims "Successful execution data is
  disabled on the workflow" — true, but silent on error executions, which
  remain fully retained.
- No node in the workflow (`setup/n8n/adyen-test-payments-workflow.json`)
  redacts or strips the payload before the HTTP Request node relays it, so
  whatever n8n retains on error is the raw Adyen body, including
  `additionalData.hmacSignature` and any other `additionalData` content
  Adyen includes.

Any non-2xx response from the receiver (invalid HMAC probe, wrong
merchant/store/reference/event, a malformed body, or simply the Mini being
unreachable/timing out) causes the HTTP Request node to fail, and n8n
persists that execution — including the full incoming payload — indefinitely
per its retention settings. This is reachable by unauthenticated requests to
the public n8n path, since a bad HMAC or malformed body is exactly what
triggers the error branch.

**Correction:** set `saveDataErrorExecution` to `"none"` to match the
success setting, or if error diagnostics are required, capture only
non-sensitive metadata (timestamp, HTTP status) rather than full execution
data. Update `docs/ADYEN-TEST-WEBHOOK.md`'s claim to describe both success
and error retention settings, since only one is currently addressed.
