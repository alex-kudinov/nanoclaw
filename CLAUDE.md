# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system map.

## Quick Context

Single Node.js host process with a skill-based channel system. Slack and Gmail
are the active imported channels; other channel modules are dormant unless
explicitly installed and wired. Messages route to `claude --print` inside Apple
Container Linux VMs. Each group has isolated filesystem and memory.

Inbound Gmail messages flow through a **bidirectional classification pipeline**: mailman emits `classify_label_write` IPCs → host writes `email_classifications` rows → Gmail labels (`MrGru/*`) → INBOX removal for `auto_archive=true` taxonomy rows → Hive Firestore `conversations/{threadId}` doc (for labels with a `hive_share_target`) → per-recipient daily digest. Self-learning closes the loop: chief's `route_lesson` pipeline (Slack corrections) and `gmail-label-poll` (operator label drags) both feed `classify-backfill.ts`. See the tracked classification section in `docs/ARCHITECTURE.md`; Claude memory is supporting evidence only.

## Shared Claude Code + Codex Continuity

Claude Code and Codex use the same tracked engineering record. Client-private
memory or chat history is never the only record of a change.

Before non-trivial work, read:

1. `docs/PROJECT-MAP.md` — reconciled system and authority map.
2. `docs/ACTIVE-WORK.md` — current ownership, overlap, state, and next actions.
3. `docs/CHANGE-PROTOCOL.md` — required task, documentation, verification, and
   handoff procedure.
4. The latest relevant entries in `docs/ENGINEERING-CHANGELOG.md`.
5. The relevant group prompt, schema, design, security document, or runbook.

Register the work in `docs/ACTIVE-WORK.md` before the first edit using a stable
`NC-YYYYMMDD-NNN` ID. Check for overlapping files and external systems. At
handoff or completion, update the authoritative documents and
`docs/ENGINEERING-CHANGELOG.md` in the same change. Record build, test,
migration, deployment, and live verification as separate facts; never imply
one from another.

The full documentation impact matrix and status vocabulary are in
`docs/CHANGE-PROTOCOL.md`. If context required to continue exists only in this
Claude conversation or Claude memory, the handoff is incomplete.

Run `npm run docs:continuity-check` before handoff. CI also enforces that
continuity/operating authorities and ordered business migrations are tracked,
schema snapshots contain no live sample rows, completion states are credible,
and validation uses `.nvmrc`.

## Database Discovery

Two databases. Read the schema reference BEFORE writing any query — always look up column names from the schema file. Never guess which database a table lives in.

| Database | Type | Schema Reference | Owns (examples) |
|----------|------|-----------------|-----------------|
| `store/messages.db` | SQLite | `agent_docs/messages-db-schema.md` | `messages`, `chats`, `registered_groups`, `router_state`, `jobs`, `scheduled_tasks`, `sessions` |
| `nanoclaw_business` | Postgres | `agent_docs/nanoclaw-business-pg-schema.md` | `email_classifications`, `taxonomy`, `booking_events`, all business CRM tables, all `business_v2.*` views/functions |

**Rules:**
- Read the relevant schema file before writing any query. If a table is not in `messages-db-schema.md`, it is in Postgres — check `nanoclaw-business-pg-schema.md`.
- `data/business/migrations/nanoclaw-v2/` is the tracked ordered PostgreSQL
  migration history for `business_v2`; `data/business/CLAUDE.md` is its tracked
  operating guide. Other top-level SQL may be legacy or subsystem-specific.
  None defines the SQLite host schema. The SQLite file
  `data/business/business.db` is dead — do not query it.
- SQLite access: `mcp__toolbox__run_tool db/db-schema --db store/messages.db`.
- Postgres access from the host: `/opt/homebrew/opt/postgresql@16/bin/psql nanoclaw_business` — the `psql` binary is not on the default non-interactive SSH PATH, always use the full path.
- If a schema file is stale: regenerate with `tools/refresh-schemas.sh`.
  Tracked schema references are structure-only; never add live sample rows.
- Agents in containers: schema files are at `/workspace/extra/agent_docs/`.


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
| `src/contador-name-reaper.ts` | 30-min cron: repairs "Unknown" student names (Heartbeat sets Stripe `customer.name` after the payment webhook fires) via `backfill-names.cjs` |
| `tools/contador/process-payment.cjs` | Deterministic Stripe→Sheets(roster+payment log)→Postgres payment pipeline; `fetchCustomerWithName()` retries the customer-name race |
| `tools/contador/lib/cohort.cjs` | Release-required MCS cohort resolver for legacy cohort slugs/text and the current `cohort_start` + `cohort_label` checkout metadata contract |
| `tools/contador/backfill-names.cjs` | Idempotent name reconciler (3 phases): `payments` table (A), Student Roster (B), Payment Log/transaction sheet (C). Re-resolves Stripe `customer.name` for Unknown rows; `--apply`, dry-run default |
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
./scripts/with-pinned-node.sh npm ci # installs under the exact .nvmrc runtime
npm run runtime:doctor              # proves runtime/ABI/CI/image alignment
npm run dev                         # Run with hot reload; auto-hands off to the pin
npm run build                       # Compile TypeScript; auto-hands off to the pin
npm run release:build               # Clean-commit production artifact; exact pin required
./container/build.sh # Rebuild agent container
```

Do not change the machine's global Node for NanoClaw. The repository pin is
`22.23.2`; npm scripts use `scripts/with-pinned-node.sh` so a shell that starts
on Node 26 cannot accidentally run project code or native modules under it.
Dependency installation is engine-strict and must use the same launcher.

Production releases follow `docs/RELEASE-INTEGRITY.md`. Do not deploy by
building or hand-editing `dist/` in the production checkout. Production startup
must require the release manifest, pin the intended full commit, and expose
that verified identity through `/health`.

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
- `GET /health` returns `rotation` block (`active_account`, `available_accounts`, `accounts_in_cooldown`)
- Managed via launchd: `com.claude-proxy.print-bridge`
- **Token rotation (since 2026-05-01):** bridge reads `~/.shared/.claude-active-token` and `~/.shared/.claude-tokens.json` (3 accounts: alex/info/cnpc) per spawn. On Sonnet usage-limit, auto-falls-back to the next available account; cooldowns the exhausted one until reset. Manual swap via shell function `cctoken [alex|info|cnpc]` from `~/.shared/.shared_shell.sh` — takes effect on next request, no restart needed. Mac Studio's bridge plist is **disabled**; only Mac Mini and the VPS run a Print Bridge. VPS bridge has the pre-rotation code (not yet patched).

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
