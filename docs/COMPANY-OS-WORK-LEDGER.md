# Company OS work ledger — proven pilots and live condition work

Status: host-only schema, non-authoritative observers, read-only report, and
operator loop are deployed and live-verified. Exact release `bab154cb`
preserves the earlier email/job/program-facts pilots and one owner-confirmed
operator, and deploys source-bound Chief work packets. Workflow and
source-correction authority remain separate; natural packet pickup remains an
outcome gate.
Tasks: foundation `NC-20260815-010`; activation `NC-20260816-001`; read-only
brief `NC-20260816-014`; report deployment/proof `NC-20260816-015`; operator
loop `NC-20260816-018`; condition pilot `NC-20260820-002`; source-bound
dispatch `NC-20260820-003`
Decision: the shared ledger is host-owned PostgreSQL business state, while the
existing SQLite approved-email tables remain the action-execution authority

Second-pilot note: `NC-20260816-016/017` add, deploy, and live-verify migration
119 plus the separately invoked host-job projector and multi-workflow report.
Five job runs are projected without changing this pilot's email state machine
or authority. See `docs/COMPANY-OS-JOB-LEDGER.md`.

Condition-work pilot: `NC-20260820-002` deploys the first
`business_condition` adapter for the deterministic program-facts detector in
exact release `8344524c`, with migration 125 and active mode live. One exact
detector run atomically records its normalized trigger,
ensure one stable `program_facts_drift` work item, append one content-minimized
observation, and route drift immediately to the existing Chief exception loop
as `fact_authority:owner_review_required`. Repeated unchanged drift remains
durable without repeated Sales noise. Only an exact clean detector rerun may
close the item; a later recurrence reopens it. The adapter never changes facts,
knowledge, products, website content, email, or another source of authority.
Production item 21 has two drift observations, one owner-review case, and one
Chief brief; the second observation came through the real Campanero scheduler
without a duplicate Sales alert. Owner correction and an exact clean scheduled
receipt remain pending.

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
  state, Gmail receipt, and—under deployed NC-20260820-003—the exact
  content-free Gmail message ID that originated the Sales work root;
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

| Stage                   | Required host fact                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `accepted`              | one deduplicated inbound/source fact was accepted                                         |
| `sales_dispatched`      | the host dispatched the exact work item to Sales                                          |
| `awaiting_approval`     | the host accepted an exact review card and persisted its action binding                   |
| `approved`              | an exact operator-approval receipt is bound to that card/action version                   |
| `mailman_dispatched`    | the host dispatched the approved action to the exact Mailman work session                 |
| `action_claimed`        | the existing SQLite action authority granted the one-time execution claim                 |
| `external_acknowledged` | an exact Gmail `SENT` receipt is recorded for that action                                 |
| `outcome_validated`     | the defined closure evidence, including the originating work-thread result, is reconciled |

### Dispositions

| Disposition | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `open`      | eligible for the next host transition                         |
| `waiting`   | waiting for an operator decision at `awaiting_approval`       |
| `blocked`   | a named guard/dependency stopped progress; stage is preserved |
| `failed`    | an attempted host operation failed; stage is preserved        |
| `completed` | only legal with `outcome_validated`                           |
| `cancelled` | terminal operator/host cancellation with an exact receipt     |

### Events

| Event                   | From                                              | To                                           | Receipt requirement               |
| ----------------------- | ------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| `accepted`              | creation                                          | `accepted/open`                              | source-event fingerprint          |
| `sales_dispatched`      | `accepted/open`                                   | `sales_dispatched/open`                      | none                              |
| `approval_requested`    | `sales_dispatched/open`                           | `awaiting_approval/waiting`                  | exact approval-card evidence hash |
| `approved`              | `awaiting_approval/waiting`                       | `approved/open`                              | `operator_approval`               |
| `mailman_dispatched`    | `approved/open`                                   | `mailman_dispatched/open`                    | none                              |
| `action_claimed`        | `mailman_dispatched/open`                         | `action_claimed/open`                        | `action_claim`                    |
| `external_acknowledged` | `action_claimed/open`                             | `external_acknowledged/open`                 | `external_delivery`               |
| `outcome_validated`     | `external_acknowledged/open`                      | `outcome_validated/completed`                | `outcome_validation`              |
| `blocked`               | any non-terminal stage                            | same stage, `blocked`                        | named block code                  |
| `failed`                | any non-terminal stage                            | same stage, `failed`                         | named failure code                |
| `resumed`               | `blocked` or `failed`                             | same stage, stage-derived active disposition | a new exact host event            |
| `cancelled`             | any non-terminal stage                            | same stage, `cancelled`                      | `cancellation`                    |
| `reopened`              | `outcome_validated/completed` condition work only | `accepted/open`                              | exact later condition occurrence  |

There are no skip transitions. Terminal email and host-job items cannot
change. The narrowly typed `program_facts_drift` recurrence edge is the only
terminal reopen in migration 125: it retains the same stable source work item,
resets its bounded deadline, and must route through `blocked` owner review
again. A duplicate exact event is a no-op; reuse of an idempotency or receipt
identity with different facts is a conflict.

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

Migration 119 was applied and live-verified under NC-017. It widens the same
tables for `host_job_run` under workflow-specific identity checks without
altering Mailman/Sales facts. The multi-workflow report is live in exact release
`999f2a4`; one five-run job projection and its duplicate-only replay are the
only authorized production job history. Release presence alone does not
authorize another projection.

Migration 125 is live under `NC-20260820-002`. It adds only the
`program_facts_drift` workflow/completion/event values and an admin-only,
append-only `company_program_fact_observations` table. That table stores opaque
occurrence/work IDs, detector version, counts, timestamps, and SHA-256 source
and finding evidence; it has no finding text, program fact, knowledge text,
product payload, customer content, or action field. Live structural
verification found 14 constraints, one enabled append-only trigger,
`nanoclaw_admin` ownership, and zero non-admin table or sequence grants. One
stable production item now has two observations and zero reopens. Populated
rollback refuses instead of deleting evidence. Schema and active-mode presence
do not authorize source correction or any fact edit.

Migration 118 was applied in production only under `NC-20260816-001`, after an
exact custom-format backup and explicit one-file apply. Live validation found
three `nanoclaw_admin`-owned tables, enabled append-only event/receipt triggers,
zero non-admin grants, and zero raw-content columns. Migration 117 belongs to
active Chaos work; repository numbering never authorizes applying another
task's migration.

## 7. Shadow-projection mapping

`src/company-work-shadow.ts` may emit ledger transitions only from these host
facts:

| Ledger fact                 | Existing authority/source                                                   |
| --------------------------- | --------------------------------------------------------------------------- |
| accepted / Sales dispatched | Gmail classification/router durable host event and queue work-unit identity |
| approval requested          | host-accepted review card plus immutable pending-send action binding        |
| approved                    | exact Slack operator-decision event bound to action/card/thread             |
| Mailman dispatched          | exact-session host handoff acknowledgment                                   |
| action claimed              | `pending_sends` one-time execution claim / `email_send_events`              |
| external acknowledged       | exact Gmail receipt already stored by the action authority                  |
| outcome validated           | Gmail receipt plus original Slack-thread closure/reconciliation evidence    |

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
npm run company-work:exceptions -- --workflow host_job_run --limit 100
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

NC-017 widens the same static bounded SELECT to `sales_email`, `host_job_run`,
or both. Its reconciliation rules are workflow-specific: email milestones do
not require job execution events, and job runs do not require Party, approval,
claim, Gmail, or thread-closure receipts. The default text view renders absent
job Party/pipeline identity as `-`; it still selects no raw email or job-result
content. The report remains disconnected from both execution paths.

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

The standalone report remains separately invokable and read-only. NC-018 uses
the same safe reader behind a default-off host interval to maintain separate
operator-attention cases and optionally post an exact Chief-channel brief. Its
acknowledgment is an attention receipt, not an exception-resolution action, and
it cannot promote a ledger fact into workflow authority. See
`docs/COMPANY-OS-EXCEPTION-LOOP.md`.

NC-20260820-003 deploys a host dispatch layer after that read: for each
visible exception it posts a bounded, cross-group work packet beneath the
brief. A `sales_email` packet follows the report's opaque action source key to
the authoritative SQLite action and exact Mailman-authored Sales root, then
copies that source into the Chief thread. The PostgreSQL ledger still receives
no customer prose or Gmail query. The packet can issue/recover only one exact
Chief `gmail_read` grant while that work retains an active exception case and
cannot mutate, approve, retry, send, or resolve the work. Exact release,
schema, prompt, service, channels, queues, and protected aggregates are
verified. The unchanged daily fingerprint deduplicated on startup, so the next
natural packet and Chief pickup remain separate outcome proof.

## 10. Read-only Sales service indicators

`NC-20260820-005` adds `src/company-work-indicators.ts` and the compiled
`company-work-indicators-cli` as a second standalone, read-only view over the
privacy-minimized ledger. It is not imported by the daemon, shadow projector,
exception loop, or email path. Its one static aggregate `SELECT` returns no
work-item, source, Party, pipeline, Gmail, Slack, or customer-content identity.

After a local or immutable release build, run:

```bash
npm run company-work:indicators
npm run company-work:indicators -- --json --window-days 30
```

The cohort contains `sales_email` items whose exact `accepted` event occurred
within the bounded half-open window. Completion requires exactly one later
`outcome_validated` event plus the matching terminal item state. Latency is the
elapsed time between those two exact events; the report returns completed
sample count, p50, p95, and maximum latency. Duplicate or contradictory
accepted/outcome evidence makes the whole report unavailable rather than
silently changing the denominator.

NC-20260820-006 defines the missing third-indicator evidence contract in
migration 126. A customer-visible outcome is one exact `sales_email`
`external_acknowledged` event, not an internal completion, blocked state, or
queued tool result. Its quality assessment is one current append-only receipt
classified as `clean`, `customer_visible_defect`,
`customer_visible_reversal`, or `customer_visible_defect_and_reversal` and
bound to that exact delivery event/version plus hashed source evidence. A
later assessment may supersede but never update/delete the prior receipt.

The aggregate publishes a defect/reversal rate only when every exact customer-
visible outcome in the accepted-window cohort has exactly one current receipt.
Until then it reports `outcome_quality_receipt_coverage_incomplete` with only
aggregate assessed/required/missing counts; an empty cohort reports
`no_customer_visible_outcomes_in_window`. Internal blocked, failed, stale,
dead-letter, or `source_gap:*` evidence remains ineligible. No objective or
alert threshold is guessed. Query failure returns only `ledger_query_failed`;
malformed ledger or receipt evidence returns only `ledger_quality_failed`.

Migration 126 is live dark persistence under exact release `265622bd`: the
migration itself adds no producer, agent grant, automatic classifier,
Gmail/Slack reader, remediation path, or message/action authority. The live
table is empty/admin-only; schema presence cannot create a clean or adverse
receipt.

NC-20260820-007 deploys the separately bounded producer as a standalone host CLI,
not a daemon path. Its default mode is a read-only preview over one exact
work-item ID and delivery-event version. The caller must supply one explicit
assessment, canonical evidence/assessment timestamps, and already-hashed
source/evidence/operator keys; raw evidence, customer identity, and content are
not inputs. The preview derives the current chain head, next revision, a
15-minute expiry, and a SHA-256 fingerprint. Apply re-derives the same plan in
one transaction and requires the exact fingerprint, hostname, immutable release
commit, and `NC-20260820-007-OUTCOME-QUALITY-ASSESSMENT` confirmation. It is
single-receipt only: there is no list, bulk, default-clean, or backfill mode.

The fingerprint binds the target, assessment, hashes, timestamps, revision,
and predecessor. It deliberately excludes only whether the same exact receipt
is not yet inserted or already present plus that existing row ID, so retry
after a lost response is duplicate-only while an intervening revision fails
`plan_changed`. Every correction still appends and supersedes; no update or
delete path exists.

```bash
npm run company-work:assess-outcome -- \
  --work-item-id <exact-internal-id> \
  --delivery-event-version <exact-version> \
  --assessment <clean-or-bounded-adverse-classification> \
  --source-key-sha256 <lowercase-sha256> \
  --evidence-sha256 <lowercase-sha256> \
  --assessor-key-sha256 <lowercase-sha256> \
  --evidence-occurred-at <canonical-utc-timestamp> \
  --assessed-at <canonical-utc-timestamp>
```

Omitting `--apply` is always dry-run. Apply is valid only from the exact
verified installed release and adds `--expected-plan-sha256`,
`--confirm-host`, `--expected-release`, and the exact confirmation above.
Installing the command does not authorize a receipt: the operator-reviewed
evidence and explicit apply gate remain separate, and production coverage must
not be manufactured for rollout proof.

Exact release `265622bd` installs the command on the Mini in default-off form.
Deployment is not baseline or receipt evidence: no real item was previewed and
the live table remains empty. Use the exact active-work and engineering-
changelog entry for the release, refusal, and protected-state receipts.

Exact release `265622bd` preserves the first bounded
30-day baseline: 15 accepted, 13 completed, two incomplete, and 86.67%
completion. Across the 13 exact accepted-to-outcome samples, p50 is
29m01.725s, p95 is 6h16m18.994s, and maximum is 9h25m12.618s. The same result
was produced once from the staged verified bundle and once after activation.
Both commands had identical before/after Company Work and exception
fingerprints. The ordinary startup exception loop re-observed current cases
before the active read and is separately attributable; it did not change the
work-item, event, or receipt ledger.

Exact release `265622bd` and live migration 126 now run contract version 2. The
staged and active 30-day reads both find 13 exact customer-visible outcomes,
zero current assessments, and 13 missing receipts, so the defect/reversal rate
remains unavailable with `outcome_quality_receipt_coverage_incomplete`. The
existing accepted/completed and latency baseline is unchanged, as are the
immediate before/after Company Work fingerprints. This is explicit missing
coverage, not a zero-defect claim. No SLO or objective is set from the small
baseline, and no assessment was manufactured for deployment proof.

NC-20260820-008 removes the manual evidence-forensics step without weakening
NC-007's human decision boundary. Migration 127 adds an admin-only,
content-free packet ledger; a default-off host service selects at most one
eligible completed Sales-email outcome per run. Before claiming a packet it
must prove the exact Company Work delivery/outcome events and receipts against
the immutable SQLite action ID, exact Mailman-routed Slack request, exact Sales
approval card, approved subject/body hash, Gmail confirmation event, and exact
Slack outcome receipt. It never calls a Gmail API or mailbox search and never
repairs SQLite while reviewing.

The private Chief packet is limited to one Slack message and is refused rather
than truncated if the identity-minimized request plus exact approved response
does not fit. PostgreSQL stores no prose or customer identity. Only configured
Slack UIDs reacting on the exact durably bound bot message are recognized:
✅ or 👍 `clean`, 🐛 `customer_visible_defect`, ↩️
`customer_visible_reversal`, and 🚨
`customer_visible_defect_and_reversal`. The UID is hashed, NC-007 dry-run/apply
is reused, and crash replay is duplicate-only by the same evidence/source key.
The reaction path is offered before generic check-mark approval, so a clean
quality label cannot wake Chief as an agent approval. Unconfigured operators,
typed messages, no reaction, and model output never become a classification.

Migration 128 closes Slack's reaction-name/UI mismatch: the standard 👍 arrives
as `+1` and is a supported explicit `clean` decision. The service also reads
only projected reaction metadata for the one exact open packet on startup/daily
run, so a supported configured-operator reaction that arrived while the listener
was down or before the vocabulary correction can be reconciled. Slack's exact-
message API returns a message envelope, but the channel helper discards its
content and exposes only reaction names and UIDs; content is not inspected,
logged, or persisted by this path. Exactly one match is required; zero or
multiple supported reactions fail closed. Slack does not provide the click
timestamp in that snapshot, so the durable assessment uses the host observation
time rather than inventing one. This is not channel search, absence-as-clean
evidence, or model inference.

NC-20260820-009 activates the service for one existing configured operator.
Exact release `288105cb` reconciled packet #1's already-present 👍 into one
append-only `clean` quality receipt and one thread acknowledgment. There is
still exactly one packet, and the service returned `decision_reconciled`
without selecting packet two. A reaction records quality evidence only: it
cannot send, retry, remediate, change work state, or take a customer action.

## 11. Operator exception loop

Migration 120 and `src/company-work-exception-loop.ts` keep operator-attention
state separate from the work-item/event/receipt state machine. Only a complete,
non-truncated report can open, re-observe, reopen, or source-resolve a case.
Daily/change fingerprints are claimed before Slack delivery; ambiguous sends
are not retried. Only a configured Slack UID reacting to the exact durably
bound brief can acknowledge its current case occurrences. No case operation
mutates `company_work_items`, `company_work_events`, or
`company_work_receipts`.

Repository presence alone does not arm it. Migration 120, the owner-approved
named-operator configuration, and the exact release are live; NC-018 records
the original config/restart canary and NC-20260820-003 records the later
source-bound dispatch deployment. Production state is authoritative only when
the active-work/changelog evidence says those gates passed.

`NC-20260821-001` adds migration 129 and a host-owned dispatch lifecycle around
those packets. The host binds the exact packet timestamp before Chief pickup,
records router pickup before agent execution, records the first bounded turn as
attempted or failed, and posts a threaded non-resolution receipt. A successful
attempt suppresses later dispatch of the same work-version/reason fingerprint;
the daily operator brief may still show the unresolved source case. Replayed
packet messages are consumed without another Chief run, and a mixed/new batch
explicitly scopes Chief to newly eligible work IDs. The records contain no
customer or agent prose and grant no agent access, source resolution, or action
authority. Repository presence is not deployment evidence.

## 12. Rollback

Before migration: revert the branch; there is no data or service recovery.

After the live migration but before runtime dependency: prefer leaving the
host-only additive tables dormant. The tracked rollback refuses to drop them
because work-item, receipt, and event history now exists.

After shadow wiring: roll back the runtime projection first. Never delete work
history or use a ledger rollback to resend/cancel an email action. The SQLite
action authority and Gmail receipt remain independent evidence.

After the exception loop records any case/brief/event, disarm its configuration
and leave migration-120 history dormant. Its guarded rollback refuses to
destroy recorded attention or delivery evidence.

After migration 129 records any dispatch/event, roll back runtime first and
leave the additive receipt tables dormant. Its guarded rollback refuses to
erase packet or attempt evidence.
