# NanoClaw project map

Status: repository investigation snapshot, 2026-07-21  
Repository: `NanoClaw`  
Local version: `1.2.1`  
Local commit: `1d14730` on `main`  
Purpose: make the same project intelligible and safely operable from Claude
Code and Codex without replacing Claude-owned sources.

## 1. How to use this map

This document separates four things that are easy to conflate:

1. **Intent** — requirements, prompts, and design documents.
2. **Implemented mechanics** — current TypeScript, SQL, and tests.
3. **Repository snapshot** — tracked, ignored, and uncommitted local files.
4. **Live state** — running daemons, containers, databases, credentials, and
   third-party systems.

The investigation verified the first three locally. It did not query or mutate
the production Mac Mini, Mac Studio, VPS, Gmail, Slack, PostgreSQL, Plutio,
Stripe, Trafft, Sertifier, Firebase, n8n, or any other remote system. Local
runtime databases are useful evidence but are not proof of current production
state.

Read this map before a change, then read the narrower source named in the
relevant section. Do not use this document as a substitute for current code or
schema inspection.

## 2. Project identity

NanoClaw is a private, self-hosted assistant and business-operations platform.
It grew from a deliberately small personal Claude assistant into a collection
of isolated, role-specific agents (“groups” or “minions”) that communicate
through Slack and Gmail, process webhooks and scheduled work, and integrate
with Tandem Coaching business systems.

The architectural center remains intentionally small:

- one long-running Node.js host process;
- a channel abstraction for inbound and outbound messages;
- one isolated Apple Container per active agent conversation/work unit;
- Claude Code CLI turns executed inside those containers;
- file-based IPC and a narrow MCP surface for host-owned capabilities;
- SQLite for host routing and scheduler state;
- PostgreSQL for shared business truth;
- explicit host-side guardrails around risky outbound actions;
- Markdown knowledge and role instructions as agent context.

The repository is both application source and operations workspace. It contains
application code, prompts, knowledge, setup assets, deployment definitions,
business schemas, scripts, local state, and an extensive chronological handoff
archive. Those have different portability and authority properties.

### Original design principles

`docs/REQUIREMENTS.md` establishes the enduring principles:

- small enough to understand;
- OS/container isolation rather than prompt-only safety;
- customization through code and inspectable skills;
- AI-native orchestration rather than a large conventional framework;
- minimal dependencies and a single process where practical;
- user ownership of data and deployment.

### What the project is not

- It is not a generic multi-tenant SaaS product.
- It is not currently runtime-neutral: current code is Apple Container-specific.
- It is not driven solely by tracked Git files; some required operational
  context is intentionally local.
- It is not safe to reproduce by copying the full repository directory because
  it contains machine-specific and sensitive state.
- It is not correct to infer production health from local tests or a successful
  TypeScript build.

## 3. Authority and conflict rules

Use this order, while respecting the distinction between mechanics and policy:

| Question                        | Primary authority                      | Supporting evidence                |
| ------------------------------- | -------------------------------------- | ---------------------------------- |
| What code does now              | current source and current schema      | focused tests, logs                |
| How a group should behave       | `groups/<name>/CLAUDE.md`              | its support/knowledge files        |
| Repository-wide operating rules | root `CLAUDE.md`                       | this map                           |
| Business data shape             | inspected PostgreSQL schema            | tracked SQL and `SCHEMA.md` copies |
| Host state shape                | inspected SQLite schema in `src/db.ts` | local `store/messages.db`          |
| Target architecture             | the specifically named design document | implementation and history         |
| Why a decision was made         | Git history and dated handoffs         | archived plans                     |
| Live operational truth          | read-only check of the live system     | local snapshots and docs           |

Important conflict rules:

- A group prompt can define approval policy, but it cannot make an unsafe host
  capability safe. Host-side checks remain mandatory.
- A design document can describe a target that was never implemented. Verify
  imports, call sites, schemas, and tests.
- A local database can be newer than Git or stale relative to production. Date
  and label it.
- A handoff describes its date, not necessarily the present. Reconcile it with
  later commits and current files.
- Backups such as `*.bak`, sync conflicts, and `dist.wip-bak-*` are historical
  evidence only.

## 4. System context

```text
Slack Socket Mode ─┐
Gmail poll/push ───┼─> channel adapters ─> SQLite message ledger ─> router
Webhook HTTP ──────┤                                             │
Schedules/jobs ────┘                                             v
                                                      per-group queue
                                                             │
                                             Apple Container + Claude CLI
                                                             │
                                            file IPC / in-container MCP
                                                             │
                ┌────────────────────────────────────────────┼──────────────┐
                v                                            v              v
         Slack/Gmail host actions                    PostgreSQL data   host scripts/APIs
                │                                            │              │
                └──────── guards, approvals, logs, idempotency ─────────────┘
```

### Primary trust boundaries

1. **External input → host.** Slack, Gmail, and webhook content is untrusted.
2. **Host → agent container.** The container receives only selected mounts,
   credentials, message context, and MCP tools.
3. **Agent → host action.** IPC requests are parsed and enforced by the host;
   outbound email and other consequential actions receive extra validation.
4. **Host → third party.** OAuth/API credentials and irreversible business
   actions remain host or integration concerns.
5. **Machine → machine.** Mac Mini, Mac Studio, VPS, and external repositories
   have different state and ownership; file sync is not deployment.

## 5. Runtime lifecycle

### Host startup

`src/index.ts` is the composition root. In broad order it:

1. initializes SQLite and loads registered groups, tasks, jobs, and cursors;
2. starts the webhook/health HTTP server;
3. loads self-registering channel modules;
4. connects configured channels;
5. establishes message polling and routing;
6. starts scheduled-task and host-job loops;
7. starts IPC processing and outbound handlers;
8. starts reliability processes such as reapers, heartbeat, proposal follow-up,
   drift detection, and healer orchestration;
9. recovers or adopts eligible in-flight container work;
10. performs graceful shutdown and container ownership handling on signals.

Exact wiring changes frequently; inspect `src/index.ts` before changing startup
order or shutdown behavior.

### Inbound conversational message

1. A channel adapter normalizes an event to `NewMessage`.
2. The host records chat and message state in SQLite.
3. Routing resolves the registered folder, trigger policy, main-group status,
   and Slack thread/work-unit identity.
4. `GroupQueue` serializes work for that conversation while enforcing global
   container concurrency.
5. `container-runner.ts` creates or resumes an isolated container turn.
6. The agent runner invokes `claude --print`, optionally resuming a Claude
   session and rotating credentials on recognized limit/auth failures.
7. Structured output and IPC requests return through files under `data/ipc`.
8. Host handlers validate and perform allowed effects, record outcomes, and
   send the final channel response.
9. The container may remain warm until the group/global idle timeout. A warm
   least-recently-used container can be evicted when another work item needs a
   slot.

### Gmail classification and routing

Gmail is both a channel and a business pipeline:

1. push notification or safety polling detects mailbox changes;
2. hard filters and label logic determine eligible mail;
3. Mailman classifies and emits a structured label-write action;
4. specialized groups can receive routed work;
5. business interactions and classification state are written separately;
6. outbound email crosses host recipient and content guards;
7. approval-gated workflows remain pending until an authorized action.

Sales commercial terms have a narrow provenance exception to the global
invented-discount block: the host derives canonical numeric terms from non-bot
human messages stored in the exact Slack work thread, applies later revocation,
and re-resolves that evidence at approval-card preflight, Action-ID creation,
and final Gmail dispatch. The agent cannot assert its own authority and another
thread cannot lend authority. Approved replies also tolerate a CRM-lagging
sender alias only from the exact Gmail participant + approved recipient +
thread-to-Party binding; the allowance is reply-scoped and does not mutate CRM.

Do not collapse the classification schema into CRM lead state. The project
explicitly treats older `public.leads` assumptions as deprecated.

The pre-LLM rules path is deliberately narrower than a sender allowlist:
actionable classifications never create sender-wide auto-rules, probationary
rules remain inactive until their timestamp matures, and `Re:`/`Fwd:`/`Fw:`
subjects bypass sender-only rules for content-aware Mailman classification.
If an actionable rule does route directly, the host first stores a durable
Mailman-owned no-wake copy containing the body, Thread-ID, and Message-ID.
For an explicit forward whose Tandem-owned From domain has a Gmail-added,
aligned DMARC or DKIM pass, the host resolves the external From/Reply-To in the
first forwarded header block as the lead and retains the teammate as
`Forwarded-By`. The internal Gmail conversation is audit-only, is not granted
to Mailman for reply, and Sales treats the work as a new outbound email after
approval.
Chief fallback handoffs carry the full parsed body and exact Gmail identifiers;
if the body is missing or truncated, Chief may use only the assigned Message-ID
with `gmail_read`, never a broad search.

### Webhook work

Definitions live in local data and produce isolated or group-context prompts.
The reliability layer archives incoming payloads, tracks processing state,
deduplicates/idempotently handles retries, and reaps stalled work. Per-hook
secrets override the global fallback. Callback URLs and suppressed chat output
are supported by the current types.

### Scheduled work

There are two schedulers:

- **Scheduled tasks** invoke an agent group with a stored prompt and
  cron/interval/once schedule.
- **Host jobs** invoke registered scripts with retries, timeouts, lock files,
  reporting policy, and run logs.

They have different tables, execution paths, failure modes, and trust levels.
Do not treat the terms “task” and “job” as interchangeable in code.

`NC-20260816-016` adds a local-only second Company OS pilot contract for host
job runs. One SQLite `job_run_logs.id` maps to one `host_job_run` work item;
PID and terminal row facts map to start/outcome events without accepting raw
output, error text, log paths, scripts, arguments, or environment. Migration
119 and the injected projector are not applied or daemon-wired. SQLite and the
job registry remain authority, and Campanero's jobs-only role is unchanged.
See `docs/COMPANY-OS-JOB-LEDGER.md`.

`NC-20260816-017` applies migration 119 and deploys the read-only-SQLite,
exact-confirmation, fixed-window projection CLI plus the multi-workflow
SELECT-only report in exact release `999f2a4`. One five-run production window
and duplicate-only replay passed with unchanged source/email parity. Neither
component is daemon- or scheduler-wired; Campanero and the job registry remain
unchanged, and another projection requires separate authorization.

Exact release `a2e6d35` deploys and activates `NC-20260816-018` with migration
120 and a separately configured host operator-attention loop over that combined
report. The live tables store reason cases, exact Slack brief delivery,
named-UID acknowledgment, and append-only lifecycle facts outside the work state machine.
Acknowledgment cannot resolve, retry, approve, send, or change a job/workflow;
resolution requires a later complete report where the exact reason is absent.
The only shared Slack change is backward-compatible delivery of exact
user/source provenance to host approval listeners. The production loop is
active for one owner-confirmed operator and has posted one naturally sourced,
durably bound Chief brief; the exact check reaction acknowledged all three
current occurrences and the threaded receipt is posted.
See `docs/COMPANY-OS-EXCEPTION-LOOP.md`; production state must be taken from the
NC-018 active-work/changelog evidence, not repository presence.

`NC-20260817-001` added the local R3 foundation: an initially unwired
content-free trigger-occurrence contract for `time`, `gmail`, `webhook`,
`topic`, and `business_condition` sources plus migration 121. Stable
definition/occurrence/fingerprint identities make exact replay converge and
semantic drift fail closed. The table is append-only/admin-only and stores no
raw source content. The common store itself cannot
create/resume work, select a skill, or grant approval/capability/action
authority. See `docs/COMPANY-OS-TRIGGER-CONTRACT.md`.

`NC-20260820-002` deploys the first `business_condition` composition over that
contract in exact release `8344524c`. The versioned program-facts detector
derives canonical
content-free source/finding/payload evidence. In active mode, one host
transaction records the exact scheduled job occurrence, ensures one stable
`program_facts_drift` work item, appends a minimized observation, and places
drift in `accepted/blocked` with
`fact_authority:owner_review_required`. Unchanged repeats do not repeat the
Sales alert; changed evidence alerts again; an exact clean rerun supplies the
only completion receipt; recurrence reopens the same item. Migration 125 is
live, `PROGRAM_FACTS_COMPANY_WORK_MODE=active`, and the installed 08:00 CT job
uses the compiled entrypoint. A direct exact-release canary created item 21,
one Sales alert, and the owner-review exception/Chief brief; a subsequent real
Campanero scheduler run added a second observation without duplicate alerting.
No detector or healer component receives authority to edit facts, knowledge,
products, website content, email, or another source system. Owner correction
and an exact clean scheduled rerun remain the source-resolution gate.

`NC-20260817-002` deployed the first bounded source adapter in exact release
`baed66d` and applied migration 121. After the
existing SQLite scheduler successfully claims a task's exact pre-claim
`next_run`, a default-off fire-and-forget observer can record only a normalized
time occurrence for one configured task ID and one exact boundary. It hashes
the ID/schedule facts, receives no prompt/chat/result content, and cannot block
or retry the task. One natural `2026-08-17T14:00:00.000Z` claim inserted
exactly one occurrence; exact replay was duplicate-only, and the one-boundary
configuration was expired back to disabled with zero daemon failures. The
table remains live with that one append-only row. No task create/resume or
action authority was introduced.

`NC-20260817-003` adds the next R3 prerequisite: migration 122 and
an unwired host store for immutable source definitions, compare-and-swap
watermark state, and append-only checkpoint/gap/reconciliation history.
Complete ranges require exact accepted/rejected accounting and monotonic
unsigned/timestamp cursors. A gap leaves the prior cursor fixed and blocks
ordinary advancement until a reconciliation event binds the exact gap. The
source registry has no enable switch or task/action fields. `NC-20260817-004`
applies the schema and deploys exact release `070cde38` dark; the three new
tables are live, empty, and admin-only. No source is registered or seeded, and
no daemon/adapter imports the module.
That dark checkpoint did not change Gmail behavior; the later
`NC-20260818-003` runtime bridge is the first candidate that removes the push
path's silent reset. Label-poll expiry remains an independent known loss
window.

`NC-20260817-005` adds a local-only inbound-Gmail recovery proposal layer. An
expired history cursor can map to a content-free `gap_detected` event, while
`gap_reconciled` is constructed only after an unfiltered, Spam/Trash-inclusive
full-mailbox listing reaches a terminal page within 20 pages, every unique
message ID has durable accepted/rejected evidence, the before/after Gmail
profile history head is identical, and the gap-age/freshness budgets hold. The
module is pure/injected and no runtime entry point imports it. It does not call
Gmail, register or bootstrap a production source, write a watermark, recover a
message, or alter the existing SQLite reset. Current per-message rejection
evidence and large-mailbox resumability are not yet sufficient for activation;
the separate label-correction cursor remains unaddressed. See
`docs/COMPANY-OS-GMAIL-RECONCILIATION.md`.

`NC-20260817-006` adds the next local, unwired prerequisite without changing
that production boundary. An exact Google wrapper exposes only profile history
head and unfiltered 500-ID message pages including Spam and Trash. A resumable
shadow can persist more than 10,000 content-free candidate receipts across
20-page invocations, but terminal success still passes through NC-005's common
stable-head/freshness/exact-accounting proposal function. Unapplied migration
123 defines admin-only snapshot state plus append-only page/candidate receipts;
the active raw continuation token is cleared at completion/invalidation and is
never exposed in sanitized progress. Disposable PostgreSQL proves 10,001
candidates over 21 pages, exact replay, append-only receipts, guarded rollback,
and zero non-admin grants. No live Google call, production schema/source/cursor,
404 interception, message recovery, runtime import, task, or action exists.

`NC-20260817-007` deploys those exact NC-006 bytes in immutable release
`de815e1d` while deliberately leaving migration 123 unapplied. Production
pre/post proof retains connected Gmail/Slack, empty execution/outgoing queues,
66 confirmed plus six blocked and zero active email actions, tasks/jobs/groups
at 11/22/20, byte-identical inbound and label-poll Gmail cursors, and trigger
occurrence/source/event/state counts at 1/0/0/0. The three shadow tables remain
absent and no runtime entry point imports or calls the wrapper/store. This is a
dark release deployment, not a live Gmail or recovery observation.

`NC-20260817-008` adds a SQLite disposition producer/reader for the
current Gmail channel. Every returned history candidate must have one durable
terminal accepted/rejected receipt before the cursor advances; a non-terminal
page 20 fails before candidate processing. Exact ordinary inbound message rows
can bridge receipt-write splits; direct-route staging rows also require the
exact PostgreSQL routed marker. Outbound rows and the in-memory cache cannot
bridge. The current 404 reset remains unchanged.

`NC-20260817-009` preflights and deploys that producer in exact release
`263ac7c4`. Aggregate-only evidence finds 57 legacy direct-route staging rows:
21 have one exact routed marker and 36 correctly remain unresolved. Cursorless
label and thread scans now hold only the unresolved candidate and continue
unrelated mail; push history still retains the whole batch cursor. A WAL-safe
mode-0600 SQLite backup precedes activation. The additive receipt table and its
two append-only triggers are structurally verified live; one listener and both
channels remain healthy with stable critical queues and no Gmail-row change.
The first successful safety poll returned zero candidates. Subsequent natural
traffic produces 18 unique immutable receipts: three ordinary inbound persists,
ten completed rule auto-archives, and five own-outbound rejections. Sixty-seven
current-process push/safety cycles have zero receipt, processing, or cursor-hold
failures, closing NC-009's natural producer gate.

`NC-20260817-010` adds a default-off historical coverage auditor over
retained host evidence only. SQLite opens read-only and selects no content or
address fields; PostgreSQL route evidence runs in an always-rolled-back
read-only transaction. The report distinguishes existing receipts, exact
ordinary rows, exact single-marker direct routes, unresolved staged/outbound/
unsupported rows, and contradictions. It double-reads both sources, refuses
drift or truncation, emits aggregate counts plus fingerprints only, and
explicitly states that it did not query Gmail and is not mailbox-complete. Its
aggregate-only production dry run accounts for 3,041 retained IDs: 23 terminal
receipts, 1,675 recoverable, and 1,343 unknown. The exact pre/post
protected-state fingerprint is identical, and the live service/release did not
change. Migration 123, source/bootstrap, live shadow, 404 behavior, and cursor
authority remain unchanged.

`NC-20260817-013` applies only migration 123 from the exact verified live
release after a natural zero-work drain and a mode-0600 custom-format backup.
The three shadow tables are live, empty, owned by `nanoclaw_admin`, and expose
zero non-admin grants; the page and candidate tables retain append-only
triggers. Protected PostgreSQL state is unchanged. The daemon/release was not
restarted or changed, and no source row/bootstrap, Gmail API call, shadow row,
404/cursor behavior, recovered message, task, or action authority exists.

`NC-20260818-001` installs exact verified candidate `1b70de94` read-only beside
the still-active `dc3e5f0d` service, then uses only its separately invoked host
CLI. After a zero-work gate and complete unfiltered `business_v2` backup, one
transaction registers `mailbox:primary:inbound-v1` and one zero-count bootstrap
event from the unchanged query-only SQLite cursor. Exact replay is duplicate-
only. Source/event/state counts are 1/1/1 at version 1/current; the three Gmail
shadow tables remain empty/admin-only, protected Company Work/occurrence
fingerprints and live PID/release/channels are unchanged, and no Gmail call,
daemon activation, 404/cursor wiring, recovered message, task, or action exists.

`NC-20260818-002` adds and applies a separate migration-124 mailbox audit rather
than weakening the gap-bound migration-123 ledger. Its exact wrapper exposes
only profile and unfiltered, Spam/Trash-inclusive ID listing; query-only SQLite
receipt lookup classifies missing evidence as unknown. The admin-only store
binds the current source/version/cursor digest, persists resumable page and
three-way candidate evidence, and cannot write a watermark or recovery
proposal. After an exact candidate install, zero-work gate, and complete
affected-schema backup, one live attempt reaches a stable terminal page over
171 pages / 85,076 IDs: 67 accepted, 39 rejected, and 84,970 unknown. No token
remains; exact protected source/cursor/work/email/service evidence is unchanged.
There is still no daemon import, 404/gap wiring, recovery, work, or action
authority.

`NC-20260818-003` adds a default-freeze runtime candidate and a one-shot
receipt-backed alignment gate. The live preflight found SQLite already ahead
of the version-1 Company OS cursor, so activation cannot invent a bootstrap or
advance. The alignment CLI walks chronological `messageAdded` history only
between that PostgreSQL cursor and the fixed SQLite target, accepts only
immutable terminal disposition receipts, reads no message content, and
records one generic `advance` only while the query-only SQLite cursor remains
exact before, inside, and after the PostgreSQL transaction. In active mode the
daemon then preflights both authorities before every delta, records a
content-free generic advance before moving SQLite, catches SQLite up only
across the exact last durable advance after a crash, records one natural
`history_expired` gap on 404, and makes no further history call while that gap
is open. Missing source/receipt evidence, cursor drift, PostgreSQL failure,
page overflow, and malformed state all retain SQLite. This candidate does not
perform the full snapshot, record `gap_reconciled`, recover/deliver a message,
create work, or grant action authority. Deployment and natural-404 proof must
be established separately from local code presence.

The first production safety poll of exact release `b7aab9b7` exposed one
additional current-ingestion terminal: `history.list(messageAdded)` can return
an ID that `users.messages.get(format=full)` later reports as exact HTTP 404
because the message is no longer available. The deployed bridge correctly
held both equal cursors, but the original receipt vocabulary could not close
that candidate. The NC-003 repair adds only
`rejected/message_unavailable`, derived from the exact message-get 404 with a
content-free evidence hash. Other fetch failures still hold the cursor. Because
SQLite cannot alter a `CHECK` constraint in place, startup transactionally
rebuilds only `gmail_inbound_disposition_receipts`, copies every existing row,
and recreates both append-only refusal triggers. Production promotion required
and passed a fresh WAL-safe backup plus copied-live and live
row/fingerprint/trigger proof. Exact release `64f1421e` then retried the range
through a natural push, recorded exactly two `message_unavailable` receipts,
and mirrored three natural advances to version 5/current with both cursors
equal and no open gap. Protected work and email-action fingerprints stayed
fixed. Rollback code that does not understand the new reason remains
fail-closed.

Scheduled agent tasks can span multiple model turns when a host tool, notably a
Gmail read, returns a queued acknowledgement and delivers the real result
asynchronously. The host may pipe that result into a scheduled-task container
only when both the directory-owned group and the exact requesting container
name match an active run; ordinary Slack/chat piping remains forbidden for task
containers. The scheduler resets a bounded 60-second continuation window after
each result turn. The runner drains exact pending input before honoring a close
sentinel, because a host rejection or Gmail result may arrive while a long model
turn is still running. The daily Sales follow-up task has an additional
completion contract: an empty queue must leave the exact empty-queue receipt;
otherwise the latest visible counted receipt names the 1-5 selected pipeline
IDs and the host verifies a visible follow-up/cold artifact for every ID in the
final work-thread state. Queued/waiting prose, a rejected or partial batch, or
inconsistent counts records an error and posts a visible scheduled-task failure
alert.

## 6. Container execution model

### Current implementation

Despite older SDK terminology, the active runner launches the Claude Code CLI:

```text
claude --print --output-format json --verbose \
  --dangerously-skip-permissions --model <model> \
  --mcp-config <generated-config> --allowedTools <generated-list>
```

The `--dangerously-skip-permissions` flag is acceptable only inside the
constrained container and with the host action boundary intact. It must never
be copied into a broad host-side execution path.

The runtime binary is currently hard-coded as `container` in
`src/container-runtime.ts`. In this fork, Apple Container is a real prerequisite;
Docker-oriented upstream/setup material is not proof of Docker compatibility.

### Isolation and limits

- default image: `nanoclaw-agent:latest`;
- default container timeout: 30 minutes;
- default idle timeout in code: 20 minutes;
- default global concurrency: 5 unless configured;
- default per-container resources: 768 MB and 2 CPUs in runner logic;
- per-group timeouts, idle timeout, model, CPU, memory, mounts, and token probe
  policy can override defaults;
- additional mounts pass through an external allowlist at
  `~/.config/nanoclaw/mount-allowlist.json`;
- non-main mount access can be forced read-only;
- `.env` is deliberately shadowed/kept out of the container workspace;
- output size, first-output timeout, liveness, and memory sampling are enforced.

### Detached and warm lifecycle

The host uses sidecar and output files to detach container lifetime from a
single daemon process. Eligible running containers can be adopted after daemon
restart. Status output distinguishes active work, warm idle work, and adopted
work. Shutdown, recovery, and LRU eviction code must be reviewed together.

### Credential lifecycle

The runner supports Claude OAuth and API-key pools, cooldowns, and group-level
eager/lazy probing. Secrets are loaded at the narrowest possible boundary and
passed on stdin where possible. Root `CLAUDE.md` documents the current auth
copy/refresh operations. Never commit the resulting credentials or container
session files.

## 7. Source code map

### Host foundation

| Area           | Main files                                                                                         | Responsibility                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Composition    | `src/index.ts`                                                                                     | starts, wires, recovers, and shuts down the system                                     |
| Configuration  | `src/config.ts`, `src/env.ts`                                                                      | non-secret defaults and narrow `.env` reads                                            |
| Types          | `src/types.ts`                                                                                     | channels, groups, mounts, webhooks, tasks, jobs                                        |
| Logging        | `src/logger.ts`, `src/log-tail.ts`                                                                 | structured logs and bounded tail access                                                |
| Local state    | `src/db.ts`                                                                                        | SQLite schema, messages, groups, sessions, tasks/jobs                                  |
| Business state | `src/business-db.ts`                                                                               | PostgreSQL access and business queries                                                 |
| Routing        | `src/router.ts`, `src/host-router.ts`, `src/routing.test.ts`                                       | group and host-directed routing                                                        |
| Queue          | `src/group-queue.ts`                                                                               | per-work-unit serialization, concurrency, warm workers                                 |
| Containers     | `src/container-runner.ts`, `src/container-runtime.ts`                                              | mounts, lifecycle, adoption, resource limits                                           |
| IPC            | `src/ipc.ts`, `src/ipc-writer.ts`, `src/watchdog-ipc.ts`                                           | agent/host protocol and action dispatch                                                |
| Capabilities   | `src/capability-manifest.ts`, `capabilities/*.json`                                                | default-off per-agent launch, MCP, IPC, mount, and runtime projection                  |
| Action safety  | `src/action-safety.ts`, `docs/ACTION-SAFETY-CONTROL.md`                                            | content-free action envelope, global/per-system external-write brake, aggregate health |
| Scheduling     | `src/task-scheduler.ts`, `src/job-registry.ts`, `src/job-runner.ts`, `src/company-time-trigger.ts` | agent tasks and host jobs; default-off post-claim trigger observation candidate        |

### Channels and messaging

| Area            | Main files                                                                                                                                                  | Responsibility                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Registry        | `src/channels/registry.ts`, `src/channels/index.ts`                                                                                                         | channel self-registration and active imports                                                                             |
| Slack           | `src/channels/slack.ts`, `src/slack-image-stage.ts`, `src/slack-approval.ts`, `src/lead-thread-key.ts`, `src/message-split.ts`, `src/attachment-convert.ts` | Socket Mode, canonical lead threads, reactions/approvals, safe splitting, text extraction, and host-staged raster vision |
| Gmail           | `src/channels/gmail.ts`, `src/gmail-api.ts`, `src/gmail-auth.ts`                                                                                            | mailbox channel, OAuth, API operations                                                                                   |
| Gmail ingest    | `src/gmail-push.ts`, `src/gmail-label-poll.ts`, `src/gmail-parser.ts`, `src/gmail-inbound-disposition.ts`                                                   | push/poll detection, normalization, and local durable terminal accounting target                                         |
| Gmail IPC       | `src/gmail-ipc-handlers.ts`, `src/classify-ipc-handlers.ts`                                                                                                 | host-side action execution                                                                                               |
| Outbound safety | `src/email-recipient-guard.ts`, `src/email-content-guard.ts`, `src/ai-tells.ts`                                                                             | destination, content, and AI-tell enforcement                                                                            |
| Tracking        | `src/email-tracking.ts`, `src/email-unsubscribe.ts`                                                                                                         | delivery metadata and unsubscribe handling                                                                               |
| Rendering       | `src/markdown-to-email-html.ts`, `src/formatting.test.ts`                                                                                                   | safe channel/email presentation                                                                                          |

Only Gmail and Slack are imported in `src/channels/index.ts`. Discord, Telegram,
WhatsApp, voice, and related modules exist as upstream Claude skills or dormant
dependencies, not active runtime channels in this snapshot.

### Business automation

| Area             | Main files                                                                                                                                                               | Responsibility                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lead/identity    | `src/lead-matcher.ts`, `src/identity-join.ts`                                                                                                                            | business identity resolution                                                                                                                                                                                                               |
| Pipeline         | `src/pipeline-status.ts`, `src/email-interaction-log.ts`                                                                                                                 | interaction and reply-state evidence                                                                                                                                                                                                       |
| Plutio           | `src/plutio-cli.ts`, `src/plutio-proposals.ts`, `src/plutio-outbox-reaper.ts`, `src/booking-plutio-host.ts`                                                              | proposal/outbox integration and the dark Booking lifecycle host adapter                                                                                                                                                                    |
| Proposal replies | `src/proposal-reply*.ts`                                                                                                                                                 | accept/decline detection and actions                                                                                                                                                                                                       |
| Follow-up        | `src/proposal-followup*.ts`, `src/followup-drop*.ts`, `src/followup-policy.ts`, `src/followup-case-store.ts`, migrations 113, 130, and 131                            | legacy approval-gated proposal/Sales mechanisms plus NC-20260821-002's live-dark, unwired exact-case foundation; the broken task is paused, migrations 130-131 are live/empty/admin-only, and policy v2 makes exact Sales rejection terminal without adding a source, presentation, pipeline mutation, draft, or send path |
| Trafft           | `src/trafft-custom-fields.ts`, `src/trafft-sweeper.ts`, `src/booking-host-write.ts`                                                                                      | booking ingestion and recovery                                                                                                                                                                                                             |
| Stripe           | `src/stripe-payment-host.ts`, `src/contador-name-reaper.ts`, `tools/contador/process-payment.cjs`                                                                        | dual-account payment/refund ingestion, canonical transaction identity, and name recovery                                                                                                                                                   |
| Hive/Firebase    | `src/hive-bridge.ts`, `src/hive-sync-reaper.ts`                                                                                                                          | engagement synchronization; `NC-20260816-008` guards mutation entry and holds denied retries without consuming attempts                                                                                                                    |
| Chaos            | `src/chaos-activity.ts`, `src/chaos-booking.ts`, `src/chaos-reconciler.ts`, `src/chaos-lifecycle-outbox.ts`, `src/chaos-lifecycle-reconcile.ts`                          | activity/booking reconciliation plus durable aggregate-verified commerce lifecycle delivery                                                                                                                                                |
| CNPC             | `src/cnpc-intake.ts`, `src/cnpc-match-result.ts`, migration 116                                                                                                          | host-owned intake, policy, bounded coach pool, and validated match result                                                                                                                                                                  |
| Knowledge drift  | `src/program-facts-drift.ts`, `src/program-facts-drift-job.ts`, `src/program-facts-company-work.ts`, `src/lesson-conflict.ts`, `src/learn-ipc-handler.ts`, migration 125 | deterministic factual controls plus the live detector-to-Company-Work adapter; exact release `8344524c`, migration 125, active mode, and compiled scheduler path are live, while owner correction and clean source-resolution remain gated |
| Brief/digests    | `src/brief-promote.ts`, `src/digest-generator.ts`, `src/digest-delivery.ts`                                                                                              | operational briefing; Things promotion denies before HTTP fetch under the common brake                                                                                                                                                     |
| SEO              | `src/seo-stats.ts`                                                                                                                                                       | SEO job support                                                                                                                                                                                                                            |

### Reliability and autonomy

| Area                     | Main files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook durability       | `src/webhook-server.ts`, `src/webhook-inbox.ts`, `src/webhook-inbox-reaper.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ingest, archive, idempotency, retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Company work ledger      | `src/company-work-ledger.ts`, `src/company-work-shadow.ts`, `src/company-job-work-shadow.ts`, `src/company-job-work-shadow-cli.ts`, `src/program-facts-company-work.ts`, `src/company-work-report.ts`, `src/company-work-indicators.ts`, `src/company-work-outcome-quality-assessment*.ts`, `src/company-work-outcome-review*.ts`, `src/company-work-exception-loop.ts`, `src/company-work-source-context.ts`, `scripts/set-company-work-outcome-review.mjs`, migrations 118-120 and 125-129, `docs/COMPANY-OS-WORK-LEDGER.md`, `docs/COMPANY-OS-JOB-LEDGER.md` | Mailman/Sales and host-job projections are live under their recorded boundaries. NC-20260820-002 live-routes program-facts drift into the same exception projection. Exact release `bab154cb` deploys NC-20260820-003's source-bound Chief work packets. The next natural brief delivered three packets and woke Chief, but exposed that pickup/attempt outcome was not durably bound and the summary itself caused a redundant run. Exact release `f6089cce` and live migration 129 deploy NC-20260821-001's content-free packet/pickup/attempt receipts, threaded non-resolution receipt, completed-fingerprint/replay suppression, and summary own-echo routing. A later natural cycle posted three changed-source packets; all three were durably picked up, attempted successfully, and receipted with zero failures and no protected core-work or customer-email mutation. Exact release `265622bd` preserves the 15 accepted/13 completed Sales baseline and NC-20260820-006's dark, admin-only, append-only outcome-quality receipt plus coverage-aware third indicator. It also live-deploys NC-20260820-007's standalone, default-dry-run, exact-release-gated operator producer. NC-20260820-008 adds a separately default-off host packet service and migration 127: it verifies exact existing SQLite/Slack/Gmail-receipt evidence without Gmail access, posts at most one complete private packet, and accepts only named-UID reactions before generic approval routing. NC-20260820-009 adds release-bound activation, Chief-owned packet/ack echoes, a global locked open-packet gate, and migration 128's explicit `+1`-as-clean vocabulary plus exact-open-packet reaction reconciliation. Exact release `288105cb` live-reconciled the sole configured operator's existing packet 👍 into one `clean` quality receipt and one bound acknowledgment without packet two. Reconciliation requires exactly one supported reaction by a configured operator; the exact-message helper discards the returned Slack message content and exposes only reaction names/UIDs to the service, which cannot default clean. There is no model classification, bulk/default-clean, Gmail search/read, customer message, remediation, or work/action authority. |
| Gmail gap reconciliation | `src/company-gmail-reconciliation.ts`, `src/company-gmail-reconciliation-shadow.ts`, `src/company-gmail-reconciliation-shadow-store.ts`, `src/company-gmail-source-bootstrap*.ts`, `src/company-gmail-mailbox-audit*.ts`, `src/company-gmail-runtime-{alignment,watermark}*.ts`, `src/gmail-inbound-disposition.ts`, `src/gmail-historical-coverage*.ts`, migrations 123-124, `docs/COMPANY-OS-GMAIL-RECONCILIATION.md`                                                                                                                                         | NC-005/006 provide the installed proposal/wrapper/gap shadow. NC-008/009 deploy and naturally prove current-ingestion receipts/cursor holdback in exact release `263ac7c4`. NC-010 completes default-off retained-host coverage with 3,041 IDs split into 23 terminal, 1,675 recoverable, and 1,343 unknown; it does not claim mailbox completeness. NC-013 applies migration 123 dark. NC-20260818-001 live-proves one source/bootstrap/version-1 current state. NC-20260818-002 applies migration 124 and live-proves a stable terminal mailbox audit over 85,076 IDs: 67 accepted, 39 rejected, 84,970 unknown. NC-20260818-003 adds the local exact-cursor alignment plus crash-safe normal-advance/natural-404 freeze candidate; deployment, natural-404 observation, full-snapshot recovery, `gap_reconciled`, and label-poll recovery remain separately gated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| External-write control   | `src/action-safety.ts`, `src/action-safety-drill-exec.ts`, `docs/ACTION-SAFETY-CONTROL.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | deployed/default-off common action envelope and dynamic global/per-system brakes; exact release `47019c9` live-verifies Gmail send/reply, Slack, Courses SMTP projection, Plutio, Stripe, Hive/Firestore, and Things; in-flight interruption, standalone scripts, remaining integrations, ceilings, and demotion remain open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Circuit control          | `src/circuit-breaker.ts`, `src/hard-filters.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | bounded failures and deterministic rejection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Token failover           | `src/token-cooldown.ts`, `src/claude-token.ts`, `src/claude-bridge.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | auth failure classification and fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Autonomy                 | `src/autonomy-policy.ts`, `src/autonomy-ledger.ts`, `src/autonomy-hold.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | category trust levels, holds, vetoes, evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Approved-send watchdog   | `src/send-watchdog.ts`, `src/db.ts`, `src/ipc.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | records approved sends, observes mailman handoffs, alerts on an unobserved send without sending autonomously                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Healer                   | `src/healer/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | collection, diagnosis, trust, approval, remediation, incident reporting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Heartbeat                | `src/heartbeat.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | periodic liveness evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Healer code includes investigation, diagnosis, proposal rendering,
implementation, remediation, trust, approval, and Slack incident threading.
Configuration decides which phases are active. Never infer that an
implementation-capable path is enabled in production without checking the
live service environment and approval state.

### Container package

`container/agent-runner` is an independent Node/TypeScript package:

- `src/index.ts` — CLI turn loop, session resume, auth rotation, result output;
- `src/ipc-mcp-stdio.ts` — in-container MCP server over stdio;
- `src/ipc-protocol.ts` — shared request/response structures;
- `src/ipc-input-filter.ts` — validation of IPC-derived input;
- `src/model-util.ts` — model selection/normalization;
- `src/rate-limit.ts` — rate/auth failure detection.

Build and test it independently after protocol, model, auth, or container
changes.

## 8. Directory and portability map

| Path                                                                                                                                                  | Meaning                                                   | Git                          | Sync/portability rule                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `src/`                                                                                                                                                | host application and tests                                | tracked                      | canonical implementation                                         |
| `container/`                                                                                                                                          | agent image and runner                                    | tracked                      | rebuild on each target architecture                              |
| `groups/*/CLAUDE.md` and named operating support (`CLAUDE-MAIN.md`, `WORKFLOWS.md`, `VOICE-AND-TONE.md`, `EMAIL-RESPONSE-GUIDELINES.md`, `SCHEMA.md`) | role prompts and procedures                               | tracked                      | canonical behavior policy; changes travel with Git               |
| other `groups/*/*`                                                                                                                                    | conversations, auth, snapshots, scratch/runtime artifacts | ignored                      | sensitive or volatile; never treat as portable authority         |
| `knowledge/`                                                                                                                                          | shared and agent knowledge                                | mixed                        | sources tracked; generated packs/schedules partly ignored        |
| `tandem-knowledge/`                                                                                                                                   | broader Tandem knowledge corpus                           | tracked/mixed                | review provenance before regeneration                            |
| `data/business/CLAUDE.md` and `data/business/migrations/nanoclaw-v2/`                                                                                 | PostgreSQL operating guide and ordered DDL                | tracked                      | portable source history; running schema still wins               |
| other `data/business/`                                                                                                                                | legacy/local SQL and runtime material                     | ignored/mixed                | not automatically current authority                              |
| `data/jobs/` and `data/webhooks.json`                                                                                                                 | runtime definitions/state                                 | ignored                      | machine-local; export deliberately                               |
| `data/ipc/`                                                                                                                                           | file IPC                                                  | ignored                      | volatile, never copy while live                                  |
| `data/sessions/`                                                                                                                                      | Claude/container sessions                                 | ignored                      | sensitive and machine-specific                                   |
| `store/messages.db`                                                                                                                                   | host SQLite state                                         | ignored                      | back up transactionally; not source                              |
| `handoffs/`                                                                                                                                           | dated Claude work checkpoints                             | ignored by Git               | synced operational history, not canonical current state          |
| `.claude/`                                                                                                                                            | Claude settings and skills                                | settings tracked selectively | skills portable; local settings and permissions machine-specific |
| `.nanoclaw/`                                                                                                                                          | applied-skill state                                       | ignored                      | local installation metadata                                      |
| `.toolbox/`                                                                                                                                           | shared toolbox registration                               | ignored                      | re-register per machine/client                                   |
| `setup/`                                                                                                                                              | setup, service, launchd, n8n/VPS assets                   | tracked/mixed                | inspect for embedded environment data before sharing             |
| `docs/`                                                                                                                                               | requirements, designs, operations, this map               | tracked                      | label target vs implemented state                                |
| `tools/`, `scripts/`                                                                                                                                  | maintenance and integration tools                         | tracked/mixed                | inspect side effects before use                                  |
| `dist/`                                                                                                                                               | compiled host output                                      | ignored                      | rebuild; never use as source authority                           |
| `logs/`                                                                                                                                               | runtime logs                                              | ignored                      | sensitive operational evidence                                   |
| `.env*`                                                                                                                                               | credentials and toggles                                   | ignored                      | never copy through Git or documentation                          |

### Confirmed portability gaps

1. Named group operating support and the current `business_v2` migration
   history were promoted to Git by `NC-20260728-004`. Group conversations,
   browser/auth state, scratch files, execution reports, and other runtime
   artifacts remain intentionally excluded.
2. `.stignore` excludes all `data/`, `store/`, and `logs/`; use Git for the
   tracked business guide/migrations and database-aware backups for live state.
3. `handoffs/` is intentionally outside Git. It may be present on a synced
   machine but cannot be assumed on a clone or CI worker.
4. `.claude/settings.json` and local MCP configuration contain absolute paths
   and machine-specific integration assumptions.

Until those are deliberately redesigned, “run on another machine” requires a
reviewed export/checklist, not only `git clone && npm install`.

## 9. Persistence model

### SQLite: host control plane

Location: `store/messages.db`.

Current local schema contains:

- `chats` and `messages` — normalized channel history/cursors;
- `sessions` — Claude session continuity by group/conversation;
- `registered_groups` — channel binding, folder, trigger, model/container JSON;
- `slack_thread_anchors` — entity-keyed thread continuity and activity;
- `scheduled_tasks` and `task_run_logs` — agent task definitions/history;
- `jobs` and `job_run_logs` — host job definitions/history;
- `email_tracking` — outbound email metadata;
- `pending_sends` — durable approved-email actions: host action ID, approval
  thread, normalized To and ordered visible CC recipients, approved
  subject/body hash, current execution state, Gmail receipt, and visible
  failure state. Deployed NC-20260820-003 adds only the exact inbound source
  Gmail message ID so a Company Work-bound Chief read can be re-authorized
  after restart; no source prose/query is stored;
- `email_send_events` — append-only stage history for each approved-email
  action (`approved` through Gmail-confirmed or visibly held/blocked);
- `gmail_inbound_disposition_receipts` — NC-008/009's live append-only,
  content-free terminal accounting for current Gmail ingestion. Exact release
  `263ac7c4` created the table and two no-update/no-delete triggers after a
  WAL-safe backup; later natural proof contains 18 unique content-free receipts
  with no current-process receipt, processing, or cursor-hold failure;
- `router_state` — durable router progress.

Inspect `.schema` before every manual query. Do not copy a live WAL-backed
database with an ordinary file copy and call it a backup.
Tracked schema snapshots are structure-only: live sample rows are forbidden
because they can contain customer and operational data.
Approved-email action projections and events are intentionally retained as
low-volume safety/audit evidence; automatic pruning is declined until a
reviewed retention rule can preserve confirmed and uncertain receipt history.

### PostgreSQL: business data plane

Database name documented by the project: `nanoclaw_business`.

The modern namespace is `business_v2`, including concepts such as:

- parties and email identities;
- roles and relationships;
- programs and variants;
- enrollments and engagements;
- pipeline state and interactions;
- attachments and documents;
- outbox/reference and incident state;
- collector/heartbeat evidence;
- proposal follow-up actions, suppressions, and sweep watermarks;
- party-level `no_followup_at` / `no_followup_reason` suppression with
  `fn_drop_followups` and `fn_resume_followups`;
- live, empty migration-130 admin-only Company OS follow-up current cases and
  append-only changed-evidence events. Under NC-20260821-002 they remain unwired;
  schema/repository presence grants no source, scheduler, presentation,
  draft, approval, Plutio/payment mutation, or send authority;
- durable webhook inbox state.
- live migration-118 Company OS work-item, append-only event, and exact-receipt
  structures. `NC-20260816-001` deploys a default-off host observer of exact
  SQLite/Slack action facts; the verified bounded history is three completed
  outcomes plus one named source gap, with duplicate-only replay. SQLite
  remains action authority; running state must still be taken from
  active-work/changelog evidence, not repository presence.
- `NC-20260816-014` adds a read-only reconciliation/exception report over
  those privacy-minimized tables. It detects state/event contradictions,
  receipt gaps, duplicate facts, named source gaps, blocked/failed/waiting,
  stale/overdue, and outcome-missing work through one bounded SELECT.
  `NC-20260816-015` deploys exact release `cf96258` and verifies one full
  four-item production read plus unchanged PostgreSQL and SQLite fingerprints.
  It is not daemon-wired and cannot affect the approved-email path.
- `NC-20260820-005` adds a separate aggregate-only Sales email service-
  indicator report. Exact accepted and outcome-validated events provide the
  accepted/completed count and completion-latency sample; malformed evidence
  makes the result unavailable. The planned customer-visible defect/reversal
  measure remains unavailable because no canonical receipt exists, and
  internal exception states are not used as a proxy. The command emits no
  item/customer identity, is not daemon-wired, and gains no workflow or
  message authority. Exact release `a02abaca` is live; its first 30-day read
  reports 15 accepted/13 completed, 86.67% completion, and
  29m01.725s/6h16m18.994s/9h25m12.618s p50/p95/max latency with unchanged
  protected fingerprints. The unavailable third indicator and the absence of
  a statistically useful time series remain explicit gates.
- `NC-20260816-016` adds local, unapplied migration 119 and an unwired injected
  projector for `host_job_run`. The target schema preserves Party/pipeline
  requirements for `sales_email`, requires neither for a host job run, adds
  exact start/terminal-failure events, and retains host-admin-only access.
  This is source/state-machine evidence only: no production schema, observer,
  report, scheduler, job, Campanero, or channel state changes under NC-016.
- `NC-20260816-017` applies migration 119 and deploys the separately invoked
  read-only-SQLite/bounded-write observer plus multi-workflow SELECT-only report
  in exact release `999f2a4`. A five-run closed window produced exactly 5
  items/15 events/5 receipts, and replay was duplicate-only. SQLite remains
  authority; the observer is not scheduled or daemon-wired.
- `NC-20260816-018` deploys migration 120 plus a daemon-owned attention loop in
  exact release `a2e6d35`; active release `baed66d` preserves it. The three live
  admin-only
  tables store exact reason cases, deduplicated/bound Slack briefs, and
  append-only acknowledgment/resolution evidence without raw customer, email,
  job-output, approval, prompt, or arbitrary payload content. They grant no
  agent access and never mutate the three work-ledger tables. The loop is
  active for one owner-confirmed operator; the first bounded run opened three
  reason cases and durably posted one natural Chief brief without changing the
  source work ledger. The named reaction acknowledged all three current cases
  with a posted threaded receipt; natural source resolution remains pending.
- `NC-20260817-001` added migration 121 plus a typed store for normalized
  trigger occurrences. The target is admin-only,
  append-only, content-free, and replay-safe across five closed source kinds.
  `NC-20260817-002` records its exact production application; task
  creation/resume, skills, and every action authority remain unchanged.
- `NC-20260817-002` deploys the default-off observer that can append one
  allowlisted scheduled-task boundary after SQLite has already claimed it.
  Source reads remain content-free and scheduler authority is unchanged. One
  natural boundary inserted once, exact replay was duplicate-only, and config
  is disabled after the canary. Other source adapters and every task/action
  promotion remain absent.
- `NC-20260817-003` adds migration 122 and an unwired typed
  store for immutable trigger-source definitions, versioned cursor state, and
  append-only watermark/gap history. Disposable PostgreSQL proves exact
  registration/event replay, source-fact conflicts, monotonic and stale-version
  refusal, gap freeze, exact-gap reconciliation, append-only history,
  history-preserving rollback, and zero agent grants. `NC-20260817-004` applies
  the schema and deploys exact release `070cde38` dark with zero source,
  watermark-event, and state rows plus zero non-admin grants. Current source
  cursors and adapters remain unchanged.
- `NC-20260817-005` adds no schema or production rows. Its pure injected
  inbound-Gmail adapter can construct validated gap/reconciliation proposals
  only; the live migration-122 tables remain at the NC-004 dark boundary until
  separately registered/bootstrap work occurs.
- `NC-20260817-006` adds unapplied migration 123 plus an unwired exact Gmail
  read-only wrapper and resumable shadow store. The target stores one opaque
  active continuation token, append-only page-token hashes, immutable Gmail
  IDs, accepted/rejected dispositions, bounded reason keys, and evidence
  hashes only. Disposable PostgreSQL proves a 21-page/10,001-candidate terminal
  attempt, exact completion replay, append-only enforcement, populated rollback
  refusal, empty rollback, and admin-only grants. Production PostgreSQL,
  migration-122 row counts, Gmail cursors, and runtime imports remain unchanged.
  `NC-20260817-007` deploys exact release `de815e1d` with the migration still
  absent and all source/cursor/runtime boundaries unchanged.
- `NC-20260817-013` applies only migration 123 from exact live release
  `dc3e5f0d` after a zero-work drain and verified mode-0600 backup. Its three
  tables are empty/admin-only with expected constraints/indexes and append-
  only page/candidate triggers. The runtime remains unwired and no source,
  Gmail, cursor, recovery, work, or action boundary changes.
- `NC-20260818-001` installs exact candidate `1b70de94` without activating the
  daemon, takes a complete unfiltered affected-schema backup, and records one
  exact inbound Gmail source plus zero-count bootstrap/current state. Exact
  replay is duplicate-only; shadow rows remain empty and no Gmail, cursor,
  recovery, work, or action boundary changes.
- `NC-20260818-002` applies migration 124 and invokes its default-refuse,
  gap-independent mailbox audit separately from the daemon. It lists only
  unfiltered Gmail IDs plus profile head, reads SQLite terminal receipts query-
  only, stores accepted/rejected/unknown evidence under admin-only tables, and
  rechecks the exact current source before page or completion writes. A live
  stable terminal audit closes 85,076 IDs as 67 accepted, 39 rejected, and
  84,970 unknown with no retained token. Protected cursor/source/work/email/
  service state is unchanged; no daemon import, cursor event, gap/404,
  recovery, work, or action authority exists.

The database also contains classification tables and older/public integration
tables. Their coexistence is why the repository mandates schema-first work.
Do not use the legacy `data/business/business.db`; root instructions explicitly
identify that model as dead.

### Markdown knowledge

Durable agent context is distributed across:

- role prompts in `groups/*/CLAUDE.md`;
- `knowledge/shared` common facts;
- `knowledge/agents/<name>` role-specific generated/source material;
- `tandem-knowledge` source and synthesized business knowledge;
- role-local files such as Sales `KNOWLEDGE.md`, `LEARNED.md`, schedules,
  workflows, schemas, voice, and response guidance;
- archived handoffs and decision records.

The July self-learning changes intentionally made Sales audit drafts directly
against `LEARNED.md`. A bulk “merge lessons” job was disabled after a lossy
rewrite path was identified. Knowledge regeneration must preserve provenance,
facts, and manually reconciled contradictions.

### Sales request-first behavior (`NC-20260809-004`)

The runtime Sales behavior authority is `groups/sales/CLAUDE.md`, supplemented
by `groups/sales/WORKFLOWS.md` and
`groups/sales/EMAIL-RESPONSE-GUIDELINES.md`. `groups/sales/CLAUDE-MAIN.md` is a
compatibility/staging companion and is not loaded by the current host or
container runtime; contract tests include it to prevent contradictory guidance.

Sales must decide in this order: relationship evidence predating the inbound,
current-message asks, answerability, one response route with its content budget,
then path non-authority. Broad website browsing-path data is disabled and
non-binding for customer-facing drafts. A source-bound contact-form
`Entry-Page` may resolve one explicit page-relative reference when it maps
unambiguously to an official Tandem page, but it supplies no relationship,
intent, answerability, fact, recommendation, or commercial authority and Sales
must not run a Chaos lookup. Commercial content requires `TRANSACT` and a
verbatim current-message Route-Basis of no more than 15 words. `LOW` confidence
or `HUMAN` yields a draftless escalation, not an approvable Sales card.

`NC-20260820-004` deploys that bounded ingress path across exact Tandem website
commit `bdf8fd9b3`, active n8n workflow `1`, and immutable NanoClaw release
`eb5fbaa1`. Website, workflow structure/code, prompt hashes, release health,
channels, listener, and empty queues are live-verified. A genuine contact
submission remains the outcome gate; no synthetic lead was created for proof.

The host autonomy ledger recognizes canonical standalone Sales headings using
an anchored, emphasis-tolerant, case-insensitive grammar. The historical
`REVISED DRAFT FOLLOW-UP:` label remains recognition-only. The structural eval
fixture lives outside the Sales container mount at
`evals/sales/request-first-cases.json`; it does not itself prove response quality.

## 10. Agent/group map

The local SQLite snapshot contains 19 registered folders. That snapshot was
last active around 2026-07-06 and is not asserted to be current production.

| Folder                                                    | Role and boundaries                                                           | Local execution notes                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                                                    | privileged administrator/general assistant                                    | main group; no trigger required                                                                                                                         |
| `chief`                                                   | coordination, escalation, decision routing, support-draft approval            | must not revive the old DB-dispatch pattern                                                                                                             |
| `inbox`                                                   | qualify inbound leads and create modern CRM evidence                          | no direct sales ownership                                                                                                                               |
| `mailman`                                                 | classify and label email; execute approved outbound work                      | full Gmail family, limited to host-assigned resources and host-verified recipients                                                                      |
| `sales`                                                   | approval-gated sales drafts and pipeline follow-up                            | assigned Gmail thread/search reads only; no Gmail send/reply                                                                                            |
| `booking`                                                 | Trafft booking events and interaction logging                                 | host/business mounts                                                                                                                                    |
| `contador`                                                | Stripe, payment Sheets, PostgreSQL, vendor invoices                           | exact host-assigned invoice-message reads; Haiku locally                                                                                                |
| `certifier`                                               | pending certification workflow and Sertifier actions                          | explicit approval before consequential issue/send                                                                                                       |
| `courses`                                                 | session recap preparation and distribution                                    | current raw SMTP path bypasses Gmail controls and is scheduled for retirement                                                                           |
| `grader`                                                  | rubric/data-driven MCS grading and durable results                            | Sonnet; one thread/container per submission; calibration holds                                                                                          |
| `procurement`                                             | CaleProcure/email review control plane plus legacy Bonfire/proposal lifecycle | scheduled intake uses host-owned task/source-run identity; review and commercial actions remain separately gated; Bonfire CDP remains isolate-or-retire |
| `cnpc`                                                    | CNPC application intake and bounded coach-match review                        | host owns eligibility, pricing, capacity filtering, result validation, and every external action                                                        |
| `archivarista`                                            | domain-isolated knowledge synthesis/archival                                  | Haiku; broad read mounts, provenance critical                                                                                                           |
| `newsroom`                                                | editorial pipeline                                                            | no unapproved broadcast                                                                                                                                 |
| `social`                                                  | LinkedIn content state machine                                                | confirmation/approval boundary                                                                                                                          |
| `campanero`                                               | jobs MCP operator                                                             | narrow job execution surface                                                                                                                            |
| `heartbeat`                                               | watchdog sink                                                                 | intentionally no conversational response                                                                                                                |
| `feature-requests`                                        | feature/bug intake                                                            | local support files, no tracked role prompt                                                                                                             |
| `gru-community`, `gru-incidents`, `gru-seo`, `gru-solera` | registered channel workspaces                                                 | folders are currently empty; global/fallback behavior applies                                                                                           |

There are tracked role prompts for `global` plus the 16 named operational
roles and `_TEMPLATE`. Empty/local-only registered folders and tracked prompts
are not a one-to-one set. Always inspect `registered_groups` and the actual
folder before changing routing.

### Common minion contract

`groups/_TEMPLATE/CLAUDE.md` establishes the usual pattern:

- acknowledge or emit a configured processing response promptly;
- distinguish read-only analysis from actions needing approval;
- use shared and role-specific knowledge;
- record durable lessons/handoffs in defined channels;
- keep secrets and unsupported claims out of output;
- let host guardrails enforce side effects.

Each concrete group overrides that pattern. The concrete file wins for its
role, subject to repository-wide and host safety rules.

## 11. IPC and host capability model

Agents do not receive unrestricted host access. They issue structured requests
through the in-container MCP/file protocol. The host validates request type,
caller/group identity, target container/conversation, arguments, and approval
or policy state as applicable.

Capability families include:

- channel send/reply and Slack thread anchoring;
- fixed-destination grader file delivery with durable idempotency receipts;
- Gmail read/classify/draft/send operations;
- business-data read/write helpers;
- handoff and learning events;
- scheduled tasks and host jobs;
- status, logs, and selected operational queries;
- integration-specific host scripts.

Security-sensitive rules:

- do not add a generic shell escape as an IPC convenience;
- do not trust a request's claimed group without binding it to container state;
- preserve `target_container`/conversation checks for replies;
- validate recipients at the final email-send boundary;
- record the requested action, decision, and final result separately;
- ensure retries are idempotent or carry a stable idempotency key;
- keep approval state durable across process/container restarts.

### Per-agent manifest checkpoint (`NC-20260816-004`)

Tracked `capabilities/<group>.json` files now describe all 17 operative group
folders. `src/capability-manifest.ts` validates and fingerprints them, and
`scripts/generate-capability-matrix.ts` produces the path-free review surface at
`docs/generated/CAPABILITY-MATRIX.md`. The release builder packages the
manifests.

Global enforcement remains default off. When a group is selected, container
launch projects exact Claude and MCP tools, declared business credential
families, configured mount targets/access, and runtime ceilings from the
selected manifest; recognized message/task/job
IPC is also denied outside the manifest's host-operation set.
The projection fingerprint is carried in container input and sidecar state.
GroupQueue refuses another turn for a stale warm container, and startup refuses
adoption of a stale or pre-manifest container. Existing domain authorization,
resource grants, action safety, mount allowlists, and receipts remain
authoritative and cumulative.

`NC-20260816-006` adds a staged `CAPABILITY_MANIFEST_ENFORCED_GROUPS` selector
because the live registry contains legacy dynamic folders and the global switch
cannot satisfy a one-agent rollout. Selected folders must be tracked and
registered; all non-selected folders remain in compatibility mode. The first
live canary is Campanero, narrowed to its authoritative jobs-only MCP role.
The bundled environment editor is dry-run by default, hostname-confirmed for
apply, backup-producing, and atomic. Immutable combined release `2987070` is
health-verified with only Campanero selected. Its live projection has no Claude
tools, only MCP `jobs`, only host operation `jobs_mutate`, and read-only
`knowledge`/`agent_docs` mounts. A read-only production-image canary returned
the exact live 22-job inventory and structurally proved Bash and all undeclared
MCP tools absent. Queue, email-action, job, and Campanero-task aggregates were
unchanged after the canary; release, environment, and 18 runner-snapshot
rollback artifacts are retained.

`NC-20260816-010` adds a final fail-closed credential-family allowlist to the
same projection. Compatibility mode preserves the legacy payload. Enforced
agents receive only declared business credential families, and any new secret
name is withheld until classified. The Booking manifest omits Trafft because
live webhook persistence and reconciliation are host-owned; it retains the
least-privilege business DB family and the existing Plutio family. The latter
cannot be removed without replacing the tracked non-booked lifecycle procedure
in `groups/booking/EXECUTION-STEPS.md`. Claude runtime authentication remains a
documented platform exception. The bundled Booking verifier reads the real
host configuration but emits only names/counts and performs no network or
database call.

Immutable release `ba5fe74e93e7d58582079a153d85aaf30a651c86` is now
health-verified on `mini-claw.local` with only Booking and Campanero selected
and global enforcement false. The installed no-network verifier found all
three configured Trafft source names absent from Booking's projected stdin and
all five required DB/Plutio names present. Health remained 17/17 valid with
zero active/waiting/outgoing work, and the email/task aggregates were unchanged.
This is credential-boundary evidence, not a natural non-booked lifecycle run.

`NC-20260816-011` builds the next dark boundary without changing live Booking
behavior. The host adapter accepts only an archived Trafft `canceled` or
`rescheduled` event, validates its stored identity, persists only opaque
inbox/event references in the existing Plutio outbox, re-loads the archive at
dispatch, derives every external value host-side, and routes writes through
the common Plutio safety control. A stable marker plus an opaque receipt allows
Booking-specific stale in-flight rows to be retried without intentionally
duplicating an activity. Legacy proposal/invoice reclaim behavior is unchanged.

The adapter is not connected to webhook ingress, and the Booking prompt,
manifest, Plutio credentials, and mounts are unchanged. The shared rescheduled
event extractor also omits the flattened `appointmentStartDateTime` value that
the archived payload uses; the adapter corrects this only inside its dark
parser. Promotion must first change and canary the shared identity extractor,
then prove that Plutio preserves the remote marker before removing the current
container path. Local or injected replay proof is not natural business-path
evidence.

Exact release `63ed4aacf41e3026037912ed3f5ffccfbdc95e59` is now live on
`mini-claw.local`. The installed injected canary proves allowed, denied, and
replay control flow while making zero database, child-process, or network calls.
Health, channels, listener/drain state, capability selection, email/task
aggregates, and legacy Plutio outbox totals remained stable; no
`booking_activity:%` row exists. This is deployment proof of the dark control
surface only, not remote Plutio idempotency or a natural lifecycle outcome.

`NC-20260816-012` is the separately gated promotion prerequisite. Its deployed
release `ed957d3` makes the shared Trafft extractor authoritative for flattened
`appointmentStartDateTime` reschedule payloads and removes the dark adapter's
private identity repair. The immutable bundle now contains a dry-run-first,
exact-host/full-release-confirmed synthetic Plutio marker canary. Apply is
limited to one stable non-customer person/activity record; it requires exactly
one remote marker occurrence before replay and blocks any replay attempt to
call the activity writer. Local, release, install, activation, and negative
confirmation gates pass. The one authorized Plutio first pass persisted one
synthetic activity but stripped its HTML-comment marker; exact readback found
zero occurrences and refused replay before a second write. Health and all
NanoClaw aggregates remained stable. Booking ingress, prompt, procedure,
manifest, mounts, and Plutio projection remain unchanged. The owner authorized
one corrective entry, and the locally verified replacement uses visible
text-only `[nanoclaw-booking:<sha256>]`. Exact release `13ca192` is now live;
the authorized correction produced exactly one visible marker and immediate
replay returned `already_recorded` without calling the activity writer.
Independent readback found one note and exactly one marker, while health and
NanoClaw aggregates remained stable. At the NC-012 boundary this closed the
shared-identity and remote-marker prerequisites only and assigned natural
ingress, durable outbox receipt, procedure/manifest/mount cutover, and container
Plutio removal to NC-013. The current NC-013 state follows.

`NC-20260816-013` first deployed the cutover as exact release `77064e9`. It gives
canceled/rescheduled interactions the archive-derived
event key, fixes receiver and inbox-reaper handling so a returned container
error stays retryable, and requires that exact persisted lifecycle interaction
before either path can enqueue the opaque Booking Plutio action. The Booking
prompt/procedure, manifest, generated matrix, and registration source remove
direct Plutio/toolbox access together. A bundled dry-run-first registration
helper preserves every other group field, rejects a partial legacy mount state,
requires the exact host and release for apply, and writes an exclusive rollback
snapshot. The immutable bundle passed local gates, fresh extraction, and a
separate disposable operational-root remove/idempotency/restore rehearsal. On
the Mini, Booking drained cleanly; the helper removed exactly the two legacy
mounts; the live procedure files match the release; and activation preserved
both registration, prompt, and LaunchAgent rollback artifacts. One healthy
Node 22.23.2 listener reported exact verified release `77064e9`. Installed
negative proof shows Booking receives only `business_db`, `knowledge`, and
`agent_docs`, with all configured Trafft/Plutio source names and legacy mounts
absent.

The subsequently authorized normal-ingress canary created archived inbox
`4469`, synthetic party `11333`, lifecycle interaction `3034`, party-sync row
`1311`, and Booking activity row `1312`. It also exposed two defects: scheduled
tasks emitted a result but remained warm until the host treated them as failed,
causing one automatic retry and two Booking notices; and the post-Plutio
metadata query lacked an explicit text cast after the remote activity write.
The host completion gate was recovered against the exact archived interaction,
marking the inbox handled before further retries.

Corrective release `67f16d5` fixed one-shot scheduled-task exit and the receipt
cast, rebuilt image `sha256:0618fbecf88cc0298fa9665db1c0c2c0ad368da37d471d148fb984e310ca835e`,
and refreshed all 18 runner snapshots. A third defect then surfaced before the
controlled retry: `tools/plutio/run-reaper.sh` still executed operational
TypeScript rather than immutable release code. Release `02ce48f` added a
compiled reaper CLI, included the launcher in the bundle, and made the
operational launcher verify and execute launchd's exact code root and Node
interpreter; exact active release `999f2a4` preserves those bytes and controls.
The real launcher processed only row `1312`; remote readback
returned `already_recorded`, persisted marker/person/note receipts and
interaction metadata, and emptied the queue without a second activity. The
authorized duplicate webhook returned HTTP 200 and left all entity counts
stable. Because the initial event required operator recovery, NC-013 remains
`deployed_unverified` pending one fresh post-fix natural lifecycle observation;
its capability and replay boundaries are live-verified.

This is not full P0.2/P0.3 completion: network egress remains
`unrestricted_current`; Bash and raw mounted tools/credentials remain for some
roles; immediate in-flight termination, value/rate ceilings, dynamic group
onboarding, every group beyond the selectively proven canaries, and broader
business-path canaries are still open. See `docs/CAPABILITY-MANIFESTS.md`.

### Sales channel work-item containment (`NC-20260802-006`)

Each inbound `*→sales` handoff is one top-level channel work item. Scheduled
`[FOLLOW-UP]` and `[COLD]` cards also start visible work items so an approval or
control surface cannot disappear inside an old collapsed thread. The Slack host
starts a fresh root and repoints the current lead anchor for each item, even
when the same lead has an older thread. Sales review cards, revisions, operator
questions/approvals, outbound handoffs, and status messages resolve to that root
without `reply_broadcast`; lead replies never roll into a new channel root merely
because the generic anchor TTL elapsed. A still-open older root remains eligible
only when the host persisted it for the same channel and lead, preventing both
same-lead cycle theft and model timestamp authority. Messages queued during a
Slack disconnect are sent back through the same router after reconnect; a
partial multi-chunk retry stays under its established root. Group prompts
document the same rule. The runner stamps output with its container identity;
the host resolves that identity against the active queue work unit and defaults
Sales output to its originating thread when `thread_ts` is omitted. The Slack
adapter independently validates explicit historical roots, deduplicates a
re-posted scheduled cycle against a stored current root no more than six hours
old, and enforces the no-broadcast policy. Resolved-lead routing is serialized
so simultaneous scheduled re-posts cannot both become roots. A resolver failure
remains visibly unanchored rather than minting a second lead identity, and
increments the since-start diagnostic. Cross-channel
handoffs never inherit or carry the source timestamp. Same-channel non-lead
Sales status may inherit only an active queue-registered work unit. Connected
send failures schedule bounded retries; a partially delivered split message
queues only its unsent chunks beneath the established root. `/health` exposes
non-sensitive resolver-downgrade-since-process-start and outgoing-queue
diagnostics. These counters are process-lifetime signals, not durable history.

### Grader file delivery checkpoint (`NC-20260802-001`)

The generic channel message IPC is not a file authority. Grader uploads use a
separate `slack_file_message` contract whose final boundary is host-owned:

- only the directory-derived registered main group or `chief` may call it;
- the destination is fixed to the registered `grader` group;
- the source must be a regular non-symlink inside that source group's
  `data/ipc/<group>/attachments/` tree, at most 25 MB, with matching size and
  SHA-256 metadata;
- the host snapshots the verified bytes before conversion/upload, closing the
  writable-mount time-of-check/time-of-use gap;
- a durable `pending` receipt is written before Slack is touched and becomes
  `complete` with the root timestamp only after Slack confirms the threaded
  upload and NanoClaw persists the readable root;
- duplicate completed keys return the same receipt; pending/uncertain keys are
  held rather than automatically retried.

`SlackChannel.postGraderFileMessage()` posts one clean root, uploads the source
artifact into that root's thread through `filesUploadV2`, and only then stores
the inline-readable root with `from_group` set to the privileged source so the
grader wakes exactly once. The shared toolbox adapter copies operator-selected
files over the existing authenticated SSH route to the production Mac Mini's
IPC, and fails closed unless that host's compiled runtime contains this
capability; it does not call Slack directly or inject message rows.
This path shipped in release `0a39380`, was live-canaried through the toolbox,
and remains present in current production release `aa1c821`. Its durable
receipt and duplicate replay were verified before the later release switch.

### Slack raster-vision checkpoint (`NC-20260817-011`)

The Slack adapter previously classified every image as unreadable and did not
download it; the resulting note instructed the minion to ask the operator for
text. Supported inbound PNG, JPEG, GIF, and WebP files are now bounded at 10 MB,
downloaded with the existing Slack `files:read` token, validated from file
signature rather than filename or MIME metadata, and atomically staged beneath
the destination group's host-owned `data/inbound/<group>/slack/` tree. Raw file
and message identifiers never become path segments.

The runner overlays that one group's inbound tree read-only at
`/workspace/ipc/inbound`; the surrounding IPC mount stays writable for normal
agent-to-host operations. The message carries the exact staged path and tells
an image-capable minion to use `Read`. Image text remains untrusted input, not
authorization. Unsupported/spoofed bytes, missing download metadata, oversize
files, and download/staging failures yield explicit notes. Derived local copies
expire after 30 days; Slack remains the source of truth. This checkpoint does
not grant a new credential, action, recipient, or outbound-message authority.

### Gmail IPC containment checkpoint (`NC-20260729-004`)

The container runner still exposes one shared MCP namespace, so the host is the
enforcing boundary. The containment work adds:

- an explicit operation matrix: Mailman owns all Gmail operations; Sales owns
  resource-scoped search/thread reads; Contador and Archivarista own exact
  routed-message reads; Chief owns exact correction-message reads; every other
  group is denied;
- quarantine, rather than deletion or dispatch, for a denied `gmail_*` IPC,
  plus an asynchronous denial message to the calling agent;
- host-origin grants for Gmail thread IDs, message IDs, and addresses, with
  handoff propagation limited to structured headers and resources the source
  group already holds; in-memory sets are bounded;
- a durable Sales fallback that re-authorizes an exact thread or address
  after restart only when PostgreSQL proves it belongs to non-terminal pipeline
  work;
- the deployed NC-20260820-003 Chief fallback that re-authorizes only
  `gmail_read(messageId)` when SQLite binds that exact source message to an
  approved Sales action and PostgreSQL binds the same opaque action ID to a
  `sales_email` Company Work item with a still-active exception case; it grants
  no search, thread listing, send, reply, or arbitrary exact-message access;
- durable approval bindings for Sales and Chief reply cards: the approved
  Thread-ID and recipient can reissue Mailman's exact reply scope after restart,
  and the Gmail-derived recipient must match before delivery;
- exact assigned-address grammar for Gmail search;
- fail-closed host party resolution for To/CC and Gmail-derived reply targets;
- reply test routing as well as send test routing.

The operation matrix governs container-originated Gmail IPC. Host-owned flows
may call handlers directly: proposal approval currently invokes
`handleGmailSend` as a host action attributed to Sales, while digest delivery
calls the Gmail API directly. Both still require consolidation into the later
uniform action boundary; neither grants a Sales container `gmail_send`.

The implementation is committed at `1689527`. Its reviewed compiled host
artifact and additive SQLite migration were deployed to the Mac Mini on
2026-07-30; the exact release and rollback evidence are in
`docs/ENGINEERING-CHANGELOG.md`. Most grants remain deliberately fail-closed
and process-local in the first slice: after daemon restart, stale agent context
must be reissued by a host source instead of silently retaining mailbox access.
The functional exceptions are scheduled Sales work (reconstructed from an
active pipeline entry and recorded email interaction) and a still-pending human
approval (reconstructed from the local approval record). Live inert canaries
verified both denial acknowledgement and exact pending-approval grant recovery.
NC-20260820-003 is the deployed work-ledger slice that generalizes one durable
exact-message grant without broadening it. Exact release, schema, prompt,
service, channel, queue, and protected aggregates are verified. The next
natural brief delivered three packets and woke Chief without Gmail search, but
the packet attempt had no durable public completion binding. NC-20260821-001
deploys migration 129 and the host wiring in exact release `f6089cce`: exact
pickup/turn receipts, replay and unchanged-fingerprint suppression, and a
non-waking summary are live with healthy channels and unchanged protected
aggregates. Startup correctly returned `duplicate_brief`, leaving the new
dispatch tables empty; one later natural packet-level attempt remains the
outcome gate.

### Approved-email delivery assurance (`NC-20260802-009`)

The email path no longer treats “same recipient” or a queued tool response as
proof that a particular approval was fulfilled. Each parseable approval creates
one host-issued UUID and immutable SHA-256 of its approved subject/body. The
host recognizes a check-mark or exact whole-message `Approved` in the draft
thread, posts the Action-ID back into that thread, and carries or recovers that
identity at the routed handoff. It claims the Gmail
boundary with one conditional SQLite transition, and records Gmail message and
thread IDs before the approval is marked confirmed. A confirmed replay returns
the existing receipt without calling Gmail; an executing or uncertain replay
is held for reconciliation instead of retried.

If an executing action reaches the alert deadline, it becomes `uncertain`; the
alert says that delivery may have occurred, and the claim predicate cannot
reopen it. An unparseable approval is blocked immediately in its thread.
Unbound/unknown/ambiguous Mailman requests are quarantined, denied to Mailman,
and surfaced to Chief. Global `GMAIL_TEST_RECIPIENT` routing is prohibited for
action-bound customer sends; those actions block before claim.

Guard refusals and uncertain boundary errors are posted in the original
approval thread and retained in the action/event ledger. A post-send business
logging failure cannot relabel a durable Gmail receipt as unsent. Legacy rows
without an action ID remain readable for operator diagnosis, but Mailman cannot
execute them: they require a fresh exact approval. `groups/mailman/OUTBOUND-EMAIL.md`
is now tracked and packaged as the canonical verbatim-send procedure; the
obsolete ASCII subject rewrite and model-side post-send database write are
removed.

The Gmail tool's legacy `lead_id` field means canonical Party ID, not pipeline
Entry ID. It is a model-supplied hint for tracking, never identity authority.
The host-resolved Party from the exact recipient/thread wins when available;
the recipient must still belong to that Party's known email set. If the host
cannot resolve a Party, a valid hint is usable only after the same membership
check. This preserves the fabricated-recipient guard while preventing Entry
IDs such as `985` from blocking an exact approved action for Party `11152`.

For an exact approved action, Mailman's Gmail payload is now execution intent,
not content authority. The host reloads the approved Slack card by its durable
`draft_ts`/channel binding, re-parses To, ordered visible CC, subject, and body,
verifies the stored hash and recipient headers, and replaces model-supplied
recipient, CC, subject, body, thread, Action-ID, Party hint, email type, and
rendering flags before the one-time claim. Model-added CC and raw-HTML flags are
discarded; an approved CC is restored only from the action-bound card. A CC
that is not on the customer Party may pass on a reply only when it exactly
matches the card and is still visible on Gmail's latest external message at
execution time; configured internal mailbox identities remain separately
allowed. Exact `[FOLLOW-UP #N]` cards now enter
this same path and require `Email`, `Thread-ID`, fenced `Subject`, and fenced
body fields. Host-generated proposal follow-ups use their PostgreSQL draft row
as approval authority and the same one-time action/receipt ledger, preventing a
post-Gmail failure from leaving a resendable pending draft. Deterministic
pre-Gmail refusals say that Gmail was not called rather than asking the operator
to reconcile a nonexistent receipt. Parseable cards also run the exact Gmail
content policy before Slack posts them for approval and again before an
Action-ID is minted, so the operator cannot approve a deterministic future
content rejection. The canonical meeting/checkout set includes regional
`zoom.us`, `book.stripe.com`, Tandem's legacy `tandemcoaching.com`, and its
company-controlled `tco.ac` short links; suffix lookalikes remain blocked.

Approval-card submission is asynchronous, so the container tool explicitly
describes its result as pending host validation rather than `Message sent`.
Malformed, content-invalid, or overlong cards are quarantined, rejected visibly
in the host-derived Slack work thread, and returned through the exact
originating container work unit with an instruction to correct and repost. A
card successfully persisted to Slack returns `[approval_card ACCEPTED]` through
the same exact-container path; scheduled batches count only those accepted
artifacts before emitting their completion receipt.
Card-posting groups also suppress narrow positive final-text recaps that claim a
draft was posted and awaits approval; blocking signals, actual progress, and
Gmail receipts remain visible.

`npm run test:email-critical` is a serial Node-22 regression gate for approval
parsing, SQLite transitions, routing, authorization, recipient/content guards,
bigint party resolution, receipts, replay behavior, and exact scheduled-task
Gmail continuation/completion. `release:build` runs that exact gate after
proving the source tree is clean and before compiling the artifact.

`NC-20260815-008` adds a versioned, synthetic-only incident corpus at
`evals/email-delivery/incidents.json`. `npm run test:email-replay` executes its
approval-card and host-execution cases through the production parsers and
host-owned rehydration function without opening Gmail, Slack, or a production
database. The corpus also names the stateful schema, receipt, restart,
ambiguity, session-isolation, blocked-send, and completion regressions that
must remain in `test:email-critical`; the replay test fails if either it or a
linked regression leaves that release-blocking gate. This is local release
assurance, not a customer-path canary or business-outcome observation.

`NC-20260815-009` extends that corpus with the observed Chief-fallback marker
failure and visible-CC loss. Host-generated Chief fallbacks now carry
`[APPROVED-REPLY]`; approval parsing rejects ambiguous, duplicate, hidden-copy,
or malformed recipient headers; and the durable action stores the ordered
visible CC list for exact rehydration and final-boundary authorization. Exact
release `12c2b049` and the reviewed Mailman instructions are deployed and
health-verified. Natural action
`996a9d1c-e193-4fa3-9fe4-340a438e0f8d` later completed the normal fallback,
Mailman execution, exact Gmail acknowledgment, and one original-thread closure
without manual recovery, closing the named customer-path gate.

The separate `email:transport-canary` command sends fixed text to the monitored
mailbox itself and retrieves the exact Gmail receipt without writing business
or customer-action state. It is a transport/OAuth canary only, never evidence
that the full approved-customer path or inbox delivery succeeded. The one
authorized production canary for NC-009 returned and re-read Gmail
message/thread receipt `19fc4d33ccf3061e`; its recipient is recorded only by
SHA-256. Immutable releases intentionally omit `.env`, so the current direct
release-root invocation cannot discover the operational Gmail credentials.
The successful canary used an isolated temporary working directory containing
only a link to the existing operational environment and a copy of the exact
activated manifest, executed the activated binary, and then removed the
harness. A first-class environment-file binding is tracked under NC-010.

As of 2026-08-02, the main production host runs exact release
`e1fa93e09f6dedf363c9a8c0be1723583563f533` under Node 22.23.2. Health proves
the release commit and code root match; Slack and Gmail are connected; the
queue and container scheduler are empty; and the five affected live group
instructions match the reviewed release copies. The corrected bundle contains
520 verified files with source-tree digest
`7ade520429963e29e5d050da0b105bf7d2497b2b` and artifact digest
`de470dd842a6443bb21fa95e3f827afb240324c3f50e35385ceb3cd21337c24a`.
Its atomic activation changed only the executable, code root, and expected
commit from prior release `aa1c821`. An earlier activation of `d1bfcce` failed
on the exact legacy SQLite schema and automatically restored `aa1c821`, its
prompt files, and health before the migration-order correction was reviewed.
The operational source checkout remains dirty and was not overwritten. The
separately deployed healer controls remain as recorded under `bc8a71b`:
model-authored actions and implementation are off, while fixed capped daemon
recovery is on. A natural approved customer-email action, a Sales handoff/
draft/revision cycle, and a real daemon-down healer recovery remain separate
outcome observations.

### Email session and Sales work-unit containment (`NC-20260803-001`)

The first natural customer action after NC-20260802-009 exposed three coupled
gaps: the Sales template omitted the fenced `Subject:` that the exact-action
parser requires; concurrent Mailman containers shared untargeted asynchronous
Gmail input; and Sales channel roots and their replies could map to different
container keys. The repair validates every approvable email card (`[SALES
REVIEW]`, `[FOLLOW-UP]`, or `[SUPPORT-DRAFT]`) before Slack regardless of
whether it embeds a handoff marker, quarantines malformed bytes, and posts a
group-appropriate rejection in the host-derived work thread. Chief's canonical
support-reply template is tracked and uses the same exact fenced draft shape as
the parser.

Every Gmail MCP request now carries the runner's container identity. Async read
results and denials are returned through the matching live `GroupQueue` work
unit with runner-owned targeting and acknowledgement. Ephemeral results are
excluded from chat-cursor rollback because their source is not replayable; an
exited target produces a visible hold and is never replaced by a sibling
session, and an exit sweep warns if it removes an unacknowledged result. Host
email handoffs include a bare `Lead Email:` field in addition to
the display-name envelope so the actual customer anchors the Slack work item.
Sales `threadPerMessage` and its host-owned `[PROCESSING] Generating response…`
receipt are persisted startup requirements with a fail-closed assertion. The
host awaits that in-thread receipt before queueing a cold Sales container,
records duplicate suppression only after successful channel delivery, and
leaves a failed first attempt eligible for the spawn-path fallback. A bounded
cursor migration seeds only roots already consumed by the legacy `||root`
cursor, preventing activation from replaying the recovery window; existing
newer per-root cursors are never rolled back.

Host-owned work-root hints remain conditional on the root and outgoing message
deriving the same lead identity. A mismatch opens no cross-lead thread and does
not repoint either lead's anchor. An approval card too large for one Slack row
is refused as one visible rejection rather than split into fragments; a
malformed pre-existing card also posts a rejection at approval while minting no
action. Content-guard and overlong-card rejections return to the exact authoring
container; the tool's earlier file-queue acknowledgement is never described as
a successful Slack post, and a narrow positive model-authored
`draft posted / awaiting approval` recap is suppressed independently of thread
placement without hiding blocking prose. `test:email-critical` includes
malformed-card, same-group result isolation, lead-anchor, cross-lead refusal,
overlong-card, pre-approval content parity, transactional-link/lookalike, and
Sales cursor migration regressions.

Numeric commercial authorization follows the same exact-work-unit model. A
human's affirmative term in one Sales thread authorizes only the matching
canonical value there; a question is inert and a later explicit negative
instruction removes the term. That durable evidence is consumed by the IPC
preflight, Slack defense in depth, approved-send watcher, and final Gmail guard.
For replies, the Gmail channel and classification continuation preserve bounded
host-derived `Visible-To`, `Visible-Cc`, and `Reply-All-Candidates` context from
the exact current message through direct/classified routing to Inbox, Sales, or
Chief. Candidates exclude the primary recipient, duplicates, configured
send-as/reply-to/BCC mailboxes, and are capped at ten. BCC is never exposed.
Forwarded inquiries suppress the visible-recipient context because their
envelope is the internal forward rather than the external conversation. The
minion may propose a CC only from that list and only on explicit latest-sender
or exact-thread operator intent; the exact operator-visible `Cc:` line is
immutable after approval. Gmail is re-read at execution and must still show
each out-of-Party approved address on the latest external message. Unapproved,
invented, stale, standalone, and more-than-ten recipient paths remain blocked.

## 12. Integrations

The repository contains active or planned connections to:

- Slack Socket Mode and Slack Web API;
- Gmail OAuth/API, labels, push notifications, and safety polling;
- PostgreSQL;
- Apple Container and Claude Code CLI;
- Plutio proposals/outbox;
- Trafft bookings;
- Stripe payment webhooks/APIs;
- Google Sheets service-account workflows;
- Sertifier certification;
- Firebase/Hive engagement data;
- Chaos activity/booking data;
- n8n on a VPS for ingress/workflow orchestration;
- Cloudflare/OpenLiteSpeed perimeter components documented in operations files;
- Obsidian/knowledge vaults and OneDrive content;
- Things bridge on the Mac Studio;
- local/shared toolbox MCP operations;
- course, grading, SEO, transcript, and publishing repositories/scripts.

Presence in a prompt, setup asset, dependency, or skill is not sufficient to
label an integration active. Verify its import/wiring, environment toggle,
credential presence without exposing values, and live health.

## 13. Configuration map

Never document environment values. The major key families discovered in source
are:

- **Claude auth:** `CLAUDE_CODE_OAUTH_TOKEN*`, `ANTHROPIC_API_KEY*`, rotation
  and bridge keys/URLs;
- **identity/channels:** `ASSISTANT_NAME`, Slack tokens/IDs, Gmail mailbox,
  OAuth, push, send-as/reply-to/BCC, poll and test-recipient controls;
- **containers:** image, timeout, idle, concurrency, CPU, memory, output,
  spawn/liveness/stale-output/recovery sampling controls;
- **webhooks:** port, secrets, Gmail push secret;
- **PostgreSQL/business:** standard PostgreSQL variables and product/facts paths;
- **integrations:** Stripe, Sheets, Firebase/Hive, proposal, Things, toolbox,
  tracking/unsubscribe, SEO, team identifiers;
- **autonomy:** allowed groups, promotion streak, veto time;
- **healer:** collect/diagnose/investigate controls; the default-off
  model-authored action flag, separate default-on deterministic restart flag,
  action epoch, explicit operator allowlist, approval TTL, and secondary
  implement/auto-remediate flags; commands, concurrency, timeouts, and logs. A
  Slack reaction alone is not execution authority. Diagnostic Bash is a
  separate off-by-default escape hatch outside the action flag and must remain
  off pending host sandboxing;
- **operations:** timezone, log level, dry-run, job report and heartbeat channels.

`.env.example` documents only a subset and contains some upstream/runtime-neutral
wording that no longer matches the Apple Container-only implementation. For a
new environment, derive a checklist from `readEnvFile(...)` and `process.env`
call sites, then classify every key as secret, safe configuration, optional,
or deprecated. Do not copy an old `.env` blindly.

## 14. Claude Code workflow

### Orientation

From the repository root:

1. use Node 22 from `.nvmrc`;
2. start Claude Code in the root so it loads `CLAUDE.md`;
3. read the relevant group prompt and design/schema before work;
4. check the dirty tree and current branch;
5. use the Claude skills below only after reading their `SKILL.md`.

### Claude skill inventory

The repository provides procedures for:

- `setup`, `customize`, `debug`, `update-nanoclaw`;
- creating a minion;
- adding Slack, Gmail, Discord, Telegram, Telegram swarm, WhatsApp, voice
  transcription, and parallel execution;
- converting to Apple Container;
- Qodo rules/PR resolution;
- X integration.

Only Slack, Gmail, and Apple Container are reflected as applied/current in the
local skill state and runtime imports. An available skill describes a change
procedure, not an installed feature.

### Machine-local Claude settings

`.claude/settings.json` defines MCP access for an SSH-backed NanoClaw surface
and a registry-backed toolbox using local absolute paths. The local settings
file contains an extensive permission allowlist and extra directories. Those
permissions must be reviewed per machine; they are not a portable security
policy and must not be copied without understanding every allowed path/action.

## 15. Codex workflow

Codex starts from root `AGENTS.md`, which points back to the canonical Claude
sources. The intended workflow is:

1. open the repository root in Codex;
2. let `AGENTS.md` load, then read root `CLAUDE.md` and this map;
3. read the relevant group `CLAUDE.md` exactly as Claude would;
4. treat `.claude/skills/*/SKILL.md` as procedures and adapt their steps rather
   than inventing a parallel Codex-only workflow;
5. use the same Node version, schemas, tests, approvals, and deployment checks;
6. update shared sources, not a separate Codex fork.

Codex will not automatically inherit Claude's local chat history, ignored
handoffs, MCP permissions, session JSON, slash commands, or credentials. Make
required context explicit through tracked documentation or a reviewed handoff.
Never solve that gap by syncing Claude session/auth directories.

## 16. Local setup and runbook

### Prerequisites

- macOS with Apple Container installed and running;
- exact Node `22.23.2` (`.nvmrc` and package metadata); native modules must be
  installed or rebuilt under that exact ABI;
- npm dependencies installed for that exact Node ABI;
- Claude Code CLI and valid OAuth/API credentials;
- required Slack/Gmail credentials and callback configuration;
- PostgreSQL access where business workflows are used;
- a reviewed mount allowlist and all required external repositories/knowledge;
- machine-local runtime definitions, group support files, and secrets.

### Build and test

```bash
nvm use
npm install
npm ci --include=dev --prefix container/agent-runner
npm run typecheck
npm run test:email-critical
npm test
npm run release:build

cd container/agent-runner
npm run build
npm test

cd ../..
container system start
npm run setup
npm run dev
```

`npm run setup` is stateful. Read `.claude/skills/setup/SKILL.md` and inspect the
setup code before running it on an established machine. Do not run setup merely
to explore the repository.

Production build, activation, health proof, and rollback are governed by
`docs/RELEASE-INTEGRITY.md`. The daemon refuses a missing/mismatched manifest or
runtime or a code root outside that verified release before opening external
systems. `/health` exposes the verified commit/artifact/Node identity, resolved
code root, and code-root match. Activation is dry-run by default and derives an
exact-three-field candidate from the installed plist so machine-local service
configuration is preserved.

### Authentication

- Gmail consent: `npm run gmail:auth`.
- Claude refresh/re-auth: follow root `CLAUDE.md` and `reauth.sh` only after
  understanding which account/token pool is being changed.
- The legacy `npm run auth` command refers to WhatsApp auth code; WhatsApp is
  not an active imported channel in this snapshot.

### Development process

`npm run dev` runs `tsx src/index.ts`. It can connect to real channels and
services if credentials are present. Use a test environment, dry-run/toggle,
test recipient, isolated database, or focused test whenever possible. Never
assume “dev” is harmless in this operations repository.

### Service operation

The repo includes macOS launchd definitions and setup helpers, plus Linux/VPS
systemd/n8n assets. Production checks should cover:

1. build result and correct Node version;
2. Apple Container runtime health and agent image availability;
3. daemon/service state and recent logs;
4. local `/health` response and channel activity ages;
5. Slack and Gmail connection state;
6. PostgreSQL reachability and expected schema;
7. scheduler/reaper/heartbeat progress;
8. one safe end-to-end test for the changed path;
9. absence of stuck, duplicate, or orphaned work;
10. rollback readiness.

Do not copy generated `dist/` between machines as the primary deploy method;
build from the intended commit on the target or in a controlled build process.

## 17. Verification status on 2026-07-21

The investigation performed read-only inspection plus local verification; it
did not repair dependencies or change application state.

| Check                               | Result                         | Interpretation                           |
| ----------------------------------- | ------------------------------ | ---------------------------------------- |
| `npm run typecheck`                 | pass                           | current TypeScript graph is type-correct |
| container runner typecheck/tests    | pass, 22/22 tests              | independent runner package is green      |
| root `npm test` under current shell | fail, 1302 passed / 172 failed | not a green baseline                     |
| live production checks              | not run                        | no current production-health claim       |

The dominant root-test failure is a missing `better-sqlite3` native binding for
Node 26.5.0, while `.nvmrc` pins Node 22. Some container-runner tests also share
a temporary fixture path and can race under root-suite parallelism; formatting,
queue, and runtime failures need focused reruns after restoring the correct
Node/native dependency baseline. Do not declare all 172 failures product bugs,
and do not declare them all environment-only without those reruns.

Recommended baseline recovery, as a separate authorized change:

1. switch to Node 22;
2. reinstall/rebuild native dependencies without overwriting unrelated work;
3. run one failing SQLite test file;
4. run affected queue/container files serially if necessary;
5. run the full suite;
6. record genuine expectation or implementation drift separately.

### Verification update on 2026-07-28

`NC-20260728-005` completed that baseline recovery under the pinned Node 22
runtime:

| Check                        | Result                        | Interpretation                                                                                             |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| root `npm run typecheck`     | pass                          | current TypeScript graph is type-correct                                                                   |
| root `npm run format:check`  | pass                          | all root TypeScript source/tests match the shared formatter                                                |
| root `npm test`              | pass, 124 files / 1,595 tests | green regression baseline; webhook and `tsx` child-process tests require local TCP/IPC listener permission |
| container runner build/tests | pass, 22/22 tests             | independent runner package remains green                                                                   |
| schedule renderer tests      | pass, 16 checks               | tracked schedule transformation contract is green                                                          |
| knowledge delta tests        | pass, 18 checks               | bounded update parser/applicator contract is green                                                         |

The repair distinguished stale test contracts from three product defects:
ordinary polling re-ingested bot rows, retry keys accumulated repeated
`||root` suffixes, and scheduled tasks did not share queue state with root
message containers. Native dependencies were rebuilt with Node 22 before
interpreting results. A sandboxed full run still reports `listen EPERM` for
local listeners; that is an execution-policy restriction, not a product
failure.

### Runtime-contract update on 2026-08-21

`NC-20260821-004` makes exact Node 22.23.2 the one NanoClaw execution contract.
Both package engines and engine-strict install policy, every GitHub
`setup-node` step, the exact agent-image tag, release build and startup checks,
and production health agree. CI also runs on pushes to `main`. A workstation
shell may still start on Node 26 for unrelated projects; NanoClaw npm scripts
use `scripts/with-pinned-node.sh` to execute under the exact installed pin, and
dependency installation must use that same launcher. The global Node is not a
project authority and is not modified by the repository.

## 18. History and evolution

### Upstream/core lineage

The upstream NanoClaw project supplied the small one-process architecture,
container isolation, channel/skill customization model, and base setup flow.
This fork has diverged substantially into a Tandem Coaching operations system.

### Local timeline

| Period           | Major evolution                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| early March 2026 | Slack runtime, webhook/group isolation, handoffs, Gmail ingestion, Sales, PostgreSQL migration                                                                                                                                       |
| 5–10 March       | Certifier, Contador, and minion framework expansion                                                                                                                                                                                  |
| late March       | knowledge lessons, job/watchdog systems, bridges, message tracking, threading                                                                                                                                                        |
| 31 March         | transition away from Agent SDK/bridge experiments to direct `claude --print`; Archivista renamed                                                                                                                                     |
| April            | Gmail push/classification, modern data model, procurement, booking, webhook reliability                                                                                                                                              |
| May              | token efficiency, push cleanup, Chaos pipeline and reconciliation                                                                                                                                                                    |
| June             | auth failover, proposal reply/follow-up, self-healing, entity-keyed Slack threading, machine/storage work                                                                                                                            |
| 5 July           | lesson recovery, Sales knowledge reconciliation, program-fact drift protection                                                                                                                                                       |
| 6 July           | grader reliability/calibration, autonomy trust ladder, warm container LRU/adoption/resource/status work                                                                                                                              |
| 23–28 July       | shared Claude/Codex change protocol; email-content guard; schedule and knowledge regeneration; durable follow-up suppression; canonical Slack lead threads; attachment extraction; approved-send watchdog; continuity reconciliation |

The latest archived handoff found was dated 2026-07-05; the root `HANDOFF.md`
is older. Later commits resolved at least some open items from that handoff,
including four Sales knowledge contradictions. Always check later history.

### Git topology at the 2026-07-21 snapshot

- branch: `main`;
- local HEAD: `1d14730`;
- local branch: 40 commits ahead of `origin/main`;
- `origin`: personal GitHub fork;
- `upstream`: public NanoClaw repository.

This means “push”, “update from upstream”, and “deploy current” are three
different operations. Use `.claude/skills/update-nanoclaw/SKILL.md` for the
upstream merge procedure and preserve local customizations.

## 19. Historical working-tree snapshot (2026-07-21)

At that investigation time, `git status` reported 102 changed paths:

- 85 tracked modifications/deletions;
- 17 untracked paths;
- changes span runtime source, tests, group prompts, knowledge, schemas/tools,
  and operations assets;
- one tracked cleanup script is deleted;
- new work includes IPC filtering, token handling, AI-tell detection,
  follow-up-drop handling, grader assets, and healer Gmail liveness;
- untracked backups include a build backup, `.stignore` backup, and VPS/n8n
  database/workflow exports.

All of those pre-date this map and are user-owned. They were not reformatted,
staged, reverted, or incorporated into a cleanup.

The untracked VPS database/workflow backups are an accidental-commit risk and
may contain sensitive operational data. Inspect and move/ignore them through a
separate explicit decision; do not open, publish, or delete them casually.

### Reconciliation checkpoint on 2026-07-28

- current branch: `codex/continuity-reconciliation`;
- base: `a6e4b13`;
- review checkpoint: `157cb1b`;
- the July 23–28 batch, continuity system, named group operating support, and
  ordered business migrations are committed;
- the branch is not yet pushed;
- Claude validation of the checkpoint is pending explicit approval to send an
  email/path-redacted private-code patch to the Claude API.

## 20. Known drift, risks, and open decisions

### P0: secrets and production safety

- Local `.env` files, session state, browser profiles, OAuth material, service
  accounts, database dumps, and MCP settings are sensitive.
- Untracked VPS/n8n backups are not covered by an obvious repository ignore.
- The project can send email/messages and modify business systems from a local
  dev process when real credentials are available.
- Prompt approval rules must remain backed by host enforcement and durable
  approval records.
- A read-only production check on 2026-07-30 verified that the dedicated
  Procurement Chrome service and both its loopback and shared Apple Container
  gateway CDP endpoints were live. The dedicated profile protects unrelated
  browser state, but every agent VM can still reach the unauthenticated bridge.
  The evidence, business-funnel diagnosis, and isolation-or-retirement decision
  are recorded in `docs/PROCUREMENT-RESURRECTION-PLAN.md`.
- `NC-20260730-003` implemented the first resurrection slice:
  migration 114, deterministic CaleProcure normalization, exact-message email
  intake, an immutable observation/run ledger, a bounded review queue, and
  optimistic host-only review transitions.
- `NC-20260730-004` extends that slice with a
  default-off typed CaleProcure batch IPC and host-generated Slack cards.
  Decisions require an exact command in the bound card thread from a configured
  Slack UID and atomically consume the card/version/epoch. Migration 114 and the
  isolated host/runner/prompt release were deployed to the production Mac Mini
  on 2026-07-30. RLS preserves direct legacy access only for source-keyless
  Bonfire rows; source-keyed CaleProcure/email rows are host-owned. Both gates
  remain off with no owner IDs or epoch; the schedule, browser, 309 legacy rows,
  and submission boundary were not changed.
- `NC-20260809-003` migration 115 and immutable releases `9aa23b4e7c39` and
  `ba726e7cbda0` are
  deployed in collection-only validation. Migration 115 makes a bound
  `process` decision create one pursuit transactionally,
  keeps every active/overdue pursuit visible, associates repeated observations
  with each exact source run, requires per-unit coverage receipts, and uses an
  acknowledged alert outbox that retries undelivered Slack alerts and re-alerts
  time-driven conditions daily. Named-human success receipts are inserted into
  that outbox in the same transaction as the decision or pursuit event and are
  routed only to the bound Slack thread; no post-commit failure can report the
  action as unrecorded. Host alert posts use `SlackChannel.postTracked`;
  their persisted bot/no-`from_group` shape is suppressed by the existing
  bot-noise spawn guard. `proposal_ready` and `submitted` remain unreachable
  until the separate typed packet/receipt migration. Two natural CaleProcure
  canaries returned scheduler success without a source-run receipt and are
  explicitly rejected as business successes. An operator-assisted public-row
  canary proved only the adapter/database path with nine planned/observed units
  and zero missing. The Claude-R8-reviewed follow-up binds scheduled IPC writes to a
  host-owned per-task token, buffers final text until that exact receipt
  validates, verifies the release adapter/unit contract, atomically claims due
  work, and fails restart-orphaned one-time tasks loud. Collection is enabled;
  review remains off until a natural receipted canary passes. R8 returned `GO`
  for an immutable collection-only release and third natural canary after the
  read-only live-schema predicate precheck; pinned Node 22.23.2 passes the full
  152-file / 1,980-test host suite and the independent 4-file / 29-test runner
  suite.
  The precheck and immutable activation passed, but the third natural canary
  exposed a separate browser-procedure failure: source run 5 was correctly
  bound to its task and reported all nine units observed, yet returned zero
  opportunities and missed the current positive control. Direct public-browser
  reproduction proved that filling `Event Name` does not execute a search;
  CaleProcure requires clicking the visible `Search` button, after which
  `facilitation` shows event `0000039985`. Hidden duplicate summaries/rows can
  coexist with the visible result. The tracked procedure therefore requires
  explicit `Clear Criteria` / fill / `Search` actions and visible-only result
  proof. Review remains off until that correction is independently reviewed,
  installed byte-exact, and a natural positive-control canary passes.
  Claude R9 found three remaining procedure-contract gaps: Step 4 still
  equated observation with page load, visible selection lacked a snapshot-ref
  method, and `partial` prescribed an in-run retry that cannot converge with a
  task-bound token. The corrected procedure now closes all three and uses the
  portal-native exact department lookup followed by a clean detail-page match
  to verify business unit/event identity. It never maps agency name directly to
  a source key.
  R9 also verified that the release archive covered `groups/` but omitted the
  delegated `knowledge/` bytes. The release builder now packages tracked
  `knowledge/`, and `container-runner` mounts
  `knowledge/agents/<group>` from the verified active code root read-only when
  present, suppressing every normalized mutable configured alias of the same
  target. Older releases fall back to the configured mount so rollback remains
  viable. Claude R10 found and closed the raw-target alias gap (`''`,
  `knowledge/`, and `./knowledge`) and otherwise accepted the R9 procedure and
  release-integrity repairs. Claude R11 returned `GO` after independently
  exercising the resolution boundary and focused gates; immutable
  collection-only deployment and a fourth natural canary may proceed while
  review remains disabled.
  Release `ec62c3003aaa` then activated successfully and is the first live
  archive-attested procedure, but its fourth natural canary timed out after
  1,235,396 ms with no result or source receipt. The configured 900,000 ms
  timeout was not effective because the runner floors it at
  `IDLE_TIMEOUT + 30,000` (1,230,000 ms on production). With four natural
  browser outcomes failed, direct public-browser success, and an
  operator-assisted adapter success, the browser acquisition layer remains
  unvalidated. Review stays off; do not add timeout or prompt retries before a
  deterministic host-owned CaleProcure collector is designed and reviewed.
  That replacement is now implemented and Claude R14-approved for commit and
  shadow deployment. It is a host job from the immutable release, uses the
  daemon's pinned Node runtime, connects only to the dedicated loopback CDP
  origin, and ingests through `ingestCaleProcureRows`; it does not delegate
  portal navigation to a model or container. Visible result-state transitions,
  count/row reconciliation, portal-directory business-unit mapping, exact
  detail identity, a 200-row pre-detail budget, per-unit diagnostics, partial
  receipts, and abort/tab cleanup are enforced in code. The prior Procurement
  container bridge and Bonfire credential injection are retired; Bonfire and
  attachment acquisition are paused pending separate deterministic adapters.
  The registered daily collector defaults off. Shadow deployment must prove
  three self-exiting 9/9 runs, positive control `3820/0000039985`, differing
  query totals, and no tab growth before one review-off live collection. Review
  activation remains a later owner decision after two scheduled live runs on
  different days.

### P1: reproducibility and source ownership

- Named group support files and ordered `business_v2` migrations are
  Git-tracked; the continuity checker enforces that state.
- Runtime databases, schedules, auth/session state, job definitions, and other
  ignored live state still require an explicit export/recreation plan.
- The July 23–28 implementation batch is committed at `157cb1b`; Claude review
  and a branch push remain before it is cross-machine authority.

Decision needed: define an explicit portable-configuration package containing
non-secret prompts, workflows, schemas, job definitions, and knowledge sources,
while keeping secrets and volatile runtime state excluded.

### P1: documentation/implementation drift

- Some documents say “Claude Agent SDK”; active code executes Claude CLI print
  mode.
- Upstream README/features describe multiple channels; only Gmail and Slack are
  currently imported.
- Some architecture/setup wording suggests runtime swapping or Docker; the
  fork hard-codes Apple Container.
- `.env.example` does not cover the current configuration surface and carries
  stale runtime-neutral wording/defaults.
- `MANIFEST.md` and older handoffs contain statuses superseded by later code or
  local registration state (for example, Grader is registered locally).
- Documented external mount roots can drift from actual `registered_groups`
  configuration; Grader is one observed example.

### P1: verification baseline

- Interactive shells can ignore `.nvmrc`; validation must explicitly activate
  Node 22 before installing/rebuilding native dependencies or interpreting
  failures. CI reads `.nvmrc`.
- Native modules must be rebuilt after Node changes.
- `NC-20260728-005` restored the green root baseline: 124 files / 1,595 tests.
- Tests that bind local TCP/IPC listeners require an execution environment that
  permits those listeners; a sandbox `EPERM` must be rerun with that permission
  before it is classified as a regression.

### P2: architectural complexity

- The original small-core goal now coexists with a very large composition root
  and many host-side business automations.
- SQLite, PostgreSQL, Markdown knowledge, job JSON, group support files,
  third-party state, and Slack threads can each claim part of workflow truth.
- Warm/adopted containers improve latency and resilience but increase lifecycle
  state that must be reasoned about during restart and deploy.
- Healer and autonomy features can become self-modifying/high-impact if live
  toggles and approval boundaries are not independently verified.

### P2: historical residue

- Target, superseded, and current architecture documents coexist without a
  universal status header.
- Backup and sync-conflict files can be mistaken for authority.
- Dormant dependencies and skills can make inactive channels appear active.
- Local database next-run timestamps and registration rows can look current
  long after the daemon snapshot became stale.

## 21. Documentation index

| Document                                  | Use                                                                                             | Caution                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                               | current repository operations and conventions                                                   | verify implementation-specific claims                                                                                                                                                             |
| `AGENTS.md`                               | Codex entry point                                                                               | intentionally delegates to Claude sources                                                                                                                                                         |
| `docs/PROJECT-MAP.md`                     | reconciled cross-client map                                                                     | dated snapshot, not live status                                                                                                                                                                   |
| `docs/CHANGE-PROTOCOL.md`                 | required Claude/Codex change, evidence, and handoff contract                                    | update when the shared workflow changes                                                                                                                                                           |
| `docs/ACTIVE-WORK.md`                     | current task ownership, overlap, state, and next action                                         | must remain concise and current                                                                                                                                                                   |
| `docs/ENGINEERING-CHANGELOG.md`           | append-only implementation/verification/deployment history                                      | evidence only; do not overstate boundaries crossed                                                                                                                                                |
| `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`     | active, dependency-gated strategic roadmap                                                      | roadmap state is not implementation state; use active work/changelog evidence                                                                                                                     |
| `docs/COMPANY-OS-WORK-LEDGER.md`          | Mailman/Sales work-ledger decision, state, receipt, shadow, and activation contract             | SQLite remains email authority; migration/release/shadow state is tracked under `NC-20260816-001`; promotion remains separate                                                                     |
| `docs/COMPANY-OS-JOB-LEDGER.md`           | Campanero host-job run identity, state, receipt, privacy, and activation contract               | NC-017 is deployed/live-verified for one five-run window; SQLite remains authoritative and there is no daemon/scheduler wiring                                                                    |
| `docs/COMPANY-OS-GMAIL-RECONCILIATION.md` | inbound Gmail history-expiry source, full-snapshot, accounting, refusal, and promotion contract | NC-005/006 are deployed but unwired; NC-008/009 receipts are live; NC-010's retained-host production audit is complete but not mailbox-complete; production cursors/404 behavior remain unchanged |
| `docs/ACTION-SAFETY-CONTROL.md`           | host action envelope, safety precedence, covered boundaries, and activation/drill transaction   | seven-system boundary through Things is live-proven in exact release `47019c9` under `NC-20260816-009`; controls remain default-off and residuals explicit                                        |
| `docs/CAPABILITY-MANIFESTS.md`            | per-agent manifest mechanics, review procedure, activation gate, and limitations                | Campanero and Booking selective canaries are live under `NC-20260816-006`/`010`; global rollout, egress, remaining raw-secret removal, and wider canaries remain open                             |
| `docs/RELEASE-INTEGRITY.md`               | production build, activation, health, and rollback contract                                     | archive integrity is not publisher authenticity                                                                                                                                                   |
| `docs/PROCUREMENT-RESURRECTION-PLAN.md`   | verified Procurement history, current recovery state, and target loop                           | migration 115 is deployed collection-only; natural source-run proof, review closure, and the separately reviewed proposal packet remain open                                                      |
| `docs/SELF-HEALING-COMPLETION-PLAN.md`    | reconciled healer current state and gated completion sequence                                   | action-boundary source is local until separately reviewed/deployed                                                                                                                                |
| `docs/REQUIREMENTS.md`                    | original product principles                                                                     | intent, not feature inventory                                                                                                                                                                     |
| `docs/ARCHITECTURE.md`                    | broad bespoke architecture                                                                      | some SDK terminology is stale                                                                                                                                                                     |
| `docs/SPEC.md`                            | core behavior specification                                                                     | reconcile with fork extensions                                                                                                                                                                    |
| `docs/DATA-MODEL.md`                      | business model                                                                                  | inspect live PostgreSQL schema                                                                                                                                                                    |
| `docs/SECURITY.md`                        | threat/security model                                                                           | verify host guards and current mounts                                                                                                                                                             |
| `docs/CONTAINER-ARCHITECTURE.md`          | container lifecycle target/recent design                                                        | history includes rejected phases                                                                                                                                                                  |
| `docs/APPLE-CONTAINER-NETWORKING.md`      | Apple networking operations                                                                     | environment-specific                                                                                                                                                                              |
| `docs/MINION-FRAMEWORK.md`                | agent framework                                                                                 | concrete group prompts are role authority                                                                                                                                                         |
| `docs/WEBHOOK-RELIABILITY.md`             | durable webhook design                                                                          | verify tables and current reaper wiring                                                                                                                                                           |
| `docs/PROPOSAL-FOLLOWUP-DESIGN.md`        | proposal cadence and approval                                                                   | verify current store/actions                                                                                                                                                                      |
| `docs/SALES-FOLLOWUP-OPERATING-MODEL.md`  | unified Sales/proposal/receivables ownership, eligibility, cadence, rejection, receipts, and rollout gates | NC-20260821-002 pauses the broken Sales task and live-deploys an unwired pure policy plus empty/admin-only migrations 130-131/store; policy v2 makes exact Sales rejection terminal but adds no source adapter, presentation, pipeline mutation, draft, approval, or customer action |
| `docs/SELF-HEALING-*.md`                  | healer phases/target behavior                                                                   | enabled state is environment-dependent                                                                                                                                                            |
| `docs/gmail-pubsub-setup.md`              | Gmail push setup                                                                                | cloud/VPS state must be rechecked                                                                                                                                                                 |
| `MANIFEST.md`                             | ownership and recent-shift overview                                                             | currently modified; some statuses stale                                                                                                                                                           |
| `HANDOFF.md`, `handoffs/*`                | dated work context                                                                              | chronological evidence only                                                                                                                                                                       |

Historical/alternate architecture files (`nanoclaw-architecture-final.md`,
`nanorepo-architecture.md`, `business-agents-architecture.md`, plans, SDK deep
dives) should be given explicit status before future reliance.

## 22. Safe change workflow

### Before changing

1. Read root instructions, this map, `docs/ACTIVE-WORK.md`,
   `docs/CHANGE-PROTOCOL.md`, the latest relevant engineering-changelog entry,
   relevant group prompt, relevant current design, and actual source/schema.
2. Register or continue a stable `NC-YYYYMMDD-NNN` task before the first edit.
3. Capture branch, HEAD, worktree status, Node version, and target environment.
4. Identify pre-existing overlapping changes and their owner/client.
5. Classify the work as analysis, local code change, data migration,
   integration change, deployment, or live business action.
6. Define rollback and evidence before any external-state change.

### While changing

1. Keep the patch scoped and preserve unrelated dirty files.
2. Add/update focused tests at the enforcing boundary.
3. For schema changes, use forward migration, backfill, compatibility window,
   validation, and rollback/restore plan.
4. For outbound actions, test rejection and idempotency as well as success.
5. For group behavior, update its canonical prompt/support files and verify
   those files are actually portable.
6. For runtime lifecycle, test cold start, warm follow-up, concurrency pressure,
   restart/adoption, timeout, and shutdown.

### Definition of done

- correct Node version and native dependencies;
- focused tests pass;
- typecheck passes;
- full relevant suite passes or every unrelated failure is evidenced;
- no new secrets, dumps, sessions, generated output, or runtime state in Git;
- source, schema, prompts, and current docs agree;
- deployment health and safe end-to-end behavior verified when deployed;
- rollback remains possible;
- active-work status and engineering changelog reflect the exact boundary
  reached: uncommitted, committed, migrated, deployed, live-verified, or
  outcome-validated;
- a dated handoff records unresolved work if the change is not complete.

## 23. Fresh-machine and cross-Mac checklist

Do not copy the entire working directory. Build an explicit manifest:

### Portable through Git

- tracked source, tests, prompts and named group operating support, docs, setup
  code, ordered `business_v2` migrations, and skills;
- intended commit history and branch;
- lockfiles and Node pin.

### Export separately after review

- job and webhook definitions without credentials;
- non-generated knowledge sources;
- mount allowlist template with target-machine paths;
- a current handoff and service topology;
- database backups made with database-aware tools, encrypted and access-limited.

### Recreate per machine

- `.env` and secret stores;
- Claude/Gmail/Slack OAuth sessions;
- MCP/local permission settings and absolute paths;
- Apple Container runtime/image;
- launchd/systemd registration;
- external repository checkouts and OneDrive/Obsidian roots;
- PostgreSQL connectivity and least-privilege roles;
- local SQLite runtime state unless performing a deliberate migration.

### Never sync as ordinary files

- active SQLite database/WAL files;
- `data/ipc`, live session directories, logs, browser profiles;
- Claude auth/session state;
- raw database dumps in the repository;
- node modules, build output, or container runtime state.

### Acceptance test on the target

1. confirm Node 22 and clean dependency install;
2. typecheck and tests;
3. build host and agent image/runner;
4. verify mount allowlist and no secret mounts;
5. inspect SQLite and PostgreSQL schemas;
6. start in a safe/test mode;
7. verify health, Slack, Gmail, and one inert/read-only agent turn;
8. verify one approval-gated draft without sending;
9. verify jobs/reapers without duplicate dispatch;
10. document machine-specific differences.

## 24. Investigation coverage

This map was produced from:

- root `CLAUDE.md` and every active `groups/*/CLAUDE.md`;
- the local business `CLAUDE.md`, role support guides, and identified backup
  prompts as historical evidence;
- all `.claude/skills/*/SKILL.md` procedure surfaces and applied-skill state;
- root requirements, architecture, security, data, container, webhook,
  proposal, Gmail, healer, and minion documentation;
- source/test inventory and key composition, routing, container, channel,
  database, IPC, scheduler, autonomy, healer, and integration code;
- SQLite schema and aggregate operational inventory;
- tracked/untracked/ignored file boundaries and sync rules;
- Git remotes, branch divergence, recent history, and dated handoff headings;
- local typecheck and test runs under the disclosed Node version.

Sensitive runtime Claude session JSON and credential-bearing files were
identified structurally but not reproduced or treated as project instructions.
Large generated/vendor/build artifacts were inventoried, not read as source.

## 25. Glossary

- **Group/minion:** role-specific agent folder and registered routing target.
- **Main group:** privileged administrator conversation.
- **JID:** channel-specific chat identifier used as a routing key.
- **Work unit:** group plus root/thread identity used for queue/container scope.
- **Warm container:** finished agent process/container retained briefly for a
  low-latency follow-up.
- **Adopted container:** detached work reclaimed by a restarted host daemon.
- **IPC:** structured file/MCP requests crossing agent-to-host boundary.
- **Scheduled task:** prompt-driven group execution.
- **Host job:** direct registered script execution.
- **Classification:** email label/routing pipeline, distinct from CRM pipeline.
- **Business v2:** current PostgreSQL business-domain namespace/model.
- **Handoff:** dated context checkpoint, not necessarily current authority.
- **Skill:** a Claude Code procedure that can add/change capability; availability
  does not imply installation.
