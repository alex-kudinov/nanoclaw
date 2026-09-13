# NC-20260909-003 architecture reset — bounded correction review R2

VERDICT: MATERIAL CORRECTION REQUIRED

## Adjudication of the eight corrections

1. **WordPress state machine "untouched" — CONFIRMED.** R1's Keep section
   verbatim carries the original request's *current-fact* description
   ("browser context, intents, preparations") into a *recommendation*
   ("untouched by this reset"), in both the flow (A.1) and the Keep list.
   Decision 9 only requires an editable form plus one temporary submission
   record before payment. R1 conflated "this is what WordPress does today"
   with "this should stay exactly as it is," which reopens the parallel
   intent/preparation/quote/capability state machine the owner's
   simplification rejected.
2. **Transients as production persistence — CONFIRMED.** R1 keeps "the
   shape" of `class-adyen-test-checkout.php`'s transient-backed attempt
   record for production and never states the storage medium changes. WP
   transients (`get_transient`/`set_transient`, `SESSION_TTL = 1800`) live in
   `wp_options` or an external object cache and can be evicted or expire
   silently; they are not a transactional record. The validation/idempotency
   logic is reusable; the persistence layer is not.
3. **Terminal retry reuses the idempotency key — CONFIRMED.** R1's flow
   (B.3) states plainly: "Terminal nonpayment → delete the temporary
   submission, **free the idempotency key for a fresh attempt**." Freeing a
   provider idempotency key for reuse is the defect the correction
   identifies — Adyen idempotency keys must not be recycled across distinct
   submissions.
4. **Existing paid purchase stranded — CONFIRMED.** R1's cutover step 5
   says only "treat ... as closed, historical evidence. Do not replay or
   migrate it." It never says how that customer's receipt/paid-invoice
   download or resend keeps working once step 10 disables the Mini service.
   That is a live customer-facing gap, not a pure archival question.
5. **Bookkeeper recorder is Stripe-shaped — CONFIRMED, and worse than R1's
   own hedge.** R1 flags `ContadorProviderAlias` as "could not be confirmed
   ... provider-agnostic or Stripe-shaped" but then asserts elsewhere that
   Adyen can write through "the same shared recorder `process-payment.cjs`
   already uses for Stripe ... tagged by provider." The two files this R2
   review newly opens resolve the hedge against R1:
   - `data/business/migrations/nanoclaw-v2/133_contador_payment_fulfillment_cases.sql`
     hard-codes `stripe_account CHECK (... IN ('heartbeat','tandem'))`,
     `payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'`, alias IDs constrained to
     `^(pi|cs|ch|in|re|evt)_...`, and `last_event_type` enumerated to six
     literal Stripe event names plus a `stripe_source` stage. None of Adyen's
     `pspReference`, `merchantReference`, or event codes
     (`AUTHORISATION`/`CAPTURE`/`CAPTURE_FAILED`) satisfy these constraints.
   - `tools/contador/process-payment.cjs`'s `fetchPaymentData()` is a Stripe
     API client (`stripeGet` against `api.stripe.com`) fused with the
     Sheets/Postgres writer in one function; there is no seam to hand it an
     already-resolved Adyen notification without either calling Stripe or
     rewriting the fetch stage.
   R1's claim that the Adyen adapter can "simply write through" this table
   and script is not supported by the evidence; it is now falsified by it.
6. **Adyen verification / compatibility signing — NOT A DEFECT.** R1
   already states the VPS alone verifies the Adyen HMAC (B.1), that NanoClaw
   never receives the native webhook, that Bookkeeper has "no ...
   payment-status authority," and separately identifies
   `class-payment-private-transport.php`'s signed-envelope design as prior
   art for "the compatibility feed's own signing scheme" distinct from its
   retired bidirectional role. Nothing in R1 assigns NanoClaw the Adyen HMAC
   secret or webhook adjudication. This correction restates decisions 4/6
   with more precision; it does not identify an R1 error. Converged.
7. **Credential cutover precision — CONFIRMED, and reveals a rollback
   contradiction in R1.** R1 step 8 bundles "Adyen API key, client key,
   merchant account, and the private-transport HMAC key pair" under
   "relocate **and rotate**" and schedules the Adyen API/webhook-HMAC
   rotation "at cutover" (before step 9's decommission observation window).
   Two defects: (a) client key and merchant account identifier are not
   secrets and rotation is meaningless for them; (b) rotating the live Adyen
   API key/webhook HMAC at step 8 invalidates the Mini path's copy of the
   same live credential *before* R1's own step 11 rollback ("flip ... back
   to the old dispatch coordinator ... rollback is a config flip, not a
   rebuild") could still work — a config flip cannot revive a path whose
   Adyen credentials were already rotated out from under it. R1's plan
   contradicts its own rollback guarantee.
8. **Three R1 "missing owner decisions" are already resolved —
   CONFIRMED.** Checked against the corrections' cited language, which
   restates decisions already present in the accepted architecture (push
   delivery, automatic-capture AUTHORISATION-as-paid-trigger, seven-year
   retention). R1's item 9 list elevated implementation choices to
   owner-decision status. The fourth item (shared vs. parallel case schema)
   is resolved as an implementation recommendation by item 5 above, not
   returned to the owner.

## 1. Corrected keep/change/delete-or-archive/create deltas (relative to R1)

**Keep — narrowed**
- Pricing/promotion/terms, form validation, attribution facts, and UI
  presentation are reusable domain logic, unchanged from R1.
- The *validation and anti-replay logic* in `class-adyen-test-checkout.php`
  (product allowlist, origin allowlist, per-IP rate limit, request-fingerprint
  conflict detection, idempotency-key format check) — reusable, but only as
  logic ported onto durable storage (see §2), not as transient-backed code.
- `tools/contador/process-payment.cjs`, `src/stripe-payment-host.ts`, and
  migration 133 — Stripe ingress/case path preserved **unchanged**, per
  decision 5, and explicitly *not* to be mutated for Adyen (see §3).

**Change or move — corrected**
- Everything R1 bucketed as "untouched" under "browser context,
  intents/preparations" moves to **implementation-audit / retirement**,
  not "keep as-is." Only a field or rule proven necessary (e.g., promotion
  consumption fencing, the dual-fence transactional freeze before the
  provider call) is deliberately re-implemented into the single durable
  pre-payment record in §2 — the current multi-table structure itself is not
  ported.
- Session/attempt lifecycle, enrollment/admission, and document families:
  R1's classification stands, with one addition — the storage backing the
  ported session/attempt logic must be durable MariaDB tables inside real
  transactions, not a `wp_options`/object-cache transient.

**Delete or archive — corrected**
- The transient-keyed attempt record (`tc_adyen_test_*` transients and their
  30-minute TTL) is retired outright at production cutover, not carried
  forward as "the shape" of production storage. Archive the file for its
  validation logic; the storage primitive does not ship.
- R1's remaining delete/archive items (private-transport bidirectional
  authority, `website-checkout-service.ts`/`website-checkout-live-service.ts`
  as runtime authority, the reverse-tunnel proxy family, frozen
  migrations 149-165) are unchanged by this review.

**Create — corrected/added**
- Durable MariaDB checkout-submission table + real DB transactions,
  replacing the transient (§2).
- A **new, adjacent** NanoClaw case-schema family for Adyen (e.g.
  `contador_adyen_payment_fulfillment_cases` /
  `_aliases` / `_receipts`, mirroring migration 133's append-only/receipt
  pattern under its own CHECK constraints), rather than widening or
  reusing migration 133 (§3).
- A provider-neutral **operational recorder function**, extracted from
  `process-payment.cjs`'s Sheets/Postgres-write stage, callable by both the
  existing Stripe pipeline and the new Adyen adapter (§3).
- A distinct, narrow **Tandem Commerce → NanoClaw Bookkeeper delivery
  signing key**, separate from both the retired bidirectional
  private-transport key and the Adyen webhook HMAC (§4).
- A one-time **paid-order/document import** of the already-confirmed live
  Adyen purchase into Tandem Commerce's order/document schema (§4), or, if
  deferred, a narrow bounded old-document compatibility route scoped to that
  one order only.

## 2. Corrected minimum state model and terminal retry rule

**Minimum pre-payment record** (one row, one table, durable, transactional):
submission/attempt UUID; product/quote snapshot (price, currency, any
promotion code plus its consumption fence); submitted payer/learner fields;
full billing address; business-invoice / buying-for-someone-else flags;
terms-acceptance snapshot (version, hash, timestamp); the Adyen
`Idempotency-Key` value used for the `/sessions` call; state
(`draft_submission` → `awaiting_payment` → `paid` |
`terminal_nonpayment` | `payment_pending`); created/updated timestamps.
No parallel intent, preparation, quote-plan, or private-capability tables.

**Terminal retry rule (corrected):** on terminal nonpayment
(`refused`/`cancelled`/`expired`), delete the temporary PII submission per
decision 9, but do **not** free or reuse the Adyen idempotency key. A
deliberate fresh submit always mints a new submission/attempt UUID and a new
`Idempotency-Key` for the new `/sessions` call. The old terminal attempt
retains only a minimal non-PII provider/tombstone record (opaque
merchantReference/pspReference, terminal event code, timestamp — following
the same content-minimization discipline as migration 133's own comment:
"no names, email, product text, amount, card") solely so a late/duplicate
provider event against the old key can be recognized and discarded.
Payer/learner email or name remain forbidden as any uniqueness or gating key
(decision 7 unchanged).

## 3. Corrected Bookkeeper adapter/recorder/case boundary

- The Stripe ingress/case path (`stripe-payment-host.ts`,
  `process-payment.cjs`'s Stripe fetch stage, migration 133) is preserved
  **unchanged** — do not widen its CHECK constraints or reuse its table for
  Adyen identities, since its `stripe_account`, `pi_`/`cs_`/`ch_`/`in_`/`re_`/
  `evt_`-prefixed alias IDs, and Stripe-literal `last_event_type` enum are
  incompatible with Adyen's `pspReference`/`merchantReference`/event-code
  shapes by construction, not merely by convention.
- Extract a **provider-neutral operational recorder** from
  `process-payment.cjs`: the Payment Log upsert, Student Roster
  mapping/write, and Postgres `payments` insert (its section 2a/2b/3) taking
  an already-resolved input shape (`productName`, `customerEmail`,
  `customerName`, `amountCents`, `currency`, `paymentStatus`, `eventType`,
  `canonicalTransactionId`, `canonicalProductSlug`, cohort-bearing metadata)
  — the same shape the Stripe path currently produces via its API-fetch
  stage (section 2 of `fetchPaymentData`). The new Adyen adapter populates
  this shape directly from the Tandem order/product/payer/learner context
  the VPS hands it; it must not call back into Stripe or Adyen to re-derive
  it.
- The new Adyen adapter writes its case/alias/stage-receipt state into an
  **adjacent** table family (or an explicit later v2 migration), not into
  migration 133, so the proven Stripe schema and its constraints are never
  touched during this cutover. The same `complete`-state gate R1 already
  specified (verified stage receipts for `payment_log`, `postgres_payment`,
  `student_roster` or `not_applicable`) applies identically to the new
  family.
- No accounting, enrollment, document, or payment-status authority — this
  boundary is unchanged from R1 and matches
  `docs/CONTADOR-BIZMGR-BOUNDARY.md`.

## 4. Corrected treatment of the existing paid purchase and credentials

**Existing paid purchase.** Recommended (simpler, safer) option: before the
Mini service is disabled, perform a one-time import/projection of the exact
verified paid order and already-issued receipt/invoice document facts for
that purchase into Tandem Commerce's order/document schema — no new payment,
no new enrollment, same order identity. After import, that customer's
confirmation page, re-download, and resend all resolve through Tandem
Commerce like any other order; Mini's copy becomes pure frozen historical
evidence per R1's existing classification. Fallback if the import cannot be
completed before cutover: keep a narrow, explicitly bounded old-document
compatibility route alive on Mini for that **one order only** (read-only
download/resend) until the import is done and verified, then decommission it
with the rest of the Mini path. Required verification before relying on
either route: independently pull the receipt/invoice from the new location
and confirm it is byte-identical (or hash-identical) to the original
Mini-issued document, and confirm order metadata (amount, product, payer)
matches the existing record, before the old Mini document route for that
order is turned off.

**Credentials (corrected sequencing and scope).**
- Client key and merchant account identifier: relocate to the VPS/WordPress
  secret store. They are not secrets; do not "rotate" them.
- Adyen API key and webhook HMAC secret: relocate to the VPS. Rotate them
  only **after** the old Mini path has fully drained — zero in-flight old
  attempts and zero proxy traffic across the observation window (R1's former
  step 9), not at cutover (R1's former step 8). Rotating earlier invalidates
  the Mini path's copy of the same live credential while R1's own rollback
  plan still depends on that path being callable.
- Old bidirectional WordPress↔Mini private-transport HMAC key pair: retire
  and revoke at the same decommission point, unchanged from R1.
- Create a new, distinct, narrow Tandem Commerce → NanoClaw Bookkeeper
  delivery signing key, separate from both the retired bidirectional
  transport key and the Adyen webhook HMAC — not previously named in R1's
  Create list.

## 5. Genuinely unresolved owner decisions

None. All four items in R1's "genuinely missing owner decisions" section are
resolved: compatibility-feed transport mechanics and the shared-vs-parallel
case schema are implementation-audit items (§3); the paid-trigger event and
the frozen-schema retention window are already answered by the accepted
automatic-capture/AUTHORISATION decision and the existing seven-year
commerce/document retention policy, respectively.
