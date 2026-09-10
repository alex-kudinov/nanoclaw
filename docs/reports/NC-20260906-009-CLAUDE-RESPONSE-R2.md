# Re-review response — R2

Scope: `docs/reports/NC-20260906-009-CLAUDE-RESPONSE-R1.md`,
`docs/reports/NC-20260906-009-CORRECTION-EVIDENCE-R2.md`,
`src/student-enrollment-admission.ts`. Read/write only, no other tool use.

## R1 disposition: CLOSED — narrowed and fixed

R1's broad claim (predecessor never bound `channel` to any proof, so any
caller could set `channel: 'migration_or_correction'` and skip
`claimEnrollmentWriter` entirely) does not match the predecessor code shown
in the evidence: `enrollmentIngressProofPayload` already put `channel` inside
the `commercial`/`participant`/`assignment` proof payload context, and the
predecessor's `migration_or_correction` branch already routed to an owned
`quarantine('correction_requires_resolution', 'owner_admin')` with no
enrollment materialization — not the unauthenticated double-write R1
described.

The real, narrower gap R1 surfaced was real: the `funding` purpose's proof
payload (`enrollmentIngressProofPayload`, `purpose === 'funding'` branch)
never included `channel`, so a funding-only signed statement did not bind
`channel` to any MAC, and `statementSchema` carried no `channel` field at
all — nothing rejected a caller who resigned/reused a funding proof while
swapping `e.channel` on the envelope.

The applied correction, verified directly in
`src/student-enrollment-admission.ts`:

- `statementSchema` now has a required `channel: channelSchema` field
  (line 64), and `verify()` rejects any statement where
  `statement.channel !== e.channel` or `!issuer.channels.includes(e.channel)`
  (lines 420–421) — this binds `channel` to every signed statement,
  independent of purpose, closing the funding-only gap directly rather than
  only via the commercial/participant/assignment payload context.
- Issuer registration enforces `channels` (min 1, max 8, validated enum) and
  throws `invalid_issuer_channel` when a `migration_or_correction` channel is
  registered on non-`operator_decision` transport (lines 334–336) —
  combined with the pre-existing transport/role XNOR check (lines 329–333),
  this excludes `source_adapter` (provider) issuers from registering the
  correction channel — and when `scholarship`/`complimentary_owner_grant`
  is registered by a non-`owner_admin` role (lines 337–341).
- `admit()` now checks `e.channel === 'migration_or_correction'`
  unconditionally, before the writer-claim branch (lines 488–494), and only
  calls the local, non-mutating `admissionHold(...,
  'correction_requires_resolution')` — it never reaches
  `claimEnrollmentWriter` or `applyEnrollmentIngress` for that channel. This
  makes the no-student-effect guarantee for corrections structural rather
  than dependent on the writer-claim short-circuit R1 flagged.
- `channels` is defensively copied at registration (`z.array(...).parse(...)`
  plus explicit `channels,` in the stored issuer object, line 351),
  consistent with the existing `purposes`/`sourceScopes` copy pattern, so
  post-registration mutation of the caller's issuer object is inert.

This matches the evidence's described diff and disposable-PostgreSQL
reproduction (unchanged legacy writer, unchanged legacy effect count, zero
new enrollment, `correction_requires_resolution` exception, `held`
disposition) and is consistent with the source as read.

## NO MATERIAL FINDINGS

No further material issues found in the bounded artifacts. The
`migration_or_correction` path is now authenticated at the channel level for
every proof purpose (including funding-only), structurally review-only
(cannot reach the ingress engine or writer claim regardless of future edits
to that branch), and channel-restricted issuer registration correctly
excludes provider/source_adapter issuers from the correction channel and
non-owner-admin issuers from grant channels, matching the stated intent that
operators may request correction review but cannot execute a migration or
mutate a student.
