# Company OS work ledger — Campanero host-job pilot

Status: NC-016 dark foundation complete; NC-017 deployed and live-verified an
explicit fixed-window observer and multi-workflow read-only report. Migration
119 is applied and five exact host-job runs are projected; the observer remains
unscheduled/default-off.
Tasks: foundation `NC-20260816-016`; activation `NC-20260816-017`
Decision: SQLite `jobs` and `job_run_logs` remain host-job authority; the
PostgreSQL ledger may only project exact structural run facts

## 1. Outcome and boundary

The second pilot represents one host job execution attempt as one durable work
item:

```text
job_run_logs row inserted
  → child process PID recorded
  → exact terminal row recorded
  → successful outcome receipt or named failed-run receipt
```

Campanero is the jobs-only management interface. It is not the scheduler or
execution authority. The authoritative sources remain:

- the host job registry plus the SQLite `jobs` row for definition/enabled/next
  run state;
- the SQLite `job_run_logs` row for one exact execution attempt;
- `src/job-runner.ts` and `src/task-scheduler.ts` for execution mechanics.

NC-016 does not import the projector from the daemon, query either database,
run/pause/resume a job, change a schedule, post a result, alter Campanero's
prompt/capability, apply migration 119, or deploy a release.

NC-017 retains that execution boundary. It adds a separately invoked CLI whose
SQLite connection is opened read-only and whose PostgreSQL writes require an
exact confirmation string, lower timestamp, closed upper timestamp, and batch
ceiling. A truncated window or missing job definition is refused before the
first ledger write, and every structural row is validated before projection
begins. The CLI is not imported by the daemon or scheduler and no recurring
observation is armed.

## 2. Work identity and source facts

One `job_run_logs.id` is one work item. The privacy-minimized source identity is
`sqlite_host_job_run` plus `<job-name>:<run-id>`. Retry attempts retain their
own run IDs and therefore remain separate work items; parent/child retry joins
belong to the later R5 task model and are not inferred here.

The projector type accepts only:

- run ID and job name;
- structural trigger identity;
- start/finish timestamps;
- status, duration, exit code, PID presence, retry attempt, and timeout.

It cannot accept job output, error text, log path, script, arguments, prompt,
environment, credentials, or arbitrary payload. PostgreSQL receives opaque
identity, timestamps, named codes, and SHA-256 evidence only.

## 3. State and receipt mapping

| Ledger fact | Exact SQLite source | Ledger result |
| --- | --- | --- |
| `accepted` | inserted `job_run_logs` row with run ID/start time | `accepted/open` |
| `execution_started` | positive host-recorded PID | `execution_started/open` |
| `outcome_validated` | `ok`, exact finish/duration, PID, and exit code 0 | `outcome_validated/completed` plus `outcome_validation` receipt |
| `execution_failed` | exact terminal `fail`, `timeout`, or `dispatch_error` row | last verified stage/`failed` plus terminal receipt and named code |
| `failed` source gap | contradictory or incomplete structural facts | last verified stage/`failed`, no invented terminal receipt |

An `ok` row without durable PID evidence does not become complete. A running
row stays open; its deadline is start + configured timeout + the job runner's
five-minute orphan grace. A terminal row missing finish/duration facts becomes
an explicit `source_gap:*` failure. No model text can supply or repair a fact.

Terminal failure codes are bounded to:

- `job_run:timeout`;
- `job_run:dispatch_error`;
- `job_run:prelaunch_failure`;
- `job_run:exit_nonzero`;
- `job_run:process_error`.

## 4. Schema decision

Migration 119 widens migration 118 rather than creating a parallel ledger:

- `workflow_type` adds `host_job_run`;
- `completion_definition` adds `host_job_terminal_receipt`;
- the job-only `execution_started` and `execution_failed` events are added;
- Party and pipeline IDs become nullable at the column level but a
  workflow-specific constraint still requires both for `sales_email` and
  forbids both for `host_job_run`;
- terminal success and failure require exact receipts;
- all existing append-only, source identity, idempotency, optimistic version,
  ownership, and no-agent-grant controls remain.

The non-auto-discovered rollback refuses to narrow the schema while any
`host_job_run` history exists. Existing Mailman/Sales history is never deleted.

## 5. Activation implementation state

`src/company-work-ledger.ts` contains the host-only typed job create/transition
contract. `src/company-job-work-shadow.ts` retains the injected per-run
projector and adds one fixed-window batch coordinator.
`src/db.ts#listJobRunsForProjection` selects only structural columns and has a
separate read-only connection for the CLI. `src/company-job-work-shadow-cli.ts`
is the explicit write gate; repository presence, release deployment, or an
environment key alone cannot invoke it.

The Company OS exception report now accepts `all`, `sales_email`, or
`host_job_run` filters through one static bounded SELECT. Email rows keep their
eight-stage Gmail/approval receipt rules. Job rows require only accepted,
execution-started, and terminal facts appropriate to their state; a
receipt-backed `job_run:*` failure is distinguished from a receipt-less
`source_gap:*` failure. Null Party/pipeline identity is valid only for job work.

The projection CLI has no defaults for its write boundary:

```bash
npm run company-job-work:project -- \
  --since <inclusive-ISO-timestamp> \
  --through <closed-inclusive-ISO-timestamp> \
  --batch-limit <1-250> \
  --confirm-shadow-projection NC-017-HOST-JOB-SHADOW
```

Run it from the operational working directory with the absolute verified
release CLI so its read-only SQLite source and existing PostgreSQL connection
resolve correctly. Count the structural source window first; do not raise the
limit merely to hide truncation.

## 6. NC-017 activation gates

Activation requires all of the following under NC-017:

1. reconcile migration 119 with the then-live schema and concurrent migration
   owners;
2. take an exact backup and explicitly apply only migration 119;
3. use the default-off observer only with required lower/closed-upper
   timestamps, exact confirmation, and a batch limit;
4. prove historical running, success, failure, timeout/dispatch, source-gap,
   and duplicate-only cases without changing `jobs` or `job_run_logs`;
5. widen the read-only exception report with workflow-specific validation;
6. verify pre/post job catalog/run fingerprints, scheduler health, queues, and
   channel state;
7. retain SQLite and the job registry as authority.

All seven gates passed under exact release `999f2a4`. The production window
`2026-08-17T01:45:40.000Z` -> `2026-08-17T01:48:41.000Z` contained five
complete successful runs. It produced 5 items, 15 events, and 5 receipts;
exact replay produced 15 duplicate facts and no write. The job report shows all
five complete with zero exceptions. Pre/post source-window, job-definition,
task-definition, and Mailman/Sales ledger hashes are identical. The deployment
and backup receipts are recorded in `docs/ENGINEERING-CHANGELOG.md`.

Scheduling the observer, sending a brief, resolving an exception, retrying a
job, normalizing all trigger types, or making the ledger authoritative are
later, separately authorized milestones.

## 7. Known gaps

- `already_running` advances `jobs.next_run` but creates no `job_run_logs` row,
  so this pilot cannot project that skipped attempt. Fixing source durability
  belongs to scheduler ownership/trigger normalization, not this shadow.
- Registry definitions are mutable cached state; this pilot keys execution
  work by immutable run ID and does not claim a versioned job-definition
  catalog.
- Retry attempts have no durable parent link yet.
- The five-run proof covers successful terminal rows in production. Failure,
  timeout, dispatch-error, running, and source-gap behavior is contract-tested
  and disposable-database-tested but has not been manufactured on production.

## 8. Rollback

Before schema application, revert the local source/migration/documentation
change. There is no service, database, scheduler, message, or job recovery.

Migration 119 is now applied and five host-job rows exist. Restore the retained
prior immutable release if needed and leave recorded history dormant. The
tracked schema rollback must refuse while host-job history exists; never delete
work history to make rollback convenient.
