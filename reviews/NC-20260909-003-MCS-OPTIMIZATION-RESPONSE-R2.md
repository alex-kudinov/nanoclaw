# Narrow correction review: unsigned optimization evidence R2

## Verdict

GO

## What was checked

- `factSchema` in `payment-domain.ts` is `.strict()` with an explicit field
  list (`deliveryId, scope, attemptId, paymentReference, kind,
  operationReference, success, amount, currency`) — no provider/ESD/3DS field
  exists on `PaymentFact`, and `.strict()` rejects any extra key at parse
  time, so even a future caller mistake can't smuggle supplemental data back
  into the canonical fact or its fingerprint.
- `payment-event-store.ts` builds the `fact` object passed to `recordFact`
  without `providerEvidence`; the provider evidence is read into a sibling
  local (`providerEvidence`) and only reaches
  `recordProviderOptimizationEvidence`, never `recordFact`/`projectPaymentEvidence`.
  Event fingerprinting (`payment_events.payload_sha256`) and duplicate
  detection are therefore unsigned-field-free, closing the R1 gap.
- `recordProviderOptimizationEvidence` runs in its own transaction, separate
  from `recordFact`'s commit, and only fires when
  `providerEvidence && result.attemptId === attemptId`. It re-validates the
  attempt's scope against `this.scopeHash` before inserting, so evidence
  cannot attach across scopes. The insert is `ON CONFLICT
  (scope_sha256,event_id,evidence_sha256) DO NOTHING`, matching the
  documented commit-then-retry ordering: if the evidence write fails after
  the fact commits, the provider retry re-delivers, the fact path returns
  `duplicate` (idempotent), and the evidence insert gets a fresh chance with
  the same digest key — it is not lost and not duplicated.
- Neither `projectPaymentEvidence` (`payment-domain.ts`) nor
  `readInternalEvidence`/`readConfirmationSummary`/`refresh`
  (`payment-event-store.ts`) reference
  `payment_provider_optimization_evidence` anywhere — confirmed by reading
  every query in the file. Supplemental evidence cannot reach authorization,
  confirmation, fulfillment, or conflict-state projections.
- `162_...sql` / `rollback_162_...sql`: admin-only ownership, all other roles
  revoked, immutable (`BEFORE UPDATE OR DELETE` trigger reusing the existing
  `fn_payment_store_immutable`), FK to `payment_attempts`, and the rollback
  refuses while any row exists. The disposable test exercises the full
  dependency order (refuse-while-populated, truncate, rollback 162 before
  rollback 151, reapply, rollback again) and it is internally consistent.
- The persisted-evidence assertion in
  `payment-event-disposable.test.ts` (`.toEqual({...})` with an exact key
  set) confirms `shopperEmail`/`store` never reach the evidence row, and the
  separate `persisted`/`confirmation` assertions confirm no PSP reference or
  HMAC key leak through the fact or confirmation surfaces either.

## Non-material note (not blocking)

`recordProviderOptimizationEvidence` fires whenever
`result.attemptId === attemptId`, which is also true for some `needs_review`
outcomes that resolve to the *correct* attempt (e.g.
`provider_reference_conflict`, `amount_or_fact_conflict` — both return
`attemptRow.attempt_id`, the same attempt the webhook correlates to). So
evidence can be written for an event that was held as an exception rather
than recorded as a fact. Since no projection/confirmation path ever reads
this table (confirmed above), this cannot change authorization, confirmation,
fulfillment, or conflict state, and it stays scoped to the one real attempt —
it does not meet the material bar for this review.
