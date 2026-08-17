# Company OS operator exception loop

Status: exact release `0d2c8ec` and migration 120 are deployed dark under
`NC-20260816-018`; the loop is disabled with zero configured operators and
zero attention rows. Named-operator activation and natural acknowledgment
remain separately evidence-gated in active work and the engineering changelog.

## Purpose and authority

This is the smallest operator-attention loop for the two proven Company Work
pilots. It reads the complete privacy-minimized report, records exact reason
cases, posts a deduplicated bounded brief to the registered Chief Slack
channel, and lets a configured operator acknowledge the exact posted brief.

It is not a workflow engine. Acknowledgment means only "this named operator saw
this exact brief." It cannot resolve, approve, reject, retry, dispatch, send,
pause, resume, cancel, or advance email or job work. SQLite remains authority
for approved-email actions and host jobs. A case resolves only when a later
complete, non-truncated source report no longer contains that exact reason.

## Host-owned records

Migration 120 adds three admin-only tables, separate from work state:

- `company_work_exception_cases`: current lifecycle for one stable
  work-item/workflow/reason identity and its occurrence number;
- `company_work_exception_briefs`: daily/change-fingerprint deduplication,
  exact Slack channel/message binding, and acknowledgment-receipt status;
- `company_work_exception_events`: append-only opened, reopened, briefed,
  acknowledged, and source-resolved facts.

The tables contain opaque internal IDs, named reason codes, severity,
timestamps, Slack UID/message identity, and SHA-256 evidence only. They have no
customer name/address, email subject/body, approval text, job output/error,
prompt, arbitrary payload, or action authority. No agent role receives access.

## Reconciliation and delivery

The host loop runs only when all configuration is valid. Each tick:

1. obtains one bounded `workflow=all` Company Work report;
2. refuses all writes when the report is unavailable or truncated;
3. expands every exact reason into a stable case identity;
4. opens, re-observes, or reopens cases and source-resolves absent cases in one
   host transaction;
5. claims a Chicago-calendar-day fingerprint before attempting Slack;
6. posts at most one new brief for that exact case/version/occurrence set;
7. binds the returned Slack timestamp or marks ambiguous delivery uncertain.

A claimed fingerprint is never automatically retried. When Slack returns a
timestamp but PostgreSQL cannot bind it, the host posts a best-effort warning
and refuses acknowledgment of that unbound message for the process lifetime.
After restart it still cannot match a `posted` brief in PostgreSQL, so it has no
exception acknowledgment authority.

Brief text is bounded to ten visible work items and contains only work ID,
workflow, stage/disposition, age, severity, and named reason codes. It explicitly
states that acknowledgment performs no workflow action.

## Exact operator acknowledgment

Only a check reaction carrying an exact Slack user ID from the configured
allowlist can acknowledge a `posted` row bound to the same channel and message
timestamp. Typed `Approved`/check text is claimed but refused with a visible
instruction; an unnamed user is refused with a visible receipt. Other bot
messages remain available to the existing approval handlers.

The acknowledgment transaction affects only the current occurrence of cases
briefed by that exact message. An old brief cannot acknowledge a reopened
occurrence. The host then posts a threaded receipt stating the number observed
and that nothing was resolved or acted upon. Missing receipt delivery is stored
as uncertain; it does not undo or broaden the attention fact.

## Configuration and activation

The tracked defaults are off:

```text
COMPANY_WORK_EXCEPTION_BRIEF_ENABLED=0
COMPANY_WORK_EXCEPTION_OPERATOR_UIDS=
COMPANY_WORK_EXCEPTION_BRIEF_INTERVAL_MS=86400000
COMPANY_WORK_EXCEPTION_REPORT_LIMIT=100
COMPANY_WORK_EXCEPTION_STALE_AFTER_HOURS=24
```

Enabled mode fails closed unless the operator list contains one or more exact
Slack `U...`/`W...` IDs and all numeric bounds are valid. Effective health
reports mode, counts, limits, running state, last result, and error code, never
the operator IDs.

Use only the helper bundled in the exact immutable release. It verifies the
full expected release commit, accepts only a small allowlist of existing
named-operator configuration keys, defaults to dry-run, prints no UID values,
and requires the exact hostname for apply:

```bash
node scripts/set-company-work-exception-loop.mjs \
  --env-file /absolute/path/to/.env \
  --expected-release <full-40-character-release-commit> \
  --mode on \
  --operator-source-key <approved-existing-operator-key> \
  --dry-run
```

Apply creates an exclusive same-mode backup and atomically replaces the env
file. Restart is required because NanoClaw reads file configuration at startup.
The first enabled startup tick is the bounded Slack canary; do not manufacture
or alter a source exception merely to make a brief appear.

Production currently has no approved existing named-operator source key for
this helper to copy. Chief-channel membership is discovery evidence, not an
authority grant. Do not infer or create a Company Work operator allowlist until
the owner explicitly confirms the named person and the dedicated configuration
path is reviewed.

## Recovery

To disarm, run the same release helper with `--mode off --apply` and restart,
or restore its exact backup with `--restore ... --confirm-host ...`, then
restart and verify health says `disabled`. Disarming stops future reads/posts
but preserves cases, briefs, acknowledgments, and events.

The migration rollback drops tables only while all three are empty. Once any
history exists, leave the additive tables dormant. Never delete evidence to
force rollback and never mutate source work to demonstrate resolution.

## Acceptance evidence

Before activation require exact Node typecheck/build/tests, the email-critical
and independent runner gates, documentation continuity, an immutable verified
release, production backup and explicit migration 120 apply, service drain,
default-off health, a non-empty named-operator count, and unchanged job/email
authority fingerprints. Live proof distinguishes:

- brief delivered and durably bound;
- named operator reaction acknowledged with threaded receipt;
- no container wake, workflow event/receipt, email, job, or queue side effect;
- later natural source resolution, which remains distinct from acknowledgment.
