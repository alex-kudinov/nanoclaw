# NC-20260809-003 - Procurement recovery implementation review R1

## Role and objective

Continue as NanoClaw Company-OS owner in the exact Procurement Claude session.
Review the implementation design for a stable, reliable, useful Procurement
system. This round is design/adversarial review only; do not edit source.

Implementation root:
`/private/tmp/nanoclaw-nc-20260809-003`

This worktree is cleanly based on the exact live production release commit
`97ca2ccfb9d3185a5b86607fb8118b997e4ef70b`. The original checkout at
`/Users/xbohdpukc/dev/NanoClaw` is a separate heavily dirty operational tree;
do not edit it.

Write exactly one response:

`/private/tmp/nanoclaw-nc-20260809-003/docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R1.md`

Do not edit any other file.

## Read first

1. this request;
2. `docs/reports/NC-20260809-003-PROCUREMENT-PRODUCTION-PREFLIGHT.md`;
3. the prior converged R2 audit at
   `/Users/xbohdpukc/dev/NanoClaw/docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CLAUDE-RESPONSE-R2.md`;
4. worktree `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/CHANGE-PROTOCOL.md`,
   `docs/ACTIVE-WORK.md`, relevant changelog, `groups/procurement/CLAUDE.md`,
   `docs/PROCUREMENT-RESURRECTION-PLAN.md`, migration 114, current
   Procurement/email/scheduler source and focused tests.

Do not read `.env*`, credentials/settings/auth stores, raw databases/logs,
browser state, private proposal or solicitation content, or customer/student
data. The preflight contains all allowed live facts.

## Accepted facts and owner decisions

Treat every item in the preflight as accepted evidence. In particular:

- email routing is operationally suppressed by `auto_archive=true` and 348 of
  466 classified Procurement emails lack routing receipts;
- migration-114 control tables are empty and every opportunity is source-keyless;
- every opportunity is still unreviewed; no post-decision path exists;
- the current daily task timed out and the shared CDP endpoint is reachable from
  a non-Procurement container;
- daemon Procurement keys are absent;
- primary/backup operators are Alex/Cherie, exact UIDs resolved only on host;
- email taxonomy becomes `auto_archive=false`;
- decision actor initially owns pursuit;
- deadline escalation defaults to 14 days;
- `passed` is valid canary closure;
- legacy scan pauses and shared CDP retires at cutover;
- submission and commitments remain human-only;
- no new source before one closure canary.

Do not reopen these as owner questions.

## Proposed minimum implementation

### A. Configuration and email route

- Make one tracked configuration surface actually feed Procurement policy.
  Prefer `readEnvFile` at host startup/policy resolution so existing deployment
  secret handling remains consistent; never expose the values to containers.
- Add caller-level tests proving RFP/RFQ with `auto_archive=false` routes once,
  grants exactly one message ID, and records `routed_at`; true remains a tested
  explicit archive-only behavior.
- Add a host reconciler over Procurement classifications with
  `routed_at IS NULL`; initially alert/retry only with exact idempotency.
- Migration updates the two taxonomy rows to `auto_archive=false` and is safe
  when rows are absent.

### B. Source completeness

- Extend source runs with adapter version, planned/observed units, cursor or
  watermark, completeness evidence, terminal reason, and a real `partial` path.
- Separate adapter acceptance from source completion.
- Make mid-batch failure resumable/atomic and test zero-row complete,
  partial-page, replay, and conflicting replay.

### C. Post-decision pursuit spine

- Add migration 115 with host-owned pursuit state/version, initial owner, next
  action/due time, append-only events, artifact manifest, assessments,
  proposal-packet identity/hash, manual submission receipts, and outcomes.
- A `process` decision atomically creates exactly one visible pursuit job.
- Expose bounded `procurement_pursuit_queue` and typed transition/card
  operations; do not restore direct SQL.
- A named-human assessment command may close as `passed` or advance to
  `proposal_ready` only when required typed evidence is present.
- No state reaches `submitted` without a human-recorded receipt/reference.

### D. Reconciliation and scheduling

- Replace the generic agent cron with a host-owned orchestration/reconciler job
  or make scheduled completion receipt-bearing and source-aware.
- Escalate undecided/stalled/expired/ready-without-submission/submitted-without-
  outcome/unrouted-email/no-recent-complete-run cases exactly once.
- Pause legacy schedule and retire shared CDP only during verified cutover, with
  backups and rollback.

### E. Canary and source gate

- Synthetic denial/replay/failure canaries first.
- One sanitized positive intake → card → named `process` → pursuit-visible →
  evidenced `passed` canary.
- Then one real public opportunity to `passed` or `proposal_ready`, never submit.
- Only afterward implement SAM.gov as the first new adapter.

## Required review

1. Identify any unsafe, over-broad, underspecified, or non-idempotent element.
2. Propose the smallest schema/state machine and exact host operations needed
   for the closure canary; defer everything not required without creating a
   dead-end design.
3. Define SQL transition invariants, RLS/grants, replay behavior, and additive
   rollback boundary.
4. Define exact tests that must fail on current source and pass after repair.
5. Decide whether `readEnvFile` or tracked launchd is the safer configuration
   authority in this architecture, using current repository precedent.
6. Specify how to repair/reconcile 348 historical unrouted classifications
   without granting arbitrary Gmail search or causing duplicate handoffs.
7. Challenge whether migration 115 should include artifacts/packets now or use
   a narrower extensible core for the first canary.
8. Give an implementation order with file ownership that avoids unrelated
   Sales/email active work in this release lineage.
9. State release, migration, deployment, canary, and rollback acceptance gates.

## Response format

1. Verdict
2. Corrections required before implementation
3. Minimal schema/state machine
4. Host API and authorization contract
5. Email recovery strategy
6. Source-completeness contract
7. Reconciler/scheduler contract
8. Test plan with current-failure reproductions
9. Implementation sequence and exact files
10. Deployment/canary/rollback gates
11. Remaining risks, not owner questions
12. Files inspected, changed-file attestation, elapsed time, cost

Use file-and-line citations. Clearly distinguish fact, inference, and
recommendation. Do not reproduce hidden chain-of-thought.
