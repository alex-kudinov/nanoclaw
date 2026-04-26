# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system map.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

Inbound Gmail messages flow through a **bidirectional classification pipeline**: mailman emits `classify_label_write` IPCs → host writes `email_classifications` rows → Gmail labels (`MrGru/*`) → INBOX removal for `auto_archive=true` taxonomy rows → Hive Firestore `conversations/{threadId}` doc (for labels with a `hive_share_target`) → per-recipient daily digest. Self-learning closes the loop: chief's `route_lesson` pipeline (Slack corrections) and `gmail-label-poll` (operator label drags) both feed `classify-backfill.ts`. See `~/.claude/projects/-Users-xbohdpukc-dev-NanoClaw/memory/project_bidirectional_classification.md`.

## Database Discovery

Three databases. Read the schema reference BEFORE writing any query — always look up column names from the schema file.

| Database | Type | Schema Reference | Query Examples | Discovery |
|----------|------|-----------------|----------------|-----------|
| `store/messages.db` | SQLite | `agent_docs/messages-db-schema.md` | `agent_docs/messages-db-queries.md` | `mcp__toolbox__run_tool db/db-schema --db store/messages.db` |
| `data/business/business.db` | SQLite | `agent_docs/business-db-schema.md` | — | `mcp__toolbox__run_tool db/db-schema --db data/business/business.db` |
| `nanoclaw_business` | Postgres | `agent_docs/nanoclaw-business-pg-schema.md` | `agent_docs/business-pg-queries.md` | `psql nanoclaw_business -c '\dt+'` |

**Rules:**
- Read the relevant schema file before writing any query
- If a schema file is missing or stale: regenerate with `db/db-schema --db <path> --refresh` (SQLite) or `pg_dump --schema-only` (Postgres)
- Agents in containers: schema files are at `/workspace/extra/agent_docs/`


## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations (router_state, registered_groups, messages, jobs) |
| `src/business-db.ts` | Postgres wrapper for `nanoclaw_business` (role-based, pg.Pool) |
| `src/classify-ipc-handlers.ts` | Inline handler for `classify_*` IPC namespace |
| `src/gmail-labels.ts` | Gmail label CRUD (ensureLabel, replaceClassLabelsOnThread) |
| `src/hive-bridge.ts` | Firebase Admin SDK wrapper for Hive Firestore; `HiveConversationNotFoundError` |
| `src/classify-backfill.ts` | Lesson-driven backfill (sender/subject rules → email_classifications) |
| `src/hive-sync-reaper.ts` | 15-min cron retry worker for failed Hive writes |
| `src/gmail-label-poll.ts` | 5-min cron to detect Gmail-UI label drags → classify_correction_detected |
| `src/digest-generator.ts` + `src/digest-delivery.ts` | Daily per-recipient email digest |
| `data/business/classification-schema.sql` | Taxonomy + email_classifications DDL + 25-label seed |
| `setup/gmail/CUTOVER-info-forwarding.md` | Operational runbook for retiring info@ forwarding |
| `scripts/apply-gmail-filter.ts` | Export/apply/dry-run Gmail filter + auto-forwarding rollback |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/agent-browser.md` | Browser automation tool (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Development

Run commands directly — execute them yourself rather than instructing the user.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Authentication (Credential Copy)

Containers authenticate via **subscription auth** — credentials are copied from the host into each container's mounted `.claude` dir at launch time.

- `~/.claude/.credentials.json` on the host contains the OAuth subscription token
- `container-runner.ts` copies this file into `data/sessions/{group}/.claude/.credentials.json` before each container launch
- Containers get `CLAUDE_CONFIG_DIR=/home/node/.claude` pointing to the mounted dir
- `toolbox/shared/claude/lib/lifecycle.sh` runs every 10 min via launchd, keeping tokens fresh
- Tokens are created via `claude setup-token` (1-year validity) — re-run annually on each machine

**If auth breaks:** Check `~/.claude/proxy/health.json` for lifecycle status. Ensure `claude auth status` returns `loggedIn: true`.

**Auth flow:** `claude setup-token` → `~/.claude/.credentials.json` → lifecycle.sh keeps fresh → container-runner.ts copies per-launch → container reads via CLAUDE_CONFIG_DIR

### Claude Print Bridge

External callers (tandemweb scripts, PHP recommender) use the HTTP bridge instead of direct API calls:

- Bridge service: `toolbox/shared/claude/bridge/server.js` on Mac Mini (port 40960)
- Listens on Tailscale IP (100.115.115.206), auth via `X-Bridge-Key`
- `POST /v1/print` wraps `claude --print` with safe-execution allowlist
- `GET /health` for monitoring
- Managed via launchd: `com.claude-proxy.print-bridge`

### Related Projects

| Project | Path | Purpose |
|---------|------|---------|
| **claude-proxy** | `~/dev/claude-proxy` | Design docs, handoffs, and plan for the token lifecycle system |
| **toolbox** (`shared/claude/`) | `~/dev/toolbox/shared/claude/` | All lifecycle scripts, Toolbox tools, launchd/systemd units |
| **toolbox** (`shared/email/`) | `~/dev/toolbox/shared/email/` | Email alerting (used by `alert.sh`) |

### Key Files for Troubleshooting Auth

| File | Purpose |
|------|---------|
| `~/dev/toolbox/shared/claude/RUNBOOK.md` | Full ops runbook — recovery, fallback, adding machines |
| `~/dev/toolbox/shared/claude/lib/lifecycle.sh` | Master lifecycle script (refresh → sync → health) |
| `~/dev/toolbox/shared/claude/lib/extract-token.sh` | Token extraction from `~/.claude/.credentials.json` |
| `~/dev/toolbox/shared/claude/lib/alert.sh` | Multi-channel alerting (Slack, Pushover, email) |
| `~/.claude/.credentials.json` | Token store — `claudeAiOauth.accessToken` and `expiresAt` |
| `~/.claude/proxy/health.json` | Current health status (ok/warning/critical) |
| `~/.claude/proxy/lifecycle.log` | Lifecycle cycle history |
| `~/.claude/proxy/sync.log` | Token sync events (hash fragments, timestamps) |
| `~/Library/LaunchAgents/com.claude-proxy.token-lifecycle.plist` | macOS scheduler (10-min interval) |
| `~/dev/.env.shared` | Alert credentials (Pushover, Slack webhook, email) |

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
