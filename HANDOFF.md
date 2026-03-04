# Handoff — 2026-03-04 Session 14

## Session Summary

- **Diagnosed Slack Socket Mode drop** at 06:17 AM — 8 queued messages lost on SIGTERM; restarted NanoClaw via `launchctl kickstart`
- **Recovered two lost leads** (Kashif Hasnie #4, Maria Leggett #5) by re-injecting handoff IPC files; both surfaced in #gru-sales
- **Fixed Gmail duplicate re-delivery bug** — `processedIds` Set cleared on restart; catch-up poll re-delivered all labeled emails; fixed by seeding from DB via `getMessageIdsForJid()` on `connect()`
- **Added `getMessageIdsForJid()` to `src/db.ts`** — queries `messages` table for all IDs with a given `chat_jid`
- **Killed stuck mailman containers** (4 + 1 chief) blocking sales agent at MAX_CONCURRENT_CONTAINERS (5)
- **Created `data/business/CLAUDE.md`** — comprehensive PostgreSQL schema docs: connection, tables, roles, common queries
- **Fixed SCHEDULE.md cohort dates** — `calendar_ctas.py` was only returning nearest cohort; added `find_all_dates()` returning all Module 1 cohort starts (365-day window); fixed PCC/ACTC showing 43 weekly module sessions instead of true cohort starts
- **Added Voice & Tone section to `groups/sales/CLAUDE.md`** — Cherie Silas voice DNA, banned phrases, structural rules, email format requirements
- **Corrected voice section** — removed Alex's abrupt example; added required email greeting (`Hi [First Name],`) and sign-off (`Warmly, / Tandem Coaching Team`)

## Current State

- **Branch:** main (22 commits ahead of upstream/main, 3 behind)
- **Last commit:** `aad4fae feat: outbound email sending via Sales→Mailman handoff`
- **Uncommitted changes:** Large — ~502 insertions across 16 modified files (sessions 11–14 accumulated)
- **Untracked files:** `knowledge/agents/mailman/`, `knowledge/agents/sales/LEARNED.md`, `scripts/submit-lead.ts`, `src/channels/gmail.test.ts`, `src/learn-ipc-handler.ts`
- **Files touched this session:**
  - `groups/sales/CLAUDE.md` — Voice & Tone section: Cherie's voice, banned phrases, email format (greeting + sign-off), corrected abrupt example
  - `src/channels/gmail.ts` — seed `processedIds` from DB on `connect()` to prevent re-delivery
  - `src/db.ts` — added `getMessageIdsForJid()` function
  - `data/business/CLAUDE.md` — new file (PostgreSQL schema docs for agents)
  - `tandemweb/tools/newsroom/calendar_ctas.py` (separate repo) — `find_all_dates()`, Module 1 filter for all programs
  - `knowledge/agents/sales/SCHEDULE.md` — regenerated: ACC=12 dates, PCC=11, ACTC=11 (true cohort starts only)

## Active Problem Context

No active bugs. System operating. The large uncommitted diff is accumulated work across sessions 11–14 (Gmail channel, PostgreSQL migration, mailman group, sales voice, schedule fix).

**Known issue to watch:** `processedIds` cap logic in `gmail.ts` lines 281–288 has a subtle bug — iterates the iterator to advance past 1000 entries, then tries to rebuild from it, but it's already consumed. Low urgency (only triggers at 5000 IDs).

## Decisions & Reasoning

- **Cherie's voice, not Alex's:** User confirmed sales emails use Cherie's warm authority style. "The program page has everything you need to decide" is Alex's abrupt voice. Cherie's version: "If you need more information, a lot of it is on the program page. Feel free to read and reach out."
- **Greeting/sign-off always required:** The anti-sycophantic rule does NOT apply to structural email conventions. `Hi [First Name],` and `Warmly, / Tandem Coaching Team` are always required. Clarified explicitly in CLAUDE.md.
- **Module 1 filter for all programs:** PCC/ACTC calendar events include all weekly sessions — must filter `mod != 1` universally in `find_all_dates()` to get true cohort enrollment dates.
- **DB-seeded processedIds:** Simplest fix for Gmail re-delivery — query existing IDs from SQLite `messages` table on startup. No new tables needed.

## Open Items & Blockers

- **Commit the accumulated diff** — ~502 insertions across 16 files, split into logical commits
- **Review untracked files** before committing: `LEARNED.md`, `submit-lead.ts`, `learn-ipc-handler.ts`, `gmail.test.ts`, `knowledge/agents/mailman/`
- **`processedIds` cap bug** in `gmail.ts` lines 281–288 (low urgency)
- **Test voice updates** — send a test lead, verify Cherie's voice + greeting + sign-off in draft

## Next Steps

1. Commit accumulated work in logical chunks:
   - Gmail dedup fix (`gmail.ts` + `db.ts`)
   - `data/business/CLAUDE.md`
   - `groups/sales/CLAUDE.md` voice section
2. Review and commit/gitignore untracked files
3. Send a test lead to verify voice changes
4. Monitor Gmail logs on next restart for `seededIds: N` (confirms dedup seeding)

## Gotchas Discovered

- **Slack Socket Mode drops silently** — no auto-reconnect; queued messages lost on SIGTERM. Must restart manually.
- **MAX_CONCURRENT_CONTAINERS=5 is a hard ceiling** — hung containers (no timeout) block all agent work. Need container timeout/watchdog.
- **psql not in PATH on Mac Mini** — full path: `/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql`
- **PCC/ACTC calendar includes all weekly module sessions** — must filter `mod != 1` for ALL programs, not just ACC.
- **Google Workspace primary vs. alias** — `info@tandemcoaching.academy` is the GW primary; `info@tandemcoach.co` is an alias. OAuth shows the primary.

## Environment Notes

- **Mac Mini (production):** `mini-claw` (Tailscale) / `192.168.1.50` (LAN). SSH key: `~/Sync/keys/xbohdpukc`
- **NanoClaw service:** `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- **Logs:** `~/dev/NanoClaw/logs/nanoclaw.log` on Mac Mini
- **Build + restart:** `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- **rsync target:** `mini-claw:~/dev/NanoClaw/`
- **Container networking resets on reboot** — run IP forwarding + NAT + builder DNS in order (see MEMORY.md)
