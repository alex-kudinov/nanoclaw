# NC-20260812-001 — Claude response to Codex, R2

Reviewed: the 8 bounded files plus the 4 focused test files named in the
request. Traced each convergence/idempotency claim against actual code (not
the summary's prose). No source or live system was edited.

## Answers to the six questions

**Q1 — cs.completed/pi.succeeded convergence.** Yes, safely, for all five
targets, verified by tracing both arrival orders:

- `process-payment.cjs:514` sets `accountingStripeId = canonicalTransactionId
  || STRIPE_ID`. Whenever `payment_intent` is resolvable (the normal case for
  a paid Checkout Session), `accountingStripeId` is the `pi_*` regardless of
  which event type triggered the run.
- Payment Log (`process-payment.cjs:556`) and the Sales fallback tab
  (`process-payment.cjs:730`) both match on `candidateIds = new Set([accountingStripeId,
  STRIPE_ID])`, so whichever event arrives second finds the row the first one
  wrote (keyed on `pi_*`) and updates it in place — no duplicate row either
  order.
- Postgres (`process-payment.cjs:768`) upserts `ON CONFLICT (stripe_session_id)`
  on the same canonical `pi_*`, plus a same-transaction `DELETE ... WHERE
  stripe_session_id = <raw STRIPE_ID>` when the two differ — this only ever
  targets a row keyed under the *other* run's raw id, never the canonical row
  itself (the two id strings can't collide), so it cleans up a stray
  pre-canonicalization duplicate without any path that deletes a distinct,
  legitimate payment.
- Outbox (`chaos-lifecycle-outbox.ts:141` `ON CONFLICT (source_system,
  source_event_id)`) and Chaos (`class-lifecycle.php:278` `INSERT IGNORE` on
  `hash(source_system|source_event_id)`) both key `purchase_completed` on the
  same canonical `pi_*`, so both event types collapse to one outbox row and
  one Chaos row regardless of arrival order.

**Q2 — unauthenticated/caller-controlled account selection.** No live
attack path found. `account` is not accepted as ground truth on its own —
it selects which single Stripe key `process-payment.cjs`/`mark-refunds.cjs`
try (`--account`), and Stripe restricted keys are hard-scoped per account, so
a mismatched `(account, stripe_id)` pair simply 404s rather than resolving
against the wrong account's data (`process-payment.cjs:337-359`,
`STRIPE_KEYS` filtered to one entry when `--account` is set). The n8n side
(`n8n-stripe-lifecycle-extractor.js:5`, `N8N-STRIPE-LIFECYCLE.md`) hard-codes
the label per Stripe-Trigger-credential-bound Code node and documents
removing the old unauthenticated `AliasHeartbeatSpaced` webhook alias. See
Finding 2 below for a related but non-blocking gap (missing `account` is
accepted, not rejected).

**Q3 — outbox PII-free + retry safety.** Confirmed on all four axes:
- **PII-free at rest:** `116_chaos_lifecycle_outbox.sql` has no email/name
  column; `chaos-lifecycle-outbox.test.ts` asserts
  `JSON.stringify(params)` doesn't match `/email|name/i`. Email is resolved
  only inside `sendRow` (`chaos-lifecycle-outbox.ts:232`), immediately before
  the authenticated POST, from `public.payments` — never persisted to the
  outbox row.
- **Crash / stale in-flight:** `claimRows()` re-selects `status='in_flight'
  AND last_attempted_at < now() - interval '15 minutes'`
  (`chaos-lifecycle-outbox.ts:189`), `FOR UPDATE SKIP LOCKED` — a crashed
  sender's claim is retried after 15 minutes without another sender racing it.
- **Timeout:** `AbortController` + 15s timeout wraps every send
  (`chaos-lifecycle-outbox.ts:254-269`).
- **Duplicate success response:** if NanoClaw crashes after Chaos accepts but
  before `markSent`, the retry re-POSTs; Chaos's own `INSERT IGNORE` on
  `hash(source_system|source_event_id)` returns `200 {"status":"duplicate"}`
  (`class-lifecycle.php:103-107`), which is still `response.ok`, so the retry
  completes cleanly. No double-count.

**Q4 — `purchase_refunded` distinctness.** Confirmed. `source_event_id` is
the refund's `re_*` id end-to-end (n8n extractor →
`stripe-payment-host.ts:190,223` → `chaos-lifecycle-outbox.ts:77-82`
`sourceEventId()` → outbox unique constraint → Chaos `source_event_id`), with
`canonical_transaction_id` carried separately as the shared `pi_*` for
netting. Two partial refunds on the same charge produce two distinct outbox
rows and two distinct Chaos rows, both pointing at the same
`properties.original_transaction_id`. `webhook-extractors.test.ts` covers the
fan-out key distinctness at the inbox layer.

**Q5 — cohort/reconciliation honesty.** Correctly separated, verified by
reading both consumers:
- `class-lifecycle.php` `get_cohorts()` keeps two different counters in the
  same response and does not conflate them: `source_totals[...].events[name]`
  increments on **every** matching row (raw receipt count — a person with 2
  refund events contributes 2), while the per-group `refunded`/`purchase_completed`
  counters in `$groups` increment **once per person** regardless of how many
  matching events they had (`chaos-lifecycle.php:329` vs `:366`,
  `$person['stages'][$stage] = true`). Raw receipts and attributed-person
  conversion are structurally distinct fields in the same payload.
  `test-data-foundation.php:100` only checks `purchase_refunded` is a
  recognized canonical event name — it does not exercise this counter
  separation, but the source is unambiguous on inspection.
- `reconcile-chaos-lifecycle.cjs` compares three raw-receipt counts only
  (Stripe API count, outbox row count, Chaos `source_totals` count) — it
  never touches the per-person cohort endpoint, so the weekly reconciliation
  report cannot accidentally present conversion-rate-shaped numbers as
  receipt counts.

**Q6 — P0/P1 findings.** Two, both below.

## Finding 1 (P1, production operability) — dead-lettered lifecycle facts raise no alert

`chaos-lifecycle-outbox.ts::runChaosLifecycleOutbox` only calls
`logger.warn` when a row is dead-lettered
(`chaos-lifecycle-outbox.ts:341-350`); there is no equivalent of the
`alertChief(...)` call that every other reaper in this codebase makes on
dead-letter — `plutio-outbox-reaper.ts:392-397`, and the same convention
exists in `webhook-inbox-reaper.ts`, `trafft-sweeper.ts`, and
`hive-sync-reaper.ts`. The implementation summary describes this outbox as
"modeled on the existing `plutio_outbox`/reaper pattern," but this specific
piece of that pattern was not carried over.

Consequence: if the Chaos endpoint is unreachable or misconfigured for the
`~2 days` it takes to exhaust `MAX_ATTEMPTS=8` at the capped exponential
backoff, a real purchase or refund fact is silently dropped to
`dead_lettered` with nothing but a log line. The only backstop is the weekly
`reconcile-chaos-lifecycle.cjs` run noticing `stripe_minus_chaos > 0` — up to
a week of silent gap for a system whose explicit design constraint is that
external failures "must be observable."

**Fix:** add a chief alert in `runChaosLifecycleOutbox` when
`result.deadLettered > 0`, mirroring `plutio-outbox-reaper.ts:392-397`
(include outbox id, `event_name`, and `last_error`).
**Acceptance test:** in `chaos-lifecycle-outbox.test.ts`, drive a row through
`MAX_ATTEMPTS` failed sends and assert the alert path is invoked exactly
once for that row.

## Finding 2 (P2, defense-in-depth, not blocking) — `account` is optional and silently falls back to dual-key trial

`parseStripeAccount` returns `null` (not an error) when `account` is absent
(`stripe-payment-host.ts:100-113`), and `handleStripePayment` only passes
`--account` when it's present. If `account` is missing — e.g. n8n drifts from
the mandated envelope in `N8N-STRIPE-LIFECYCLE.md`, or a future caller
constructs the payload by hand — `process-payment.cjs`/`mark-refunds.cjs`
silently revert to the pre-R1 "try both keys in order" behavior instead of
rejecting the request. This does not corrupt data (Stripe object ids are
unique per account, so the wrong key simply fails to resolve — see Q2), but
it means the one field this design added specifically to remove account
ambiguity is not actually required at the trust boundary, and a
misconfiguration degrades silently rather than failing closed.

As a direct consequence, the "account mismatch → escalate" check
(`stripe-payment-host.ts:213-218`) is currently unreachable: whenever
`account` is supplied, `STRIPE_KEYS` is filtered to that one label, so the
resolved `stripeAccount` can only ever equal the value that was passed in (or
the call fails with no fact at all). It's a harmless invariant guard, not a
live cross-check — don't rely on it as tested behavior in a future refactor.

**Fix (optional before shipping, recommended before the Encharge/Heartbeat
slices that will add more producers):** reject `payment_intent.succeeded`,
`checkout.session.completed`, and the refund event types when `account` is
absent, instead of falling back.
**Acceptance test:** in `stripe-payment-host.test.ts`, a payment/refund
payload without `account` throws `StripePayloadError`.

## Verdict: REVISE

Core convergence, idempotency, refund-distinctness, and PII-minimization
claims all check out against the code, not just the summary. Finding 1 is
the one that should block deployment — it's a small, mechanical fix that
brings this outbox in line with the alerting convention every sibling reaper
in this codebase already follows, and its absence is a real silent-data-loss
gap in a pipeline built specifically to prevent silent data loss. Finding 2
is worth doing in the same pass since it's adjacent code, but does not by
itself block shipping the current slice.
