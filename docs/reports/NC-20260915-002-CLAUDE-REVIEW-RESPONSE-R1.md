# NC-20260915-002 bounded authentication review — response R1

Scope reviewed: the 7 allowed paths only. No other repository or history
inspected.

## Material findings

No material security, authorization, replay, parser, or evidence defects
found. Two non-blocking observations, neither requiring correction:

1. **Manual time check is stricter than, not a replacement for, the library
   check — confirmed intentional, not a gap.**
   `google-service-account-transport.ts:133-144` re-checks `iat`/`exp` against
   `transportPolicy.observedAt` with a 60s skew, on top of the 3,600s
   `maxExpiry` already enforced inside
   `OAuth2Client.verifySignedJwtWithCertsAsync` (line 110-116). The negative
   test `rejects expired and future tokens` (`google-service-account-transport.test.ts:164-178`)
   uses offsets of only 61s past/future — inside typical library clock-skew
   tolerance but outside the app's 60s window — and asserts the specific
   reason code `SERVICE_TOKEN_TIME_INVALID`. This proves the tighter
   application-level window is load-bearing (the library's own check alone
   would not reject these cases), which is a legitimate additional hardening
   layer, not a redundant no-op. No correction needed.

2. **Returned `identity.*` fields are echoed from `payload.*` rather than
   from `transportPolicy.*`.** (`google-service-account-transport.ts:167-171`)
   By the time this executes, `payload.aud/email/sub` have already been
   compared equal to the policy-injected expected values
   (lines 122-131), so the two sources are guaranteed identical at this point.
   Purely cosmetic; does not weaken the "expected values are injected from
   policy, never derived from the token" requirement, since the *decision* to
   accept was made against policy, not against the token.

## Required boundary questions

**Issuer** — enforced twice: `OAuth2Client.verifySignedJwtWithCertsAsync` is
called with `[transportPolicy.expectedIssuer]` as the only accepted issuer
list (`google-service-account-transport.ts:114`), and the exact constant type
`typeof GOOGLE_SERVICE_ACCOUNT_ISSUER` on
`GoogleServiceAccountTransportPolicy.expectedIssuer` makes it a compile-time
literal — no other issuer string can even be configured. Supported.

**Audience** — passed as the required audience to the same library call
(line 113) and re-checked manually (line 125). Covered by the negative test
`wrong audience` and by the crossrepo/D2 integration assertion that a wrong
audience is rejected with zero database writes
(`d2-student-lifecycle-shadow.disposable.test.ts:1008-1021`). Supported.

**Principal / subject** — `payload.email` and `payload.sub` are checked
against `transportPolicy.expectedPrincipalEmail` /
`expectedSubject` (`google-service-account-transport.ts:126-128`), plus
`email_verified === true` strictly (not truthy). Binding both the mutable
`email` and the GCP-immutable numeric `sub` defends against a
deleted-and-recreated service account reusing the same email with a
different underlying identity — a real GCP gotcha, correctly closed here.
Supported.

**Time** — signature-library expiry bound (3,600s max) plus a stricter
independent 60s-skew application check against injected `observedAt`
(see finding 1). Supported.

**Signature** — delegated entirely to `google-auth-library`'s
`verifySignedJwtWithCertsAsync` against an injected certificate map; no
custom HMAC/verification exists. Confirmed both by direct reading of
`google-service-account-transport.ts` and by the structural regex assertion
in `google-account-claim-proposal-boundary.test.ts:20-25`, and exercised
by the negative test `rejects a token whose trusted certificate does not
match its signature` (`google-service-account-transport.test.ts:180-192`).
Header shape is pre-validated (`alg==='RS256'`, exactly 3 keys, bounded `kid`
pattern) before any crypto runs, closing the classic alg-confusion/oversized-kid
class of attack. Supported.

**Body** — bounded to 16 KiB before UTF-8 strict decode and JSON parse
(`google-service-account-transport.ts:96-98,146-153`), then passed to the
existing, unchanged strict proposal schema. The `authority-bearing body`
test (`google-service-account-transport.test.ts:203-206`) confirms a body
carrying `targetPartyId` is rejected as `SERVICE_PROPOSAL_INVALID` before
Company OS derivation. Supported.

**Replay** — the transport module deliberately implements no nonce/replay
store, consistent with the checkpoint's explicit constraint against a second
replay ledger. The load-bearing property — that a token not binding the body
still can't be used to smuggle an altered proposal — is proven end-to-end in
`d2-student-lifecycle-shadow.disposable.test.ts:1135-1164`: an
altered-but-same-`claimId` proposal passes transport (`accepted`, since the
token doesn't bind bytes) and is then rejected at the store layer with
`claim_id_payload_conflict`, with zero additional writes. Exact replay is
separately proven to reach the pre-existing `EXACT_CLAIM_REPLAY_NOOP`
zero-write path (lines 1110-1133). Supported.

**Transaction-authority** — the new transport path does not bypass or weaken
the pre-existing serializable-transaction requirement. Driving the accepted
proposal through a non-serializable transaction throws
`serializable_transaction_required`, and through an autocommit/session-level
serializable client throws `transaction_boundary_lost`
(`d2-student-lifecycle-shadow.disposable.test.ts:1023-1052`), both with zero
writes. Supported.

## Forbidden-expansion check

Read all 7 allowed files directly. Found no runtime import, HTTP
endpoint/listener/client, `fetch`/`axios`/`process.env` usage, Google
metadata or IAM call, custom HMAC/canonical signing, replay table, retry
worker, DDL/migration 168, or Party/ref/access/provider/customer write in
`google-service-account-transport.ts` or any of the four test files. The
structural test (`google-account-claim-proposal-boundary.test.ts`) enforces
this independently and passed per the supplied evidence. Consistent with the
checkpoint's declared scope.

## Correction required before commit/push

None.

## Verdict

`PASS`
