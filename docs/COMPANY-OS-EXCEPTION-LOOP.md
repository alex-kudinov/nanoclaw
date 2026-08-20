# Company OS operator exception loop

Status: exact release `8344524c` preserves the live migration-120 loop under
`NC-20260816-018` for the sole owner-confirmed operator and adds the live
program-facts source under `NC-20260820-002`. Its first bounded run and named
acknowledgment remain verified; the program-facts canary additionally opened
one exact owner-review case and posted Chief brief 10. Later natural
source-derived resolution remains separately evidence-gated in active work and
the engineering changelog. `NC-20260820-003` locally adds source-bound Chief
work packets and a narrow exact-message recovery path; that change is not yet
deployed or live-verified.

## Purpose and authority

This is the smallest operator-attention loop for the three proven Company Work
pilots. It reads the complete privacy-minimized report, records exact reason
cases, posts a deduplicated bounded brief to the registered Chief Slack
channel, and lets a configured operator acknowledge the exact posted brief.
The local `NC-20260820-003` candidate additionally emits one host-owned work
packet per visible exception. Those packets wake Chief as actionable work and,
for Sales-email items, attach the exact Mailman handoff instead of asking Chief
to discover the source through Gmail search.

`NC-20260820-002` deploys the third workflow in exact release `8344524c` with
migration 125 and active mode. Its exact-release canary created blocked item 21
directly; the already-recurring loop picked up the named reason from the
complete report, opened its case, and posted Chief brief 10 without parsing or
polling the detector's Sales-channel warning. A subsequent real Campanero
scheduler run appended observation 2 without duplicate Sales alerting. A clean
detector receipt removes the source reason; the loop may then source-resolve
the corresponding case under its existing rules. Slack acknowledgment still
performs no source correction or work transition.

It is not a workflow engine. Acknowledgment means only "this named operator saw
this exact brief." It cannot resolve, approve, reject, retry, dispatch, send,
pause, resume, cancel, or advance email or job work. SQLite remains authority
for approved-email actions and host jobs. A case resolves only when a later
complete, non-truncated source report no longer contains that exact reason.
Chief triage is not resolution and grants no new workflow or send authority.

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

`NC-20260820-003` adds no PostgreSQL table and does not copy customer prose into
these exception records. The Company Work item's opaque `source_key` joins a
`sales_email` item to its authoritative SQLite email action. SQLite stores the
exact inbound Gmail Message-ID on `pending_sends`; the host resolves and copies
only a bounded source excerpt into the transient Slack work packet.

## Reconciliation and delivery

The host loop runs only when all configuration is valid. Each tick:

1. obtains one bounded `workflow=all` Company Work report;
2. refuses all writes when the report is unavailable or truncated;
3. expands every exact reason into a stable case identity;
4. opens, re-observes, or reopens cases and source-resolves absent cases in one
   host transaction;
5. claims a Chicago-calendar-day fingerprint before attempting Slack;
6. posts at most one new brief for that exact case/version/occurrence set;
7. resolves and posts one source-bound Chief work packet beneath the brief for
   every visible exception, with durable `from_group=company-os` routing;
8. binds the brief timestamp only after every visible packet has a tracked
   Slack receipt; otherwise it marks delivery uncertain and refuses
   acknowledgment.

A claimed fingerprint is never automatically retried. When Slack returns a
timestamp but PostgreSQL cannot bind it, the host posts a best-effort warning
and refuses acknowledgment of that unbound message for the process lifetime.
After restart it still cannot match a `posted` brief in PostgreSQL, so it has no
exception acknowledgment authority.

Brief text is bounded to ten visible work items and contains only work ID,
workflow, stage/disposition, age, severity, and named reason codes. It explicitly
states that acknowledgment performs no workflow action.

For `sales_email` items, source resolution is identity-bound: PostgreSQL must
point to one SQLite action, that action must point to one Sales Slack root, and
the root must contain a trusted Mailman inbound handoff. The host reconstructs
only consecutive Mailman fragments, validates exact Thread-ID/Message-ID
headers, and fails closed on conflicts. Legacy actions may be backfilled once
from that trusted root. A complete attachment requires no Gmail call; a
truncated attachment permits one exact `gmail_read(messageId)`; a missing
binding produces a named code and never permits search or guessing. Attached
customer prose is explicitly labeled untrusted evidence, not host instruction.

The Chief restart fallback is equally narrow: `gmail_read` succeeds only when
SQLite maps that exact Message-ID to a Sales action and PostgreSQL maps that
same action to a `sales_email` Company Work item with a still-active exception
case. It does not authorize `gmail_search`, thread discovery, replies, sends,
or any unrelated message.

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
full expected release commit. The earlier dark `0d2c8ec` helper accepts only
the small allowlist of existing named-operator configuration keys; live release
`a2e6d35` additionally accepts one owner-readable, owner-only regular file
containing exactly one valid Slack UID. Both paths default to
dry-run, print no UID values, and require the exact hostname for apply:

```bash
node scripts/set-company-work-exception-loop.mjs \
  --env-file /absolute/path/to/.env \
  --expected-release <full-40-character-release-commit> \
  --mode on \
  --operator-source-key <approved-existing-operator-key> \
  --dry-run
```

For an explicitly confirmed dedicated Company Work operator when no approved
source key exists, replace `--operator-source-key ...` with
`--operator-uid-file <absolute-owner-only-file>`. The helper rejects symlinks,
group/other permissions, multiple IDs, malformed IDs, ambiguous source
selection, and wrong-owner files. Remove the temporary input after the applied
configuration has been verified; rollback uses the environment backup, not the
input file.

Apply creates an exclusive same-mode backup and atomically replaces the env
file. Restart is required because NanoClaw reads file configuration at startup.
The first enabled startup tick is the bounded Slack canary; do not manufacture
or alter a source exception merely to make a brief appear.

Production has no approved existing named-operator source key for this helper
to copy. Chief-channel membership was discovery evidence, not an authority
grant; the owner separately confirmed Alex Kudinov as the sole Company Work
operator at 2026-08-17T02:57Z. Activation used the dedicated owner-only-file
path, verified one redacted operator, and removed the exact temporary input
after apply. The durable environment backup is recorded in the engineering
changelog. No Procurement, Healer, approval, email, job, or workflow authority
was created or inherited.

## Recovery

To disarm, run the same release helper with `--mode off --apply` and restart,
or restore its exact backup with `--restore ... --confirm-host ...`, then
restart and verify health says `disabled`. Disarming stops future reads/posts
but preserves cases, briefs, acknowledgments, and events.

The migration rollback drops tables only while all three are empty. Once any
history exists, leave the additive tables dormant. Never delete evidence to
force rollback and never mutate source work to demonstrate resolution.
Rolling back `NC-20260820-003` restores the prior release behavior and leaves
the additive SQLite source-message column dormant; no customer or work state
must be deleted.

## Acceptance evidence

Before activation require exact Node typecheck/build/tests, the email-critical
and independent runner gates, documentation continuity, an immutable verified
release, production backup and explicit migration 120 apply, service drain,
default-off health, a non-empty named-operator count, and unchanged job/email
authority fingerprints. Live proof distinguishes:

- brief delivered and durably bound;
- named operator reaction acknowledged with threaded receipt;
- each visible exception packet delivered with tracked cross-group provenance
  and wakes Chief as actionable work;
- an email-backed packet carries its exact bounded source without search, with
  one exact restart-safe read available only when the attachment is truncated;
- no work transition, resolution, approval, email, job, or queue side effect
  occurs merely because Chief received or triaged the packet;
- later natural source resolution, which remains distinct from acknowledgment.
