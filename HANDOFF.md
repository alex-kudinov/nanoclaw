# Handoff — 2026-03-01 (Session 4)

## Session Summary
- Created Slack app "Gru" (Mr Gru) in cnpc.coach workspace with full scope set
- Retired nclaw, migrated everything to Gru (bot token + app token in .env)
- Created Wave 1 channels: #gru-inbox (C0AHDHWMSKH), #gru-sales (C0AHV1SGT6W), #gru-chief (C0AHDHX1NBH) — private, Gru + Alex invited
- Initialized business.db on Mac Mini from schema.sql (8 tables)
- Created queue/ directory structure (inbox-to-sales, any-to-chief, sales-to-proposals, proposals-to-sales, billing-to-books)
- Created groups/inbox/CLAUDE.md, groups/sales/CLAUDE.md, groups/chief/CLAUDE.md
- Registered all 5 channels in Mac Mini's messages.db (slack:C... → folder)
- Restarted NanoClaw on Mac Mini — now running as Gru (botUserId: U0AJ7UDBD6D), groupCount: 5
- Set up SSH to Mac Mini: key at ~/Sync/keys/xbohdpukc, host 100.115.115.204
- Migrated pulse webhook to Gru (tandemweb/.env PULSE_SLACK_WEBHOOK updated)
- Renamed nclaw-mac → general-gru (channel ID C0AHEJM92KY unchanged)
- Created .stignore to prevent Syncthing from syncing store/ and business.db
- Added full Gru bot scope set via App Manifest (18 scopes incl. reactions:write, users:read.email, channels:manage, im:write, etc.)

## Current State
- Branch: main (uncommitted changes — many files)
- NanoClaw: running on Mac Mini as Gru, PID 48464, groupCount 5, all channels live
- Gru bot: U0AJ7UDBD6D | App: B0AHDHJBNQ7 | xoxb token in .env (same after last reinstall)
- Wave 0: COMPLETE ✅
- Wave 1 agent structure: COMPLETE ✅ (groups + db + queues created)
- NOT YET TESTED: Inbox Commander agent response to a test lead

## Active Problem Context
The test lead was posted to #gru-inbox earlier but was posted BY the Gru bot token — NanoClaw likely filtered it as a bot message. Need to verify if NanoClaw picks up messages posted by the bot itself (n8n will also post via bot token).

This is a potential architectural issue: n8n posts to Slack using Gru's bot token → NanoClaw may filter it as a bot_message → agents never fire. Need to test and potentially adjust the message filtering logic in slack.ts.

## Decisions & Reasoning
- **One bot (Gru) for everything** — nclaw retired, Gru handles personal assistant + all business agents. One NanoClaw process, one Slack connection.
- **Socket Mode** — xapp token enables outbound WebSocket from Mac Mini, no inbound ports needed
- **store/ excluded from Syncthing** — .stignore added to prevent SQLite corruption across machines
- **Mac Mini is authoritative** — store/messages.db and data/business/business.db live on Mac Mini only
- **SSH key**: ~/Sync/keys/xbohdpukc (no passphrase, syncs across machines)
- **general-gru channel** — was nclaw-mac, renamed by user manually (ID unchanged: C0AHEJM92KY)

## Open Items & Blockers
1. **Test Inbox Commander** — post a non-bot message to #gru-inbox and verify agent fires
2. **Bot message filtering** — NanoClaw may ignore messages posted by Gru bot (n8n uses bot token). If so, check slack.ts BotMessageEvent filtering and possibly allow n8n's bot messages through
3. **n8n workflow** — contact form → #gru-inbox not yet built
4. **SSH config** — add Host mini-claw entry to ~/.ssh/config for convenience
5. **husky pre-commit hook** — still broken on Node 25 (better-sqlite3 gyp). Commits need --no-verify or fix node version.
6. **Sync conflict files** — several .sync-conflict-* files in repo root, should be cleaned up

## Next Steps (priority order)
1. Test: send a non-bot message to #gru-inbox (from Slack UI manually) → verify Inbox Commander fires
2. If bot message filtering blocks n8n: investigate slack.ts BotMessageEvent handling, determine fix
3. Build n8n workflow: contact form → structured message → #gru-inbox
4. End-to-end test: POST to WP contact form → n8n → #gru-inbox → agent qualifies → drops to queue
5. Add SSH config entry for mini-claw

## Gotchas Discovered
- **Slack scope UI bug** — adding scopes via the OAuth UI drops others on page refresh. Always use App Manifest to set scopes atomically.
- **Slack reinstall sometimes revokes bot token** — always verify token after reinstall.
- **Bot-created channels** — bot is automatically a member (cant_invite_self on invite is expected).
- **store/messages.db is Mac Mini-only** — .stignore now prevents Syncthing from touching it.
- **data/business/ doesn't auto-sync** — had to manually scp schema.sql and init db on Mac Mini.
- **NanoClaw trigger log says "@Andy"** — this is TRIGGER_PATTERN from config, not the bot name. gru channels have requires_trigger=0 so trigger pattern is irrelevant for them.
- **SSH to Mac Mini needs key specified** — ssh -i ~/Sync/keys/xbohdpukc (no ~/.ssh/id_* exists on this machine)

## Environment Notes
- Mac Mini SSH: ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204
- Mac Mini hostname: macmini-eth.kudinov.com / mini-claw.local / 100.115.115.204 (Tailscale)
- NanoClaw logs: ~/dev/NanoClaw/logs/nanoclaw.log (on Mac Mini)
- NanoClaw service: launchctl kickstart -k gui/$(id -u)/com.nanoclaw
- Gru bot token: NanoClaw/.env SLACK_BOT_TOKEN
- Gru app token: NanoClaw/.env SLACK_APP_TOKEN
- VPS: 100.115.115.15:2225, user tca, key ~/Sync/Keys/byteberry/tandem_vps
- n8n: https://ops.tandemcoach.co (Google SSO — info@tandemcoaching.academy)
