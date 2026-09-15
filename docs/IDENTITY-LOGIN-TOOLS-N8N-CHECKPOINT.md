# Tandem Identity n8n relay minimum-sufficient checkpoint

Date: 2026-09-15

Task: `NC-20260915-003`

Status: `KEEP` with pre-activation retention and byte-bound canaries; no n8n
workflow, Cloud Run config, or identity binding has been changed

## Current observable result

The reviewed NanoClaw gateway is live on the Mini and enabled only on the
tailnet. Its exact internal route returns `401` without a Google bearer token
and a suffix route returns `404`. Tandem Identity source can mint an
audience-bound Google ID token and consume the strict bounded response, but the
deployed Cloud Run service is not yet configured to call a real gateway.

The established public ingress is already:

`identity-gateway.tandemcoach.co -> Cloudflare/LiteSpeed -> n8n on VPS -> Tailscale -> NanoClaw`

Live read-only proof established:

- n8n `2.9.4` is healthy on the VPS at Tailscale IP `100.115.115.15`;
- the Mini is reachable at `100.115.115.206`;
- active Chaos and unsubscribe workflows already provide synchronous
  public-edge-to-NanoClaw response forwarding;
- an unknown unsubscribe token traversed the complete path and returned the
  NanoClaw `Link not recognized` response without a business write; and
- the installed n8n HTTP Request node supports full-response, never-error,
  fixed timeout, explicit headers, and the Respond to Webhook node supports a
  dynamic downstream status.

Evidence:
`.program/evidence/NC-20260915-003-vps-n8n-identity-path-viability.md`

## Constraints and present hazards

- Google/Firebase authenticates. Company OS alone decides canonical Party and
  entitlement.
- The sole pilot remains Party `10069`; it has no Coaching Tools Plus grant,
  so `/tools` must deny.
- n8n must not become identity authority, inspect token claims, select a Party,
  cache access, or create a second binding store.
- The incoming Google bearer token is sensitive transient authentication
  material. It must not be written into workflow payloads, logs, execution
  history, error reports, or response bodies.
- n8n normally persists execution data. This workflow must use workflow-level
  settings that disable successful and failed execution persistence and manual
  execution persistence to the extent supported by the live n8n version.
- The public webhook host is shared. Only one exact POST path may relay to one
  fixed Mini URL; caller-controlled destination or callback URLs are forbidden.
- Cloudflare and n8n accept larger general webhook bodies. This route must
  reject anything beyond 4 KiB before the HTTP Request node.
- NanoClaw must continue verifying Google signature/JWKS, issuer, exact public
  n8n audience, runtime principal email, `email_verified`, and immutable
  subject. n8n cannot replace or weaken that check.
- Funnel remains off. No new public service, database, queue, worker, secret,
  Party merge, entitlement grant, provider write, or customer migration is in
  scope.

## Operational-obligation delta

| Obligation | Minimum accepted change | Failure if removed or broadened |
| --- | --- | --- |
| Public route | One active n8n POST webhook at `/webhook/tandem-identity-binding-v1` behind a dedicated `identity-gateway.tandemcoach.co` vhost on the existing VPS. | A generic proxy or alternate methods enlarge the public attack surface. |
| Edge body bound | The dedicated LiteSpeed vhost sets `maxReqBodyLen` to 4096 before proxying its sole route to the existing loopback n8n runtime. | The n8n Webhook node necessarily receives a request before its Code node can reject it. |
| Admission | A Code/branch gate requires a numeric content-length at or below 4 KiB, rejects transfer-encoding/chunked or missing length, and confirms the parsed JSON reserialization is at or below 4 KiB before forwarding. | Oversized or indeterminate-length payloads reach the private host. |
| Authentication | Forward the `Authorization` header unchanged; NanoClaw verifies the Google token against the exact public webhook URL audience and pre-pinned service identity. | n8n becomes a trust authority or a confused audience is accepted. |
| Private target | HTTP Request uses only fixed `http://100.115.115.206:8088/identity/v1/binding`, POST, JSON, two-second timeout. | Caller-selected URLs create SSRF or broaden private reach. |
| Response | Enable full response plus never-error and return only downstream status/body with `application/json` and `no-store`. | n8n hides 401/400/503 distinctions or leaks internal data. |
| Retention | Workflow execution-save settings are disabled; no Code node returns the bearer; workflow errors contain only stable codes. | Transient Google credentials enter n8n history or logs. |
| Release | Keep the workflow inactive through source tests/review; activate once under the VPS/n8n resource lease, probe, then configure Cloud Run. | A public route exists before its verifier and rollback are reconciled. |
| Recovery | Deactivate/delete the exact workflow first; restore NanoClaw/Tandem Identity audience/config; verify public 404 and private health. | A stale public relay remains after rollback. |

## Next falsifiable proof and bounded work

1. Add one version-controlled n8n workflow definition, one dedicated
   LiteSpeed-vhost and Cloudflare-DNS declaration, and focused source-contract
   tests.
2. Change only the pinned gateway audience in NanoClaw and the URL/audience
   examples/config in Tandem Identity to the exact n8n webhook URL.
3. Run focused/full tests and bounded independent authentication review.
4. Commit and push both branches.
5. Acquire only the exact VPS n8n workflow and affected release leases.
6. Import the workflow inactive, read it back without credential values, then
   activate it.
7. Install and validate the dedicated vhost, create/read back only its proxied
   CNAME, and prove a body over 4 KiB is blocked at the VPS edge without an n8n
   execution.
8. Before a valid token, send a unique non-secret bearer sentinel through the
   public error path and prove it is absent from n8n execution persistence,
   manual-execution storage, workflow errors and relevant container logs. Prove
   content-length over 4 KiB, missing content-length, and chunked/transfer-
   encoded requests do not invoke the private HTTP Request node.
9. Prove from an untrusted/public client that missing auth is rejected and from
   the Cloud Run runtime that its ADC token reaches NanoClaw and receives
   `unbound` before any binding.
10. Only after the transport proof, obtain the owner-operated Firebase UID and
   apply the already authorized one-Party binding through the local CLI.
11. Verify `/account` bound and `/tools` denied, then deactivate the disposable
   relay unless continued operation is separately accepted.

## Stop conditions

- Stop if n8n cannot prevent bearer persistence in execution history.
- Stop if Cloudflare or n8n cannot preserve the exact bearer and downstream
  status/body.
- Stop if the workflow requires a caller-controlled URL, new secret, Party or
  entitlement input, additional durable state, or a second public runtime.
- Stop if any probe writes a Party, binding, entitlement, provider command, or
  customer communication before the separately authorized binding step.

## Fresh necessity verdict

Verdict: `KEEP`.

The existing VPS/n8n relay is the smallest feasible path. The largest avoidable
burden is making n8n a duplicate authentication or schema-policy layer. The
workflow therefore checks only transport admission facts needed before the
private hop; NanoClaw remains the sole bearer verifier and strict identity
request validator.

Required pre-activation corrections accepted:

- use a unique non-secret bearer sentinel and prove absence from n8n execution
  storage, manual records, workflow errors, and relevant logs; and
- reject oversized declared bodies plus missing-length or chunked bodies before
  the private HTTP Request node. If this cannot be proved using the live n8n
  envelope, move the byte bound to the existing VPS edge rather than
  approximating it.

Live correction: the Cloudflare Pro zone is already at its 20/20 custom-rule
limit, so no rule was created and no existing rule was deleted or weakened.
The smaller safe alternative is a dedicated hostname and LiteSpeed vhost on the
same VPS and n8n process. The existing wildcard `*.tandemcoach.co` certificate
covers it; the vhost-level 4096-byte limit applies before proxying and does not
constrain unrelated n8n webhooks.
