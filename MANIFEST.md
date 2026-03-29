---
project: NanoClaw
domain: personal-assistant-orchestrator
status: active
updated: 2026-03-28
---

## Owns
- Multi-channel message routing (WhatsApp, Telegram, Slack, Discord, Gmail)
- Mailman El Despacho: Gmail message intake and dispatch
- Claude agent orchestration in Linux containers
- Per-group isolated filesystems and memory
- Scheduler and task dispatch via SQLite + IPC watcher
- Skill-based channel system (routing messages to appropriate agents)

## Needs
- gmelius: Gmail label taxonomy and shared inbox conventions
- claude-proxy: Claude Print Bridge for agent execution
- toolbox: pushover/* for notification delivery

## Exposes
- Message routing API (internal IPC)
- Scheduler interface for timed tasks
- Per-channel agent isolation model

## Recent Shifts
- 2026-03-28: Ecosystem protocol adopted, manifest created
