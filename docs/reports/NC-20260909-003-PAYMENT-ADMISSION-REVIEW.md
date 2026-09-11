# Response R1 — internal payment admission and guest-status tokens

**Verdict: ACCEPTED** within the stated unwired scope. No material findings.

Reviewed only the files listed in REQUEST-R1.md, file-only, no shell/MCP/web/secrets/history,
no source edits. Accepted dependencies (PaymentTransaction, validateAttempt,
PaymentPayloadVault, paymentPayloadFingerprint, migration 149 / fn_payment_store_immutable)
were not reopened.

## Checklist coverage

**Signature/caller/path/body/clock binding** — `signingText()` HMACs a newline-joined
tuple of version marker, keyId, caller, method, path, timestamp, nonce, operationId, and
`sha256(body)`. All string fields are pre-constrained by the zod schema (regex-limited
keyId/caller, literal method, enum path, UUID nonce/operationId) before being placed in
the signed text, so no delimiter-injection ambiguity is possible. `verify()` re-checks
key→caller binding, envelope caller/method/path against the host-supplied `expected`,
and a ±300000ms skew against a caller-supplied `now`. `payment-admission-store.ts` always
sources `now` from `clock_timestamp()` inside the same transaction, not `now()`
(session-frozen value), so skew enforcement uses true wall-clock time even under a
long-running transaction. Matches `payment-request-auth.ts:37-139`,
`payment-admission-store.ts:38-46`.

**Constant-time comparison** — `timingSafeEqual` is used for the only true secret
comparison (HMAC signature); both operands are fixed 32-byte buffers guaranteed by the
`^[a-f0-9]{64}$` regex, so no length-mismatch throw path exists. Caller/method/path/keyId
comparisons are `!==` on non-secret identifiers, which is correct — constant time is not
required there. `payment-request-auth.ts:120-129`.

**Concurrent nonce admission** — `admit()` verifies and inserts the nonce
(`ON CONFLICT(caller,nonce_sha256) DO NOTHING`) inside one transaction against a
PK-backed unique constraint, so correctness holds under real concurrent transactions,
not just app-level locking. Proven by the 25-concurrent-replay-of-one-envelope test
(24 rejected with `internal_request_replayed`). `payment-admission-store.ts:49-78`,
`payment-admission-disposable.test.ts:182-194`.

**Replay/TTL behavior** — `retainNonceUntil = envelope.timestamp + 300001` is bounded
consistently with the migration's
`retain_until>received_at AND retain_until<=received_at+600001` check across the full
accepted skew range; verified this holds at both skew extremes. Capability replay
(`issueStatusCapability` on an existing `(caller,operation_id)` row) returns the original
`expiresAt` and ignores a different requested `ttlMs`, proven by the 25-fresh-nonce/
one-capability test asserting a passed `ttlMs=86400000` does not change the returned
`expiresAt`. `payment-request-auth.ts:130-138`,
`150_payment_request_admission.sql:13,25`, `payment-admission-disposable.test.ts:221-249`.

**Capability entropy/storage** — Bearer is `pcap_` + 32 `randomBytes` base64url (256
bits). Only `sha256(token)` (for lookup) and an AES-GCM-sealed copy (for identical-
operation replay response) are persisted; the AAD binds the ciphertext to
`${capability_id}:status-capability`, so a ciphertext can't be replayed under a different
capability id. Row assertions confirm the raw token never appears in storage.
`payment-admission-store.ts:158-178`, `payment-admission-disposable.test.ts:241-248`.

**Scope/expiry/revocation** — `permits(caller, attempt)` is invoked fresh on every
issuance against the attempt's actual stored contract (not the envelope), and wrong-
caller/wrong-scope issuance is denied (`capability_scope_denied`). Expiry and revocation
are both checked against DB-clock time on every replay and on every `permitsStatus` call;
an expired-or-revoked prior grant fails closed rather than being reissued.
`payment-admission-store.ts:120-127,140-148,183-199`.

**Idempotent issuance** — Keyed on `(caller, operation_id)`, serialized with
`pg_advisory_xact_lock` before the check-then-insert, and enforced again by the
`UNIQUE(caller,operation_id)` constraint. If the same `operation_id` is later presented
with a *different* `attempt_id`, the store detects the mismatch and throws
`capability_operation_conflict` rather than silently reusing the wrong scope — this fails
safe. Proven under 25 concurrent fresh-nonce retries of one operation collapsing to one
token/id. `payment-admission-store.ts:128-148`,
`payment-admission-disposable.test.ts:221-269`.

**SQL integrity/grants** — All three tables are owned by `nanoclaw_admin`; `REVOKE ALL`
runs against `PUBLIC` and iterates every non-admin, non-`pg_%` role. Immutability
triggers are wired on all three tables (reusing 149's `fn_payment_store_immutable`).
Foreign keys correctly chain nonces → attempts (149) and capabilities/revocations →
nonces → capabilities, so revocation/capability evidence can't exist without a genuine
admitted request. Proven by the immutable-evidence/admin-only-grants test.
`150_payment_request_admission.sql:7-52`,
`payment-admission-disposable.test.ts:307-326`.

**Safe disposable/rollback behavior** — Rollback locks all three tables
`ACCESS EXCLUSIVE` and refuses if any evidence row exists in any of the three, matching
the test's populated-refusal assertion; the same test then truncates and proves a clean
rollback → reapply → rollback cycle on the disposable database only. The disposable test
itself asserts a null `inet_server_addr()` (Unix-socket-only, not a TCP/production
connection) and validates the generated database name with a strict regex before use,
then drops it in `afterAll`. `rollback_150_payment_request_admission.sql:1-12`,
`payment-admission-disposable.test.ts:133-179,327-352`.

## Doc-to-code consistency

Every claim in `docs/PAYMENT-DOMAIN.md`'s "Internal request and guest-status admission"
section was checked against the code: signing algorithm/fields, five-minute skew,
DB-clock nonce admission, capability entropy/storage, replay-without-extension,
revocation ownership, admin-only/immutable migration 150 tables, and the disposable test's
database naming — all match. No drift found.

## Boundary respected, not reopened

Per the explicit boundary in REQUEST-R1.md, this slice does not bind the caller-supplied
`attemptId`/action parameters to the signed request body — that binding is deferred to
the future route handler, which must derive `expected.{caller,method,path}` from trusted
route configuration and parse the signed bytes into its own command. This is a known,
already-documented deferral, not a new finding. No public HTTP surface, replay claim
beyond the durable admit path, or production migration exists in this scope, and none is
asserted here.

## Non-blocking observations (not material findings)

- A caller that deliberately signs a request with `timestamp` at the extreme past edge
  of the 5-minute skew window gets as little as ~1ms of `retainNonceUntil` margin to use
  the resulting receipt for `issueStatusCapability`/`revokeStatusCapability` before
  `request_admission_required` fires. This only shortens the *signing caller's own*
  window and cannot be used against another caller — not exploitable, no action needed.
- Two distinct admitted operations (different `operation_id`s) for the same caller and
  attempt can each mint an independent, live status-read capability for that attempt.
  Given the capability only grants a boolean status read and `permits()` is re-checked
  per issuance, this is consistent with "idempotency is per-operation, not per-attempt"
  and is not a scope leak.
