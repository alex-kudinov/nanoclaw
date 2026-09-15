# NC-20260915-003 bounded real-gateway review R2 — response

## Material findings, ordered by consequence

### 1. Unverified: the runtime read path's Postgres role may lack any grant on `auth_accounts` / `student_component_entitlements` (likely-blocking, not security-defective)

`src/index.ts` wires the live `/identity/v1/binding` lookup through
`withAgentContext('tandem-identity-gateway', (client) => lookupLoginToolsBindingWithClient({ client, ... }))`
(src/index.ts:2272-2286). `lookupLoginToolsBindingWithClient` issues direct
`SELECT`s against `business_v2.auth_accounts` and
`business_v2.student_component_entitlements` (login-tools-gateway.ts:159-165,
180-191) — base tables, not `business_v2.v_*` views.

Migration 167 puts every Tandem Identity table, including `auth_accounts`,
under `ALTER TABLE ... OWNER TO nanoclaw_admin` plus
`REVOKE ALL ... FROM PUBLIC` (167_tandem_identity_control_plane.sql:1116-1136)
and issues **no subsequent `GRANT`** to any other role. `data/business/
CLAUDE.md`'s role table (`nanoclaw_inbox`, `nanoclaw_sales`, `nanoclaw_mailman`,
`nanoclaw_chief`, `nanoclaw_booking`, `nanoclaw_contador`,
`nanoclaw_procurement`, `nanoclaw_admin`) does not list a
`tandem-identity-gateway` role at all, and the standalone operator CLI
(`scripts/bind-tandem-identity-pilot.ts:46`) explicitly does
`SET LOCAL ROLE nanoclaw_admin` before touching these same tables — i.e. the
one place in this diff that *is* known to need admin access sets it
explicitly, while the webhook-triggered read path does not.

`business-db.ts` (where `withAgentContext` resolves an agent key to a
Postgres role/credential) is outside this review's allowed read paths, so I
cannot confirm what role `'tandem-identity-gateway'` actually assumes. If it
is not `nanoclaw_admin` (or a role separately granted `SELECT` on these two
tables), every `/identity/v1/binding` call will hit a Postgres
permission-denied (or unknown-role) error, which `webhook-server.ts`'s
generic `catch` turns into a flat `503 identity_gateway_unavailable`
(webhook-server.ts:643-649). That failure mode is fail-closed and not an
authorization defect, but it directly blocks the checkpoint's own success
criterion — "`/account` reads back `bound`" — and would only surface at the
moment the owner performs the real Google sign-in.

**Required-check support:** bears on "the read response derives only the
existing canonical entitlement and the pilot returns bound with no grant" —
that check can only be evaluated once this role path is confirmed live: an
overly narrow grant makes the proof fail-closed (safe but non-functional); an
overly broad grant (e.g. blanket `nanoclaw_admin` reuse for a
webhook-reachable code path) would widen the blast radius of this one HTTP
route beyond what the D1 "admin-only, unwired" design intends.

### 2. Rollback/disable path for a stale or wrong binding has no implemented function

`login-tools-gateway.ts` provides only `bindLoginToolsPilotWithClient`
(accept) and `lookupLoginToolsBindingWithClient` (read). Nothing in this diff
appends a disabled `auth_accounts` version. The checkpoint's own rollback
section ("append a disabled auth-account version with a rollback receipt")
therefore depends on hand-written admin SQL at incident time, not on tested
code. The schema supports it (`auth_accounts_version_guard`,
`auth_accounts_binding_chk` both allow a `disabled`/`binding_basis='none'`
successor version), so this is a gap in tooling, not in the data model.

**Required-check support:** "accepted/disabled/conflicting binding states
fail safely and rollback remains possible through append-only versioning" —
the append-only *shape* is proven (schema + triggers), but the *rollback
action itself* is unexercised by any test in this diff.

### 3. BFF client response-size guard is not enforced by the HTTP layer itself

`company-os-identity-gateway.ts:106-112` checks `content-length` before
calling `response.text()`, then re-checks the decoded byte length — but
`response.text()` itself is not size-bounded (no streaming cap, no
`AbortController` triggered mid-read), so a value that lies about
`content-length` while still exceeding 16 KiB is only caught *after* the
full body has already been buffered in memory. Given the caller is
Cloud Run's own BFF talking to a private, audience-pinned Company OS
endpoint over Tailscale, the practical exposure is low, but it is a residual
gap in the "bounded timeout and response" required check as literally
implemented.

**Required-check support:** "the BFF mints ADC/metadata ID tokens for the
exact audience, uses no downloaded key/shared secret, and bounds timeout and
response" — audience/timeout/no-downloaded-key are all satisfied; the
response bound is advisory rather than hard-enforced.

## Confirmed correct (no defect found)

- **Auth verification fails closed on every axis.** `GoogleServiceCallerVerifier.verify`
  (login-tools-gateway.ts:78-104) checks issuer, exact audience, exact
  principal email, `email_verified === true`, and the pre-pinned immutable
  `sub` before accepting a token; any mismatch or verification exception
  throws `service_identity_invalid`, mapped to `401` before body parsing
  (webhook-server.ts:601-610). `maxExpiry: 3_600` bounds token freshness.
- **Route isolation is exact and derived from the configured path.**
  `WebhookServer`'s constructor rejects any `tandemIdentityGateway.path` that
  isn't a two-segment absolute path (webhook-server.ts:451-455). The request
  handler 404s suffix paths, encoded-path variants (`/%69dentity/...`), and
  query-string variants, while draining the body first for
  `POST/PUT/PATCH` so a probe cannot use the isolation boundary as a
  connection-keepalive oracle (webhook-server.ts:556-580) — all three are
  covered by `webhook-server.test.ts`'s `'exposes only the exact
  authenticated identity gateway path'` test.
- **All auth/body/schema failures precede database work.** The handler order
  is: exact path/method check → bearer regex/length → `verifyCaller` →
  bounded body read → strict Zod parse → only then `identityGateway.lookup`.
  `'rejects identity gateway requests before lookup on auth or shape
  failure'` explicitly asserts `lookup` is never called on either failure.
- **No request field lets the caller choose Party or entitlement.**
  `LoginToolsGatewayRequestSchema` (`.strict()`) carries only `kind`,
  `schemaVersion`, `projectId`, `uid`, and an optional `verifiedEmailSha256`
  hash — no Party ID, no entitlement, no role.
- **Operator binding identity excludes time and is atomic.** `stableBinding`
  in `bindLoginToolsPilotWithClient` (login-tools-gateway.ts:250-258) hashes
  `decisionRef`, `decisionUuid`, `projectId`, `uid`, `verifiedEmailSha256`,
  `partyId`, `callerSubject` — no timestamp. An advisory `pg_try_advisory_xact_lock`
  keyed on that hash serializes concurrent attempts, and the disposable
  PostgreSQL test in `d2-student-lifecycle-shadow.disposable.test.ts` (lines
  1345-1463) proves: first accept writes exactly one receipt/auth-account/
  decision and zero Party/ref/entitlement/provider rows; an exact replay at a
  different `observedAt` is `duplicate` with zero writes; and four separate
  single-field mutations (uid, Party, decision ref+UUID, caller subject) each
  throw and leave every count — including the previously accepted binding —
  unchanged.
- **Read path fails safe on an unexpected Party.** If an accepted subject
  somehow resolves to a Party other than the configured pilot Party,
  `lookupLoginToolsBindingWithClient` throws `pilot_party_conflict` rather
  than returning a value (login-tools-gateway.ts:176-178), and the route
  turns any lookup exception into a generic `503` with no internal detail
  leaked.
- **Read projection is canonical-only.** Entitlement state is derived from
  `student_component_entitlements`/`student_enrollments_v2` joins, not from
  any caller-supplied or cached value; the fixture Party `10069` (no rows)
  correctly returns `{ status: 'bound', partyId: '10069', entitlements: [] }`
  — bound, no grant — matching the stated pilot expectation.
- **Configuration is disabled by default.** `TANDEM_IDENTITY_GATEWAY_ENABLED`
  defaults to `false` (config.ts:153-162), and the gateway dependency object
  is only constructed when a verifier exists (index.ts:2255-2289); no test in
  this diff issues a live network call to a real Funnel/Cloud Run endpoint.
- **R1 corrections are all present in this diff:** the three previously
  omitted files are readable; the namespace-derivation/malformed-path
  rejection is implemented in the constructor; decision UUID is now part of
  the replay identity; duplicate-detection now compares the full binding hash
  rather than a subset; the disposable proof separately varies UID, Party,
  decision, and caller subject and confirms unchanged counts on each failure.

## Required corrections before commit or external mutation

1. **Blocking for the live proof, not for commit:** before the owner performs
   Google sign-in, confirm (by reading `business-db.ts` or by a direct
   `psql` check of `information_schema.role_table_grants` for
   `auth_accounts` / `student_component_entitlements`) which role
   `withAgentContext('tandem-identity-gateway', ...)` assumes, and that role
   has `SELECT` (and only `SELECT`) on both tables. If it does not, either
   grant exactly that in a follow-up migration or change the call site to
   `SET LOCAL ROLE nanoclaw_admin` the same way the CLI script does, scoped
   only to this read.
2. Before relying on the checkpoint's stated rollback path in an incident,
   write (or at minimum hand-verify against the disposable database) the
   "append a disabled auth-account version" operation once, so rollback is
   proven rather than asserted.
3. Optional hardening, not blocking: bound `company-os-identity-gateway.ts`'s
   `fetch` read itself (e.g. a streaming reader with an early abort) rather
   than relying on a post-hoc length check, since `content-length` is
   attacker/bug-controllable in principle.

## Verdict

**PASS WITH CORRECTIONS.**

The authentication, request-contract, route-isolation, and replay/idempotency
guarantees are all implemented as claimed and are exercised by tests that
prove zero-write on every failure path — no defect was found in the
authorization or binding-safety model itself, and the R1 blockers are
resolved. The one likely-blocking issue (finding 1) is a plumbing/permissions
question this review cannot resolve from its allowed read paths; it fails
closed rather than open, so it is not a security defect, but it must be
confirmed before the owner's real sign-in or the pilot's own success
criterion (`/account` returns `bound`) may simply never be reachable.
