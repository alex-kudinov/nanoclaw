# Handoff — 2026-03-01 (Session 6)

## Session Summary
- Synced all local changes to git (added prettier, fixed husky hook, pushed 30 files)
- Updated `.gitignore`: added sync-conflict patterns, `handoffs/`, `.toolbox/`
- Verified #gru-inbox: 2-step Inbox Commander format NOT working consistently (Sarah Chen got 1 message only; Jordan Lee's 2 messages were from 2 separate webhook calls, not 1 run)
- Designed the full pipeline architecture: GForm → n8n (sanitize only) → NanoClaw webhook → Inbox Commander (classify+qualify) → specialized agents
- Settled on `tandem-knowledge/` as the scoped knowledge mount for sales agents
- Analyzed 161 real GravityForms submissions — identified ~55% auto-answerable, ~45% need judgment/Gru
- Identified `llms-full.txt` (5,636 lines, updated weekly) as Gru's broad knowledge source
- Simulated Gru answering two real contact form questions using `llms-full.txt` — results were solid
- Modified `tandemweb/tools/newsroom/calendar_ctas.py` to also write `tandem-knowledge/SCHEDULE.md` every Monday alongside the existing JSON output
- Calendar update cadence agreed: manual trigger via "Mr Gru, update the calendars" — no automated deploy needed given ~biannual schedule changes

## Current State
- Branch: main, diverged from upstream (4 vs 5 commits)
- Uncommitted changes in NanoClaw: `src/channels/slack.test.ts`, `src/container-runner.ts`, `src/container-runtime.test.ts`, `src/container-runtime.ts`, `src/env.ts`, `src/routing.test.ts` (likely upstream-merge artifacts from prettier formatting)
- Modified in TandemWeb (not committed): `tools/newsroom/calendar_ctas.py` — added `write_schedule_md()` function
- `tandem-knowledge/SCHEDULE.md` does NOT exist yet — will be created next time `calendar_ctas.py` runs

## Architecture Decisions Made This Session

### Pipeline: GForm → n8n → Gru → Sales Agent
- **n8n**: dumb pipe only — sanitize fields (strip HTML, truncate, validate email), extract fields, POST clean JSON to NanoClaw webhook
- **Inbox Commander (Gru)**: classify (exec coaching / coach training / other / spam), qualify, write to `leads` DB, drop to appropriate queue
- **Classification happens in Gru** — not in n8n. Contact forms are ambiguous; Claude handles nuance better than keyword matching
- **One webhook endpoint** (`/hook/contact-form`) — all GForm submissions regardless of type

### Knowledge Architecture (3 tiers)
| Tier | File | Who gets it | Updated by |
|---|---|---|---|
| Curated facts | `tandem-knowledge/KNOWLEDGE.md` | All sales agents | Manual edit |
| Live schedule | `tandem-knowledge/SCHEDULE.md` | All sales agents | Weekly via `calendar_ctas.py` |
| Full site | `tandemweb/llms-full.txt` | **Gru only** | Weekly TandemWeb routine |

### Gru's gap-fill + learning loop
When a sales agent escalates a question it can't answer:
1. Gru reads `llms-full.txt` and synthesizes an answer
2. Posts to `#gru-chief` for human validation
3. If approved → Gru appends Q&A to `tandem-knowledge/LEARNED.md`
4. Future agents get it from the mount automatically

### 2-step Inbox Commander format (unresolved)
The webhook server's `onOutput` sends ONE final result. The intake receipt only appears if the agent calls `mcp__nanoclaw__send_message` mid-run. For Sarah Chen, the agent didn't. Root cause not yet fixed — parked until pipeline design is finalized.

## Open Items
1. **n8n workflow** — build: Gravity Form → sanitize → POST to Mac Mini webhook
2. **Inbox Commander 2-step format** — fix or redesign (webhook server could send receipt on arrival, agent sends only qualification)
3. **Commit TandemWeb changes** (`calendar_ctas.py` modification)
4. **Commit remaining NanoClaw changes** (prettier-formatted test files)
5. **Mount `tandem-knowledge/` into containers** — currently not mounted; agents can't read it yet
6. **Mount `llms-full.txt` into Gru container only** — not yet configured
7. **Build Sales Closer CLAUDE.md** (coach training + exec coaching variants, or one shared)
8. **Email reply loop** — when prospect replies to agent's email, how does it get back to Gru? (parked, do after first path works)
9. **`SCHEDULE.md` first run** — needs `calendar_ctas.py` to run once to generate the file

## Next Steps (priority order)
1. Commit TandemWeb `calendar_ctas.py` change
2. Commit remaining NanoClaw changes
3. Mount `tandem-knowledge/` into containers + mount `llms-full.txt` into Gru
4. Build n8n workflow (GForm → webhook)
5. Fix Inbox Commander 2-step format
6. Build Sales Closer CLAUDE.md

## Gotchas Discovered
- **`llms-full.txt` is 766KB** — too large to read in one tool call. Agent must search it with Grep or read in chunks. Don't try to read it whole.
- **GForm data analysis**: ~45% of inquiries need personalized judgment (existing hours, prior training equivalency, credential path advice). These escalate to Gru or human. The other 55% are factual questions KNOWLEDGE.md can handle once filled out.
- **Inbox Commander 2-step format never worked**: intake receipt (`📥 Received:`) has never appeared in #gru-inbox. The webhook's onOutput sends one message — the final agent result.
- **calendar_ctas.py path assumption**: `SCHEDULE_MD_FILE = PROJECT_ROOT.parent / "NanoClaw" / "tandem-knowledge" / "SCHEDULE.md"` — assumes NanoClaw and tandemweb are sibling directories under the same parent (`~/dev/`). True on both machines.
- **Prettier broke the husky hook**: prettier wasn't installed. Fixed by `npm install --save-dev prettier --ignore-scripts`. Now works.

## Environment Notes
- Mac Mini SSH: `ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204`
- NanoClaw logs: `~/dev/NanoClaw/logs/nanoclaw.log` (Mac Mini)
- TandemWeb project: `~/dev/tandemweb/` (both machines via Syncthing)
- `llms-full.txt` location: `/Users/xbohdpukc/dev/tandemweb/llms-full.txt`
- GravityForms CSV analyzed: `data/gf_entry_48-export-2026-03-01.csv` (161 entries)
