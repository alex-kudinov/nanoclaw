# Handoff — 2026-03-01 (Session 5)

## Session Summary
- Consolidated secrets: created `~/dev/.env.shared` as cross-project secrets file (CF, Plutio, email, Things, Encharge, Endorsal, Straico, TextFocus, DataForSEO, Pulse)
- Updated `src/env.ts` to cascade-load `~/dev/.env.shared` (base) then overlay project `.env` (wins on conflict)
- Updated `.env`: added ASSISTANT_NAME=Mr Gru, WEBHOOK_PORT, WEBHOOK_SECRET, CONTAINER_HOST_IP, infra reference vars (Mac Mini, VPS, n8n)
- Fixed bot message filtering in `src/db.ts`: changed `is_bot_message = 0` → `is_from_me = 0` in both query functions
- Fixed `src/channels/slack.ts`: `is_from_me` now only true for NanoClaw's own output (`user === botUserId`), not all bot messages
- Created `data/webhooks.json` on Mac Mini with `contact-form` webhook → inbox group
- Tested end-to-end: `curl → POST /hook/contact-form → container → Inbox Commander → Slack message sent`
- Updated `groups/inbox/CLAUDE.md`: added 2-step message format (intake receipt first, then qualification)
- Rebuilt on Mac Mini using `/opt/homebrew/bin/node node_modules/.bin/tsc`
- Restarted service twice; running as PID 50006, `trigger: @Mr Gru`, groupCount 5

## Current State
- Branch: main (many uncommitted changes — same upstream diff as before)
- NanoClaw: running on Mac Mini (PID 50006), groupCount 5, all channels live
- `trigger: @Mr Gru` confirmed in logs
- Wave 1 pipeline: **contact-form webhook → Inbox Commander** works end-to-end
- Two test leads fired via webhook during this session (Jordan Lee, Sarah Chen)
- Intake receipt format added to Inbox Commander CLAUDE.md — not yet verified in Slack (agent fired, Slack message sent per logs, but didn't confirm 2-message format visually)

## Active Problem Context
The 2-step Inbox Commander output (intake receipt + qualification) was added to CLAUDE.md but not visually confirmed. Agent DID fire and send a message (218 chars for first lead, 247 for second). Whether it's sending two separate messages or combining into one is unknown — check #gru-inbox in Slack.

Also: webhook-triggered agent runs don't store messages in messages.db (they bypass the message cycle). By design — the Slack output is the record. Not a bug.

## Architecture Decisions

### Secrets management
- `~/dev/.env.shared` — single source of truth for cross-project keys. Not in any repo. Syncthing distributes it.
- Project `.env` wins on conflict. Add new service keys to `.env.shared`, not to `.env`.
- BizMGR project is now redundant — all its creds are in `.env.shared`.

### n8n → NanoClaw integration (critical)
- **Slack does NOT deliver Socket Mode events for the bot's own messages** — n8n posting to Slack via Gru's bot token will never trigger NanoClaw.
- **Correct architecture**: n8n POSTs directly to NanoClaw webhook server (port 8088, reachable via Tailscale from VPS).
- n8n can post to Slack separately for human visibility, but the TRIGGER is the webhook POST.
- Human visibility comes from the agent's intake receipt message, not n8n.

### is_from_me vs is_bot_message
- `is_from_me = 1`: NanoClaw's own Slack output (user === botUserId). Filter these.
- `is_bot_message = 1`: any bot (kept for auditing, NOT used as filter).
- Queries filter `is_from_me = 0` instead of `is_bot_message = 0`.

### Webhook server
- Already existed, fully featured. Accepts `POST /hook/:id`, validates secret, runs agent group, sends output to channel.
- `data/webhooks.json` on Mac Mini (not synced, not in git — lives in gitignored `data/`).
- Watcher picks up changes to `webhooks.json` live (no restart needed for new webhooks).

## Open Items & Blockers
1. **Confirm 2-message format** in Slack — open #gru-inbox and check Sarah Chen's lead response
2. **n8n workflow** — needs to be built: Gravity Form → n8n → POST /hook/contact-form (Mac Mini via Tailscale)
3. **End-to-end test**: submit real WP contact form → n8n → webhook → Inbox Commander qualifies → queue drop
4. **Verify DB write + queue drop**: `SELECT * FROM leads;` and `ls data/business/queue/inbox-to-sales/`
5. **Build Sales Closer CLAUDE.md** (Wave 1, step 2 of 3)
6. **data/webhooks.json not in git** — recreate if Mac Mini wiped. Webhook secret is in `.env`.
7. **Sync-conflict files** — several `.sync-conflict-*` files in repo root to clean up
8. **husky pre-commit hook** — broken on Node 25. Use `--no-verify` or fix later.

## Next Steps (priority order)
1. Check #gru-inbox in Slack — verify 2-step message format for Sarah Chen lead
2. Build n8n workflow: Gravity Form → format fields → POST to webhook (Mac Mini Tailscale IP)
3. End-to-end test with real WP contact form
4. Verify DB write and queue drop after a qualified lead
5. Build Sales Closer CLAUDE.md (Wave 1, step 2)

## Gotchas Discovered
- **Slack bot self-message blackhole** — Slack never sends Socket Mode events for messages the bot itself posts. n8n must POST to the webhook, not post to Slack, to trigger NanoClaw.
- **Mac Mini SSH + npm**: non-interactive SSH doesn't source shell profiles. Use `/opt/homebrew/bin/npm run build` with full path. Added `nanoclaw-build` alias to `.zshrc` for interactive sessions.
- **data/webhooks.json is Mac Mini-only** — in gitignored `data/`. Document webhook definitions or back them up separately.
- **Webhook agent runs don't write to messages.db** — bypass the message storage cycle. Slack output is the only record.
- **ASSISTANT_NAME must match bot display name** — was "Andy", now "Mr Gru". All Gru channels have `requires_trigger=0` so the trigger pattern doesn't block them, but it shows up in logs.

## Environment Notes
- Mac Mini SSH: `ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204`
- Mac Mini hostname: macmini-eth.kudinov.com / mini-claw.local / 100.115.115.204 (Tailscale)
- NanoClaw logs: `~/dev/NanoClaw/logs/nanoclaw.log` (on Mac Mini)
- NanoClaw service: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- Mac Mini build: `ssh ... "/opt/homebrew/bin/node ~/dev/NanoClaw/node_modules/.bin/tsc"` from project dir
- Webhook endpoint: `http://100.115.115.204:8088/hook/contact-form`
- Webhook secret: see `.env` WEBHOOK_SECRET (`ed43647461a200485b69ec48c2e00b243941a859ac678307`)
- Gru bot: U0AJ7UDBD6D | App: B0AHDHJBNQ7
- VPS: 100.115.115.15:2225, user tca, key ~/Sync/Keys/byteberry/tandem_vps
- n8n: https://ops.tandemcoach.co (Google SSO — info@tandemcoaching.academy)
- Shared secrets: `~/dev/.env.shared` (Syncthing-synced, never commit)
