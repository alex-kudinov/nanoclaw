---
project: NanoClaw
domain: personal-assistant-orchestrator
status: active
updated: 2026-06-13
---

## Owns
- Multi-channel message routing (WhatsApp, Telegram, Slack, Discord, Gmail)
- Mailman El Despacho: Gmail message intake, classification, and dispatch
- **Bidirectional Gmail classification with self-learning + Hive Firestore bridge** (25-label `MrGru/*` taxonomy with `auto_archive` noise filtering, label-drag correction detection, lesson-driven backfill, per-recipient daily digests)
- Claude agent orchestration in Linux containers
- **Credit-aware OAuth→API-key failover** — minions exhaust prepaid Agent-SDK credit across all pooled accounts (persistent per-token cooldown in `data/.token-cooldowns.json`) before falling back to a metered Anthropic API key; per-minion eager/lazy probe policy auto-detects account renewals
- Per-group isolated filesystems and memory
- Scheduler and task dispatch via SQLite + IPC watcher
- Skill-based channel system (routing messages to appropriate agents)
- **MCS assignment grading** (`grader` minion): grades Mentor Coaching written assignments off the courses-repo grading system, keeps durable per-student records, tracks course completion, and hands off to the `certifier` minion for Foundation certificate issuance
- **Autonomy ladder** (per-category trust + L2 hold-and-send): trust ledger derives every sales draft's outcome from stored messages; 15 consecutive clean approvals promote a category to auto-approve-after-veto-window; any correction demotes. Guards at the gmail send boundary (recipient + content: discounts/links/placeholders) fence what auto-send may do
- **Program-facts drift guard**: daily zero-LLM diff of curated `facts/programs.yaml` vs tandemweb products.json + sales KB; Slack alert on divergence (notify-only)
- **Lesson conflict check**: every new LEARNED.md lesson is bridge-checked for contradictions; conflicts flagged CONTESTED and owner-routed (ICF→Cherie, business→Alex)

## Needs
- hive: `conversations/{threadId}` doc creation via `hive-gmail-push` Pub/Sub topic (Hive's Cloud Function owns doc creation; NanoClaw never creates from scratch)
- claude-proxy: Claude Print Bridge for agent execution (NB: its 3-account OAuth rotation faces the same June 15 2026 economics cliff — needs its own API-key fallback)
- anthropic: pay-as-you-go `ANTHROPIC_API_KEY` as the metered fallback once subscription Agent-SDK credit is exhausted (June 15 2026 OAuth-economics change)
- toolbox: pushover/* for notification delivery, chaos/* for verified-visitor lead export + journeys, **agenticflow/* for AgenticFlow agent/workflow invocation**
- chaos-tracker: token-authed `chaos/v1/lead/*` REST API (recently-verified + visitor journey) on tandemcoach.co, consumed by the daily chaos reconciler and the sales journey toolbox tool
- agenticflow.ai: hosted no-code automation account (workspace "Tandem Coaching") — REST `api.agenticflow.ai/v1`, project-scoped key in `toolbox/.env`. Reached only via `agenticflow/*` toolbox tools (never raw-MCP-registered, to avoid per-turn tool bloat). One live asset (`trafft-list-consults`, run 33×); rest of account is scratch/experiments

## Exposes
- Message routing API (internal IPC)
- Scheduler interface for timed tasks
- Per-channel agent isolation model
- `classify_*` IPC namespace (classify_label_write, classify_correction_detected, classify_backfill_pending, classify_backfill_confirm)
- `email_classifications` + `classification_taxonomy` + `classification_rules` tables in `nanoclaw_business` Postgres
- `/hook/chaos` webhook ingestion (Chaos verified-visitor → business_v2 party/lead, via n8n relay)

## Recent Shifts
- 2026-07-06: **Autonomy trust machinery shipped** — per-category approval-streak ladder (`autonomy_trust`/`autonomy_pending` in messages.db, 60s in-process sweep), L2 hold-and-send that injects the standard approval after a 120-min veto window (👎 vetoes + demotes), deterministic content guard at gmail send/reply (numeric discounts, link whitelist, placeholders → `[EMAIL BLOCKED]`), lesson-conflict check with owner routing, and `scripts/autonomy-report.ts` historical funnel. Baseline: 568 sales drafts, 41–64% clean-approval by category, no category L2-ready yet. Sales drafts now carry a mandatory `Category:` line.
- 2026-07-05: **Grader minion added** — new `grader` minion (Slack #gru-grader `C0BFBFNPN6M`, `requiresTrigger:false`, model `sonnet` per a data-backed model-per-action policy) grades MCS written assignments against the data-driven grading system mounted read-write from `~/dev/courses/community/icf` (registry + graders + calibration + per-student `record.json`), tracks course completion, and emits `[HANDOFF: grader→certifier]` on Foundation completion so the existing `certifier` minion issues the `mcs-foundation` Sertifier cert. Calibration of new assignments + course onboarding stay in Claude Code (Opus) — one-model-per-minion, so the Opus tier lives outside the minion by design. Registration pending on the Mac Mini (`scripts/register-grader.ts C0BFBFNPN6M`).
- 2026-06-13: **AgenticFlow.ai access layer added** — subproject at `integrations/agenticflow/`; 4 verified `agenticflow/*` toolbox tools (list-agents, list-workflows, run-agent, trigger-webhook) wrap the project-scoped REST API. Account enumerated: 10 agents, 5 workflows (only `trafft-list-consults` is production; rest are scratch/tests). Architecture: toolbox-wrapped, not raw-MCP-registered.
- 2026-06-13: **Credit-aware OAuth→API-key failover shipped + deployed** — ahead of the June 15 2026 end of `claude -p` OAuth-subscription economics, minions now burn all 3 accounts' prepaid Agent-SDK credit (persistent per-token cooldown) before failing over to a metered `ANTHROPIC_API_KEY`; eager minions (procurement/chief/newsroom/archivarista/courses) probe for account renewals before paying. Key staged inert as `ANTHROPIC_API_KEY_FALLBACK` since it outranks OAuth in the CLI. LiteLLM gateway evaluated and **deferred to a minimal seam** (per-minion budgets + off-Anthropic decoupling), not the full multi-node platform — gated by the agentic-tool-use fidelity wall on non-Claude backends.
- 2026-05-16: **Chaos → leads pipeline shipped** — email-verified website visitors from the Chaos tracker flow into the `business_v2` CRM as parties (and `form_contact`/`form_lead_magnet` leads). Push path: Chaos forward queue → n8n `/webhook/chaos` → `/hook/chaos` → `webhook_inbox` → inbox agent. Daily `chaos-reconciler` backstop polls Chaos's lead-export API; `chaos/get-visitor-journey` toolbox tool surfaces browsing journeys to sales.
- 2026-04-11: **Bidirectional Gmail classification pipeline shipped** — 25-label taxonomy, Gmail-UI label-drag corrections (gmail-label-poll cron), Hive sync reaper, per-recipient daily digests (disabled pending T25 cutover). Replaces Gmelius inbox fan-out. T25 forwarding cutover pending 48h baseline soak.
