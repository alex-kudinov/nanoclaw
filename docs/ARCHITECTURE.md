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
GroupQueue.enqueueMessageCheck(chatJid, threadTs)
    ↓
processGroupMessages() → getMessagesSince() → formatMessages()
    ↓
runContainerAgent(group, prompt) → container stdin JSON
    ↓
Agent output → channel.sendMessage(chatJid, text)
```

### Gmail Classification Bypass (Pre-LLM Fast Path)

Gmail emails go through an additional pre-processing step in `fetchAndProcess()` before reaching the message loop:

```
Gmail API message
    ↓
Skip SENT / DRAFT / SPAM / TRASH
    ↓
Hard filter check (hard-filters.json) → drop if matched
    ↓
Rules runner (classification_rules DB, 60s cache) → if match:
    ├─ handleClassifyLabelWrite() → store + label + auto-rule
    ├─ isAutoArchiveLabel? → skip mailman, done
    └─ routeClassifiedEmail() → dispatch to sales/chief/minion
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
- **Dedup:** `processedIds` Set (capped at 5000, oldest 1000 pruned)
- **Push architecture:** `gmail-push.ts` processes history deltas (`messagesAdded` events). On `HistoryExpiredError` (>7 days stale), resets baseline and accepts data loss window.

### Slack (`src/channels/slack.ts`)

- **SDK:** Bolt framework, Socket Mode (no public URL needed)
- **Events:** `GenericMessageEvent`, `BotMessageEvent`
- **Chunking:** Messages >4000 chars split across multiple `chat.postMessage` calls
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

Sources: `auto` (confidence ≥ 0.9 creates `sender_exact` rule), `lesson` (chief corrections), `seed` (operator CLI), `manual`.

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
| `procurement/*` | classify_only (no IPC) | — |
| `financial/bill` | Contador handoff | mailman |
| `financial/refund` | Escalation | chief |
| `meeting-assets/*` | Archivarista handoff | mailman |
| `legal/*`, `recruiting/*`, `internal/*` | Escalation | chief |
| Unrecognized | Fallback escalation | chief |

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
| **procurement** | Scrapes procurement portals (Bonfire, CaleProcure) | `@Mr Gru` in procurement channel | browser automation |
| **social** | LinkedIn posting orchestrator from blog content | Scheduled jobs | — |
| **newsroom** | Editorial pipeline — newsletters, social media | `@Mr Gru` | — |
| **heartbeat** | Receives diagnostic heartbeats. No agent response. | — | — |

Inactive/minimal: `gru-community`, `gru-solera`, `feature-requests`

Note: Slack channel `#gru-bookkeeper` (`C0AK1FD66MT`) is the front door for the **contador** minion — channel name reflects the role (bookkeeping), but the agent's folder, code, and registered group name is `contador` / `El Contador`. The empty `groups/gru-bookkeeper/` directory is just a log sink for that channel.

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
   - `learn_*` → `learn-ipc-handler.ts`
   - Default: forwarded to target group as message

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
| Hive Firestore | Shared email classification state | `hive-bridge.ts` via Firebase Admin SDK |
| Slack API | Chat channel | Bolt SDK, Socket Mode |
| Claude Agent SDK | Agent execution | Inside containers |
| Claude Print Bridge | External script → Claude calls | HTTP on Mini port 40960 |
| Stripe API | Payment processing | Webhooks via n8n → contador |
| Trafft API | Booking management | Webhooks via n8n → booking |
| Plutio API | CRM sync | `plutio-outbox-reaper.ts` |
| Sertifier API | Certificate issuance | certifier agent |

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

10. **`from_group` is empty for gmail channel messages.** The channel's `onMessage()` callback stores the message without `from_group`. It's set later by the orchestrator when the agent processes the message (or stays empty if the message goes through the classification fast path).

11. **Auto-rule creation on high-confidence classification.** When mailman classifies with confidence ≥ 0.9, a `sender_exact` rule is auto-created so the same sender bypasses the LLM next time. Auto-archive labels get a 7-day probation period.

12. **Env vars are NOT on `process.env`.** `readEnvFile()` in `env.ts` parses `.env` files and returns values without setting `process.env`. This keeps secrets off child processes. Always use `readEnvFile()` or the config constants.

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
