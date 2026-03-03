# Handoff — 2026-03-03 Session 13

## Session Summary
- Implemented full Gmail Mailman integration (14-task plan from autonomous-plan steelman process in session 12)
- Created 7 new files: gmail-auth, gmail-consent, gmail-parser, gmail-api, gmail-ipc-handlers, channels/gmail, groups/mailman/CLAUDE.md
- Modified 5 files: package.json (deps), config.ts (Gmail config), channels/index.ts (barrel), ipc.ts (Gmail IPC dispatch), ipc-mcp-stdio.ts (4 MCP tools)
- Fixed Slack channel to use registry self-registration pattern (was previously not using registerChannel)
- Fixed pre-existing build error: webhook-server.ts referenced removed `MAIN_GROUP_FOLDER` export
- Deployed to Mac Mini: rsync, npm ci, container rebuild, service restart
- Service verified running with Slack connected; Gmail gracefully disabled (no OAuth yet)
- 14 gmail-parser unit tests written and passing

## Current State
- Branch: main
- Last commit: 7cb063f (feat: migrate business DB from SQLite to PostgreSQL with per-agent roles)
- Uncommitted changes (9 modified + 7 untracked):
  - `package.json` / `package-lock.json` — added `googleapis`, `google-auth-library`, `gmail:auth` script
  - `src/config.ts` — added GMAIL_POLL_INTERVAL, GMAIL_LABEL, GMAIL_MONITORED_EMAIL, GMAIL_SEND_AS
  - `src/channels/index.ts` — enabled `import './gmail.js'` and `import './slack.js'`
  - `src/channels/slack.ts` — added `registerChannel('slack', factory)` self-registration at bottom
  - `src/ipc.ts` — restructured message processing as if/else if chain, added Gmail IPC dispatch
  - `src/webhook-server.ts` — replaced `MAIN_GROUP_FOLDER` import with `group.isMain === true`
  - `container/agent-runner/src/ipc-mcp-stdio.ts` — added 4 Gmail MCP tools
  - `src/gmail-auth.ts` — NEW: singleton cached OAuth2 client
  - `src/gmail-consent.ts` — NEW: one-time OAuth consent CLI
  - `src/gmail-parser.ts` — NEW: email body/header parsing, HTML stripping, quoted reply removal
  - `src/gmail-parser.test.ts` — NEW: 14 unit tests (all passing)
  - `src/gmail-api.ts` — NEW: Gmail API operations (sendEmail, replyToThread, searchEmails, readEmail)
  - `src/gmail-ipc-handlers.ts` — NEW: host-side IPC handlers for gmail_* types
  - `src/channels/gmail.ts` — NEW: Gmail Channel with label-based polling
  - `groups/mailman/CLAUDE.md` — NEW: Mailman agent instructions
- Container image rebuilt on Mac Mini with new MCP tools
- Service running on Mac Mini with Slack connected

## Active Problem Context
Gmail channel is deployed but disabled — needs OAuth setup. No blocking bugs.

## Decisions & Reasoning
- **Polling not Pub/Sub:** 30s chained setTimeout. No public endpoint or GCP Pub/Sub needed. Upgradeable later.
- **Single mailbox JID:** All inbound maps to `gmail:info@tandemcoach.co`. Sender in sender/sender_name fields. Prevents JID explosion.
- **IPC if/else if restructure:** Old code had `unlinkSync` outside type check — deleted files before new handlers ran. Restructured with unlinkSync inside each branch.
- **Slack self-registration fix:** Slack wasn't using registerChannel. Added it to match Gmail's pattern. Previous deployment worked because Mac Mini had uncommitted code that instantiated Slack directly.
- **MCP snake_case → IPC camelCase:** Mapping at write time in MCP tool handlers.
- **Catch-up polling:** Every 10th poll runs without `after:` filter for late-labeled emails. In-memory Set dedup (capped at 5000).

## Open Items & Blockers
- **Gmail OAuth not completed:** Need GCP project + OAuth client for info@tandemcoach.co
- **Mailman group not registered:** Needs registration after Gmail channel is live
- **Uncommitted changes:** 16 files need committing
- **Deferred from previous sessions:**
  - Sales minion: optimize response to keep only most relevant information
  - External-facing agents: use frontier model (Opus 4.6), make model configurable
  - Stripe Cashier + Student Registrar pipeline

## Next Steps
1. Complete Gmail OAuth setup (GCP project, client credentials, `npm run gmail:auth`)
2. Set GMAIL_MONITORED_EMAIL=info@tandemcoach.co + create "NanoClaw" label in Gmail
3. Register mailman group with JID `gmail:info@tandemcoach.co`
4. Test end-to-end: labeled email → mailman triggers → Slack summary
5. Commit all changes
6. Address deferred items

## Gotchas Discovered
- **Slack channel wasn't using registry pattern:** Barrel file had all channels commented out. Slack worked before via uncommitted direct instantiation on Mac Mini. Rsync overwrote it. Fixed by adding registerChannel to slack.ts.
- **webhook-server.ts MAIN_GROUP_FOLDER:** Referenced removed config export. Fixed with `group.isMain === true`.
- **Container PATH on Mac Mini:** Need `export PATH="/usr/local/bin:$PATH"` before `./container/build.sh`.
- **Gmail `after:` uses Unix seconds, not ms:** `messages.list` query expects epoch seconds. Must `Math.floor(lastCheckMs / 1000)`.

## Environment Notes
- Mac Mini SSH: `ssh mini-claw` (Tailscale)
- PostgreSQL: `nanoclaw_business` on 192.168.64.1:5432
- Container runtime: `/usr/local/bin/container`
- Gmail account: info@tandemcoach.co (Google Workspace, tandemcoachingacademy domain)
- Send-as alias: hello@tandemcoach.co
- Gmail OAuth scopes: gmail.readonly, gmail.send, gmail.modify
- Gmail label for routing: "NanoClaw" (configurable via GMAIL_LABEL env var)
