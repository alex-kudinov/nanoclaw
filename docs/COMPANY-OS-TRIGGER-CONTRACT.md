# Company OS normalized trigger contract

Status: the strict foundation was completed locally under `NC-20260817-001`.
`NC-20260817-002` applied migration 121 and deployed exact release `baed66d`,
then live-proved one default-off, exact-boundary scheduled-task observer on one
natural claim. Exact replay was duplicate-only and the configuration was
expired back to disabled. `NC-20260817-003` adds the unwired source-inventory
and watermark/gap foundation in migration 122; `NC-20260817-004` applies it and
deploys exact release `070cde38` dark with all three tables empty and
admin-only. `NC-20260817-005` adds a local, unwired, proposal-only inbound Gmail
full-snapshot adapter. `NC-20260817-006` adds a local exact read-only Google
wrapper and resumable content-free shadow target in migration 123.
`NC-20260817-007` deploys those exact bytes in release `de815e1d` with the
migration still absent and no runtime import. Synthetic/disposable proof crosses
10,000 candidates. `NC-20260817-013` applies migration 123 dark with all three
tables empty/admin-only. `NC-20260818-001` adds and live-runs a default-refuse,
one-source Gmail bootstrap CLI with cursor-fingerprint, freshness, drift,
atomicity, and exact-replay gates. Production source/event/state counts are
1/1/1 at version 1/current; live Google reads, shadow evidence, cursor/runtime
wiring, and the separate label-correction source remain absent.
Webhook, topic, and business-condition adapters remain absent.

## Purpose

A trigger answers only: **which immutable source occurrence requested which
stable work identity, and was this an exact replay?** It does not execute work.

The contract gives time/schedule, Gmail, webhook, topic, and
business-condition adapters one content-free identity and replay boundary
before any of them may create or resume Company OS work. This keeps source
normalization independent from task state, skill selection, approvals,
capabilities, and action execution.

## Normalized occurrence

Every accepted candidate has:

- contract version 1;
- one closed trigger kind;
- a bounded source-system name;
- an opaque, content-free source definition key;
- an opaque, content-free occurrence key;
- a normalized UTC observation time;
- a SHA-256 digest of the source evidence;
- a requested `create` or `resume` operation and stable work identity;
- derived definition, occurrence, and semantic SHA-256 identities;
- fixed `actionAuthority: none`.

The runtime validator rejects unknown fields at both envelope levels. There is
no field for a message, webhook body, topic payload, condition explanation,
prompt, skill, model, capability, approval, action envelope, or arbitrary
metadata. External IDs that do not fit the conservative opaque-key grammar
must be mapped to a stable content-free alias or digest by a separately
reviewed adapter; weakening the common contract is not the fallback.

## Source adapter mapping

This task defines the shared target, not the adapters. A later source-specific
task must prove the following immutable identities before wiring:

| Trigger kind         | Definition key                                                      | Occurrence key                                                          | Existing evidence source                                                     |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `time`               | scheduled-task ID, host-job name, or another registered schedule ID | the exact intended firing boundary, not scheduler poll time             | SQLite `scheduled_tasks`/`jobs`; a schedule is one trigger subtype           |
| `gmail`              | approved account alias plus subscription purpose                    | immutable Gmail message ID; a history cursor alone is not an occurrence | Gmail history delta and message metadata                                     |
| `webhook`            | registered source/hook identity                                     | source-issued immutable event ID                                        | `business_v2.webhook_inbox`; null/unstable event IDs cannot be promoted      |
| `topic`              | registered topic/publisher identity                                 | publisher-issued immutable event ID                                     | an authenticated topic envelope; delivery attempt IDs are not business facts |
| `business_condition` | registered condition/version identity                               | exact evaluation window or source snapshot identity                     | a complete condition read plus source watermark/evidence digest              |

The observation time must be source-derived when available. Ingest/retry time
is operational evidence and is deliberately excluded from the occurrence
identity.

## Identity and replay semantics

All hashes use canonical JSON arrays and explicit version domains:

1. `definitionId` binds kind + source system + source definition key.
2. `occurrenceId` binds that definition + immutable occurrence key.
3. `semanticFingerprint` additionally binds observation time, evidence digest,
   requested operation, workflow type, and stable work source identity.

Therefore:

| Existing row                                              | Candidate                       | Result                         |
| --------------------------------------------------------- | ------------------------------- | ------------------------------ |
| no matching occurrence/source identity                    | any valid candidate             | insert once                    |
| same occurrence ID and same semantic fingerprint          | later delivery/retry            | exact duplicate; no second row |
| same occurrence/source identity and different fingerprint | mutated or contradictory replay | conflict; fail closed          |
| different immutable occurrence key                        | valid later fact                | new occurrence                 |

Changing an ingest timestamp cannot mint a new occurrence because ingest time
is not accepted. Changing material source/work facts under the same occurrence
identity cannot silently update history.

## Durable store

Migration 121 adds one admin-only append-only table,
`business_v2.company_trigger_occurrences`. It contains only the normalized
fields above plus `recorded_at`. Unique occurrence and source identities enforce
replay convergence. The host store inserts once, reads the winner after a
uniqueness race, and returns duplicate only when the semantic fingerprint is
exact. Any split or drift is a conflict.

No agent role receives table access. The rollback drops the table only while
empty; once evidence exists, runtime rollback leaves it dormant.

## Source inventory and watermark foundation

Migration 122 defines the durable prerequisite for every later source adapter;
it does not register a live source by itself. Each immutable source definition
binds the existing trigger `definitionId` to:

- a versioned adapter identity;
- one cursor kind: no cursor, unsigned integer, or UTC timestamp;
- one recovery mode: not applicable, bounded scan, full snapshot, or explicitly
  unsupported;
- a maximum reconciliation window and freshness budget when recovery exists;
- stable content-free owner and alert-route keys;
- a semantic source fingerprint. Exact registration replay converges; changing
  adapter/recovery/ownership facts under the same source definition conflicts.

There is deliberately no enabled flag, task target, prompt, skill, capability,
credential, approval, message, arbitrary metadata, or action field. A source
definition is inventory, not permission.

Reconcileable sources receive a host-owned compare-and-swap cursor head plus
append-only events:

| Event            | Required prior state                   | Durable effect                                                                                  |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bootstrap`      | version 0, uninitialized               | establishes the first closed cursor                                                             |
| `advance`        | current exact version/cursor           | advances strictly forward across one completely accounted range                                 |
| `gap_detected`   | current exact version/cursor           | records the attempted range and reason but leaves the durable cursor fixed; state becomes `gap` |
| `gap_reconciled` | exact open gap ID, version, and cursor | closes that one gap and advances to the proven cursor                                           |

Every event uses a stable event key and semantic fingerprint. Exact replay is
duplicate-only; same-key drift conflicts. `observed_count` must equal
`accepted_count + rejected_count`, observation windows cannot reverse, and
unsigned/timestamp cursors must move strictly forward. While state is `gap`,
ordinary advancement is refused. The append-only history and mutable cursor
head remain host-admin-only.

This contract does not pretend that all existing sources are equally ready:

| Family             | Verified current mechanics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Normalized-adapter readiness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| time               | one exact scheduled-task claim observer was proven and is now disabled; intended boundary is the occurrence identity                                                                                                                                                                                                                                                                                                                                                                                                                                 | proven for that one no-cursor source only                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Gmail              | inbound push and label-correction polling keep separate mutable history IDs in SQLite; both still re-bootstrap on expiry. Exact release `263ac7c4` makes ordinary inbound-push advancement conditional on one durable terminal receipt per returned candidate and refuses a non-terminal page 20. Its additive receipt table/triggers and first natural producer behavior are live-proven: 18 unique receipts cover three ordinary persists, ten rule auto-archives, and five own-outbound rejections across 67 failure-free current-process cycles. | NC-005 proves the strict proposal contract. NC-006 adds the exact read-only wrapper and resumable shadow ledger over 10,001 candidates. NC-008/009 add, deploy, and naturally prove the real-ingestion receipt producer/reader without wiring recovery. NC-010 accounts for retained-host unknowns, NC-013 applies the shadow schema, and NC-20260818-001 live-proves one source/bootstrap/current state. Promotion remains blocked on live shadow proof and 404 runtime wiring. Label correction remains unaddressed. |
| webhook            | `webhook_inbox` deduplicates non-null provider event IDs; some extractors still return NULL; only the older Trafft sweeper has a mutable source watermark                                                                                                                                                                                                                                                                                                                                                                                            | eligible only source by source after immutable ID and complete bounded scan proof                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| topic              | Gmail Pub/Sub exists as Gmail transport, not as a generic authenticated topic adapter                                                                                                                                                                                                                                                                                                                                                                                                                                                                | absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| business condition | condition-oriented jobs/loops exist, but none emits the normalized occurrence contract from a complete versioned snapshot/window                                                                                                                                                                                                                                                                                                                                                                                                                     | absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The older `business_v2.sweeper_watermarks` table remains source-specific legacy
evidence. Migration 122 does not migrate, reinterpret, or silently promote it.

The first Gmail inventory operation is deliberately narrower than an adapter:
`company-gmail:bootstrap` reads the existing inbound-push cursor from SQLite
in query-only mode, verifies a caller-supplied SHA-256 fingerprint and fresh
canonical observation time, and performs source registration plus one
zero-count version-zero bootstrap event in one PostgreSQL transaction. It
never accepts the raw cursor on the command line, calls Gmail, writes SQLite,
imports the daemon, creates a gap/shadow/work item, or grants action authority.
Exact replay converges; cursor drift before or inside the transaction refuses,
and drift after commit is surfaced as a failed stability receipt rather than
hidden.

Production proof under NC-20260818-001 installs candidate `1b70de94` beside,
but does not activate it over, live release `dc3e5f0d`. One source, one zero-
count bootstrap event, and one version-1 current state exist; exact replay is
duplicate-only. SQLite remained query-only, the shadow ledger remains empty,
and Company Work, trigger occurrences, daemon identity, and channel health are
unchanged.

## First source adapter: scheduled-task claim observation

The NC-002 observer observes only the scheduler's existing successful
compare-and-swap claim. The scheduler passes the adapter the already-loaded
task ID, schedule type/value, and exact pre-claim `next_run` value. The adapter:

- is disabled by default;
- requires one exact task ID and one exact intended firing boundary;
- hashes the task identity into content-free definition/work aliases;
- hashes a versioned array of task ID, schedule type/value, and boundary as
  evidence;
- uses the intended boundary as occurrence key and observation time;
- records `create` as source intent while granting no create authority;
- never receives the prompt, group/chat identity, task result, agent state, or
  action arguments;
- is fire-and-forget after claim, so refusal, conflict, or PostgreSQL failure
  cannot block, retry, roll back, or change the scheduled task.

The release-bound configuration helper changes only three dedicated keys,
defaults to value-redacted dry-run, requires the exact hostname to apply or
restore, creates an exclusive same-mode backup, and writes atomically. Health
exposes one configured task as a count, its non-secret boundary, aggregate
outcomes, and the last error code; it does not expose the task ID.

An occurrence row proves only that the already-authoritative scheduler claimed
that boundary. The task's eventual success, failure, messages, approvals, or
business outcome remain separate evidence.

## Production activation evidence

Exact release `baed66dba21dd35edf4d472c537a1d69c5fa867a` was independently
verified and deployed disabled after a zero-work drain, mode-0600 PostgreSQL
backup, and explicit migration-121 apply. Dark health showed zero calls and
zero rows. The existing weekday task's intended
`2026-08-17T14:00:00.000Z` boundary was then selected through the redacted,
backup-producing helper without changing or creating a task.

The scheduler naturally claimed that boundary at `2026-08-17T14:00:11.382Z`.
Daemon health recorded one call, one match, one applied occurrence, and zero
failures. The durable table contains exactly one content-free
`time`/`scheduled_task` row; an exact activated-release replay returned
duplicate and row count remained one. Configuration was then expired back to
disabled while the daemon retained its one-call evidence counters. The natural
task later completed under scheduler authority; its result was not inspected
and is not trigger outcome evidence.

Normal activity during the wait was separately attributable to existing email,
Company Work shadow, and exception-loop producers. Task/job/channel definition
counts stayed fixed, active email actions stayed zero, and the trigger observer
wrote no task, Company Work, approval, message, capability, or action state.
The deployment restart did cause the already-enabled daily exception loop to
post its next deduplicated Chief brief; that existing producer and its three
`briefed` events are not trigger-adapter output.

## Authority boundaries

Recording an occurrence:

- does not create or resume a task;
- does not write the Company Work ledger;
- does not select or upgrade a skill, model, budget, or execution profile;
- does not expose a capability or credential;
- does not approve, dispatch, retry, send, publish, mutate, or resolve work;
- does not treat delivery, agent completion, or prose as an outcome receipt.

Future wiring must preserve separate transactions and receipts for trigger
acceptance, task create/resume, agent attempt, action authorization, external
acknowledgment, and outcome validation.

## Activation gates

NC-002 completed gates 1-7 for the first scheduled-time source:

1. reconcile the then-live schema and trigger inventory;
2. back up PostgreSQL and explicitly apply only migration 121;
3. deploy an exact verified release with all adapters disabled;
4. deploy the scheduled-task observer disabled, then arm one exact task and
   one exact intended boundary;
5. prove that one natural claim inserts once and exact replay is duplicate;
6. compare schedule/channel/work/action fingerprints before and after;
7. retain task creation/resume and every action authority behind later gates;

NC-003 completes the generic contract portion of gate 8: immutable source
registration, compare-and-swap cursor state, complete-range accounting, gap
freeze, and exact-gap reconciliation semantics. NC-004 applies that schema and
deploys it dark while keeping source/event/state row counts at zero. Neither
task seeds or registers a source or wires an adapter. Gate 8 remains open per later
source: implement and prove the source-specific bounded scan/full snapshot,
then register and observe it before claiming loss recovery. Gmail history
expiry is explicitly blocked until that proof exists. NC-005 completes only the
local proposal layer for the inbound source: a 404 can map to `gap_detected`,
and `gap_reconciled` exists only after a capped unfiltered full snapshot reaches
a terminal page, every unique message ID receives durable accepted/rejected
evidence, the profile history head stays fixed, and the age/freshness budgets
hold. It performs no Gmail read or store write, and current production behavior
is unchanged. NC-006 completes the next local prerequisite: exact
profile/unfiltered-list calls plus an initially unapplied admin-only resumable
ledger.
Its terminal path reuses NC-005's proof, and disposable PostgreSQL verifies a
21-page/10,001-candidate attempt, exact replay, append-only receipts, and
guarded rollback. It performs no live Gmail read, production migration/source
write, cursor update, recovery, task, or action. See
`docs/COMPANY-OS-GMAIL-RECONCILIATION.md`.

NC-013 subsequently applies that ledger dark and NC-20260818-001 registers and
bootstraps the one inbound source from the unchanged SQLite cursor. This closes
inventory/bootstrap only: no Google read, shadow row, 404 interception, task,
or action authority is live.

No source exception or external event may be manufactured merely to satisfy an
activation test.

These gates prove only the single scheduled-time source and boundary above.
Every recurring definition, remaining Gmail/webhook/topic/business-condition
adapter, source-specific live shadow or recovery claim, task create/resume
operation, and action authority remains a separate tracked and authorized
milestone.
