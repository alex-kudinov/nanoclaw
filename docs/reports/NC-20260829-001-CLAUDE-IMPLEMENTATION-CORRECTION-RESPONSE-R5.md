# NC-20260829-001 final load-bearing correction review R5 — response

Scope: `docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-CORRECTION-RESPONSE-R4.md`,
`src/checkout-recovery-store.ts`,
`data/business/migrations/nanoclaw-v2/140_checkout_failure_incidents.sql`,
`/private/tmp/toolbox-n8n-patch.ccYdsX/shared/n8n/tools/n8n/patch-workflow-nodes.sh`,
and this request only. No credentials, environment, databases, logs, or
customer evidence were inspected.

## R4 residual (closed-incident catch-up gap) — CLOSED

Migration 140 adds `closed_at timestamptz` to
`checkout_recovery_operator_incidents` (`140_checkout_failure_incidents.sql:137`).
`markCheckoutRecoveryIncidentPurchasedWithClient`
(`src/checkout-recovery-store.ts:936-951`) sets it exactly once via
`closed_at=COALESCE(closed_at,$2::timestamptz)` while still bumping `version`
on every call, so a closed incident's `closed_at` is pinned to the first
closure regardless of how many further terminal events land on the case.

The due predicate (`src/checkout-recovery-store.ts:1178-1192`) now reads, for
the closed branch:

```
i.status='closed' AND i.closed_at IS NOT NULL AND i.closed_at>i.last_notified_at
```

This drops the R4 correction's exact `version=notified_version+1` match
entirely — the closed-admit clause no longer looks at `version` vs
`notified_version` gap size at all, it only requires `version>notified_version`
(satisfied by any mutation since the last notification) and compares
`closed_at` to `last_notified_at`. That is precisely the fix R4 recommended
("widen ... to admit any clean multi-step catch-up") and it closes the
specific race: an unnotified reopen (version bump while still open/notified)
followed by a purchase before the next sweep now produces
`version>notified_version` (true, any gap) and `closed_at>last_notified_at`
(true, closure is newer than the last notification) — due. A repeat/duplicate
terminal event on an already-closed incident leaves `closed_at` unchanged
(`COALESCE`) while still bumping `version`; once the closure has been
notified, `last_notified_at` is refreshed to that notification time, so any
further duplicate-driven version bump no longer satisfies
`closed_at>last_notified_at` and is correctly suppressed as noise, matching
the non-closed reopen semantics already in place. The R3 exploit and the R4
residual are both blocked; no reachable path leaves a genuinely new,
unnotified closure permanently non-due.

One structural note, not a new finding: this clause compares a
provider-event timestamp (`closed_at`, the purchase event's `observed_at`)
against a processing-time timestamp (`last_notified_at`, wall-clock time at
notify). The pre-existing reopen clause did the same
(`last_failure_at<=last_notified_at`) and was accepted through R3/R4, so this
correction does not introduce a new comparison basis or a new class of race —
it extends the same pattern already reviewed and closed. Not raising it here.

## Rollback result scope — CLOSED

`rollback_status()` (`patch-workflow-nodes.sh:111-117`) is now defined in the
outer/local bash script, between `restore_current`'s closing `}` (line 110)
and the main apply flow (`scp`/`ssh` block starting line 118) — outside the
`<<'REMOTE'` heredoc, in the same scope as the four call sites (149, 156,
163, 168). It calls the outer `restore_current` function directly and
branches on its real exit status:

```bash
if restore_current >/dev/null 2>&1; then printf 'true'; else printf 'false'; fi
```

Under `set -euo pipefail`, a function called as the condition of an `if` does
not trigger `errexit` on nonzero exit, so `restore_current`'s failure path
(including its own `scp ... || return 1`) propagates cleanly into the
`if`/`else` without aborting the script. All four call sites now resolve
`rollback_status` as a defined local command and assign
`rollback_succeeded=true|false` before reaching their respective `fail
EXTERNAL_ERROR`/`fail CONFLICT` line, so the R4 regression (crash instead of
structured failure) is gone: every one of the four failure paths again emits
the intended structured `fail` JSON, now carrying the real rollback outcome
instead of a generic message.

## Summary

Both R4 items are closed. No new load-bearing defect found in either
correction.
