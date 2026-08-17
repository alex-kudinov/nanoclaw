# Company OS work ledger — Mailman/Sales pilot

Status: host-only schema, non-authoritative shadow observer, and read-only
exception brief deployed and live-verified; workflow authority and promotion
remain separate
Tasks: foundation `NC-20260815-010`; activation `NC-20260816-001`; read-only
brief `NC-20260816-014`; report deployment/proof `NC-20260816-015`
Decision: the shared ledger is host-owned PostgreSQL business state, while the
existing SQLite approved-email tables remain the action-execution authority

Second-pilot note: `NC-20260816-016` adds a local, unapplied migration-119
target and unwired host-job projector. It does not change this pilot's email
state machine, report filter, production schema, or authority. See
`docs/COMPANY-OS-JOB-LEDGER.md`.

## 1. Outcome and boundary

The first pilot represents one customer-response cycle as one durable work
item:

```text
Mailman/inbound fact
  → Sales dispatch
  → exact review card awaiting approval
  → operator approval
  → Mailman dispatch
  → immutable email action claim
  → Gmail acknowledgment
  → original Slack-thread/outcome validation
```

The activation slice adds a bounded observer, and NC-014/NC-015 add and deploy
a separate read-only reconciliation report, but neither does any of the
following:

- make the ledger authoritative for any workflow decision;
- change either group prompt or tool capability;
- replace `pending_sends` or `email_send_events`;
- send, retry, reconcile, or close an email;
- treat agent output, a queued tool response, service health, or a transport
  canary as progress.

Migration 118 and shadow deployment were authorized and completed only under
`NC-20260816-001`. Promotion to a workflow dependency remains a later,
separately authorized milestone.

## 2. Decision: one projection, two authorities

PostgreSQL `business_v2.company_work_*` owns the cross-agent work projection:
current stage, exception disposition, optimistic version, source identity,
append-only events, and external receipts.

SQLite remains authoritative for the exact approved email action:

- `pending_sends` owns immutable To/CC/subject/body authority, execution claim,
  state, and Gmail receipt;
- `email_send_events` owns the action's append-only execution stages;
- the Company OS ledger may reference an action ID and a hash/receipt, but may
  never reconstruct approved bytes or execute Gmail itself.

This separation prevents a generic ledger transition from becoming a new send
authority. The ledger is a host-owned projection of facts from existing
authorities, not a workflow engine driven by prompts.

## 3. Privacy-minimized data contract

The ledger stores identifiers and hashes needed for correlation, not customer
content. The schema and typed API exclude:

- email addresses and names;
- subjects and message bodies;
- approval-card or operator-message text;
- arbitrary JSON payloads;
- credentials, URLs with tokens, or Gmail message content.

Permitted identity is limited to stable internal IDs and opaque source keys:
Party ID, pipeline-entry ID, source system/key, exact event key, action ID,
receipt system/key, and SHA-256 evidence fingerprint. A later projection must
reject or hash raw content before calling this API.

## 4. State model

Stage answers "how far has the business path reached?" Disposition answers
"can it currently proceed?" A block or failure does not destroy the last
verified stage.

### Stages

| Stage | Required host fact |
| --- | --- |
| `accepted` | one deduplicated inbound/source fact was accepted |
| `sales_dispatched` | the host dispatched the exact work item to Sales |
| `awaiting_approval` | the host accepted an exact review card and persisted its action binding |
| `approved` | an exact operator-approval receipt is bound to that card/action version |
| `mailman_dispatched` | the host dispatched the approved action to the exact Mailman work session |
| `action_claimed` | the existing SQLite action authority granted the one-time execution claim |
| `external_acknowledged` | an exact Gmail `SENT` receipt is recorded for that action |
| `outcome_validated` | the defined closure evidence, including the originating work-thread result, is reconciled |

### Dispositions

| Disposition | Meaning |
| --- | --- |
| `open` | eligible for the next host transition |
| `waiting` | waiting for an operator decision at `awaiting_approval` |
| `blocked` | a named guard/dependency stopped progress; stage is preserved |
| `failed` | an attempted host operation failed; stage is preserved |
| `completed` | only legal with `outcome_validated` |
| `cancelled` | terminal operator/host cancellation with an exact receipt |

### Events

| Event | From | To | Receipt requirement |
| --- | --- | --- | --- |
| `accepted` | creation | `accepted/open` | source-event fingerprint |
| `sales_dispatched` | `accepted/open` | `sales_dispatched/open` | none |
| `approval_requested` | `sales_dispatched/open` | `awaiting_approval/waiting` | exact approval-card evidence hash |
| `approved` | `awaiting_approval/waiting` | `approved/open` | `operator_approval` |
| `mailman_dispatched` | `approved/open` | `mailman_dispatched/open` | none |
| `action_claimed` | `mailman_dispatched/open` | `action_claimed/open` | `action_claim` |
| `external_acknowledged` | `action_claimed/open` | `external_acknowledged/open` | `external_delivery` |
| `outcome_validated` | `external_acknowledged/open` | `outcome_validated/completed` | `outcome_validation` |
| `blocked` | any non-terminal stage | same stage, `blocked` | named block code |
| `failed` | any non-terminal stage | same stage, `failed` | named failure code |
| `resumed` | `blocked` or `failed` | same stage, stage-derived active disposition | a new exact host event |
| `cancelled` | any non-terminal stage | same stage, `cancelled` | `cancellation` |

There are no skip transitions. Terminal items cannot change. A duplicate exact
event is a no-op; reuse of an idempotency or receipt identity with different
facts is a conflict.

## 5. Concurrency, retry, and restart semantics

Every work item has an integer `version` beginning at zero. A transition:

1. checks whether its idempotency key already exists;
2. locks the work item row;
3. requires the caller's exact expected version;
4. validates the state-machine edge and required receipt;
5. appends/deduplicates the receipt;
6. updates stage/disposition and increments the version;
7. appends exactly one event at that version;
8. commits all of the above atomically.

Consequences:

- restart before commit leaves no partial transition and the retry may proceed;
- restart after commit returns the existing event when the exact idempotency
  fingerprint is retried;
- the same key with changed actor, stage, evidence, receipt, or error/block
  identity fails visibly;
- two concurrent writers cannot both advance the same expected version;
- blocked/failed work can resume without pretending an unverified stage was
  reached;
- `external_acknowledged` and `outcome_validated` cannot be inferred from model
  text or tool-queue success because an exact typed receipt is mandatory.

## 6. Database authority

Migration 118 creates:

- `business_v2.company_work_items` — current projection and optimistic version;
- `business_v2.company_work_receipts` — append-only exact receipt identities;
- `business_v2.company_work_events` — append-only versioned transition facts.

Base-table and sequence permissions are revoked from `PUBLIC`. Only
`nanoclaw_admin` receives access. No Sales, Mailman, Chief, or other agent role
gets a view, write function, or base-table privilege in this slice. The host
typed store uses the existing admin-side `withAgentContext()` transaction.

Migration 119 is tracked only as an unapplied NC-016 target. It widens the same
tables for `host_job_run` under workflow-specific identity checks; it does not
alter deployed Mailman/Sales facts or make the existing report multi-workflow.
Repository presence is not migration evidence.

Migration 118 was applied in production only under `NC-20260816-001`, after an
exact custom-format backup and explicit one-file apply. Live validation found
three `nanoclaw_admin`-owned tables, enabled append-only event/receipt triggers,
zero non-admin grants, and zero raw-content columns. Migration 117 belongs to
active Chaos work; repository numbering never authorizes applying another
task's migration.

## 7. Shadow-projection mapping

`src/company-work-shadow.ts` may emit ledger transitions only from these host
facts:

| Ledger fact | Existing authority/source |
| --- | --- |
| accepted / Sales dispatched | Gmail classification/router durable host event and queue work-unit identity |
| approval requested | host-accepted review card plus immutable pending-send action binding |
| approved | exact Slack operator-decision event bound to action/card/thread |
| Mailman dispatched | exact-session host handoff acknowledgment |
| action claimed | `pending_sends` one-time execution claim / `email_send_events` |
| external acknowledged | exact Gmail receipt already stored by the action authority |
| outcome validated | Gmail receipt plus original Slack-thread closure/reconciliation evidence |

Projection starts shadow-only: ledger failure must alert but must not block or
duplicate the existing email path. Cutover to any dependency on the ledger
requires parity evidence over restart, retry, duplicate, block, failure, and
success cases plus the pending natural customer-path receipt for
`NC-20260815-009`.

### Activation contract

The observer defaults off. It runs only when the host environment provides
both `COMPANY_WORK_SHADOW_ENABLED=1` and a valid
`COMPANY_WORK_SHADOW_SINCE` timestamp. Interval and batch size are bounded;
missing or invalid lower-bound configuration produces a visible
`misconfigured` health state and no PostgreSQL writes.

Each scan reads only Sales action metadata from SQLite. Before creating a work
item it proves the exact Mailman-authored root, Sales-authored approval card,
approved-content hash, action event, pipeline-entry/Party binding, and—when
closing—the exact mechanical Gmail receipt line in the original Slack thread.
PostgreSQL receives opaque IDs, timestamps, named exception codes, and SHA-256
evidence only. It receives no recipient, subject, body, card, or operator text.

Historical actions may contain a later execution/confirmation fact without the
required Mailman-dispatch or action-claim event. The observer records that as a
named `source_gap:*` failure at the last verified stage and does not invent the
missing transition from Gmail success. Later source facts remain visible in
SQLite but cannot promote the work item across the gap.

The daemon health document exposes only aggregate scan, skip, error,
transition, duplicate, and completion counts. Projection errors are contained
per action; a whole-tick source/database failure is logged and surfaced in
health, but never thrown into the email execution path.

## 8. Verified activation evidence

`NC-20260816-001` completed the separately authorized migration and shadow
milestone:

- migration 118 has an exact production backup, restore catalog, migration
  digest, structural validation, least-privilege proof, and minimized columns;
- exact Node 22.23.2 typecheck, 25 focused tests, the 628-test email-critical
  gate, and the independent 36-test runner gate passed;
- immutable corrective release `55c97d5e1bd072dab1c3000f3b715134c3ccc336`
  is live with exact code-root/artifact health and one listener;
- a bounded scan of seven source actions excluded three non-Mailman roots and
  projected four eligible items as three complete outcomes plus one explicit
  `source_gap:mailman_dispatch_missing` failure at its last verified stage;
- the following cycle applied zero transitions and deduplicated all 29 facts;
- SQLite remained authoritative and unchanged by the projection: 67 bound
  actions, 61 confirmed, 6 blocked, zero actionable, and 334 source events;
  Gmail and Slack remained connected and the outgoing queue remained empty.

The natural approved-email action required by `NC-20260815-009` also completed
through normal fallback, Mailman execution, exact Gmail acknowledgment, and one
original-thread closure without manual repair. That is outcome evidence for the
existing email path; it does not promote this ledger into that path. A
separately accepted authority/promotion gate remains mandatory.

## 9. Read-only reconciliation and exception brief

`NC-20260816-014` adds `src/company-work-report.ts` and the compiled
`company-work-report-cli` as an operator-facing, read-only view over the
privacy-minimized ledger. It is not imported by the daemon or shadow observer.
Its database boundary is one static, bounded `SELECT`; it has no transition,
approval, retry, channel, or email dependency.

After a local or immutable release build, run:

```bash
npm run company-work:exceptions
npm run company-work:exceptions -- --json --limit 100 --stale-after-hours 24
```

The report separates completed, cancelled, and healthy-open work from items
that require observation. One item may carry multiple independently counted
reasons:

- contradictory current/event state or a broken event-version chain;
- duplicate milestone or receipt facts;
- a required operator/action/Gmail/outcome/cancellation receipt is absent;
- a named `source_gap:*` failure;
- blocked or failed disposition;
- elapsed deadline or transition-age threshold;
- waiting for operator approval;
- exact Gmail acknowledgment without original-thread outcome validation.

Output contains only internal work/Party/pipeline IDs, opaque source identity,
stage/disposition, timestamps/age, named codes, and aggregate counts. It never
selects recipient, subject, body, approval text, evidence bytes, or credentials.
A database/query failure returns only `ledger_query_failed` and cannot affect
the shadow projector or email path.

NC-014 established this as a local, non-authoritative R2 evidence surface.
NC-015 deploys exact release `cf96258` and live-verifies one bounded production
read: all four items were scanned without truncation, three were complete, and
one was the known critical failed/stale
`source_gap:mailman_dispatch_missing`. All structural contradiction,
event-chain, duplicate, receipt-gap, overdue, waiting-approval, and
outcome-missing counts were zero. Before/after fingerprints remained four
items, version sum 25, 29 events, 13 receipts, and unchanged maximum
timestamps; SQLite remained 61 confirmed/6 blocked actions and 334 events with
zero active actions.

The report is still not daemon- or scheduler-wired, does not satisfy R4's
operator resolution/work-panel gate, and cannot promote a ledger fact into
workflow authority. Any Slack brief, schedule, acknowledgment, resolution
action, or workflow dependency requires its own task and authority.

## 10. Rollback

Before migration: revert the branch; there is no data or service recovery.

After the live migration but before runtime dependency: prefer leaving the
host-only additive tables dormant. The tracked rollback refuses to drop them
because work-item, receipt, and event history now exists.

After shadow wiring: roll back the runtime projection first. Never delete work
history or use a ledger rollback to resend/cancel an email action. The SQLite
action authority and Gmail receipt remain independent evidence.
