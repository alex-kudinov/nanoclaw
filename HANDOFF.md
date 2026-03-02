# Handoff — 2026-03-02 (Session 9)

## Session Summary
- Built cross-group messaging: `send_message` MCP tool now accepts `target_group` param, IPC auth relaxed to allow any registered group to message another
- Built Sales Closer CLAUDE.md with approval workflow (draft → feedback loop → "Approved")
- Discovered LLM agents ignore optional MCP params — `target_group: "sales"` never used despite 7x mentions in CLAUDE.md
- Pivoted to deterministic handoff: IPC watcher pattern-matches `[HANDOFF: X→Y]` in message text and routes to group Y automatically
- Added `suppress_output` to WebhookDefinition to prevent duplicate messages from webhook onOutput callback
- Simplified Inbox Commander CLAUDE.md to step-by-step format; handoff is now just posting text with the `[HANDOFF:]` marker
- Confirmed Syncthing IS syncing NanoClaw (git history matched). Gitignored `groups/` dirs need scp.

## Current State
- Branch: main, last commit `119bca1` — deterministic handoff routing
- Service running on Mac Mini with all changes deployed
- Container rebuilt with `target_group` support
- Inbox Commander: receipt + qualification + handoff all working
- Handoff reaches `#gru-sales` channel (confirmed in logs)
- **Sales Closer does NOT trigger** — see Active Problem

## Active Problem: Sales Closer Not Triggering

The handoff message reaches `#gru-sales` (confirmed: `IPC handoff routed to target group, handoffJid: slack:C0AHV1SGT6W`). But the Sales Closer container never spawns.

**Root cause (hypothesis):** The message loop filters out messages sent by the bot itself (Mr Gru, `U0AJ7UDBD6D`) to prevent infinite loops. The handoff is sent via `deps.sendMessage()` → Slack bot message → message loop sees `is_from_me` → skips it.

**Where to investigate:**
- `src/index.ts` — `startMessageLoop`, bot-message filtering logic
- `src/channels/slack.ts` — how it tags messages as bot/self

**Possible fixes (in order of preference):**
1. **Direct queue injection** — Instead of sending a Slack message, the IPC handoff injects directly into the GroupQueue for the target group, bypassing the message loop entirely
2. **New IPC `trigger_agent` command** — spawns a container directly for a target group with a given prompt
3. **Whitelist IPC-routed messages** — mark handoff messages so the message loop doesn't filter them

Option 1 is cleanest: the handoff doesn't need to be a visible Slack message at all. It can go straight to the queue. The Slack message can be a notification-only copy.

## Architecture Decisions

### Deterministic Handoff Routing
Agent posts `[HANDOFF: inbox→sales]` as plain text. IPC watcher in `src/ipc.ts` pattern-matches `\[HANDOFF:\s*\w+→(\w+)\]` and routes to the target group. No LLM cooperation needed for routing — agent just includes the marker text naturally as part of qualification output. Handoff message goes ONLY to target channel (not duplicated in source).

### suppress_output (WebhookDefinition)
`suppress_output: true` in webhook definition. When set, the webhook server's `onOutput` callback skips sending the agent's final result. Agent uses `mcp__nanoclaw__send_message` for all channel communication. Prevents the duplicate where both IPC and onOutput send the same text.

### Sales Closer Approval Workflow
`REQUIRE_APPROVAL=1` flag at top of `groups/sales/CLAUDE.md`. Agent drafts response, posts to `#gru-sales`, waits for "Approved" or feedback. Each reply triggers a new container (trigger `.*`, requires_trigger=0) with session context. Multi-turn flow.

## Open Items
1. **Sales Closer not triggering** — see Active Problem (highest priority)
2. **Sales Closer CLAUDE.md** — written but not committed (gitignored `groups/sales/`)
3. **business.db + queue dirs** on Mac Mini — unverified
4. **Architecture doc stale** — CF Access refs, rate limit
5. **Scheduler Minion** — knowledge file sync automation

## Next Steps
1. Fix Sales Closer triggering — implement direct queue injection for IPC handoffs
2. Test full pipeline end-to-end through approval loop
3. Commit Sales Closer CLAUDE.md

## Gotchas Discovered
- **LLM agents ignore optional MCP tool params:** Even with the parameter in the tool schema and 7 explicit mentions in CLAUDE.md (including "CRITICAL"), the agent never used `target_group: "sales"`. Don't rely on agents using optional params for critical routing. Use deterministic system-level pattern matching instead.
- **Webhook `onOutput` sends final result despite `isScheduledTask`:** The MCP tool description says "your final output is NOT sent" for scheduled tasks, but the webhook callback always sends it. Fixed with `suppress_output`.
- **Syncthing doesn't sync gitignored dirs:** `groups/` is in .gitignore; Syncthing appears to use gitignore as a filter. Use scp for files in gitignored directories.
- **Colima not auto-starting on Mac Mini:** Need `colima start` before container builds. Not in launchd.
- **Mac Mini npm not in PATH for non-interactive SSH:** Needs `export PATH=/opt/homebrew/bin:$PATH` prefix.

## Environment Notes
- Mac Mini SSH: `ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204`
- Mac Mini npm: `export PATH=/opt/homebrew/bin:$PATH`
- Colima: `colima start` then `CONTAINER_RUNTIME=docker ./container/build.sh`
- n8n editor: http://100.115.115.15:5678 (Tailscale)
- Webhook secret: `ed43647461a200485b69ec48c2e00b243941a859ac678307`
- Inbox channel: `slack:C0AHDHWMSKH` (#gru-inbox)
- Sales channel: `slack:C0AHV1SGT6W` (#gru-sales)
