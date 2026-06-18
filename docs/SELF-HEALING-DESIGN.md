# NanoClaw Self-Healing System — Design

**Status:** Design / pre-implementation
**Date:** 2026-06-14
**Decisions locked:** separate independent process · autonomy = propose + auto-rerun idempotent (Tier 1+2) · scope = everything incl. daemon crashes · surface = new `#gru-incidents` channel

---

## 1. Problem

When a minion (container agent) errors today (`src/index.ts:349`, `:451`):
```
logger.error(...)     → logs/nanoclaw.error.log (pretty/ANSI, never read again)
recordFailure(folder) → in-memory circuit breaker (cooldown only)
cursor rollback       → message silently re-fires later
```
No persistence, no diagnosis, no notification, no fix. Errors scatter across **four disconnected places**: the log file, circuit-breaker memory, `job_run_logs` (SQLite), and frozen sweeper watermarks (Postgres). There is no single queue and no follow-up. The operator (Alex) manually copies errors to Claude and applies fixes by hand.

## 2. Core insight

The self-healing loop is structurally **identical to the webhook-reliability system already in production**: `webhook_inbox` → `webhook-inbox-reaper` → terminal/dead-letter → sweeper convergence. Durable queue → worker drives each item to terminal state → retry → dead-letter → alert on stuck. Build the healer by cloning that proven pattern, applied to errors instead of webhooks.

The "Claude on the machine" already exists: the **Print Bridge** (`toolbox/shared/claude/bridge`, port 40960, token rotation handled) is the remediation brain's transport.

## 3. Architecture

```
                         ┌─────────────────────────────────────────┐
   NanoClaw daemon ──────┤ JSON log sink  ──┐                       │
   (may be DOWN)         │ heartbeat row  ──┤                       │
                         │ job_run_logs   ──┤  PULL (works when     │
   Postgres ─────────────┤ frozen watermk ──┤  daemon is dead)      │
                         └──────────────────┼───────────────────────┘
                                            ▼
                              ┌──────────────────────────┐
                              │  HEALER (separate proc)   │
                              │  own launchd unit         │
                              │                           │
                              │  collect → dedup/cluster  │
                              │  → diagnose (Bridge)      │
                              │  → decide tier            │
                              │  → act → verify → close   │
                              └───────┬───────────┬───────┘
                                      │           │
                    incidents (PG) ◄──┘           ├──► #gru-incidents (own WebClient)
                    audit log                      └──► alert.sh (Pushover fallback, no-Claude)
```

### 3.1 Incident store — `business_v2.incidents` (Postgres)
Mirrors `webhook_inbox`. Columns:
- `id`, `source` (`minion:sales` / `sweeper:trafft` / `job:digest` / `daemon`)
- `fingerprint` — hash of normalized error (strip timestamps/ids) → **dedup key**
- `first_seen`, `last_seen`, `occurrences` (recurring error increments, doesn't flood)
- `severity` (info / warn / error / critical)
- `raw_context` jsonb — stderr, exit code, triggering message, recent commits — **redacted**
- `status` — `new → triaging → diagnosed → awaiting_approval → remediating → resolved | wont_fix | recurring`
- `diagnosis` text — Claude's root cause
- `proposed_fix` jsonb — diff and/or rerun command
- `applied_action` jsonb — what the healer actually did + when
- `outcome` — `verified_fixed | still_failing | escalated`
- `remediation_class` — `transient | config | code_bug | external_outage | data` (drives autonomy)

Postgres (not SQLite) so the store survives independent of the daemon's SQLite file and reuses the `business_v2` migration tooling.

### 3.2 Collector — PULL-first (scope demands it)
A crashed daemon cannot push its own death into a queue, so the collector must not depend on the daemon being alive for anything. Sources, each → normalized incident:
1. **JSON log scrape** — tail `logs/nanoclaw.jsonl` (NEW sink, §4.1), filter `level>=error`, fingerprint. Catches minion errors, uncaught exceptions, anything logged. Watermark by file offset/timestamp.
2. **`job_run_logs`** (SQLite, read-only WAL) — rows with `status!='ok'`.
3. **Frozen/error watermarks** (`sweeper_watermarks`) — `last_run_status in ('frozen','error')`.
4. **Daemon liveness** — heartbeat row (§4.2) stale > threshold OR launchd not running → `source=daemon, severity=critical` incident. *This is the headline capability of the "everything" scope.*

Optional later: push enrichment (a `recordIncident()` helper at key sites) for richer context — but pull is the backbone, never a dependency on the daemon.

### 3.3 Healer process
- Own entrypoint `src/healer/index.ts`, compiled to `dist/`, own launchd unit `com.nanoclaw.healer`.
- Must be **simpler and more robust** than the daemon (who-watches-the-watchman). Minimal deps.
- **Own Slack WebClient** (bot token) for `#gru-incidents` — never daemon IPC (IPC dies with the daemon). `src/digest-delivery.ts` already constructs its own WebClient for exactly this reason — it is the template.
- Degrades to `alert.sh` (Pushover/email, no Claude) if the Bridge itself is down.
- Two cadences (**LOCKED**):
  - **Fast loop — 5 min**: collect + triage + Tier-2 auto-reruns + poll open proposals for approval.
  - **Daily digest — 18:00 CDT**: summary to `#gru-incidents` + batch Tier-1 proposals for next-morning review.

### 3.3.1 Approval mechanism (**LOCKED**)
Tier-1 proposals are posted to `#gru-incidents`; the incident row stores the proposal's `channel + message_ts`. Each fast-loop tick the healer polls open proposals for any of three approval signals, **gated to the operator's Slack UID**:
1. **Thread reply** with text (`apply`, or any reply) — via `conversations.replies`.
2. **Thread reply** of `✅` / `:white_check_mark:`.
3. **`✅` reaction** on the proposal message — via `reactions.get` (polled, since real-time reaction *events* require Socket Mode = the daemon; polling sidesteps that and keeps the healer daemon-independent).

Approval latency = up to one loop interval (~5 min) — acceptable for fix application. Scopes needed: `groups:history` (private channel replies) + `reactions:read`. A `dismiss`/`✖️` reply or reaction → `wont_fix`.

### 3.4 Two Claude invocation modes
- **Diagnosis (Phase 1, read-only):** Bridge `POST /v1/print` — give it the error + failing file + recent commits → root cause + proposed diff. Mirrors the manual workflow.
- **Remediation code-fix (Phase 3, agentic):** full headless `claude` with Read/Edit/Bash + test-running. Out of initial scope.

## 4. Prereqs forced by "daemon-crash" scope (Phase 0)

### 4.1 JSON log sink
Pino currently writes only pretty/ANSI to stderr (`src/logger.ts`). Add a **dual sink**: keep pretty stderr for humans + structured JSON to `logs/nanoclaw.jsonl`. Low risk, small change. Without it the scraper parses ANSI — fragile.

### 4.2 Daemon heartbeat
Daemon writes `now()` to a heartbeat (Postgres row or a touched file) every ~30s. Healer reads it; stale ⇒ daemon-down incident. Tiny daemon change.

## 5. Autonomy — per remediation class (Tier 1+2)

| Class | Action | Tier |
|---|---|---|
| `transient` | auto-rerun **idempotent** job/sweeper; retry minion task; clear frozen watermark once blip clears | 2 (auto) |
| `config` | propose fix → human Apply | 1 |
| `code_bug` | propose diff → human Apply (Tier 3 auto deferred) | 1 |
| `external_outage` | alert only, nothing to fix | — |
| `data` | propose | 1 |

**Idempotency allowlist** (Tier 2 gate) — only auto-rerun work the codebase proves idempotent. Initial candidates to classify: `trafft-sweeper` (yes, idempotent on `(source,event_id)`), `webhook-inbox-reaper`, `hive-sync-reaper`, `digest`, `gmail-label-poll`. Anything not on the allowlist is propose-only.

## 6. Guardrails

- **Idempotency allowlist** — see §5.
- **Healer circuit breaker** — ≤2 auto-reruns per incident → escalate; daily cap on total auto-actions. No retry storms.
- **Loop prevention** — tag healer-originated runs; healer never heals its own actions.
- **Blast radius** — code fixes (Phase 3): branch + tests-green-gate + stage *only its own diff* + no silent main deploy.
- **Kill switch + quiet window** — one flag pauses all auto-remediation; suppress incidents during active human deploys (operator edits look like errors).
- **Redaction** — scrub secrets from `raw_context` before storing or sending to Claude.
- **Audit trail** — the `incidents` table *is* the audit log: diagnosis, diff, action, outcome, all reviewable.

## 7. Build sequence

- **Phase 0 — Visibility.** JSON log sink (4.1) + heartbeat (4.2) + `incidents` table + pull collector (all 4 sources) + daily digest to `#gru-incidents`. Outcome: every error becomes queryable; daemon crashes get caught. (Tier 0)
- **Phase 1 — Diagnose & propose.** Healer calls Bridge per incident → posts root cause + proposed fix to `#gru-incidents` with an Apply path. **Automates ~80% of the manual workflow.** (Tier 1)
- **Phase 2 — Auto-rerun idempotent.** Tier-2 actions on allowlisted transient failures + verify-fixed loop. (Tier 2)
- **Phase 3 (deferred) — Auto code-fix.** Agentic claude, tests+branch+approval, opt-in per class. (Tier 3)

Phase 0+1 is the high-leverage core; 2 graduates trust; 3 is later.

## 8. Decisions

**Resolved (LOCKED):**
- Healer location — separate independent process, NanoClaw repo (`src/healer/`), own launchd unit.
- Autonomy — Tier 1 (propose) + Tier 2 (auto-rerun idempotent). Tier 3 deferred.
- Scope — everything incl. daemon crashes (pull-first collector, all 4 sources).
- Surface — new `#gru-incidents` (private) channel.
- Approval — thread reply / `✅` reply / `✅` reaction, polled, gated to operator UID (§3.3.1).
- Daemon-down — auto-restart via `launchctl kickstart`, capped at 1–2/incident, then alert.
- Cadence — 5-min fast loop + 18:00 CDT daily digest.
- Heartbeat — Postgres row (healer already needs PG; one fewer moving part).

**Still open (resolve during Phase 0/2, not blocking):**
- **Idempotency allowlist** — confirm initial set in §5; classify each remaining job/sweeper before enabling its Tier-2 auto-rerun.
- **Quiet window** — how to detect "operator actively deploying" to suppress false incidents (e.g., a touch-file the deploy sets, or a `git status` dirty + recent-mtime heuristic).
```
