# NC-20260829-001 checkout failure implementation review R3 — response

Scope: the eight listed files only. No `.env*`, credentials, runtime DB/logs,
Slack history, or unrelated worktrees were inspected.

## 1. A purchase on one case in a shared incident can be silently reopened
   and re-notified by a still-failing sibling case (noisy/misleading)

**Severity:** material — contradicts the stated guarantee that "purchase
closes the incident" and that only "replies" follow.

**Where:** `src/checkout-recovery-store.ts`

- `markCheckoutRecoveryIncidentPurchasedWithClient` (lines 934–948) sets
  `status='closed'` and bumps `version`, but nothing else in the file ever
  checks `status` again before mutating an incident.
- `ensureCheckoutRecoveryIncidentWithClient`'s "already bound" branch (lines
  770–778) fetches the incident purely by `row.operator_incident_id`, with no
  `status` filter, then its "existing incident" UPDATE (lines 840–868) bumps
  `version`, `last_failure_at`, and `notify_due_at` unconditionally — it never
  excludes `status='closed'`.
- `listDueCheckoutRecoveryOperatorIncidentsWithClient`'s WHERE clause (lines
  1175–1179) admits a row whenever
  `(notified_version>0 AND version>notified_version)`, with no `status`
  condition in that branch.

**Concrete sequence:**

1. Case A and Case B are two distinct checkout attempts for the same
   party/product/amount within one 30-minute episode window, so they share
   `group_key` and both bind to Incident I (this joining is intentional and
   race-free per R1/R2's advisory-lock fix).
2. Incident I is notified (root sent): `notified_version = N`, `status =
   'notified'`.
3. Case A succeeds → `recordPreparedCheckoutRecoveryWithClient` calls
   `markCheckoutRecoveryIncidentPurchasedWithClient(I)` →
   `status='closed'`, `version = N+1`. The immediate "resolved" due-check
   fires as designed, gets sent, and `notified_version` catches up to
   `N+1`. So far this matches the intended one-shot resolution reply.
4. Case B (still non-terminal) later receives another `payment.failed`
   event (e.g., a retried attempt on the same still-open checkout). Because
   Case B's own state transition is not terminal, `isFailureEvent` is true
   and `ensureCheckoutRecoveryIncidentWithClient` runs. Case B already has
   `operator_incident_id = I`, so the code goes straight to the "existing"
   branch, fetches Incident I **regardless of its `closed` status**, and
   updates `last_failure_at`, `notify_due_at`, and `version = N+2`. `status`
   is left `'closed'`.
5. `listDueCheckoutRecoveryOperatorIncidentsWithClient` now matches Incident
   I again (`notified_version=N+1>0` and `version=N+2>N+1`), so it is
   re-notified — even though `status='closed'`.
6. `formatCheckoutRecoveryOperatorIncident` renders the `outcome==='closed'`
   branch unconditionally as "Checkout completed after the failed attempt
   ... No further recovery action is needed" (store.ts lines 1299–1305),
   which is now **factually wrong** for the state that actually triggered
   the re-notification (Case B's fresh failure) and also **hides** that a
   sibling attempt is still failing. This can repeat every time Case B fails
   again, up to `episode_ends_at`.

**Minimum correction:** exclude closed incidents from the "due" query, e.g.
change the second disjunct in `listDueCheckoutRecoveryOperatorIncidentsWithClient`
from
```sql
(i.notified_version>0 AND i.version>i.notified_version)
```
to
```sql
(i.notified_version>0 AND i.version>i.notified_version AND i.status<>'closed')
```
This is sufficient to stop the noisy/misleading re-notification. For full
correctness, also stop mutating `last_failure_at`/`notify_due_at`/`version`
on a closed incident in the "existing incident" UPDATE branch (e.g. add
`AND status<>'closed'` there too), so a closed incident's evidence fields
stop drifting after resolution.

## 2. n8n patch rollback failure is not surfaced to the caller

**Severity:** minor — the tool already labels this "rollback attempt" rather
than claiming guaranteed recovery, and it only manifests when the primary
apply *and* the rollback both fail.

**Where:** `setup/n8n/checkout-failure-workflow-patch.json`'s underlying tool,
`/private/tmp/toolbox-n8n-patch.ccYdsX/shared/n8n/tools/n8n/patch-workflow-nodes.sh`.

Every failure path (apply failure line 142, readback mismatch line 156,
inactive-after-patch line 161) calls `restore_current >/dev/null 2>&1 ||
true` and then reports a fixed message ("rollback attempted") regardless of
whether `restore_current` actually succeeded. `restore_current` itself does
poll `healthz` with a 60s deadline and can exit non-zero, but that exit code
is discarded by the `|| true`. If both the primary patch and the rollback
fail, the operator's only signal is the generic `EXTERNAL_ERROR`/`CONFLICT`
message — there is no way to tell from the tool's own output whether the
live workflow was actually restored, left mid-migration, or left inactive.

**Minimum correction:** capture `restore_current`'s exit status and include
it in the failure JSON (e.g. `rollback_succeeded: true|false`) instead of
swallowing it, so a failed rollback is distinguishable from a successful one
in the same failure report.

## Answers to the specific questions

- Duplicate incidents / wrong-episode attachment from concurrent/out-of-order
  cases: not found — the advisory lock on `group_key` plus the commit-then-
  window-lookup ordering (unchanged from R1/R2) still serializes creation
  correctly.
- Terminal purchase or late failure reopening/re-notifying an incident:
  **yes — see finding 1.**
- Raw/sensitive Stripe detail reaching Slack/customer copy or non-admin
  evidence: not found in the reviewed files — decline/failure/advice codes
  are bucketed through the same safe `customer_guidance_key` taxonomy on both
  the backend (`checkout-recovery.ts`) and the browser
  (`checkout.js`'s `customerPaymentFailureMessage`), sensitive codes
  (`stolen_card`, `fraudulent`, etc.) always collapse to `generic_decline`,
  and `checkoutRecoveryArchiveEnvelope` writes into the same `webhook_inbox`
  table that already stores the full raw Stripe payload for this path, so no
  new exposure tier is introduced.
- Affirmative v3 consent accepted without accidentally accepting an
  opt-out/no-consent variant: not found — PHP's `resolve_recovery_reminder`
  policy strings map 1:1 with `checkoutReminderPolicyAllows`'s allowlist
  (`checkout-reminder-v3-explicit`, `-legacy-explicit`, `-uk-softoptin`,
  `-us-optout`, plus legacy `v2`); opt-out/strict/unknown/legacy-denied
  policies are absent from that allowlist and consent gating is doubled by
  the separate `consent_state==='granted'` check.
- Queue quarantine or n8n patch losing/replaying work, altering credentials,
  leaving a workflow inactive, or failing rollback silently: quarantine
  (`quarantine_checkout_recovery_queue`) archives before clearing and is
  crash-safe against data loss; the n8n patch tool's rollback-failure
  signalling gap is **finding 2**.
- Source/SQL/runtime mismatch making deployment unsafe: none found in the
  reviewed files.
