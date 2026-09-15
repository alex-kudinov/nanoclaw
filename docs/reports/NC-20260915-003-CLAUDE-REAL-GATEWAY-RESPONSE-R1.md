# NC-20260915-003 bounded real-gateway review — response R1

Reviewed only the four allowed paths (checkpoint, diff patch, migration 167,
Tandem Identity walking-skeleton doc). No other file was read or edited.

## Finding 1 (blocking) — the load-bearing implementation file is outside the reviewable packet

`src/identity-control-plane/login-tools-gateway.ts` is imported by every
change in the diff (`webhook-server.ts`, `index.ts`, the disposable test) but
its own contents are not in the diff and not in the allowed read paths. It is
the file that must implement:

- `GoogleServiceCallerVerifier` — Google token signature/JWKS, issuer, exact
  audience, principal email and immutable subject verification (Required
  check 2).
- `LoginToolsGatewayRequestSchema` — whether the caller can smuggle a Party or
  entitlement into the request body (Required check 4).
- `bindLoginToolsPilotWithClient` / `lookupLoginToolsBindingWithClient` — the
  actual replay-identity, atomicity and pinning logic (Required checks 5–7).
- `LOGIN_TOOLS_GATEWAY_PATH` and `LOGIN_TOOLS_GATEWAY_MAX_BODY_BYTES` — the
  exact mounted path and body bound that the isolation guarantee depends on.

The same gap applies to `src/company-os-identity-gateway.ts`
(`CompanyOsIdentityGateway`, the BFF-side client instantiated in
`src/server.ts` — Required check 3) and to `scripts/bind-tandem-identity-pilot.ts`
(the operator CLI that performs the one production write). All three are new
or untracked files (`??` in git status) and none is on the allowed-paths list.

Consequence: Required checks 2, 3, 4, 5, 6, 7 and 8 cannot be independently
confirmed from this packet. What is confirmed below is confirmed only by
*side effects visible in the diff/migration*, not by reading the controls
themselves. A review that cannot see the authentication and binding logic
cannot respond `PASS` on an authentication/binding gateway.

## Finding 2 (moderate) — isolation prefix is a second, independently-hardcoded literal

In `webhook-server.ts`, the shadow-and-404 guard for all `/identity/*` traffic
uses a hardcoded string `'/identity/'`, decoupled from `identityGateway.path`
(the actual configured `LOGIN_TOOLS_GATEWAY_PATH`, defined in the excluded
file). If the two ever diverge — e.g. the gateway path is later changed to
something outside `/identity/` — the isolation guarantee silently stops
applying to the real route, while `webhook-server.test.ts` would keep passing
because its test fixture reuses the same `'/identity/v1/binding'` literal
that matches the hardcoded prefix by coincidence, not by derivation. Nothing
in the reviewed packet proves `LOGIN_TOOLS_GATEWAY_PATH` actually lives under
`/identity/`. Recommend deriving the shadow boundary from `identityGateway.path`
itself rather than a second literal, or asserting the relationship at startup.

## Finding 3 (informational) — narrower policy on the read path is unconfirmed as intentional

`src/index.ts` builds the `lookup` policy with only `projectId`, `environment`,
`pilotPartyId`, `pilotEmailSha256` — it omits `decisionRef`, `decisionUuid`,
and `callerSubject`, which appear in the disposable test's `bindingPolicy` used
for `bindLoginToolsPilotWithClient` (the write path). This is plausible by
design (only the write path needs to pin a decision/caller-subject; the read
path only resolves an already-accepted binding) but cannot be confirmed
without the type definitions in the excluded gateway file. Flagging so the
next reviewer with access to that file explicitly confirms the read path
cannot be replayed against a withdrawn/superseded decision.

## What the reviewable packet does support

- **Fail-closed defaults, both repos.** NanoClaw's `TANDEM_IDENTITY_GATEWAY_ENABLED`
  defaults to `'false'`; Tandem Identity's `COMPANY_OS_IDENTITY_GATEWAY_URL`/
  `_AUDIENCE` are optional and empty by default, forcing `UnconfiguredIdentityGateway`
  in `server.ts`. Matches the checkpoint's claim that the live server is
  guaranteed `unbound`.
- **Route isolation is tested for the visible surface.** `webhook-server.test.ts`
  exercises exact-path 200, wrong-method 405, suffix-path 404, and
  percent-encoded-path 404 for the gateway route (Required check 1, to the
  extent the test's literal path matches the real constant — see Finding 2).
- **Auth-before-body-before-lookup ordering is correct and tested.** Missing/
  malformed bearer → 401 before body read; `verifyCaller` throw → 401 before
  body read; malformed JSON → 400 before `lookup` is invoked. Satisfies "all
  auth/body/schema failures stop before database work" for the parts visible
  in `webhook-server.ts`.
- **Production HTTPS coupling.** Tandem Identity's `loadConfig` requires
  `COMPANY_OS_IDENTITY_GATEWAY_URL` and `_AUDIENCE` to be configured together
  and rejects a non-HTTPS gateway URL in production — prevents a
  half-configured or plaintext gateway from going live silently.
- **Database-level guarantees hold independent of the unreviewed TypeScript.**
  Migration 167: every evidence table has an unconditional append-only
  BEFORE UPDATE/DELETE trigger; `auth_accounts` has both a CHECK tying
  `account_state = 'accepted'` to a non-null `party_id`/`binding_basis` and a
  monotonic `account_version` guard trigger; `provider_projection_commands`/
  `provider_projection_attempts` are structurally prohibited from live writes
  (`writes_enabled boolean ... CHECK (writes_enabled = false)`,
  `attempt_count ... CHECK (attempt_count = 0)`, and an attempt-insert trigger
  that unconditionally raises). These hold even if the application layer has
  a bug, and back "no Party/ref/entitlement/provider write occurs"
  independent of Finding 1.
- **Disposable test demonstrates the pinned-binding contract for Party
  `10069`'s shape.** First bind writes exactly one receipt/auth-account/
  decision row with zero Party/ref/entitlement/provider writes; exact replay
  is a zero-write `duplicate`; changed `uid` for the same policy is rejected
  and leaves protected counts unchanged. This is real evidence, but it only
  covers a changed-UID mutation — not changed Party, changed decision, or
  changed caller identity, which Required check 6 also names.

## Required-check support summary

| Check | Supported by this packet? |
| --- | --- |
| Exact path/method/query/encoding isolation | Partial — tested, but coupling risk (Finding 2) |
| Google JWKS/issuer/audience/subject verification | Not supported — logic outside packet (Finding 1) |
| BFF ADC token minting, timeout, no downloaded key | Not supported — client outside packet (Finding 1) |
| Caller cannot choose Party/entitlement | Not supported — schema outside packet (Finding 1) |
| Operator binding pinned to decision/UID/Party/subject | Partial — only via disposable test, write CLI outside packet |
| Atomic first-apply; replay/changed-field zero-write | Partial — replay and changed-UID tested; changed-Party/decision/caller-subject not exercised in this packet |
| Auth-version/rollback append-only-safe | Supported — DB triggers + version guard (migration 167) |
| Read response maps only canonical entitlement, denies pilot | Not supported — lookup logic outside packet |
| Disabled-by-default config, truthful Funnel/rollback claims | Supported — config defaults in both repos |

## Corrections required before commit or any external mutation

1. Add `src/identity-control-plane/login-tools-gateway.ts`,
   `src/company-os-identity-gateway.ts`, and
   `scripts/bind-tandem-identity-pilot.ts` to the allowed read paths and run a
   review round R2 against them before this is treated as reviewed. These
   files carry essentially all authentication and binding risk.
2. Derive the `/identity/` isolation-shadow boundary in `webhook-server.ts`
   from `identityGateway.path` (or assert the relationship at startup) rather
   than repeating a second hardcoded literal.
3. Extend the disposable-DB proof to also exercise changed-Party and
   changed-decision replay attempts, not only changed-UID, per Required
   check 6's exact wording.

## Verdict

**BLOCK** — not because a defect was found in the reviewable diff, but because
the packet's own allowed-paths list excludes the file that implements nearly
every load-bearing control this review was asked to check (token
verification, Party/entitlement exclusion from the request, binding pinning,
replay atomicity). Commit or any external mutation should wait for review
round R2 against the three files named in Correction 1.
