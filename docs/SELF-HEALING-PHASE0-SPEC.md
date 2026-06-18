# Self-Healing — Phase 0 Implementation Spec

**Parent design:** `docs/SELF-HEALING-DESIGN.md`
**Phase 0 goal:** Deterministic observability — every error from every surface becomes a deduped, queryable incident; daemon crashes are detected and auto-recovered. **No Claude, no code-fixing.** That is Phase 1+.
**Date:** 2026-06-14

## Scope boundary

**In Phase 0:**
- Make all errors visible in one durable store (`business_v2.incidents`).
- Catch daemon crashes (heartbeat) and auto-restart once (the single deterministic, no-Claude recovery action — locked).
- Daily 18:00 digest to `#gru-incidents`.

**NOT in Phase 0 (later phases):**
- Claude diagnosis / root-cause (Phase 1)
- Fix proposals + approval polling (Phase 1)
- Tier-2 auto-rerun of idempotent jobs/sweepers (Phase 2)
- Any code modification (Phase 3)

## Constants

| Name | Value |
|------|-------|
| Incidents channel | `#gru-incidents` = `C0BAGCEBDM0` (private) |
| Fast loop | launchd `StartInterval` = 300s |
| Digest | launchd `StartCalendarInterval` = 18:00 America/Chicago |
| Heartbeat write interval | 30s (daemon) |
| Heartbeat stale threshold | 120s (4 missed beats) |
| Daemon restart cap | 2 per daemon-down incident, then alert-only |
| JSON log path | `logs/nanoclaw.jsonl` |
| Migrations | `data/business/migrations/nanoclaw-v2/` — next = `100`, `101` |

## Execution model

The healer is **short-lived, launchd-invoked** (not a long-running process) — more robust and matches "simpler than the daemon": fresh process each run, launchd guarantees execution, no leaked state. One binary, two modes:
- `node dist/healer/index.js fast` — every 5 min: collect → upsert incidents → daemon-liveness check (+capped restart) → exit.
- `node dist/healer/index.js digest` — 18:00: summarize open incidents → post to `C0BAGCEBDM0` → exit.

Two launchd units (copies in `setup/launchd/` per the launchd-not-synced rule):
`com.nanoclaw.healer.fast.plist`, `com.nanoclaw.healer.digest.plist`.

---

## Unit 1 — JSON log sink (daemon)

**File:** `src/logger.ts`
**Change:** dual output via `pino.multistream` — pretty stream to stdout (unchanged human experience) **and** raw JSON lines to `logs/nanoclaw.jsonl`. JSONL path overridable via `NANOCLAW_JSONL_PATH` env (for tests). Keep `uncaughtException`/`unhandledRejection` handlers.

**Acceptance:**
1. Existing colorized stdout/stderr logging is byte-for-byte unchanged in format.
2. `logs/nanoclaw.jsonl` receives one parseable JSON object per log call with `level`, `time`, `msg`, and any bound fields (e.g. `group`, `err`).
3. `err` objects serialize with `type`/`message`/`stack` (pino default serializer).
4. Logger never throws if the jsonl path is unwritable — degrades to stdout-only.

**Tests** (`src/logger.test.ts`): point `NANOCLAW_JSONL_PATH` at a tmp file, emit `logger.error({err}, 'x')`, assert the file has one line parsing to `{level:50, msg:'x', err:{...}}`.

**Open concern:** log rotation — `nanoclaw.jsonl` grows unbounded. Phase 0: collector tracks a byte offset and the file is truncated/rotated by a size guard (defer rotation impl to a follow-up; note the offset must reset on truncation detection — if file size < stored offset, restart from 0).

## Unit 2 — Daemon heartbeat (daemon)

**Files:** `src/heartbeat.ts` (new) + wire one `setInterval` in `src/index.ts`.
**Behavior:** every 30s `UPDATE`/upsert one PG row in `business_v2.daemon_heartbeat (name 'nanoclaw', last_beat, pid, version)`. Uses `business-db` `query`.

**Acceptance:**
1. Row's `last_beat` advances every ~30s while the daemon runs.
2. Write failure logs a warning but never crashes the daemon.
3. `pid` matches the live `dist/index.js` process.

**Tests** (`src/heartbeat.test.ts`): mock `business-db.query`; assert the upsert SQL + params; assert a thrown query is swallowed (warn, no throw).

## Unit 3 — Migrations (Postgres)

**Files:** `data/business/migrations/nanoclaw-v2/100_incidents.sql`, `101_daemon_heartbeat.sql`.

`100_incidents.sql` — `business_v2.incidents` per design §3.1. Indexes on `status`, `source`, `last_seen`. **Partial unique index** `ON (fingerprint) WHERE status NOT IN ('resolved','wont_fix')` → exactly one OPEN incident per fingerprint = clean upsert target for dedup.

`101_daemon_heartbeat.sql` — single-row table + `collector_state` table (per-source watermarks: jsonl byte offset, last job_run_logs id seen, last digest time).

**Acceptance:** `run_migration.sh` applies both cleanly; `validate.sh` passes; re-running is idempotent (`IF NOT EXISTS`).

## Unit 4 — Healer skeleton

**Files:** `src/healer/index.ts` (mode dispatch), `src/healer/slack.ts` (own `WebClient` from bot token env — template: `src/digest-delivery.ts`), `src/healer/alert.ts` (shells `alert.sh` fallback). Two launchd plists + `setup/launchd/` copies.

**Acceptance:**
1. `healer fast` connects to PG, runs collector, exits 0; logs a one-line summary.
2. Slack client posts to `C0BAGCEBDM0`.
3. If the Bridge/Slack is unreachable, falls back to `alert.sh` (Pushover) and still exits 0.
4. launchd runs `fast` every 300s; `digest` at 18:00 CT.

**Tests** (`src/healer/index.test.ts`): mode dispatch routes `fast`/`digest`; unknown mode exits non-zero.

## Unit 5 — Pull collector

**File:** `src/healer/collector.ts`. Four sources → `upsertIncident()`:
1. **JSONL scrape** — read `logs/nanoclaw.jsonl` from `collector_state` offset; keep `level>=50`; fingerprint = `sha1(normalize(msg) + '|' + err.type)` where `normalize` strips digits/uuids/timestamps.
2. **job_run_logs** — open `store/messages.db` **read-only** (`?mode=ro`); rows `status!='ok'` with id > last-seen.
3. **sweeper_watermarks** — rows `last_run_status IN ('frozen','error')`.
4. **daemon liveness** — `daemon_heartbeat.last_beat` older than 120s OR `dist/index.js` not in `pgrep` → `source='daemon', severity='critical'`. On daemon-down: if restart count for the open incident < 2, run `launchctl kickstart -k gui/<uid>/com.nanoclaw`, increment count, post alert; else alert-only.

**`upsertIncident`:** if an OPEN incident with the fingerprint exists → `last_seen=now(), occurrences+1`; else insert `status='new'`. **Redact** secrets from `raw_context` before write.

**Acceptance:**
1. A seeded error line in jsonl → one `new` incident; repeat → `occurrences=2`, no new row.
2. A failed `job_run_logs` row → incident `source='job:<name>'`.
3. A frozen watermark → incident `source='sweeper:<name>'`.
4. Stale heartbeat → `critical` incident + capped restart attempt.
5. Offset advances; truncation resets it to 0.
6. Secrets in a log line are redacted in `raw_context`.

**Tests** (`src/healer/collector.test.ts`): fixtures per source; fingerprint normalization (two errors differing only in ids → same fingerprint); dedup increments; offset reset on truncation; redaction.

## Unit 6 — Daily digest

**File:** `src/healer/digest.ts`. Query incidents touched since last digest (`collector_state`); format counts by `source`/`severity` + top-N by occurrences + any `critical`; post to `C0BAGCEBDM0`; update last-digest time.

**Acceptance:**
1. 18:00 post lists new/updated incidents grouped by source+severity with occurrence counts.
2. Empty day → a terse "no incidents" line (confirms the healer is alive).
3. Message respects Slack length cap (truncate like `job-reporter.ts`).

**Tests** (`src/healer/digest.test.ts`): format function over a fixture incident set → expected blocks; empty-set path.

---

## Rollout order

1. **Unit 3** (migrations) — zero-risk, first. Apply via `run_migration.sh` on the Mini.
2. **Units 1+2** (daemon: log sink + heartbeat) — build, full `vitest run`, deploy as ONE reviewed daemon change (staged + tested per "no untested deploys"; these touch the live daemon). Verify jsonl populates + heartbeat advances before proceeding.
3. **Units 4+5+6** (healer) — build + test; the healer is read-only except the deterministic daemon-restart, so low risk. Dry-run `healer fast` manually on the Mini (assert incidents populate), then `healer digest` manually (assert post to `C0BAGCEBDM0`).
4. **Enable launchd** units (`fast`, `digest`); copy plists to `setup/launchd/`.

## Test plan

- **Unit:** vitest per unit (above). Full `vitest run` green before each deploy.
- **Integration on Mini:**
  - Seed a fake error into jsonl → run `healer fast` → assert incident row.
  - Stop the daemon (`launchctl unload`) → run `healer fast` → assert `critical` incident + restart attempt + daemon back up.
  - Confirm dedup: same error twice → `occurrences=2`.
  - Run `healer digest` → confirm post in `C0BAGCEBDM0`.
- **Rollback:** migrations have `DROP` counterparts; daemon change is one commit (revert + rebuild + restart); healer launchd units can be unloaded with zero daemon impact.

## Deliverables checklist

- [ ] `100_incidents.sql`, `101_daemon_heartbeat.sql` + applied on Mini
- [ ] `src/logger.ts` dual sink + `src/logger.test.ts`
- [ ] `src/heartbeat.ts` + wire in `index.ts` + `src/heartbeat.test.ts`
- [ ] `src/healer/{index,slack,alert,collector,digest}.ts` + tests
- [ ] `com.nanoclaw.healer.fast.plist`, `com.nanoclaw.healer.digest.plist` (+ `setup/launchd/` copies)
- [ ] Integration verified on Mini; launchd enabled
