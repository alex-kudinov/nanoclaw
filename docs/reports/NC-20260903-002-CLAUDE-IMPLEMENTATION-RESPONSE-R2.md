# NC-20260903-002 — Claude implementation review R2

Reviewed against the allowed packet only: this request and
`docs/reports/NC-20260903-002-IMPLEMENTATION-DIFF-R1.patch` (design response
R1 consulted only to confirm two required changes).

## Material finding 1 — the bounded diff is not self-contained; several load-bearing files it depends on are not in it

The patch's own hunks call functions from, and describe behavior owned by,
files that are not part of this diff: `canonicalClassificationLabel` /
`classificationPolicyFor` (`src/classification-policy.ts`),
`getMailmanRunContext` / `mailmanUnboundSendDisposition`
(`src/mailman-run-context.ts`), and the routed-at-null sweep implied by the
new exported `retryUnroutedClassification` (presumably driven by
`src/gmail-classification-reaper.ts`). None of these three files, nor their
paired test files, are in `NC-20260903-002-IMPLEMENTATION-DIFF-R1.patch`.

Concretely unverifiable from this diff alone:

- Whether the reaper that closes design-response Finding 2 (`routed_at IS
  NULL` backlog) exists, is scheduled, and calls
  `retryUnroutedClassification` for every stale row, not only on Mailman
  resubmission.
- Whether the reaper's host-fallback write actually sets
  `classifier_version = 'mailman-host-fallback-v1'` — this exact literal is
  referenced only as a guard condition in `classify-ipc-handlers.ts`'s new
  `ON CONFLICT ... WHERE NOT (classifier_version = 'mailman-host-fallback-v1'
  AND routed_at IS NOT NULL)` clause and is never assigned anywhere in this
  diff. If the reaper uses a different literal, that guard is dead code and
  design-response Finding 3 (late real classification re-routes a reaper
  fallback, producing a second Sales/Chief delivery) is not actually closed.
- Whether `classificationPolicyFor()`'s label set is kept in lock-step with
  `data/business/migrations/nanoclaw-v2/141_classification_routing_integrity.sql`'s
  34-label list. `host-router.ts`'s new fail-closed branch
  (`policy === null` → `routed: false, action: 'error'`) means any label the
  DB taxonomy accepts as `enabled` but the code-side policy module does not
  recognize becomes silently, permanently unrouted (routed_at stays NULL,
  retried forever, `logger.error` only) — a real drift risk given the label
  set now lives in two independently-edited places.
- Whether the required acceptance tests from design-response Findings 1–3 (run_id-based
  denial disposition, `routed_at IS NULL` sweep, late-classification-after-fallback
  ordering) were actually added — the new test files listed in git status
  (`classification-policy.test.ts`, `gmail-classification-reaper.test.ts`,
  `mailman-classification-contract.test.ts`, `mailman-run-context.test.ts`)
  are not part of this diff.

This diff cannot be signed off as complete on its own terms; the three
correctness guarantees above are architecturally plausible but not
demonstrated by the material provided.

## Material finding 2 — the new classify_label_write turn-binding check is fail-open when `run_id` is absent, not fail-closed

`src/ipc.ts`'s new block:

```
if (data.type === 'classify_label_write' && data.run_id) {
  ... quarantine unless turn/message/thread match ...
}
```

is gated on `data.run_id` being truthy. If `run_id` is missing, empty, or not
a string, the entire binding check is skipped and the classification is
processed with no turn/message/thread verification at all — the opposite of
every other new guard in this patch, which fails closed (the stored-message
check throws when the source isn't an exact stored inbound message; the
taxonomy check throws/normalizes when a label is absent or disabled). The
sibling control for the same `run_id` concept, `mailmanUnboundSendDisposition`,
is called unconditionally and presumably defaults safely inside that
function; this check instead no-ops entirely on a falsy `run_id`. In the
legitimate path `run_id` is always attached by `classify_email` in
`ipc-mcp-stdio.ts`, so this is not expected to fire in normal operation — but
a defense meant to make "Thread-ID alone is never customer identity" durable
should not depend on the field it's validating also being present to trigger
the validation. Recommend quarantining (not skipping) when `run_id` is
missing/unresolvable, matching the fail-closed pattern used everywhere else
in this diff.

## Confirmed correct against the design record

- Design-response Finding 1's required change (thread `run_id` through the
  Gmail IPC payloads and branch the unbound-send denial on turn type, not
  merely on absent `approvedAction`) is implemented: `run_id` is now attached
  to `gmail_reply`, `gmail_send`, `gmail_search`, `gmail_read`, and
  `gmail_get_thread`, and `src/ipc.ts` now calls
  `mailmanUnboundSendDisposition(run_id)` to choose `alertChief` and the
  denial text instead of always alerting.
- Design-response Finding 4 (validate before persist) is implemented:
  `canonicalClassificationLabel` resolution and the low-confidence check now
  run before the `INSERT`, and the `INSERT` itself is now taxonomy-gated
  (`SELECT ... FROM classification_taxonomy WHERE label = $5 AND enabled =
  true`), closing the "insert-first, validate-after" gap the design response
  called out explicitly.
- `auto_archive` no longer gates routing decisions in
  `classify-ipc-handlers.ts` — the prior `!taxonomy?.auto_archive` routing
  gates are replaced with `taxonomy?.enabled`, and `host-router.ts` carries
  archive-only labels through an explicit `classify_only` disposition. This
  matches the required separation of inbox cleanup from owner routing.
- `financial/refund` no longer routes to Chief alone: `host-router.ts`'s
  `refund_support` disposition sends the customer response to Sales first and
  treats Chief as non-blocking secondary visibility, and `groups/chief/CLAUDE.md`
  no longer contains a support-drafting path. This matches "Support/refund
  customer-response work reaches Sales; Chief never owns reply drafting."

## Verdict

GO WITH REQUIRED CHANGES

1. Fix the fail-open `run_id` gate on the `classify_label_write` binding
   check in `src/ipc.ts` (Finding 2) — quarantine on missing/unresolvable
   `run_id` instead of skipping validation.
2. Supply (or re-issue this review against) the three omitted files —
   `src/classification-policy.ts`, `src/mailman-run-context.ts`,
   `src/gmail-classification-reaper.ts` — and their tests, so the
   `mailman-host-fallback-v1` literal, the `routed_at IS NULL` sweep, and the
   taxonomy/policy label-set parity (Finding 1) can be verified rather than
   inferred before this ships.
