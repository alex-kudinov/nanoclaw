# NC-20260803-003 Codex request R6 — reclassification route-state repair

## Objective

Review the bounded post-deployment repair for a live replay defect and return
`CONVERGED` or `CHANGES REQUIRED`. R5 converged on forwarded-email identity,
parsing, persistence, and thread safety. The exact inbound replay then exposed
a separate classification state-transition bug: a prior bad route's
`routed_at` survived a new classifier version, so the corrected
`MrGru/lead/inquiry` classification was persisted but its host route was
suppressed as a duplicate.

## Safety boundaries

- No email, Slack, production data, deploy, commit, or service restart.
- No secrets, auth/session files, database dumps, or live customer content.
- Do not edit implementation, tests, prompts, or authoritative docs.
- Write only the response file named below.

## Accepted live evidence

1. The deployed R5 code correctly recovered the exact forwarded inquiry and
   Mailman classified it `MrGru/lead/inquiry` at confidence 0.95.
2. The handler logged `skipping duplicate route (already routed)` because the
   row retained the prior rules-runner route audit.
3. No customer email was sent. The objective remains a Sales draft that uses
   the existing approval-bound outbound path.

## Repair to inspect

Only these files changed after the converged R5 commit:

- `src/classify-ipc-handlers.ts`
- `src/classify-ipc-handlers.test.ts`

The repair:

1. Sets `routed_at = NULL` when an `ON CONFLICT` update replaces a row with a
   different `classifier_version`, so the new classification can route.
2. When the same classifier version is replayed, queries the existing row. A
   still-unrouted row may retry only after its `classified_at` is at least 30
   seconds old, avoiding an immediate race with the first handler.
3. A completed route remains an idempotent no-op. A recent unrouted attempt
   remains a no-op. An old unrouted attempt retries the host route and marks
   `routed_at` only when routing succeeds.

Pinned Node 22.23.2 focused validation passes 24/24 tests and typecheck is
clean.

## Required checks

1. A different classifier version cannot inherit stale route completion.
2. A previously failed/uncompleted route can be retried without relabeling or
   widening authority.
3. Completed same-version work stays idempotent.
4. The 30-second guard materially avoids the ordinary concurrent-handler
   double-route window; identify any remaining blocking duplicate/loss path.
5. Auto-archive behavior, rules-runner direct routing, Hive sync, Gmail labels,
   and approval-bound sending are unchanged.
6. Tests cover the state matrix and accurately exercise the host route.

## Required response

Write only `docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R6.md` with verdict,
blocking findings first, checks 1–6 with file/line evidence, any non-blocking
notes, elapsed time, and unresolved owner decisions.
