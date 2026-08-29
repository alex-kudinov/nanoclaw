# NC-20260829-001 checkout failure correction design review — response R2

Reviewer: Claude (independent design review per request packet)
Scope: `docs/CHECKOUT-FAILURE-RECOVERY.md`, R1 response, and this request only.
Verdict: both prior material findings are closed. No new material finding.

## Finding 1 (n8n reactivation before queue quarantine) — CLOSED

Deployment sequence now orders quarantine strictly before n8n reactivation:

- Step 3 quarantines the WordPress queue (protected backup, move to held option,
  clear active option, delete and read-back-zero every
  `tandem_checkout_recovery_retry` cron event, set the prospective source
  epoch, verify active queue empty) while explicitly stating "the existing
  broken n8n relay remains unchanged during this step, so no queued fact can
  escape."
- Steps 4–5 (Tandemweb deploy, migration 140) occur with n8n still on its
  pre-fix code — new website events during this window land only in the new
  active queue and cannot be delivered by the still-unpatched relay, so they
  queue for later drain rather than replaying anything historical.
- Step 6 is the only point where the corrected n8n node patch is applied and
  reactivated ("Only the new-epoch queue may now drain"), and it happens after
  cron deletion is confirmed at zero.

This removes the window the original finding identified: at no point does the
fixed relay come online while the pre-fix queue or its retry cron still
exist. The source-epoch check additionally guards against a held pre-cutover
item being reintroduced by stale code or an overlapping cron.

## Finding 2 (incident grouping anchor/atomic find-or-create) — CLOSED

- **Anchor:** "The first case's `started_at` is the fixed episode anchor. A
  case joins that incident only when its `started_at` is at or after the
  anchor and strictly before anchor plus 30 minutes. The window never rolls
  forward." This is deterministic and independent of sweep timing, matching
  the requested correction exactly.
- **Atomic find-or-create:** the design now runs find-or-create inside one
  transaction under a PostgreSQL advisory lock derived from the grouping
  tuple, re-reads the most recent open incident after taking the lock, and
  backs this with a unique constraint on `incident_key` plus a unique
  incident-to-case `case_id`, with `ON CONFLICT` making replay a no-op. This
  closes the race where two concurrent sweep cycles could each observe "no
  incident yet" and each create one.

## New findings from the correction itself

None material. The advisory-lock key is described as derived from the
"subject/account/product/amount tuple," while the stated grouping key also
includes currency and the episode window. If the lock hash omits currency or
episode bucket, the only effect is unnecessary serialization between
unrelated episodes that happen to share product/amount — the re-read-under-
lock plus the `incident_key` unique constraint still make the *correctness*
guarantee (single incident per grouping key) hold regardless of what the lock
hash includes. Not load-bearing; no action required unless the team wants
tighter lock granularity for contention reasons.
