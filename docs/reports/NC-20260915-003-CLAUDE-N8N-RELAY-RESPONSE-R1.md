# NC-20260915-003 bounded n8n identity-relay review — response R1

## Material findings, ordered by consequence

1. **Byte bound is enforced after n8n has already received the full body — inherent to any webhook-node design, not a defect, but not source-provable.** The Transport Admission code node checks the *declared* `Content-Length` header and the *re-serialized* JSON size, and correctly stops a `forward` route from reaching the private `Relay to Company OS` node for any oversized, missing-length, chunked, or non-JSON request (confirmed in `tandem-identity-binding-workflow.json` and exercised by `login-tools-n8n-contract.test.ts`). But the n8n Webhook trigger node itself has no `options` limiting request body size (`"options": {}`), so an honestly-declared oversized body (or one with a false small `Content-Length` followed by a larger stream, if the underlying HTTP server buffers before validating) is still received and parsed by n8n before the Code node runs. This means the control reliably keeps oversized/indeterminate input from reaching the **private** hop, but does not reliably keep it from reaching **n8n's own memory/process**. This exact gap is already named in `IDENTITY-LOGIN-TOOLS-N8N-CHECKPOINT.md` ("If this cannot be proved using the live n8n envelope, move the byte bound to the existing VPS edge rather than approximating it") — it is a correctly identified open item, not a newly discovered one, and the checkpoint already gates activation on live proof.

2. **Test suite does not assert the rejection path is bearer-silent.** `login-tools-n8n-contract.test.ts`'s credential-leak assertion (`JSON.stringify(workflow)` not matching `/credentials|api_key|...` ) only inspects static workflow JSON, not node output shape. Reading `Return Transport Rejection`'s parameters directly confirms it only ever references `$json.responseBody` / `$json.statusCode` — the reject() branches in the Code node never populate `authorization` on the reject object — so no leak exists in source. But no test pins this invariant, so a future edit that added `authorization` to the reject payload would not fail CI. Low severity, non-blocking, recommend a follow-up assertion.

3. **Retention proof remains a canary claim, not a source claim**, exactly as the checkpoint states. `saveDataErrorExecution/saveDataSuccessExecution: 'none'`, `saveManualExecutions: false`, `saveExecutionProgress: false`, and no `errorWorkflow` key are the correct, strongest available workflow-level settings and are test-locked. Whether the live n8n `2.9.4` instance, its host logs, or the Cloudflare/LiteSpeed edge in front of it independently record the bearer cannot be determined from any of the reviewed source. This is unchanged from the checkpoint's own required pre-activation sentinel step — I did not find anything in source that would make that canary unnecessary or insufficient as designed.

No other material defects found. Specifically checked and clean:

- **n8n cannot choose Party/entitlement/target/token policy:** the HTTP Request node's `url` is a literal string (`http://100.115.115.206:8088/identity/v1/binding`), not caller- or code-derived; `LoginToolsGatewayRequestSchema` (`login-tools-gateway.ts`) accepts no Party/entitlement field, and Party is resolved server-side against `input.policy.pilotPartyId`.
- **SSRF/data-leakage:** URL, method, and 2s timeout are fixed; `fullResponse`+`neverError` output (`body`,`statusCode`) is forwarded as-is to the caller with no additional fields exposed.
- **Audience consistency / no TOFU:** `TANDEM_IDENTITY_GATEWAY_AUDIENCE` in NanoClaw `config.ts` (`https://webhooks.tandemcoach.co/webhook/tandem-identity-binding-v1`) matches the n8n webhook's implied public URL (`/webhook/tandem-identity-binding-v1`) and matches the exact string `COMPANY_OS_IDENTITY_GATEWAY_URL`/`AUDIENCE` pair asserted together in Tandem Identity's `tests/config.test.ts`. `GoogleServiceCallerVerifier` (`login-tools-gateway.ts`) checks `iss`, `aud`, `email`, `email_verified`, and `sub` against constants hardcoded in `config.ts` (`TANDEM_IDENTITY_GATEWAY_CALLER_EMAIL`/`_SUBJECT`) — no value is learned or cached from a first response, so no trust-on-first-use path exists.
- **Admission ordering:** transfer-encoding/missing length → 411, malformed length → 400, oversized declared → 413, non-JSON content-type → 415, unparsable body → 400, oversized reserialized → 413 — all correctly precede the `Admitted?` gate that alone permits reaching `Relay to Company OS`; all six paths are covered by `login-tools-n8n-contract.test.ts`.
- **Downstream status fidelity:** both success and rejection response nodes forward the exact `statusCode`/`body` computed upstream; no branch collapses or rewrites a downstream status.
- **Rollback:** the checkpoint's recovery row (deactivate/delete workflow, restore audience/config, verify public 404 + private health) is achievable purely from source — activation state (`active: false`) and the audience are each single, isolated values.

## Required checks — support status

| Check | Supported by source? |
| --- | --- |
| n8n cannot choose Party/entitlement/target/token policy | Yes |
| Bearer forwarding exact, no branch/response/error-workflow/artifact exposes it | Yes |
| Save-data settings are the strongest available source configuration | Yes — but live retention still requires the canary (finding 1/3) |
| Oversized/indeterminate requests stop before the private request | Yes for the private hop; not provable for n8n's own ingestion (finding 1) |
| Fixed target/method/timeout/full-response/never-error/response node preserve safe semantics, no SSRF/leakage | Yes |
| Exact public URL is a consistent Google ID-token audience across BFF and verifier, no TOFU | Yes |
| Pre-activation sentinel/storage/log canary and rollback are sufficient and truthful | Yes, as designed — unexecuted |

## Exact required corrections before commit/activation

- **Before commit:** none. Source, tests, and typecheck are internally consistent with the stated contract.
- **Before activation** (already scheduled in the checkpoint, confirmed necessary by this review, not new):
  1. Run the unique non-secret bearer sentinel probe and prove its absence from n8n execution storage, manual-execution records, workflow errors, and relevant container/edge logs.
  2. Prove oversized (>4 KiB), missing-length, and chunked/transfer-encoded requests do not invoke the private HTTP Request node under live traffic — and if the live envelope cannot prove the body itself never reaches n8n's memory before rejection, move the byte bound to the VPS edge rather than treating the Code-node check as sufficient.
  3. Prove the untrusted/public-client missing-auth rejection and the Cloud Run ADC→NanoClaw `unbound` path before any binding exists.
- Optional, non-blocking: add a contract-test assertion that `Return Transport Rejection`'s parameters never reference `authorization`/`$json.authorization`, to lock the invariant found true in finding 2.

## Verdict

**PASS WITH CORRECTIONS** — corrections apply to activation gating (the already-planned live canary), not to the reviewed source, which is internally consistent with the stated contract and required checks.
