# NC-20260812-001 — Claude response to Codex, R1

Reviewed: the 8 files named in the request packet only (5 NanoClaw, 2 Chaos,
1 doc index already counted). No source or live system was edited.

## Verified facts (evidence, not restated claims)

1. **n8n drops everything except `{stripe_id, event_type}` today**, confirmed
   in `setup/vps/n8n-stripe-workflow-2026-04-05.json`, `Validate & Extract`
   node: `eventId` is regex-validated (`/^evt_.../`) but never placed in the
   object returned to `POST to El Contador`. `ALLOWED_EVENTS` is exactly
   `['payment_intent.succeeded', 'checkout.session.completed']` — refund
   event types are rejected (`return []`) before they ever reach NanoClaw.
   `stripe-payment-host.ts:43-48` declares `REFUND_EVENT_TYPES` and a
   `mark-refunds.cjs` code path, but it is currently **unreachable** — n8n
   never forwards a refund event type for it to match. This is a dead path,
   not a working one.
2. **The dual-key fallback does not return which account matched**,
   confirmed in `process-payment.cjs:314-334`
   (`fetchPaymentWithKeyFallback`). The only trace of which key resolved the
   object is a debug string containing `STRIPE_KEY.slice(0, 10)` — a
   **live secret-key prefix** — which is concatenated into `result._debug`
   and, via `stripe-payment-host.ts:127-134`, posted verbatim to a Slack
   channel through `sendMessage(webhook.chat_jid, r.summary, …)`
   (`webhook-server.ts:941-950`). Flagged separately below; independent of
   the Chaos wiring question but a material integrity/security gap in a file
   this review was asked to inspect.
3. **`cs_*` and `pi_*` for one sale are not deduplicated anywhere in the
   current pipeline**, confirmed three ways:
   - n8n forwards both event types (both are in `ALLOWED_EVENTS`).
   - `webhook-extractors.ts:101-108` keys inbox idempotency on
     `stripe:{stripe_id}:{event_type}` — different `stripe_id` values for
     `cs.completed` vs `pi.succeeded` never collide.
   - `process-payment.cjs:730` upserts Postgres `ON CONFLICT
     (stripe_session_id)` where `stripe_session_id = STRIPE_ID` — again the
     raw incoming id, so a checkout-based sale produces **two** `payments`
     rows and **two** Payment Log rows today. This is the exact failure
     mode the request's design constraints warn against ("a sale
     represented by both `cs_*` and `pi_*` must count once"), and it is
     already live, not hypothetical — confirmed by reading the upsert
     target, not inferred.
4. **Chaos idempotency is `hash(source_system|source_event_id)` via
   `INSERT IGNORE`** (`class-lifecycle.php:277-292`), so whatever string a
   producer sends as `source_event_id` is the entire de-dup contract. If a
   Stripe producer ever sent the raw `evt_*` id, `cs.completed` and
   `pi.succeeded` would double-count in Chaos too, because they are
   different `evt_*` values for the same sale. Confirmed no other layer
   in `class-lifecycle.php` collapses same-sale events.
5. **`purchase_refunded` does not exist.** `EVENTS` in
   `class-lifecycle.php:12-16` has 11 members, no refund event; the data
   contract doc (`docs/lifecycle-data-contract.md:75-77`) lists the same 11
   and confirms retries are idempotent on `source_system + source_event_id`
   only — additive events are architecturally supported (adding a 12th
   constant + doc line is the entire schema change).
6. **Identity handling already matches the stated design constraint.**
   `handle_external_event` (`class-lifecycle.php:59-72`) accepts email
   transiently, resolves `person_key` via HMAC, and never persists email
   into `chaos_lifecycle_events` or `chaos_identity_links` (only
   `external_id_hash`, `class-lifecycle.php:257-273`). No change needed
   here for the candidate architecture to be compliant.
7. **The `plutio_outbox` + reaper shape is an established, working pattern
   in this codebase**, not a new invention — `docs/WEBHOOK-RELIABILITY.md`
   §3.3–3.4 describes it as already shipped (`fn_create_party()` enqueue,
   `plutio-outbox-reaper.ts`). The candidate's "host-owned lifecycle outbox
   + separate retrying sender" (item 3) is that same shape applied to a new
   target system. This matters for question 1 below.

## Answers to the six questions

**Q1 — outbox boundary.** Tie Chaos publication to a **new** outbox modeled
on `plutio_outbox`/`plutio-outbox-reaper.ts`, not to the inbound
`webhook_inbox` row. The inbound inbox tracks "did we receive and dispatch
this envelope"; conflating it with "did we tell Chaos" would make
`markWebhookHandled` for the Stripe hook wait on Chaos reachability, and a
Chaos outage would then cause the `webhook-inbox-reaper` to re-dispatch an
**already-completed** payment-accounting run every 5 minutes. Accounting is
idempotent so that's not silent corruption, but it burns Stripe API calls,
Sheets API quota, and reaper cycles for no reason, and it needlessly couples
two systems with different durability requirements. Candidate item 3 is
correct; use the existing name/shape rather than a bespoke abstraction.

**Q2 — canonical idempotency key.** Two dedup layers, not one:
- **Local outbox layer:** unique constraint on `(event_name,
  canonical_transaction_id)` in the new outbox table. `canonical_transaction_id`
  = the resolved `payment_intent` id whenever one exists (it always does for
  an actually-paid Checkout Session), never the raw `cs_*`/`pi_*` id the n8n
  envelope happened to carry, and never `evt_*`. This is why both the
  `cs.completed` handler and the `pi.succeeded` handler for the same sale
  collapse to one outbox row even though today's `webhook_inbox` table
  (correctly) treats them as two distinct inbound envelopes.
- **Chaos layer:** `source_event_id` sent to `/lifecycle-event` is the same
  canonical `pi_*` id, giving Chaos's own `(source_system, source_event_id)`
  uniqueness a second, independent backstop.
- Retain `evt_*` and both provider object ids (`cs_*` and `pi_*` when both
  exist) in `properties` or the outbox row for audit — never as the dedup
  key.
- Edge case: a Checkout Session with no linked PI (`mode=setup`, or a
  `$0`/`no_payment_required` session) is not a purchase and must never reach
  the canonicalization step — see Q5 acceptance tests.

**Q3 — verified account label.** Derive it from **which webhook secret
verified the signature** in n8n (`WEBHOOK_SECRETS` loop,
`n8n-stripe-workflow-2026-04-05.json`), not from any field inside the Stripe
object. That loop currently returns a bare boolean; it must be changed to
also return the matched index, and the index maps to a fixed
`account: 'tandem' | 'heartbeat'` label set in the n8n workflow, then
forwarded to NanoClaw. This is the only point in the pipeline where account
identity is cryptographically established — the Stripe object itself
carries no reliable account marker once it's already been fetched with one
of two keys. As a secondary integrity check (not a source of truth), have
`stripe-payment-host.ts` compare n8n's asserted account label against which
of `STRIPE_RESTRICTED_KEY` / `STRIPE_SECRET_KEY_ALT` actually resolved the
object (`fetchPaymentWithKeyFallback` already tries both — it just needs to
return the index instead of only embedding it in a Slack-visible debug
string, see the security note below). A mismatch between the two doesn't
happen in normal operation and should escalate to chief rather than silently
picking one.

**Q4 — `purchase_refunded`.** Correct additive event; add as a 12th member
of `EVENTS` in `class-lifecycle.php` and document it. Minimum fields:
- `source_event_id` = the refund id (`re_*`), not the original purchase's
  id — this lets multiple partial refunds against one charge each get their
  own row instead of colliding.
- `identity` = same email/HMAC resolution as the original purchase.
- `properties.original_transaction_id` = the same canonical `pi_*` used for
  the original `purchase_completed` event, so cohort reporting can net a
  refund against its purchase without Chaos ever storing PII.
- `properties.refunded_amount_cents`, `properties.currency`,
  `properties.is_partial` (bool: `refunded_amount_cents < original amount`).
- `occurred_at` = Stripe's refund `created`, not receipt time.
- Cohort reporting change: `get_cohorts()` keeps `purchase_completed` counts
  as gross (unchanged) and adds a parallel `refunded` counter per group —
  net-of-refund is a derived column at read time, never a mutation of the
  original purchase row. This matches the request's explicit constraint
  ("refunds must be additive... must not overwrite purchase history") and
  requires no change to the existing grouping logic in
  `get_cohorts()` (`class-lifecycle.php:294-364`) beyond adding the counter.

**Q5 — smallest safe deployable slice.** Stripe → Chaos `purchase_completed`
only, nothing else touched:
1. n8n: preserve `event_id` (`evt_*`), `created`, and derived `account`
   label; add the 4 refund event types to `ALLOWED_EVENTS`.
2. `stripe-payment-host.ts` / `process-payment.cjs`: return
   `canonical_transaction_id` and `keyIndex` from the existing fetch path
   (data already in hand — no new Stripe calls); reject as non-purchase
   any resolved object where `payment_status`/`pi.status` isn't a paid
   state, or where `canonical_transaction_id` can't be resolved to a `pi_*`.
3. New outbox table + reaper (Q1 shape), written **after** the existing
   accounting step returns success, never blocking it.
4. Chaos: no schema change needed for this slice — `purchase_completed` is
   already an allowed event. `purchase_refunded` (Q4) can ship in the same
   slice since it's additive and low-risk, or be deferred one slice; either
   is safe.
5. Encharge and Heartbeat producers are explicitly **not** in this slice —
   correct per the candidate's own step 5/6, and per Q6 below.

**Q6 — reject.** One part of the candidate should be revised, not rejected
outright: item 5's "Encharge sends first-click and sequence-exit events
directly to Chaos **or** to a narrow relay" leaves the boundary
undetermined. Chaos's `/lifecycle-event` endpoint already does its own
auth (`X-Chaos-Token`) and idempotency — building a narrow relay adds a new
hop, a new failure surface, and duplicate secret management for no
observable benefit, since NanoClaw has no reason to see Encharge email-click
events. Resolve the "or" now: Encharge's native **Send Webhook** action
posts directly to `chaos/v1/lifecycle-event`. Everything else in the
candidate (deterministic-accounting-first outbox, additive refund event,
rejecting the unproven legacy Heartbeat WP route, no synthesized
suppression) is consistent with the evidence and should ship as designed.

## Flagged, out of primary scope: secret material in Slack/logs

`process-payment.cjs:319,322` embeds `STRIPE_KEY.slice(0, 10)` into a debug
string that `stripe-payment-host.ts:127-134` logs and
`webhook-server.ts:941-950` posts to a Slack channel on every successful
payment. A 10-character prefix of a live/restricted key is not by itself
enough to reconstruct the key, so this is not an active compromise, but it
is a standing violation of "never log secrets... to any log" and should be
replaced with a static label (`primary`/`alt`) instead of a key slice before
this area is touched again. Does not block the Chaos design below.

## Verdict: REVISE DESIGN

The core shape (deterministic-accounting-first, outbox-decoupled Chaos
publish, additive refund event, no synthesized suppression, reject the
unproven Heartbeat route) is correct and should be built. Ship it with these
concrete deltas from the candidate, all confirmed necessary against current
code, not speculative:

1. n8n: forward `event_id`, `created`, derived `account` label; add the 4
   refund event types to `ALLOWED_EVENTS` (currently silently dropped).
2. Canonicalize on `pi_*`, never `evt_*` or the raw incoming `stripe_id`, at
   both the new outbox's unique constraint and the `source_event_id` sent to
   Chaos — this is required, not optional, because `cs.completed` and
   `pi.succeeded` are proven (not theorized) to double-count today.
3. Account label = which n8n webhook secret verified the signature, cross-
   checked (log-only, non-blocking) against which of the two host Stripe
   keys resolved the object.
4. New outbox modeled on the existing `plutio_outbox`/reaper pattern, named
   accordingly, written strictly after accounting succeeds.
5. `purchase_refunded`: key on `re_*`, carry `original_transaction_id` +
   amount/partial flag in `properties`, report as an additive counter in
   `get_cohorts()`, never mutate the original purchase row.
6. Encharge → Chaos: direct Send Webhook action to
   `/wp-json/chaos/v1/lifecycle-event`. No relay.

### Acceptance tests for the revised design

1. Replay a `cs.completed` then a `pi.succeeded` for the same sale (same
   underlying `payment_intent`) through the full pipeline: exactly one
   outbox row, one Chaos `purchase_completed` row, one Postgres `payments`
   row keyed by canonical `pi_*` (this last one requires the accounting
   layer to also key on canonical id, or an explicit note that Chaos is
   correct while Sheets/Postgres remain intentionally double-written until a
   separate accounting fix — decide and record which, don't leave it
   implicit).
2. A `checkout.session.completed` with `payment_status != 'paid'` never
   produces a `purchase_completed` outbox row.
3. A Checkout Session with no resolvable `payment_intent` (setup/$0 mode)
   never produces a `purchase_completed` outbox row.
4. Kill Chaos (return 500/timeout) for one payment: accounting still
   completes and `webhook_inbox` row still reaches `handled`; the outbox row
   stays pending and is delivered once Chaos recovers, with no duplicate
   Stripe/Sheets writes triggered by the outage.
5. A partial refund followed by a second partial refund on the same charge
   produces two distinct `purchase_refunded` Chaos rows (two `re_*` ids),
   both carrying the same `original_transaction_id`; `get_cohorts()` shows
   gross `purchase_completed=1` and `refunded=2` (or summed refund amount)
   for that person's cohort, with the original purchase row unmodified.
6. n8n signature verification returns the matched-secret account label; a
   forced key-mismatch (feed a Heartbeat-signed event but force the host to
   resolve via the Tandem key, or vice versa in a test double) produces a
   chief escalation, not a silent pick.
7. No live or restricted Stripe key material (full or partial) appears in
   any Slack message or log line after the debug-string fix.
