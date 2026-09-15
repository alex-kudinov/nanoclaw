# Tandem Identity real gateway minimum-sufficient checkpoint

Date: 2026-09-15

Task: `NC-20260915-003`

Status: `KEEP` with load-bearing corrections accepted; no endpoint, network or
binding change has occurred

## Customer result and current boundary

The reviewed Tandem Identity source can authorize `/tools` from an injected
Party/entitlement projection, but the deployed BFF uses
`UnconfiguredIdentityGateway`. The owner has selected one individual pilot
account and explicitly designated existing Party `10069` as canonical for this
pilot only. Duplicate checkout Parties `11646` and `11647` remain untouched.

Party `10069` has 13 exact provider-scoped Plutio, Trafft, Stripe and Tandem-web
references, no Google auth account and no Coaching Tools Plus entitlement. The
canary must therefore prove:

1. owner-operated Google sign-in;
2. one development auth subject bound to Party `10069` under the accepted owner
   decision;
3. `/account` reads back `bound`; and
4. `/tools` returns the expected access denial without creating a grant.

No real Cloud Run-to-Company-OS path exists today.

## Current infrastructure audit

- Tandem Identity runs on public Cloud Run behind Firebase Hosting.
- Company OS runs in the existing NanoClaw process on the Mac Mini and listens
  on port 8088 over the tailnet.
- Mac Mini Tailscale `1.96.2` is online at
  `mini-claw.raptor-insen.ts.net`; Tailscale Funnel is available and currently
  has an empty configuration.
- No `cloudflared` process or launchd job exists on the Mini.
- Cloud Run has no tailnet route.
- NanoClaw already owns one HTTP server and current PostgreSQL connection. The
  migration-167 identity receipt, decision and auth-account tables already
  exist; no DDL is needed.

## Minimum route selection

Use one path-mounted Tailscale Funnel route to the existing NanoClaw HTTP
process. The public Funnel mount forwards only a new exact gateway path, not the
root server or generic webhook paths. Tailscale terminates HTTPS; the application
still requires a short-lived Google-signed service-account ID token for the exact
Funnel audience.

This is smaller than:

- a second Cloud Run Company OS runtime and database route;
- a Tailscale sidecar/VPC connector in Cloud Run;
- installing Cloudflare Tunnel plus a client secret; or
- a new gateway daemon, database, queue or projection store.

The Funnel configuration is persistent host state and must have an exact off
command and readback. It is development-pilot ingress, not production
availability architecture.

## Operational-obligation delta

| Obligation | Minimum accepted change | Failure if omitted |
| --- | --- | --- |
| Public ingress | One Tailscale Funnel HTTPS mount for one exact gateway path to `127.0.0.1:8088`; no other NanoClaw route mounted. | Exposing the port/root would broaden attack surface to unrelated webhook/admin routes. |
| Caller identity | Verify Google signature/JWKS, issuer, exact Funnel audience, exact Cloud Run service-account email and immutable subject before reading the body. | Email-only or token-derived policy permits a recreated/wrong workload or confused audience. |
| Request contract | Strict, bounded development-only login observation: project, UID, verified-email fingerprint, auth time and observed time. It carries no Party ID or entitlement. | Letting the BFF choose Party/access moves canonical authority out of Company OS. |
| Pilot binding | Company OS policy pins the accepted owner decision, email fingerprint and Party `10069`; insert one migration-167 receipt/decision and versioned development auth account only after all facts agree. | General email matching could bind the wrong duplicate Party. |
| Read projection | Resolve existing accepted auth subject to Party; read current canonical Coaching Tools Plus component rows and map them into the public projection. Party `10069` currently returns no grant. | A hardcoded allowlist or synthetic entitlement becomes a second access authority. |
| Idempotency/recovery | Exact repeat is zero-write. Changed subject/body/Party/decision fails. If disabling is required, append the next auth-account version as disabled; never delete the receipt. | Repeated login could duplicate bindings or an incorrect binding could become irrecoverable. |
| BFF client | Reuse Google Application Default Credentials to mint an audience-bound ID token and call the exact gateway URL with a short timeout. No downloaded key or Company OS bearer secret. | A long-lived secret adds custody/rotation or an unbounded call stalls login. |
| Operations | Existing NanoClaw release, Tailscale Funnel status/readback, exact route health, structured value-redacted errors and rollback command. | A source build or Funnel receipt alone would not prove the live path or safe rollback. |

## Bounded implementation proof

1. Add one pure gateway request schema/policy/store over migration 167 with
   generated disposable PostgreSQL proof: first authorized binding, exact replay
   zero-write, changed reuse refusal, no Party/ref/entitlement/provider writes,
   and expected empty tools projection for Party `10069` fixture.
2. Add one exact NanoClaw HTTP handler dependency and route. All auth/body/schema
   failures stop before database work.
3. Add one Tandem Identity gateway client behind the existing `IdentityGateway`
   interface. The runtime enables it only with exact development URL, audience,
   principal email and immutable subject configuration; otherwise it remains
   unconfigured and fail-closed.
4. Run focused/full tests and bounded independent auth review. Reconcile the
   actual diff against this obligation table.
5. Commit/push both isolated branches. Acquire narrow resource leases only for
   the NanoClaw development release, Tandem Identity development release and
   Tailscale Funnel route.
6. Deploy disabled/unrouted first; verify current health. Configure only the
   exact Funnel path and read it back. Deploy the BFF gateway configuration.
7. The owner performs Google sign-in. Verify one accepted development auth
   account bound to Party `10069`, `/account` bound, `/tools` denied, exact
   replay zero-write, both services healthy and no other Party/provider/access
   counts changed.

## Stop conditions

- Stop if Funnel cannot mount one exact path without exposing other routes.
- Stop if the service-account immutable subject cannot be independently read
  before accepting tokens.
- Stop if the binding needs a Party merge, email-only inference, new DDL,
  entitlement grant, another daemon/store/queue or provider write.
- Stop if the actual source/runtime topology exceeds the obligations declared
  above.
- This pilot is not evidence for customer migration, production availability or
  paid-tool access success.

## Fresh necessity verdict

Verdict: `KEEP`.

Reusing the existing NanoClaw HTTP process, PostgreSQL connection,
migration-167 state and Cloud Run ADC is the smallest feasible real path. A
one-shot signed request would be smaller but would not prove the required Google
sign-in, BFF client, binding readback and `/tools` denial.

Load-bearing corrections accepted before implementation:

- the application must accept one exact method and path and reject suffix,
  redirect, encoded-path and alternative-method variants; Funnel readback alone
  is insufficient isolation;
- the Cloud Run service account's immutable numeric Google subject must be
  independently read and pinned before ingress is enabled; first-request token
  discovery is prohibited;
- replay identity is the owner decision, project, Firebase UID, Party `10069`
  and immutable caller identity—not volatile `observed_at` or authentication
  time. Later valid tokens for the already-bound project/UID resolve with zero
  writes even when auth time changes;
- Funnel ingress receives a bounded pilot resource lease and is removed with
  exact readback immediately after evidence capture unless continued access is
  separately accepted; and
- rollback removes public ingress first, then restores releases/configuration,
  and disables any accepted binding append-only without deleting history.

## Rollback

- Disable the exact Funnel mount with the matching `off` command and verify
  empty Funnel status.
- Restore the prior Tandem Identity and NanoClaw immutable releases/config.
- If a development auth binding was accepted, append a disabled auth-account
  version with a rollback receipt; never delete or rewrite history.
- Reverify public BFF health, private Company OS health, unchanged provider/
  entitlement state and zero public gateway reachability.
