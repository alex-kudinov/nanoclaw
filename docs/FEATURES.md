# NanoClaw Feature Registry

Tracks features by status. Add new ideas here; move to ✅ when shipped.

**Status legend:** ✅ done · 🔄 in progress · 🔲 planned

---

## Channels

| Status | Feature              | Skill / Notes                                                                 |
| ------ | -------------------- | ----------------------------------------------------------------------------- |
| ✅     | WhatsApp             | Core — always available                                                       |
| ✅     | Slack (Socket Mode)  | `.claude/skills/add-slack`                                                    |
| 🔲     | Telegram             | `.claude/skills/add-telegram`                                                 |
| 🔲     | Telegram Agent Swarm | `.claude/skills/add-telegram-swarm` — each subagent gets its own bot identity |
| 🔲     | Slack Agent Swarm    | Slack equivalent of telegram swarm                                            |

---

## Security

| Status | Feature                   | Notes                                                                                          |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| ✅     | Secrets via stdin         | Tokens never in env vars or mounted files                                                      |
| ✅     | Bash secret sanitization  | `unset` hook strips tokens before every Bash command                                           |
| ✅     | Token proxy               | `src/token-proxy.ts` — containers never receive the real token; proxy injects auth per-request |
| 🔲     | Per-group token isolation | Different API keys/accounts per group                                                          |
| 🔲     | Provider switching        | Route to Ollama, OpenRouter, etc. via proxy config                                             |

---

## Container Runtime

| Status | Feature         | Skill / Notes                                                           |
| ------ | --------------- | ----------------------------------------------------------------------- |
| ✅     | Docker / Colima | Default runtime                                                         |
| ✅     | Apple Container | `.claude/skills/convert-to-apple-container` — macOS native VM isolation |

---

## Integrations

| Status | Feature                 | Skill / Notes                                                                                                                     |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Webhook server          | `src/webhook-server.ts` — local Zapier alternative over Tailscale; define webhooks in `data/webhooks.json`, agents manage via IPC |
| 🔲     | Gmail (tool or channel) | `.claude/skills/add-gmail` — agent reads/sends email                                                                              |
| 🔲     | Voice transcription     | `.claude/skills/add-voice-transcription` — Whisper for WhatsApp voice notes                                                       |
| 🔲     | X / Twitter             | `.claude/skills/x-integration` — post, like, reply                                                                                |
| 🔲     | Toolbox integration     | Mount `~/dev/toolbox` into agent containers; per-group MCP proxy for 24+ Plutio, 14 Things 3, email tools                         |

---

## Agent Capabilities

| Status | Feature                       | Notes                                                     |
| ------ | ----------------------------- | --------------------------------------------------------- |
| ✅     | Browser automation            | `container/skills/agent-browser.md` — Playwright via Bash |
| ✅     | Scheduled tasks               | `src/task-scheduler.ts`                                   |
| ✅     | Per-group memory              | Isolated `groups/{name}/` filesystem                      |
| ✅     | Session resumption            | Claude Code session IDs persisted in SQLite               |
| 🔲     | Long-running background tasks | Agent spawns detached container, reports back via IPC     |

---

## Developer Experience

| Status | Feature                      | Notes                                              |
| ------ | ---------------------------- | -------------------------------------------------- |
| ✅     | Skills engine                | Three-way merge, drift detection, state tracking   |
| ✅     | Hot-reload dev mode          | `npm run dev`                                      |
| 🔲     | Web UI for group management  | Register channels, view logs, manage tasks         |
| 🔲     | `/update` skill improvements | Auto-rebuild container image after upstream update |
