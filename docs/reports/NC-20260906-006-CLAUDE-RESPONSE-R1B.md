# Bounded adapter review — response (R1B)

Scope: `src/bookkeeper-enrollment-contract.ts`, its test file, and
`docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md` only, per
`NC-20260906-006-CLAUDE-REQUEST-R1B.md`. Predecessor engine mechanics not
re-investigated.

## Verdict

No defect that breaks the core paths the tests exercise (duplicate/replay
short-circuit, source/finance/offer gating, per-seat capacity + rollback,
future-effective materialization, version threading through the seat loop are
all internally consistent). Two material gaps found against the review's own
focus areas; both are real behavior, not speculative.

## Finding 1 — capacity reservations lose true funding-channel provenance

`src/bookkeeper-enrollment-contract.ts:473-489` calls `reserveCapacity` with a
hardcoded `sourceScope: 'manual_sale'` (line 478) for **every** commitment
this adapter creates, regardless of the receipt's actual `sourceChannel`
(`website_stripe_checkout`, `sponsored_cohort`, `check_ach_or_wire`,
`plutio_invoice_or_contract`, grants, etc.). The order-level
`sourceReference` correctly preserves the real scope/objectType/objectId, but
the capacity-side commitment record cannot be distinguished by true origin —
a website Stripe seat, a sponsor seat, and a bank-wire seat are all recorded
identically as `manual_sale` in the capacity aggregate. Anyone reconciling
`showInventory`/reservations against real funding channels (the review's
"account/canonical-payment scoping" and "capacity counting" focus) has to
join back through `orderKey` to the enrollment side to recover it; the
capacity aggregate alone misrepresents origin for all non-manual channels.

## Finding 2 — no cross-order duplicate-participant guard

The only duplicate-participant check is `named` (lines 427-429) plus the
`participant_ambiguous` gate (lines 508-511), which dedups
`participantPartyId` **within the seats array of the single receipt being
processed**. Nothing queries existing `enrollment.enrollments` (or
`enrollment.entitlements`) for a Party already holding an active/pending
entitlement against the same offer/pool/component from a prior, unrelated
order. Two independent, individually valid receipts (different
`source.objectId`, hence different `orderKey`) that both name the same
`participantPartyId` for the same class will each pass every gate
independently: each creates its own seat, its own capacity reservation, its
own entitlement/enrollment, and its own queued roster projection for the same
real person — silently consuming two capacity seats and producing two
divergent roster projections with no exception raised. `reserveCapacity` is
explicitly documented as not validating "whether their person is known"
(accepted dependency mechanics), so this adapter is the only layer in scope
that could catch it, and it doesn't.

## Minor note (not a defect)

The per-subject dedup inside `hold()` (line 202,
`if (enrollment.exceptions[exceptionKey]) return;`) is unreachable in the
current control flow: any exact replay of a receipt that previously produced
an order-level or seat-level hold is intercepted by the top-level
`old?.evidenceSha256 === fingerprint` duplicate check (lines 217-219) before
any `hold()` call is reached again. Idempotency is therefore enforced solely
by the top-level short-circuit; the in-`hold()` guard currently does nothing.
Worth knowing if either mechanism is edited independently in the future.
