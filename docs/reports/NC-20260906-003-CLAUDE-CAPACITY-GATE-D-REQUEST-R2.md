# NC-20260906-003 Gate D Capacity correction review — R2

## Scope

Fresh bounded Sonnet/high review of the one load-bearing R1 correction only.
Read this request and exactly these three files:

1. `src/academy-capacity-operator-store.ts`
2. `scripts/academy-capacity-operator-disposable-worker.ts`
3. `src/academy-capacity-operator-disposable.test.ts`

Read only the correction ranges: store lines 145-180, 730-1030, 1315-1330,
and 1435-1455; worker lines 205-270 and 350-365; test lines 25-75. Do not load
the complete files.

Do not read other source, docs, credentials, `.env`, production data, or Git
history. Write only the requested response artifact.

## R1 finding and correction

R1 correctly found that `requireOne` labeled every zero-row persistence result
as `stale_version`, hiding missing-reference/write-integrity failures. The
correction now accepts an exact code and message. Pool/reservation/waitlist/
enrollment/assignment/history/event call sites use distinct lower-snake codes;
the review-routable codes remain `needs_review`. Operator-case finalization has
its own hard failure.

The disposable worker injects a trigger that suppresses only the test
destination-assignment insert. The transfer must return
`assignment_insert_missing_reference`, preserve the origin assignment as
active, preserve enrollment and both pool versions, and create zero destination
rows. After removing the trigger, the ordinary transfer/withdraw/reconcile
chain succeeds. Current proof is 14 cases, 28 receipts, four review cases, zero
PII markers, and zero partial mutations.

Corrected focused tests and pinned typecheck pass.

## Review question

Does the correction make persisted failure codes truthful without weakening
savepoint rollback, idempotency, review routing, privacy, or ordinary command
success? Report any remaining material defect in this correction only.

## Required response

Before ending, use Write to create
`docs/reports/NC-20260906-003-CLAUDE-CAPACITY-GATE-D-RESPONSE-R2.md`.
Write either `NO MATERIAL FINDINGS` or a concise numbered material-finding list
with exact evidence and smallest safe correction.
