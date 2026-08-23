# NC-20260823-004 first healer resolution and expansion evidence

Date: 2026-08-23
Program item: `work:self-healing-first-resolution-remediation`
State: complete; source and Company Work closure live-verified

## Resolution

- Exact source: incident `563834`, `healer:16963ebd92091e9f`.
- Root cause: the PostgreSQL missing-`work_type` error originated from a one-off
  Node `[eval1]` diagnostic query, not NanoClaw runtime code. Current tracked
  source contains no singular `work_type`; schema-owned fields are
  `workflow_type` or `work_types`; the incident occurred once and did not recur.
- The generic `npx knex migrate:latest || npx prisma migrate deploy` proposal
  was rejected as unrelated and unsafe. No command, migration, runtime code, or
  credential changed.
- A guarded transaction corrected the diagnosis/proposal, recorded
  `operator_verified_recovery` with `command_ran=false`, disarmed the stale
  proposal, and entered the existing six-minute quiet verifier.
- One correction receipt was posted to the original internal incident thread.

## Closure proof

- The normal fast-healer verifier changed the source to
  `resolved/verified_fixed`; the one-source adapter changed the existing Company
  Work item to `outcome_validated/completed` version 2.
- Durable state is three minimized observations, three lifecycle events
  (`accepted`, `blocked`, `outcome_validated`), and one bound
  `healer_verified_recovery` outcome receipt.
- The next natural fast cycle was exact replay: one duplicate, zero transitions,
  zero observations, and no error. Fast-healer error lines remain 24.

## Verification-query artifact

- Codex's first read-only receipt query referenced nonexistent event column
  `to_version`. It wrote no database state but emitted one operator-generated
  `[eval1]` error into the daemon JSONL.
- Before the collector ran, the captured pending byte range
  `30043084..30059871` was parsed and contained exactly one error seed,
  fingerprint `d93dec4d0d90a53c`, with no unrelated error.
- The source log was preserved. A compare-and-swap advanced only that exact
  cursor range and wrote unique receipt
  `suppression:NC-20260823-004:d93dec4d0d90a53c`. The artifact created zero
  incidents, Slack alerts, or Company Work items. Main/fast error-line counts
  remain 273/24.

## Expansion evidence and recommendation

- Current catalog: 146 items, 136 pending decisions, 10 verified fixed, zero
  monitoring. Of the pending set, 104 are older than seven days; 64 sources are
  generic `daemon`, and 27 legacy `wont_fix` rows lack a named no-action receipt.
- A metadata-only admission filter—seven days or newer, non-daemon, high/medium
  confidence root cause, and not legacy `wont_fix`—leaves five candidates.
- Recommended expansion is a sequential rotating allowlist, not a larger
  concurrent cap. Keep `MAX_ITEMS=1`; admit one exact source, inspect/reject or
  remediate it, require terminal receipt plus replay, then rotate.
- Recommended first order:
  1. `healer:d0ca940a103136d3`: 46 occurrences from a verified internal logging
     bug that reports expected post-output container timeout cleanup as an
     error. Fixing log severity reduces false incident volume without changing
     customer behavior.
  2. `healer:d3c78b967b64588f`: verify and close a one-occurrence Chief runner
     sync race already described as self-healing.
  3. `healer:458c0d2b7dc15d5b`: decide whether the CaleProcure collector should
     actually be enabled; do not turn on the feature flag merely because a
     proposal says so.
- Defer the expected Inbox timeout, Trafft outage/rerun, generic daemon backlog,
  and legacy anonymous `wont_fix` debt until classifier/suppression policy and a
  separate stale-backlog disposition are accepted.
