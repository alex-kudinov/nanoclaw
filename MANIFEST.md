---
project: NanoClaw
domain: personal-assistant-orchestrator
status: active
updated: 2026-04-11
---

## Owns
- Multi-channel message routing (WhatsApp, Telegram, Slack, Discord, Gmail)
- Mailman El Despacho: Gmail message intake, classification, and dispatch
- **Bidirectional Gmail classification with self-learning + Hive Firestore bridge** (25-label `MrGru/*` taxonomy with `auto_archive` noise filtering, label-drag correction detection, lesson-driven backfill, per-recipient daily digests)
- Claude agent orchestration in Linux containers
- Per-group isolated filesystems and memory
- Scheduler and task dispatch via SQLite + IPC watcher
- Skill-based channel system (routing messages to appropriate agents)

## Needs
- hive: `conversations/{threadId}` doc creation via `hive-gmail-push` Pub/Sub topic (Hive's Cloud Function owns doc creation; NanoClaw never creates from scratch)
- claude-proxy: Claude Print Bridge for agent execution
- toolbox: pushover/* for notification delivery

## Exposes
- Message routing API (internal IPC)
- Scheduler interface for timed tasks
- Per-channel agent isolation model
- `classify_*` IPC namespace (classify_label_write, classify_correction_detected, classify_backfill_pending, classify_backfill_confirm)
- `email_classifications` + `classification_taxonomy` + `classification_rules` tables in `nanoclaw_business` Postgres

## Recent Shifts
- 2026-04-11: **Bidirectional Gmail classification pipeline shipped** — 25-label taxonomy, Gmail-UI label-drag corrections (gmail-label-poll cron), Hive sync reaper, per-recipient daily digests (disabled pending T25 cutover). Replaces Gmelius inbox fan-out. T25 forwarding cutover pending 48h baseline soak.
- 2026-04-09: Gmail Pub/Sub push live (passive subscriber on `hive-gmail-push` topic, replaced 30s polling)
- 2026-03-31: Apple Container runtime integration with watchdog recovery + archivista → archivarista rename
- 2026-03-28: Ecosystem protocol adopted, manifest created
