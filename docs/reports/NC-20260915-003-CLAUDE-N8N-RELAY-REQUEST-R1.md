# NC-20260915-003 bounded n8n identity-relay review

## Objective

Review only the load-bearing new n8n relay and audience change for one
development Tandem Identity canary. Find material defects that could expose or
persist a Google bearer token, broaden private-network reach, bypass Company OS
identity authority, accept oversized/indeterminate input, misreport downstream
status, or make rollback untruthful.

## Accepted authority and facts

- The owner established the ingress boundary:
  `webhooks.tandemcoach.co -> existing VPS/n8n -> Tailscale -> NanoClaw`.
  Funnel is prohibited for this work.
- Google/Firebase authenticates. NanoClaw/Company OS alone verifies the Google
  token and decides canonical Party and entitlement. n8n is transport only.
- The Google runtime principal email and immutable subject are independently
  pinned in NanoClaw. The caller cannot supply Party or entitlement.
- Party `10069` is the sole owner-approved pilot Party and currently has no
  Coaching Tools Plus entitlement; `/tools` must deny.
- Live read-only proof established healthy n8n `2.9.4`, public edge -> n8n,
  synchronous n8n -> Mini -> response behavior, and exact Mini gateway
  reachability (`401` real path without token, `404` suffix).
- The live n8n version supports workflow settings that disable successful,
  failed, manual and progress data saves, and HTTP Request full-response plus
  never-error.
- No n8n workflow, Cloud Run config or identity binding has been changed.

## Changed contract

- One inactive POST webhook at
  `https://webhooks.tandemcoach.co/webhook/tandem-identity-binding-v1`.
- Transport admission requires determinate numeric content length, rejects
  transfer encoding/missing length, requires JSON, and rejects declared or
  reserialized bodies above 4 KiB.
- It forwards the Authorization value unchanged and the parsed JSON body to one
  fixed Mini URL with a two-second timeout.
- It returns only downstream JSON/status and no-store headers.
- All n8n execution-persistence settings are disabled and no error workflow is
  attached.
- NanoClaw's exact expected Google audience changes from the abandoned Funnel
  URL to the public n8n webhook URL. Tandem Identity configuration tests use
  that same exact URL/audience.

## Allowed read paths

1. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/IDENTITY-LOGIN-TOOLS-N8N-CHECKPOINT.md`
2. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/setup/n8n/tandem-identity-binding-workflow.json`
3. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/login-tools-n8n-contract.test.ts`
4. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/identity-control-plane/login-tools-gateway.ts`
5. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/src/config.ts`
6. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/src/company-os-identity-gateway.ts`
7. `/Users/xbohdpukc/dev/tandem-identity/.worktrees/login-tools-walking-skeleton-20260915/tests/config.test.ts`

Only write the response artifact. Do not edit source or other documentation.

## Required checks

- n8n remains transport and cannot choose Party, entitlement, target URL or
  token policy.
- Bearer forwarding is exact and no workflow branch, response, error workflow,
  static credential or source artifact exposes it.
- Save-data settings are the strongest available source configuration; identify
  any live retention claim that still requires a canary rather than source
  proof.
- Missing length, transfer encoding, non-JSON and both declared/re-serialized
  >4 KiB requests stop before the private request.
- The fixed target, method, timeout, full-response/never-error and response node
  preserve safe downstream semantics without SSRF or data leakage.
- The exact public URL is a valid consistent Google ID-token audience across
  BFF and verifier; no trust-on-first-use exists.
- The proposed pre-activation sentinel/storage/log canary and rollback are
  sufficient and truthful.

## Verification already run

- NanoClaw gateway/n8n/webhook focused tests: 71/71 pass.
- NanoClaw typecheck and formatting pass.
- Tandem Identity config/gateway focused tests: 8/8 pass; typecheck/build pass.

## Response

Write
`/Users/xbohdpukc/dev/NanoClaw/.worktrees/tandem-identity-login-tools-walking-skeleton-20260915/docs/reports/NC-20260915-003-CLAUDE-N8N-RELAY-RESPONSE-R1.md`.

Report only material findings ordered by consequence, exact required
corrections before commit/activation, which required checks are supported, and
final `PASS`, `PASS WITH CORRECTIONS`, or `BLOCK`.
