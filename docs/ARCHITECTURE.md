# NanoClaw Architecture

Complete system map. For operational reference (commands, DB queries, troubleshooting), see [../CLAUDE.md](../CLAUDE.md). For design rationale, see [REQUIREMENTS.md](REQUIREMENTS.md).

---

## System Overview

Single Node.js process orchestrating Claude Agent SDK containers. Each agent group runs in an isolated Apple Container (macOS 26) with its own filesystem, memory, and tools.

```
                         ┌─────────────────────────────────────────────┐
                         │              NanoClaw Host                  │
                         │            (node dist/index.js)             │
                         │                                             │
  ┌─────────┐            │  ┌──────────┐   ┌────────────┐             │
  │  Gmail   │──push/──▶ │  │  Gmail    │   │   Slack    │             │
  │  Pub/Sub │  poll     │  │  Channel  │   │  Channel   │             │
  └─────────┘            │  └────┬─────┘   └─────┬──────┘             │
                         │       │               │                     │
                         │       ▼               ▼                     │
                         │  ┌────────────────────────────┐             │
                         │  │     Message Loop            │             │
                         │  │  (poll DB → enqueue →       │             │
                         │  │   spawn container)          │             │
                         │  └────────────┬───────────────┘             │
                         │               │                             │
                         │  ┌────────────▼───────────────┐             │
                         │  │      GroupQueue             │             │
                         │  │  (concurrency limit,        │             │
                         │  │   liveness, circuit breaker) │             │
                         │  └────────────┬───────────────┘             │
                         │               │                             │
                         │     ┌─────────▼─────────┐                   │
                         │     │  Container Runner  │                   │
                         │     │  (Apple Containers) │                   │
                         │     └─────────┬─────────┘                   │
                         │               │ stdin/stdout JSON           │
                         │     ┌─────────▼─────────┐                   │
                         │     │    IPC Watcher     │                   │
                         │     │  classify_* gmail_* │                   │
                         │     │  learn_*           │                   │
                         │     └───────────────────┘                   │
                         └─────────────────────────────────────────────┘
```

**Runtime:** Mac Mini (`mini-claw`, Tailscale `100.115.115.206`), managed by launchd (`com.nanoclaw`).

---

## Message Flow

### Inbound (Slack / Gmail)

```
Channel.onMessage() → storeMessage(msg) → messages.db
    ↓
Message Loop (POLL_INTERVAL) polls getNewMessages(registeredJids)
    ↓
Group by (chat_jid, thread_ts)
    ↓
Try pipe to active container → if wrote, advance cursor, done
    ↓
Check trigger requirement → if needed and missing, skip (accumulate)
    ↓
Check circuit breaker → if open, defer
    ↓
Post configured host `[PROCESSING]` receipt in the work thread
    ↓
GroupQueue.enqueueMessageCheck(chatJid, threadTs)
    ↓
processGroupMessages() → getMessagesSince() → formatMessages()
    ↓
runContainerAgent(group, prompt) → container stdin JSON
    ↓
Agent output → channel.sendMessage(chatJid, text)
```

The processing receipt is attempted and awaited before queue insertion. Its
duplicate marker is recorded only after channel delivery succeeds; if that
attempt fails, the spawn path retries instead of treating an error as a visible
acknowledgment. Sales startup configuration fail-closes unless every Sales
group uses per-message work threads and the exact `Generating response…`
receipt. This makes a newly accepted handoff visible while model generation is
still running without spending model tokens on status narration.

### Gmail Classification Bypass (Pre-LLM Fast Path)

Gmail emails go through an additional pre-processing step in `fetchAndProcess()` before reaching the message loop:

```
Gmail API message
    ↓
Skip SENT / DRAFT / SPAM / TRASH
    ↓
Parse the exact message's visible To/Cc headers; derive a bounded reply-all
candidate list excluding the primary sender and configured Tandem mailboxes
    ↓
Hard filter check (hard-filters.json) → drop if matched
    ↓
Rules runner (mature classification_rules DB entries, 60s cache) → if match:
    ├─ handleClassifyLabelWrite() → store + label + auto-rule
    ├─ isAutoArchiveLabel? → skip mailman, done
    └─ persist exact inbound → routeClassifiedEmail() → dispatch to sales/chief/minion
    ↓ (no rule match)
onMessage() → normal message loop → mailman container
    ↓
Mailman classifies → classify_label_write IPC
    ↓
handleClassifyLabelWrite() → store + label + auto-rule + routeAfterClassify()
```

### Outbound

Agents emit IPC files. Host dispatches by type:
- `gmail_send` / `gmail_reply` → `gmail-ipc-handlers.ts` → Gmail API → apply MrGru label
- every Gmail MCP request carries its runner-owned `source_container`; async
  results return through the matching active `GroupQueue` work unit rather than
  a shared group input file; these ephemeral results are deliberately excluded
  from chat-cursor dead-letter rollback because the chat database cannot
  reproduce them;
- the Gmail tool's legacy `lead_id` is only a canonical Party-ID hint; host
  recipient/thread resolution is authoritative, and final To/CC membership
  checks remain mandatory;
- for a durable approved action, the host treats Mailman's call as execution
  intent and reconstructs To, ordered visible CC, subject, body, Gmail thread,
  Action-ID, rendering mode, Party hint, and email type from the exact stored
  approval card before claim; Chief fallbacks carry Mailman's required
  `[APPROVED-REPLY]` marker;
- inbound visible `To`/`Cc` and a maximum-ten normalized
  `Reply-All-Candidates` list are host-derived context for direct and
  classified routes. BCC is never exposed. Forwarded inquiries suppress this
  context because their visible envelope belongs to Tandem's internal forward;
- Sales or Chief may place candidates on an approval card only when the latest
  external sender explicitly requests copy/reply-all/continued participation,
  or Alex/Cherie explicitly directs it in that exact Slack work thread. At
  execution the host re-reads Gmail's latest external message and rejects an
  approved out-of-Party CC that is no longer an exact visible participant;
- scheduled Sales follow-up cards use the same exact-card action path, while
  host-generated proposal follow-ups claim and confirm the same ledger directly
  from their PostgreSQL draft row;
- a parseable approval card is checked with the same deterministic content
  policy before Slack presents it for approval and again when the approval is
  observed; content that Gmail would reject cannot receive an Action-ID. The
  pre-Slack rejection is also returned through the exact originating container
  work unit so Sales corrects and reposts instead of treating the IPC queue
  acknowledgement as posting success;
- Agent `result` → `channel.sendMessage()` → Slack/Gmail

---

## Channels

### Gmail (`src/channels/gmail.ts`)

- **JID:** `gmail:info@tandemcoaching.academy`
- **Group:** `mailman` (auto-registered, `requiresTrigger: false`)
- **Mode:** Push (Pub/Sub via n8n) + safety poll (10 min fallback)
- **Label trigger:** `MrGru` — only messages with this label are polled
- **Thread reply detection:** `pollThreadReplies()` scans MrGru-labeled threads for unlabeled replies (Gmail labels are per-message, not per-thread). Only runs in legacy poll mode, NOT in push mode.
- **Outbound labeling:** `applyLabel()` in `gmail-api.ts` adds MrGru label to every sent message so replies route back
- **Visible-recipient context:** exact bounded `Visible-To`, `Visible-Cc`, and
  `Reply-All-Candidates` fields travel with the host handoff. They are evidence,
  not reply-all authority; BCC and internal-forward envelopes are excluded.
- **Attachments:** the inbound manifest exposes only bounded sanitized metadata.
  An exact authorized `gmail_read(messageId)` may ask the host to reload that
  message and process its MIME leaves. Attachment IDs, bytes, credentials,
  download URLs, and temporary paths remain host-private. The host enforces
  count/size/type/magic/archive/encryption/OCR/extraction limits, deletes all
  temporary bytes, persists content-minimized receipts, and returns only
  bounded text inside an `untrusted_attachment` wrapper or an explicit held
  state. See `docs/GMAIL-ATTACHMENT-CLOSED-LOOP.md`.
- **Dedup:** `processedIds` Set (capped at 5000, oldest 1000 pruned)
- **Push architecture:** `gmail-push.ts` processes history deltas (`messagesAdded` events). On `HistoryExpiredError` (>7 days stale), resets baseline and accepts data loss window.

### Slack (`src/channels/slack.ts`)

- **SDK:** Bolt framework, Socket Mode (no public URL needed)
- **Events:** `GenericMessageEvent`, `BotMessageEvent`
- **Chunking:** Messages >4000 chars split across multiple `chat.postMessage` calls
- **Attachments:** text/documents are inlined or converted; supported raster
  images are signature-validated and staged under the destination group's
  host-owned inbound tree, exposed to the minion through an exact read-only
  `/workspace/ipc/inbound/...` path
- **Health monitor:** Periodic `auth.test` + WebSocket staleness detection → auto-reconnect

### Registration (`src/channels/registry.ts`)

Channels self-register when their module is imported. `channels/index.ts` is the barrel file. Each channel implements the `Channel` interface: `connect()`, `sendMessage()`, `isConnected()`, `ownsJid()`, `disconnect()`.

---

## Email Classification Pipeline

### Taxonomy

25+ labels under `MrGru/*` stored in `classification_taxonomy` (Postgres). Key categories:

| Prefix | Labels | Auto-archive | Hive share |
|--------|--------|:---:|:---:|
| `lead/*` | inquiry, offer | No | alex+cherie |
| `client/*` | active, dormant | No | alex+cherie |
| `financial/*` | bill, refund, receipt | receipt only | cherie |
| `vendor/*` | warm, cold | cold only | cherie |
| `meeting-assets/*` | recording, zoom | zoom only | alex |
| `newsletter/*` | general, digest | Yes | — |
| `notification/*` | system, monitoring, calendar | system only | alex (monitoring) |
| `procurement/*` | rfp, rfq | Yes | alex+cherie |
| `internal/*` | cofounder | No | alex+cherie |
| `legal/*` | contract, notice | No | alex+cherie |
| `recruiting/*` | applicant, outreach | outreach only | cherie |

### Classification Rules (`classification_rules` table)

Four pattern types, evaluated in priority order:

1. `sender_exact` — exact email match (fastest, most rules)
2. `header_match` — `header-name:value` substring match
3. `sender_regex` — regex against sender email
4. `subject_regex` — regex against subject line

Sources: `auto` (confidence ≥ 0.9 creates a probationary `sender_exact` rule
only for auto-archive labels), `lesson` (chief corrections), `seed` (operator
CLI), `manual`. Rules with a future `probation_until` are not active. `Re:`,
`Fwd:`, and `Fw:` subjects suppress sender-only rules so a human-carried
conversation is always classified from its content.

In-memory cache with 60s TTL (`classify-rules-runner.ts`).

### Self-Learning Loop

```
Operator drags MrGru/* label in Gmail UI
    ↓
gmail-label-poll.ts (5-min cron) detects delta
    ↓
classify_correction_detected IPC → chief
    ↓
Chief calls route_lesson
    ↓
classify-backfill.ts relabels historical emails (cap: 25)
    + inserts new classification_rules entry
```

### Host Router (`host-router.ts`)

Dispatch table for classified emails:

| Label prefix | Action | Target |
|-------------|--------|--------|
| `lead/*` | `matchLead()` → if pipeline match: sales handoff; else: inbox handoff | mailman |
| `client/*` | Escalation | chief |
| `procurement/*` | host-normalized observation + exact-message handoff | procurement via mailman |
| `financial/bill` | Contador handoff | mailman |
| `financial/refund` | Escalation | chief |
| `meeting-assets/*` | Archivarista handoff | mailman |
| `legal/*`, `recruiting/*`, `internal/*` | Escalation | chief |
| Unrecognized | Fallback escalation | chief |

The Procurement route shown above is implemented locally by
`NC-20260730-003` but is not production-active until migration 114, the host
source, and the agent-runner are deployed together. Production remains on the
previous `classify_only` behavior until that explicit boundary is crossed.

### Release identity boundary

Production host code is compiled only from a clean committed tree by
`npm run release:build`. The generated manifest binds the complete `dist/`
file set to the Git commit/tree and exact Node version. `main()` verifies that
identity before initializing databases, channels, schedules, webhooks, or
containers; `/health` exposes it alongside runtime health.

The service uses an immutable release directory for `dist/`, container skills,
and agent-runner source while retaining the operational checkout as its working
directory for databases, sessions, logs, and writable group workspaces. Full
activation and rollback details, including the declared writable-prompt
residual, are in `docs/RELEASE-INTEGRITY.md`.

### Lead Matcher (`lead-matcher.ts`)

Two-step Postgres lookup:
1. `best_party_by_email(sender)` → party_id
2. `v_active_pipeline` join → stage in (new, qualifying, proposal, negotiating) AND `last_interaction_at > NOW() - 60 days`

Returns pipeline entry details + thread_id from most recent outbound interaction.

---

## Agent Groups

| Group | Purpose | Trigger | Key IPC types |
|-------|---------|---------|---------------|
| **main** | Mr Gru — personal assistant (Slack main channel) | `@Mr Gru` | — |
| **global** | Mr Gru — same agent, different JID | `@Mr Gru` | — |
| **mailman** | Email classifier + sender. Routes classified emails. | None (all gmail) | `classify_label_write`, `gmail_send`, `gmail_reply`, `gmail_search`, `gmail_read` |
| **inbox** | Triages inbound leads/inquiries for Tandem Coaching | None (IPC handoff) | `[HANDOFF: inbox→sales]` |
| **sales** | Drafts responses to qualified leads, gets human approval | None (IPC handoff) | `[HANDOFF: sales→mailman]` |
| **chief** | Coordination layer — escalations, corrections, weekly briefings | None (IPC escalation) | `classify_correction_detected`, `route_lesson` |
| **campanero** | Job scheduler manager — manages host-side cron jobs | `@Mr Gru` in job channel | — |
| **contador** | Accountant — Stripe payments, Google Sheets, database | None (IPC handoff) | payment webhooks |
| **archivarista** | Knowledge synthesis — cloud drive, meetings, briefings | None (IPC handoff) | — |
| **booking** | Processes Trafft booking events, hands off to sales | None (webhook) | — |
| **courses** | Course session recap emails — preview, edit, distribute | None (IPC handoff) | — |
| **certifier** | Certificate issuance via Sertifier API | `@Mr Gru` | — |
| **procurement** | Reviews public CaleProcure/email opportunities; legacy Bonfire scanner remains isolated pending a decision | `@Mr Gru` in procurement channel | bounded Procurement IPC plus legacy browser automation |
| **social** | LinkedIn posting orchestrator from blog content | Scheduled jobs | — |
| **newsroom** | Editorial pipeline — newsletters, social media | `@Mr Gru` | — |
| **heartbeat** | Receives diagnostic heartbeats. No agent response. | — | — |

Inactive/minimal: `gru-community`, `gru-solera`, `feature-requests`

Note: Slack channel `#gru-bookkeeper` (`C0AK1FD66MT`) is the front door for the **contador** minion — channel name reflects the role (bookkeeping), but the agent's folder, code, and registered group name is `contador` / `El Contador`. The empty `groups/gru-bookkeeper/` directory is just a log sink for that channel.

### Stripe payment/refund fulfillment boundary (`NC-20260823-006`)

The `stripe-payment` webhook remains a deterministic host path with no agent
container or LLM. Before any Sheets/PostgreSQL/roster mutation, the host
resolves a Checkout Session to its canonical Payment Intent and commits one
privacy-minimized `business_v2.contador_payment_fulfillment_cases` row keyed by
Stripe account plus Payment Intent. Append-only aliases bind provider event,
Checkout, charge, invoice, and refund IDs to that case.

The release-owned processor returns private stage results only after exact
Payment Log, `public.payments`, and mapped-roster readback. The host then commits
append-only stage receipts and transitions the case to `complete` or a durable
`needs_student`, `needs_product`, `write_failed`, or `needs_review` exception.
Only after that transaction may `webhook_inbox` become `handled`, with its
`related_entity` bound to the exact case/version. A verified complete replay
does not rerun external writes. A persisted five-minute lease spans the
120-second processor: overlapping delivery remains retryable without a second
child, and only an expired lease may create the next case version. Refunds
cannot complete in this slice; they
remain `needs_review` until refund/student-fulfillment evidence exists.

This is operational fulfillment, not accounting. Case state omits names,
email, product text, amounts, cards, raw webhook content, and accounting facts;
Bizmgr and manual QuickBooks procedures retain their existing authority.

---

## Container Isolation

### Runtime

Apple Containers (macOS 26). Runtime abstracted in `container-runtime.ts` — swappable between Docker and Apple Container via `$CONTAINER_RUNTIME`.

### Container Runner (`container-runner.ts`)

1. Copies `~/.claude/.credentials.json` into `data/sessions/{group}/.claude/`
2. Writes snapshots: tasks, jobs, available groups
3. Builds mount list from group config + `mount-security.ts` allowlist
4. Spawns container: `container run -i --rm --name nanoclaw-{group}-{ts} ...`
5. Pipes prompt to stdin as JSON, reads results from stdout
6. Streams results to `onOutput` callback

Each group also receives a host-owned inbound-artifact overlay at
`/workspace/ipc/inbound`. It is mounted read-only after the writable group IPC
mount so channel evidence such as Slack screenshots cannot be replaced by the
container that is asked to inspect it.

### Agent Runner (`container/agent-runner/`)

Inside the container:
- Entry: `src/index.ts` — reads stdin JSON, invokes Claude Agent SDK
- IPC: `src/ipc-mcp-stdio.ts` — exposes IPC tools as MCP tools (gmail_send, gmail_reply, etc.)
- Hooks: `hooks/pre-compact-archive.js` (save conversation on context compact), `hooks/sanitize-bash.js`
- Session persistence: `data/sessions/{group}/` mounted at `/home/node/.claude`

### Mount Security (`mount-security.ts`)

Allowlist-based. Each group declares its mounts in registration config. `mount-security.ts` validates all mounts against the allowlist before container launch. Rejects paths outside approved directories.

---

## IPC System

### Write Path

`ipc-writer.ts` → writes JSON file to `data/ipc/{group}/messages/{timestamp}-{rand}.json`

### Watch Path

`ipc.ts` watches `data/ipc/*/messages/` directories. On new file:
1. Parse JSON
2. Route by `type` prefix:
   - `classify_*` → `classify-ipc-handlers.ts`
   - `gmail_*` → `gmail-ipc-handlers.ts`
   - `procurement_*` → `procurement-ipc-handlers.ts` with directory-derived
     caller identity, a read-only queue, default-off CaleProcure intake, and
     host-generated review cards
   - `slack_file_message` → `grader-file-message.ts`, accepted only from the
     registered main group or `chief` and fixed to the registered `grader`
   - `learn_*` → `learn-ipc-handler.ts`
   - Default: forwarded to target group as message

### Grader file delivery boundary

`mcp__nanoclaw__send_grader_file` and the shared toolbox adapter stage an exact
file under `data/ipc/<source>/attachments/` and emit `slack_file_message`.
The host derives source identity from that directory, rejects traversal,
symlinks, non-files, files over 25 MB, and size/hash mismatches, then snapshots
the bytes. It writes a durable pending receipt before posting one Slack root,
uploads the file into that root's thread with `filesUploadV2`, and persists the
inline-readable root only after upload success. The completed receipt records
the root timestamp; duplicate or uncertain keys never post automatically.

### Procurement review boundary

Migration 114 and `NC-20260730-003/004` define the undeployed replacement path:

1. the Procurement container extracts bounded public CaleProcure result rows;
2. the host validates, timestamps, hashes, deduplicates, and records the batch
   plus explicit source-run completion;
3. the minion reads the bounded queue and submits an advisory recommendation;
4. the host renders current database truth into one Slack card anchored by
   `procurement:opp:{id}` and records its channel, message, review version, and
   action epoch;
5. an exact `DECIDE` command in that card's thread is accepted only from a
   configured Slack UID; the database atomically claims the card and optimistic
   version, making stale cards and replays fail closed.

Both collection and review actions are off by default. No card state authorizes
registration, email, proposal commitments, submission, signature, attestation,
or terms acceptance.

### Handoff Pattern

Agents route work via structured handoff messages:

```
[HANDOFF: source→target]
[SOURCE: email|contact-form|slack]
Party ID: {N}
Name: {name}
Email: {email}
Message: {content}
```

The host-router writes these to the target group's IPC directory.

---

## Databases

### 1. SQLite: `store/messages.db`

Operational state. Schema: `agent_docs/messages-db-schema.md`

| Table | Purpose |
|-------|---------|
| `messages` | All inbound/outbound messages (id, chat_jid, sender, content, timestamp, from_group, thread_ts) |
| `router_state` | Key-value store (last_timestamp, last_agent_timestamp JSON, gmail cursors, history IDs) |
| `registered_groups` | JID → group mapping (name, folder, trigger, requiresTrigger) |
| `scheduled_tasks` | Cron tasks (schedule_type, schedule_value, status, next_run) |
| `sessions` | Container session IDs for conversation continuity |
| `chat_metadata` | Chat/channel metadata (name, last_message_time, is_group) |
| `tracking_pixels` | Email open tracking (tracking_id → lead_id, email_type) |
| `jobs` | Job registry state |
| `task_run_log` | Execution history for scheduled tasks |

### 2. SQLite: `data/business/business.db`

Legacy business data. Being replaced by Postgres. Still used by some older scripts.

### 3. Postgres: `nanoclaw_business`

Production business database. Schema: `agent_docs/nanoclaw-business-pg-schema.md`

**business_v2 schema (role-based access):**

| Table/View | Purpose |
|-----------|---------|
| `parties` | People/organizations (citext email, phone, metadata JSONB) |
| `party_emails` | Multi-email support per party |
| `party_roles` | Role assignments (lead, client, vendor, partner, internal) |
| `pipeline_entries` | Sales pipeline (party_id, program_slug, stage, assigned_to) |
| `interactions` | Activity log (channel, direction, summary, metadata with thread_id) |
| `engagements` | Client engagements (program, status, dates) |
| `documents` | Document references |
| `outbox` | Async work queue for cross-system sync |
| `v_active_pipeline` | View joining pipeline + party for lead matching |
| `best_party_by_email()` | Function: fuzzy email → party_id resolution |

**Classification tables:**

| Table | Purpose |
|-------|---------|
| `classification_taxonomy` | 25+ label definitions (label, hive_share_target[], auto_archive, priority) |
| `classification_rules` | Pattern-based pre-LLM rules (pattern_type, pattern_value, target_label, source, hit_count) |
| `email_classifications` | Per-message classification records (gmail_message_id, label, confidence, classifier_version) |
| `classification_backfill_pending` | Queued backfill operations from lesson pipeline |

**Other tables:** `payments` (Stripe), `procurement_opportunities`, `bookings` (Trafft).

**Roles:** `nanoclaw_admin` (DDL, full access), `nanoclaw_inbox` (read parties + write pipeline), `nanoclaw_sales` (read/write pipeline + interactions), `nanoclaw_contador` (payments).

### Relationship Context dark foundation (`NC-20260825-003`)

The local target adds one provider-neutral read control plane above
`business_v2.parties`:

```text
tracked adapter manifest + fact catalog
        -> bounded source refs / identity candidates / normalized facts
        -> ambiguity-safe Party resolution
        -> versioned section projections
        -> exact host grant + party_context_get
        -> content-minimized query receipt
```

Migration 137 creates scoped external references, temporal identifier claims,
identity exceptions, disabled adapter registrations, append-safe observations,
current projections, immutable query receipts, and dry-run-only Plutio
projection receipts. It grants only `nanoclaw_admin`. The fixture LMS adapter
has no credential or network surface and exists only to prove conformance.

`party_context_get` is stamped with directory group plus host run/container
identity and has no model-writable work ID. The host must already hold and
consume one exact work/subject/purpose/section grant; the global feature flag
also defaults off. Context never grants an external action.

NC-003 is committed and pushed. Exact live NC-004 adds a credential-free
Trafft host-ledger shadow. It reads only minimized source-bound interaction
fields, records exact appointment-reference observations, and emits
`needs_identity` without a Party projection because current emails are not
source-verified. It runs only under
`RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED=1`; query capability remains off.
The first live run is complete over 414 eligible appointments, all null-Party
and held, with zero projections; an exact replay produced 414 duplicates.
See `docs/RELATIONSHIP-CONTEXT-PRODUCTION-ROLLOUT.md` for deployment and live
verification gates.

Exact live NC-20260826-003 adds the first exact-identity reconciliation without
turning email into authority. A Trafft customer reference is eligible only for
a post-registration Party created by Trafft, with its first interaction inside
the Party's five-minute creation window, exactly one customer ID in that
window, and one canonical Party for that customer across the ledger. Later
appointment refs bind only when their canonical ledger Party agrees with the
exact customer ref. Booking identity resolution checks that exact customer ref
before preserving the existing email fallback. Exact rows append a new
`exact_reference` observation and current projection; legacy, shared,
ambiguous, or mismatched rows stay held. A host-only one-shot canary may consume
one exact Booking grant and return only status/count/receipt metadata for the
appointments section. Scheduled/group query capability remains off.
The live startup over 422 natural rows bound 2 customers/4 appointments,
created 4 current projections, retained 418 current-row holds, and reported
zero conflicts; a 422/422 replay made no changes. One host-only minimized read
delivered receipt 1. Global query and every scheduled/group consumer remain
off.

NC-20260826-004 adds two ordinary adapters without changing the Party,
observation, projection, query, or policy cores. The Plutio ledger adapter
imports stable existing person IDs. A private Encharge snapshot adapter accepts
only Party/email fingerprint/provider ID plus bounded consent states and
revalidates uniqueness against the live Party-email graph. Trafft may use those
verified refs as explicit lower evidence tiers; uncorroborated/conflicting
history becomes terminal `legacy`, never an inferred Party attachment.

### Tandem OS relationship-owner authority (`NC-20260826-001`)

Migration 138 adds a separate admin-only organizational-accountability layer:

```text
accepted owner decision
        -> Tandem OS principal (team:tandem, action authority none)
        -> exact append-only follow-up-lane assignment
        -> as-of host resolution
        -> lane-bound case provenance or fail-closed unresolved owner
```

The owner registry never supplies credentials, sender identity, approval, or
external-action authority. Policy requires exact assignment evidence before
actionable Sales/proposal/receivable work, while authoritative terminal source
facts may still close without it. Case persistence binds the lane, principal,
assignment ID, and decision reference under one composite foreign key.

---

## Job Scheduling

### Internal Jobs (`job-registry.ts`, `job-runner.ts`)

Jobs defined in `data/ipc/*/current_jobs.json`. Campanero agent manages them via Slack commands. `task-scheduler.ts` evaluates cron expressions and triggers execution.

### External launchd Jobs

| Service ID | Script | Schedule | Purpose |
|-----------|--------|----------|---------|
| `com.nanoclaw` | `dist/index.js` | Always on | Main NanoClaw process |
| `com.nanoclaw.watchdog` | `scripts/nanoclaw-watchdog.sh` | Every 120s | Health monitor + auto-restart |
| `com.nanoclaw.copy-people` | `scripts/copiers/copy_people.py` | Interval | Sync people data to vault |
| `com.nanoclaw.copy-chat` | `scripts/copiers/copy_chat.py` | Interval | Sync chat transcripts to vault |
| `com.nanoclaw.copy-email` | `scripts/copiers/copy_email.py` | Interval | Sync email data to vault |
| `com.nanoclaw.copy-calendar` | `scripts/copiers/copy_calendar.py` | Interval | Sync calendar to vault |
| `com.nanoclaw.clean-*` | `scripts/copiers/clean_*.sh` | Every 900s | Remove stale .lock files |
| `com.nanoclaw.commitment-*` | `tools/commitment/sync_from_vault.py` | Interval | Things 3 ↔ vault sync |
| `com.nanoclaw.procurement-browser` | `scripts/start-procurement-browser.sh` | Always on | Chrome for procurement scraping |
| `com.nanoclaw.transcript-watcher` | `scripts/transcript-worker.sh` | Always on | Process meeting transcripts |

---

## Infrastructure

### Machines

| Machine | Tailscale IP | Role |
|---------|-------------|------|
| **Mac Mini** (`mini-claw`) | `100.115.115.206` | NanoClaw host, Postgres, Claude Print Bridge |
| **Mac Studio** (`macstudio`) | `100.115.115.12` | Development, Claude Code sessions |
| **VPS** (`ai`) | `100.115.115.99` | n8n webhooks, LiteSpeed |

### Sync

Syncthing syncs NanoClaw source between machines. **Excluded from sync** (`.stignore`):
- `dist/` — must build on each machine separately
- `store/` — runtime SQLite state
- `data/business/business.db*` — legacy DB
- `node_modules/`

### External Services

| Service | Purpose | Integration point |
|---------|---------|-------------------|
| Gmail API | Email send/receive/labels | OAuth2 via `gmail-auth.ts` |
| Pub/Sub (`hive-gmail-push` topic) | Gmail push notifications | n8n → webhook-server |
| Hive Firestore | Shared email classification state | `hive-bridge.ts` via Firebase Admin SDK; final conversation mutations use the common host brake, and denied reaper work is held without consuming retries |
| Things bridge | Decision-brief promotion into Things on the Mac Studio | `brief-promote.ts` host HTTP POST; the final fetch is protected by the common host brake |
| Slack API | Chat channel | Bolt SDK, Socket Mode |
| Claude Agent SDK | Agent execution | Inside containers |
| Claude Print Bridge | External script → Claude calls | HTTP on Mini port 40960 |
| Stripe API | Payment processing | Webhooks via n8n → contador (see [WEBHOOK-RELIABILITY.md](WEBHOOK-RELIABILITY.md)) |
| Trafft API | Booking management | Webhooks via n8n → booking (see [WEBHOOK-RELIABILITY.md](WEBHOOK-RELIABILITY.md)) |
| Plutio API | CRM sync | `plutio-outbox-reaper.ts` |
| Sertifier API | Certificate issuance | certifier agent |

**Inbound webhook reliability** — All `/hook/*` receivers are governed by [WEBHOOK-RELIABILITY.md](WEBHOOK-RELIABILITY.md): single `webhook_inbox` archive, idempotency by `(source, event_id)`, 5-min reaper for failed dispatches, 6h sweepers per source for events that never arrived, dead-letter to `#gru-chief`. n8n stays as the security perimeter (no bypass).

---

## Gotchas & Design Decisions

1. **Gmail labels are per-message, not per-thread.** Replies don't inherit labels. `pollThreadReplies()` is a band-aid that only runs in legacy poll mode (not push mode). In push mode, history deltas catch new messages regardless of labels.

2. **`dist/` doesn't sync.** Must `npm run build` on Mini after code changes. Build command: `ssh 100.115.115.206 "export PATH=/opt/homebrew/bin:$PATH && cd ~/dev/NanoClaw && npm run build"`

3. **`BUSINESS_DB_HOST_LOCAL` overrides `BUSINESS_DB_HOST`.** On Mini, Postgres is at localhost. On Mac Studio, Postgres is unreachable (no tunnel). Scripts that need Postgres must run on Mini.

4. **Circuit breaker can defer messages silently.** `circuit-breaker.ts` tracks consecutive container failures per group. When open, messages accumulate in DB without processing. Check with `/health` endpoint.

5. **`processedIds` cap at 5000.** Oldest 1000 entries are pruned when cap is reached. Theoretical risk of re-processing old messages after long uptime, but unlikely in practice.

6. **Heartbeat file syncs but reflects Mini state.** `data/heartbeat.json` is written by the Mini process but synced to Mac Studio via Syncthing. PID in heartbeat is for the Mini process.

7. **Container build cache is sticky.** `./container/build.sh` with `--no-cache` doesn't invalidate COPY steps. Must prune buildkit volume first for truly clean rebuild.

8. **Test routing rewrites recipients.** When `GMAIL_TEST_RECIPIENT` is set in `.env`, ALL `gmail_send` outbound emails are redirected to that address. CC is also stripped.

9. **Tracking pixel suppresses self-BCC.** When an email body contains an open-tracking pixel (`https://{TRACKING_DOMAIN}/t/`), BCC and CC to tandemcoach.co addresses are stripped to prevent self-opens polluting engagement signals.

10. **`from_group` is empty for ordinary Gmail channel messages.** The channel's `onMessage()` callback stores the message without `from_group`. A directly routed actionable rules-runner match is first persisted as a Mailman-owned no-wake copy so its body, Thread-ID, and Message-ID survive the early return without spawning Mailman twice.

11. **Internal forwards are new-email work, not reply threads.** For an explicit forward whose Tandem-owned From domain has a Gmail-added, aligned DMARC or DKIM pass, the host resolves the external From/Reply-To in the first forwarded header block as the lead and retains the teammate as `Forwarded-By`. The internal Gmail thread is audit-only and is withheld from Mailman's reply grant. An approved response is a new email to the external lead.

12. **Auto-rule creation on high-confidence auto-archive classification.** When Mailman classifies an auto-archive label with confidence ≥ 0.9, a `sender_exact` rule is created with a 7-day probation period. Actionable labels never create sender-wide auto-rules, and the runner excludes probationary rules until they mature.

13. **Env vars are NOT on `process.env`.** `readEnvFile()` in `env.ts` parses `.env` files and returns values without setting `process.env`. This keeps secrets off child processes. Always use `readEnvFile()` or the config constants.

---

## Operations Quick Reference

### Build & Restart

```bash
# Build on Mini (required after code changes — dist/ doesn't sync)
ssh 100.115.115.206 "export PATH=/opt/homebrew/bin:\$PATH && cd ~/dev/NanoClaw && npm run build"

# Restart NanoClaw
ssh 100.115.115.206 "launchctl kickstart -kp gui/\$(id -u)/com.nanoclaw"

# Run scripts on Mini
ssh 100.115.115.206 "export PATH=/opt/homebrew/bin:\$PATH && cd ~/dev/NanoClaw && npx tsx scripts/<script>.ts <args>"
```

### Health Check

```bash
# Heartbeat (written every 10 min)
cat data/heartbeat.json

# Watchdog state
cat ~/.local/state/nanoclaw-watchdog.json

# Webhook health
curl http://localhost:8088/health
```

### Reprocess Email

```bash
# Dry run
npx tsx scripts/reprocess-email.ts --dry-run MSG_ID

# Force classify + route
npx tsx scripts/reprocess-email.ts --classify-as MrGru/lead/inquiry MSG_ID

# Route directly to a group
npx tsx scripts/reprocess-email.ts --route sales MSG_ID
```

### Classification Management

```bash
# List rules
npx tsx scripts/classify-rule.ts list

# Add rule
npx tsx scripts/classify-rule.ts add --type sender_exact --value user@example.com --label MrGru/vendor/cold

# Backfill week
npx tsx scripts/backfill-week.ts
```

---

## Source File Index

### Core Orchestration
`index.ts`, `config.ts`, `types.ts`, `env.ts`, `logger.ts`, `db.ts`, `router.ts`

### Channels
`channels/registry.ts`, `channels/index.ts`, `channels/gmail.ts`, `channels/slack.ts`

### Container System
`container-runner.ts`, `container-runtime.ts`, `group-queue.ts`, `group-folder.ts`, `mount-security.ts`, `circuit-breaker.ts`, `watchdog-ipc.ts`

### Gmail Pipeline
`gmail-api.ts`, `gmail-auth.ts`, `gmail-consent.ts`, `gmail-parser.ts`, `gmail-labels.ts`, `gmail-push.ts`, `gmail-label-poll.ts`, `gmail-ipc-handlers.ts`

### Classification System
`classify-rules-runner.ts`, `classify-ipc-handlers.ts`, `classify-backfill.ts`, `hard-filters.ts`, `host-router.ts`, `lead-matcher.ts`

### Business Logic
`business-db.ts`, `email-interaction-log.ts`, `email-tracking.ts`, `email-unsubscribe.ts`, `hive-bridge.ts`, `hive-sync-reaper.ts`, `plutio-outbox-reaper.ts`, `claude-bridge.ts`

### Scheduling & IPC
`ipc.ts`, `ipc-writer.ts`, `task-scheduler.ts`, `job-registry.ts`, `job-runner.ts`, `job-reporter.ts`, `job-snapshot.ts`, `learn-ipc-handler.ts`

### Digest
`digest-generator.ts`, `digest-delivery.ts`

### Webhook
`webhook-server.ts`
