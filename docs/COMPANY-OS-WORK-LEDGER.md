# Company OS work ledger — Mailman/Sales pilot

Status: dark foundation implemented locally; migration 118 is tracked but
unapplied; no runtime producer or consumer is wired
Task: `NC-20260815-010`
Decision: the shared ledger is host-owned PostgreSQL business state, while the
existing SQLite approved-email tables remain the action-execution authority

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

This task supplies only the persistence and typed transition foundation. It
does not:

- apply migration 118;
- create work items from live Gmail, Slack, Sales, or Mailman events;
- change either group prompt or tool capability;
- replace `pending_sends` or `email_send_events`;
- send, retry, reconcile, or close an email;
- treat agent output, a queued tool response, service health, or a transport
  canary as progress.

Migration and runtime projection require later, separately authorized tasks.

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

The migration is deliberately unapplied here. Migration 117 belongs to active
Chaos work and may not yet be live; an activation task must inspect the running
schema and apply the ordered migration chain rather than assuming repository
presence equals database state.

## 7. Later shadow-projection mapping

A later task may emit ledger transitions only from these host facts:

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

## 8. Verification and activation gates

This dark-foundation milestone exits when:

- migration and rollback files are tracked and migration 118 is not applied;
- migration contract tests prove host-only permissions, privacy-minimized
  columns, constraints, exact receipt/event uniqueness, and rollback refusal
  with data;
- state-machine/store tests cover restart-equivalent retry, exact duplicate,
  conflicting duplicate, stale version, illegal skip, block/resume, failure,
  required receipts, cancellation, and full success;
- typecheck, focused tests, root tests, documentation continuity, formatting,
  and diff checks pass, with unrelated baseline failures named separately;
- `docs/PROJECT-MAP.md`, `docs/DATA-MODEL.md`, the Company OS roadmap, active
  work, and the changelog distinguish local implementation from migration,
  shadow projection, deployment, and outcome validation.

The later activation milestone must stop for owner review before any production
database migration or runtime wiring. It requires schema-first live preflight,
backup/rollback evidence, exact migration ordering, a default-off release,
shadow reconciliation, and a separately accepted promotion gate.

## 9. Rollback

Before migration: revert the branch; there is no data or service recovery.

After a later migration but before runtime dependency: prefer leaving the
host-only additive tables dormant. The tracked rollback refuses to drop them
when any work item, receipt, or event exists.

After shadow wiring: roll back the runtime projection first. Never delete work
history or use a ledger rollback to resend/cancel an email action. The SQLite
action authority and Gmail receipt remain independent evidence.
