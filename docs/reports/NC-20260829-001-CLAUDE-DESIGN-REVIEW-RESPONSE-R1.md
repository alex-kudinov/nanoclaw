# NC-20260829-001 checkout failure correction design review — response R1

Reviewer: Claude (independent design review per request packet)
Scope: files 1–8 listed in the request packet only.
Verdict: material findings below. Do not implement until both are resolved
(or explicitly accepted with a documented mitigation) in the design.

## 1. Deployment sequence reactivates the fixed n8n relay before the historical
   WordPress retry queue is quarantined — the corrected pipeline will
   auto-replay live historical customer events through WordPress's own cron

**Evidence**

- `docs/CHECKOUT-FAILURE-RECOVERY.md` "Deployment sequence" orders the steps:
  - step 4: "Briefly deactivate each affected n8n workflow after zero active
    executions, apply an exact-node patch..., reactivate, and verify node
    projection hashes..." — this makes the corrected raw-byte HMAC
    verification live.
  - step 5 (only after step 4): "Deploy the exact Tandemweb commit, reset
    opcode/cache..., **quarantine the old queue**, and verify new queue
    health."
- `class-stripe-checkout.php:2504-2569` (`queue_checkout_recovery_shadow_body`,
  `drain_checkout_recovery_shadow_queue`) shows the *existing, already-running*
  WordPress mechanism that is completely independent of any code deploy:
  failed shadow deliveries are persisted in the `tandem_checkout_recovery_shadow_queue`
  option and retried by WP-Cron (`tandem_checkout_recovery_retry`) on a
  backoff schedule (5 min → up to 6 h), up to 25 items per cron run, using a
  **freshly computed signature at drain time** (`send_checkout_recovery_shadow_body`,
  line 2474) against the *current* ingress secret. Only rows already marked
  `exhausted` (57 of 99, per the accepted facts) are skipped; the other 42 are
  still eligible and a retry is very likely already scheduled given the
  backoff windows involved.
- The "Historical queue and cutover" section (`docs/CHECKOUT-FAILURE-RECOVERY.md`
  lines 156-168) requires quarantining the queue *before* any replay, but the
  numbered "Deployment sequence" does not enforce that ordering relative to
  n8n reactivation — it places quarantine one full step *after* n8n starts
  correctly accepting signed traffic again.

**Impact**

Between step 4 (n8n reactivated, HMAC bug fixed) and step 5 (Tandemweb
deployed, queue quarantined), WordPress is still running the pre-fix code
with the pre-existing, un-quarantined queue of 42 non-exhausted historical
facts and an already-pending (or soon-to-be-scheduled) `tandem_checkout_recovery_retry`
cron event. That cron will now succeed — because the relay it is calling is
the one just fixed in step 4 — and will deliver real historical
`checkout.captured` / `payment.created` / `payment.failed` /
`checkout.client_abandoned` / `payment.succeeded` facts, with real emails,
amounts, and tokens, straight into the corrected pipeline, uncontrolled by
any of the canary/quarantine machinery described later. This is exactly the
outcome the design's own "Explicit exclusions" section forbids ("no...
historical queue replay").

**Minimum required correction**

Quarantine the WordPress queue (rename/move to a held option, clear the
active option, and disable further scheduling of `tandem_checkout_recovery_retry`
against it) strictly *before* step 4 reactivates the corrected n8n workflow —
or keep the corrected n8n workflow's webhook inactive/returning a non-2xx
placeholder until the WordPress-side quarantine is confirmed complete. The
design must also name the specific mechanism for the one-time quarantine
action (e.g., a WP-CLI command run during the maintenance window), since
deploying new PHP code does not by itself touch existing `wp_options` data —
the 99 queued entries will still be sitting in the live option after the
code deploy in step 5 unless something explicitly acts on them first.

## 2. The "one durable 30-minute operator incident" grouping has no specified
   window anchor or atomic find-or-create primitive, risking the exact
   duplicate-notification failure mode it exists to fix

**Evidence**

- `docs/CHECKOUT-FAILURE-RECOVERY.md` "One operator incident" section: "The
  five-minute host sweep groups due cases by exact Party when resolved, or by
  email HMAC when unresolved, plus Stripe account/product/amount/currency
  inside a bounded 30-minute episode... A later attempt updates that incident
  instead of creating another root notification." No anchor point is given
  for the 30-minute window (first case's `started_at`? first case's
  `shadow_due_at`? incident creation time? rolling from each new case?).
- `src/checkout-recovery-store.ts:516-632` (`sweepCheckoutRecoveryShadowWithClient`)
  is the only existing sweep implementation in the reviewed packet, and it
  processes cases independently, one row lock at a time (`FOR UPDATE SKIP
  LOCKED`), with no cross-case grouping key, no incident table, and no
  find-or-create-by-grouping-key primitive. Migration 140 per the design
  text only "adds nullable, admin-only failure context to checkout cases:
  ...operator incident identity/version/notification fields" — i.e., the
  incident is represented as denormalized fields copied onto each grouped
  case row, not as its own lockable entity.

**Impact**

Two cases that belong to the same real customer episode but become "due" in
different five-minute sweep cycles (e.g., a website-originated case due at
its 45-minute mark and a second, later checkout attempt due at its own
5-minute `payment.failed` mark) must independently discover and update the
same shared incident. Without a specified window anchor and an atomic
find-or-create step, two concurrent or near-concurrent sweep cycles can each
observe "no incident yet" for the same grouping key and each create one —
reproducing the original defect (cases 30/31 each posting `payment_failed`
and `shadow_ready` separately) in a new form, and doing so silently, since
nothing in the reviewed design flags this race.

**Minimum required correction**

Specify: (a) the exact anchor for the 30-minute episode (recommend: first
case's `started_at` in the group, not a rolling window, so the boundary is
deterministic and independent of sweep timing), and (b) an atomic
find-or-create-by-grouping-key step (e.g., a unique constraint on
`(stripe_account, product_slug, amount_cents, currency, resolved_party_id
OR email_sha256, episode_bucket)` with `ON CONFLICT DO UPDATE`, or an
explicit advisory lock keyed on the grouping tuple) so two sweep cycles
racing on the same customer episode cannot both win a "create" path.
