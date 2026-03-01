# Handoff — 2026-03-01 (Session 3)

## Session Summary
- Fixed n8n access: Google SSO replacing broken email OTP (forwarding account issue)
- Added `info@tandemcoaching.academy` to CF Access allow policy via API
- Configured Google OAuth IdP in CF Zero Trust (manual — app ID + client secret from GCP)
  - Redirect URI: `https://tandemcoach.cloudflareaccess.com/cdn-cgi/access/callback`
  - One-time PIN login method removed
- n8n owner account created: `info@tandemcoaching.academy`
- Confirmed full architecture doc is the execution plan — no re-planning needed
- Identified Wave 0 pre-requisites before starting Task #3 vertical slice

## Current State
- Branch: main (uncommitted changes — HANDOFF.md only)
- n8n: live at `ops.tandemcoach.co`, owner account created, ready for workflows
- CF Access: Google SSO only, `info@tandemcoaching.academy` + academy emails allowed
- Wave 0 status: n8n ✓ | Slack app ✗ | business.db ✗ | queue/ dirs ✗ | #gru-channels ✗

## Active Problem Context
Wave 0 is the blocker for Task #3. Need to complete:
1. Create Slack app "Gru" in `cnpc.coach` workspace — get `xapp-` and `xoxb-` tokens
2. Create `#gru-*` channels (Wave 1 set: `#gru-inbox`, `#gru-sales`, `#gru-chief`)
3. Initialize `business.db` + `queue/` directory structure in NanoClaw repo
4. Write CLAUDE.md for Wave 1 agents (inbox, sales, chief)
5. Register agent groups in NanoClaw
6. Build n8n contact form webhook workflow → posts to `#gru-inbox`

User left mid-session to create the Slack app (manual step). NanoClaw repo path on Mac Mini not yet confirmed.

## Decisions & Reasoning
- **Slack workspace:** `cnpc.coach` (not tandemcoach)
- **Channel naming:** `#gru-*` as per architecture doc — all agent channels private
- **Contact form → `#gru-inbox`:** per architecture doc, Inbox Commander handles all inbound
- **Google SSO:** `info@tandemcoaching.academy` is the primary Google account
  - `tandemcoach.co` emails are forwarding-only — don't use for CF Access or n8n
  - `tandemcoaching.academy` is the primary Google Workspace domain
- **Cloudflare team name:** `tandemcoach` (not `tandemcoaching`) — URL is `tandemcoach.cloudflareaccess.com`
- **"aktx → tandemcoaching" rename:** no script changes needed — scripts use dynamic account ID

## Open Items & Blockers
- Slack app creation (user doing manually): need `xapp-*` (app token) and `xoxb-*` (bot token)
- NanoClaw repo path on Mac Mini — same machine or different?
- husky pre-commit hook broken in NanoClaw repo: `better-sqlite3` native compilation fails on Node 25, so `prettier` never installs. Commits require `--no-verify` or fixing the Node version.

## Next Steps (priority order)
1. Confirm Slack app tokens from user (xapp- and xoxb-)
2. Confirm NanoClaw path on Mac Mini
3. Create `#gru-inbox`, `#gru-sales`, `#gru-chief` channels, invite Gru bot
4. Initialize NanoClaw business agent structure:
   - `data/business/schema.sql` + `business.db`
   - `data/business/queue/` directories (inbox-to-sales/, any-to-chief/)
   - `groups/inbox/CLAUDE.md`, `groups/sales/CLAUDE.md`, `groups/chief/CLAUDE.md`
5. Register channel IDs → group names in NanoClaw
6. Build n8n workflow: contact form webhook → `#gru-inbox`
7. End-to-end test: POST test payload → verify Slack message → verify agent responds

## Gotchas Discovered
- **CF Zero Trust team name is `tandemcoach`** (not `tandemcoaching`) — redirect URI must use `tandemcoach.cloudflareaccess.com`
- **`tandemcoach.co` emails are forwarding-only** — never use them for auth flows
- **`tandemcoaching.academy` is primary Google Workspace** — use these for all Google auth
- **husky hook broken on Node 25** — `better-sqlite3` gyp compilation fails, npm install never completes, prettier never installs. Need `--no-verify` to commit in this repo until fixed.

## Environment Notes
- VPS: `100.115.115.15:2225`, user `tca`, key `/Users/xbohdpukc/Sync/Keys/byteberry/tandem_vps`
- All VPS/CF creds: `setup/vps/.env`
- n8n UI: `https://ops.tandemcoach.co` (Google SSO — info@tandemcoaching.academy)
- NanoClaw: running on Mac Mini (path TBC), launchd service
