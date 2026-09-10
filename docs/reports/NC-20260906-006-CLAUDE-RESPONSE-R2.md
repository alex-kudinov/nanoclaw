# Re-review of R2 corrections — response

Scope: `docs/reports/NC-20260906-006-CLAUDE-RESPONSE-R1B.md`,
`docs/reports/NC-20260906-006-CORRECTIONS-R2.diff`, and
`src/bookkeeper-enrollment-contract.ts` only, per
`NC-20260906-006-CLAUDE-REQUEST-R2.md`. Predecessor engine mechanics not
re-investigated.

## Verdict

NO MATERIAL FINDINGS.

All five listed corrections are present in the code as described and match
their stated regressions/tests:

1. Capacity `sourceScope` now maps `website_stripe_checkout` →
   `website_stripe_sale`, `plutio_invoice_or_contract` → `invoice`,
   `check_ach_or_wire` → `check`, `sponsored_cohort` → `sponsor`, everything
   else (including grants) → `manual_sale` (lines 502-511), verified per
   payment-channel test case.
2. The seat loop now checks `enrollment.enrollments` for an existing
   `pending`/`active`/`held` entry for the same `participantPartyId` before
   materialization (lines 549-565) — matched by delivery-block key when the
   seat has an assignment, by `offerKey` when it doesn't. On a match it opens
   `participant_already_enrolled` for `owner_admin` and `continue`s before
   `assignParticipant`/`materializeEnrollment`. The check runs after
   `reserveCapacity` (lines 497-522) but the capacity commitment is not
   rolled back on this path, so the funded reservation stays `held` and
   counted, matching the described "explicit resolution" behavior. A
   `completed` prior enrollment does not match `['pending','active','held']`,
   so a later legitimate enrollment is unaffected.
3. The exact-replay duplicate check (lines 217-224) now compares
   `enrollment.evidence['{orderKey}:admission'].evidenceSha256` — an
   append-only record attached once, immediately after `captureOrder`, before
   any later validation hold — instead of the order's mutable
   `evidenceSha256`. `correctOrderTerms` changes the latter but not the
   former, so replay after a legitimate correction still short-circuits
   correctly.
4. A conflicting receipt on an existing order now throws
   `source_unverified` before any mutation (lines 225-232) unless
   `authority.acceptedReceiptSha256` matches the new receipt's fingerprint
   and it isn't future-dated; only then does it proceed to `hold(...,
   'duplicate_source_conflict', 'owner_admin')` and freeze queued/failed
   projections. The throw path performs no state changes, matching the
   regression's assertion that input state is unchanged and the original
   projection stays `queued`.
5. `delivery_block_expired` is checked before any capacity reservation is
   attempted (lines 463-466), so no reservation is created for an expired
   block. `checkout_session` objects fail the stripe `sourceValid` shape
   check (requires `objectType === 'payment_intent'`) and are held as
   `source_identity_invalid`.

## Minor note (not material)

Lines 225-228 throw the same message — `'unattested conflict cannot change
an existing order'` — for two distinct conditions: an actual hash mismatch,
or a hash match that is simply future-dated relative to `occurredAt`. The
fail-closed behavior is correct in both cases, but an operator reading the
thrown error for a genuinely attested, merely future-dated correction would
see a message describing it as unattested. Worth a distinct error code/message
if this path is ever surfaced to a human triager; not a functional defect.

## Verification

Confirmed by reading, not by execution. No Bash, MCP, runtime, or additional
file reads were used beyond the three listed sources.
