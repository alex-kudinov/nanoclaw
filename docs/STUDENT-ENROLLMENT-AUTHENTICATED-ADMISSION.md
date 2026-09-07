# Local authenticated admission foundation

NC-20260906-009; unwired, synthetic-only, on the disposable transactional store.
The owner separated this source foundation from
`work:student-enrollment-production-admission-pilot`. No real credentials,
provider/native API call, student/history read, production migration, deployment,
writer cutover, financial action or communication is included.

## Registered host statements

`createEnrollmentAdmission` takes trusted host issuer/key and catalog
configuration. It authenticates a local HMAC-SHA256 statement protocol over exact
UTF-8 body bytes. This is a **host verification receipt protocol**, not native
Stripe/Plutio webhook compatibility. Provider-event/provider-read issuers are
mocked host adapters here; production bindings must authenticate the actual
native event/read first. Operator issuers require real named-session/decision
authority in the separately gated pilot.

Registration binds actor, role, transport, exact source scopes, channels and purposes.
Provider transports only use source_adapter; operator transport uses finance,
enrollment or owner roles. Keys must be distinct and are copied privately.
Messages cannot choose roles, actor, catalog or another scope. Keys/signatures
are never stored in the database or exposed in service results.

Statements bind version/audience, issuer/transport/channel, immutable receipt ID,
purpose, proof key, issued/expiry time and exact facts. MAC comparison is
constant-time after bounded shape checks. Invalid signatures, time windows,
issuer/purpose/scope bindings, duplicate proof/receipt keys and altered facts
reject before persistence. Funding must authenticate; missing business proofs
become the existing owned holds. Business channel/role rules remain in ingress.

Proofs bind canonical source, offer, seat number/count, Party, payer relationship
and class as appropriate. Aliases remain one funding identity. Verification
returns a private WeakMap-backed certificate, not a caller-supplied verified
flag. It cannot cross service instances or serialize. Exact retry is allowed
within its lifetime; freshness is rechecked after database locks, immediately
before admission. Times are epoch milliseconds with at most a ten-minute lifetime.
Renewed statements need new immutable receipt IDs.

The channel is authenticated even with funding-only evidence. Provider issuers
cannot register correction channels, and grant channels require owner_admin.
Authenticated operator correction requests take an explicit review-only branch:
an owned `correction_requires_resolution` case, no call to the enrollment engine,
no funding writer claim, and no enrollment/entitlement/assignment/projection or
capacity effect. Actual correction execution remains separately gated.

## One transaction and one writer

The trusted transaction-decision composition retains the existing store's
disposable target guard, SERIALIZABLE isolation, 20 canonical table locks,
version checks, readback and commit uncertainty. No serialized callback or
external endpoint is added.

Local/unapplied migration 147 adds append-only admin-owned authenticated receipts
(issuer/receipt IDs, hashes, actor/role/purpose/transport/times) and writer claims
(canonical source, writer, policy, evidence and actor/time). It grants no minion
access. Rollback refuses either populated ledger.

All receipt identities are checked before insertion in the same transaction.
Reuse with changed facts or principal authority produces an owner exception,
never overwritten evidence. New control records receive exact readback checks.
Writer identity is canonical Payment Intent, invoice payment, bank receipt or
owner grant; checkout/event aliases cannot create another writer identity.

The new path and synthetic legacy executor share claims and lock order. Legacy
ownership or a different policy denies the new path with an owned exception
and no enrollment effect. The legacy mock refuses enrollment-owned sources.
Control rows and canonical state roll back together; uncertain commits reconcile
through exact intake retry. Results are internal host state; a future public
acknowledgement must not expose these full aggregates.

**Real legacy writers are unchanged.** The guarantee applies to participating
callers. The pilot must wire both real paths through the gate, keep raw storage
primitives internal, and prove no bypass/dual processing. Disposable guards
prevent this foundation from being treated as a live release.
Claims provide mutual exclusion for enrollment effects, not automatic population
selection or accounting control. The pilot must define routing eligibility and
preserve independent financial-record capture.

## Verification and remaining gate

Ephemeral-key mocks and disposable PostgreSQL prove authentication denials,
opaque certificates, aliases, grants, partial sponsors, dual-writer races,
receipt/policy conflicts, control-row readback, atomic rollback, commit-ack loss,
expiry before writes, no stored credentials, append-only receipts, guarded
rollback and zero non-admin grants.

Native bindings, real operator authentication, credential provisioning, bounded
production data/locks, migrations 146/147, store promotion, both writers,
rollback and an explicit new-event population remain in the unauthorized pilot.
Historical replay, provider projections and authority cutover are not silently
included in this local completion.
