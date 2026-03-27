# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

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
| `src/db.ts` | SQLite operations |
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

Run commands directly—don't tell the user to run them.

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
