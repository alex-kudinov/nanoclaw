# Company OS normalized trigger contract

Status: the strict foundation was completed locally under `NC-20260817-001`.
`NC-20260817-002` adds a default-off, exact-boundary scheduled-task observer as
an unapplied/unreleased activation candidate. Migration 121 remains unapplied
until that task records a separate production gate. Gmail, webhook, topic, and
business-condition adapters remain absent.

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

| Trigger kind | Definition key | Occurrence key | Existing evidence source |
| --- | --- | --- | --- |
| `time` | scheduled-task ID, host-job name, or another registered schedule ID | the exact intended firing boundary, not scheduler poll time | SQLite `scheduled_tasks`/`jobs`; a schedule is one trigger subtype |
| `gmail` | approved account alias plus subscription purpose | immutable Gmail message ID; a history cursor alone is not an occurrence | Gmail history delta and message metadata |
| `webhook` | registered source/hook identity | source-issued immutable event ID | `business_v2.webhook_inbox`; null/unstable event IDs cannot be promoted |
| `topic` | registered topic/publisher identity | publisher-issued immutable event ID | an authenticated topic envelope; delivery attempt IDs are not business facts |
| `business_condition` | registered condition/version identity | exact evaluation window or source snapshot identity | a complete condition read plus source watermark/evidence digest |

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

| Existing row | Candidate | Result |
| --- | --- | --- |
| no matching occurrence/source identity | any valid candidate | insert once |
| same occurrence ID and same semantic fingerprint | later delivery/retry | exact duplicate; no second row |
| same occurrence/source identity and different fingerprint | mutated or contradictory replay | conflict; fail closed |
| different immutable occurrence key | valid later fact | new occurrence |

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

## First source adapter: scheduled-task claim observation

The NC-002 candidate observes only the scheduler's existing successful
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

The NC-001 foundation stops before production. NC-002 must separately:

1. reconcile the then-live schema and trigger inventory;
2. back up PostgreSQL and explicitly apply only migration 121;
3. deploy an exact verified release with all adapters disabled;
4. deploy the scheduled-task observer disabled, then arm one exact task and
   one exact intended boundary;
5. prove that one natural claim inserts once and exact replay is duplicate;
6. compare schedule/channel/work/action fingerprints before and after;
7. retain task creation/resume and every action authority behind later gates;
8. define source watermarks and bounded reconciliation before claiming loss
   recovery, especially for Gmail history expiry.

No source exception or external event may be manufactured merely to satisfy an
activation test.
