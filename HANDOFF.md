# Handoff — 2026-03-02 (Session 10)

## Session Summary
- Diagnosed Sales Closer "can't read thread" bug: `getThreadParent` requires the parent message in DB, but Slack Socket Mode doesn't reliably deliver `bot_message` events
- Added `storeOutbound` method to `SlackChannel` — proactively stores bot messages in DB right after `chat.postMessage` returns, before relying on bot_message event
- Deployed fix to Mac Mini, restarted service, ran test (Marcus Webb)
- **Fix confirmed: parent message IS now in DB** (id=`1772496341.077149`, content starts with `[SALES REVIEW]`, thread_ts=NULL, from_group=sales)
- **Agent STILL says "I don't have access to my previous draft"** — so the issue is NOT about the message being in the DB

## Current State
- Branch: main, last commit `73f678c`
- Uncommitted changes: `storeOutbound` fix in `src/channels/slack.ts` (deployed to Mac Mini, NOT committed)
- Other uncommitted changes: formatting-only (prettier) across multiple files
- Service running on Mac Mini with storeOutbound fix deployed

## Active Problem: Sales Closer Still Can't Read Thread Context

### What's confirmed working
- Parent message (`[SALES REVIEW]`) IS stored in DB with correct `id` matching the Slack `ts`
- DB query from Mac Mini shows: `1772496341.077149|Mr Gru|[SALES REVIEW] Lead #1...||sales`
- User reply stored correctly: `1772496438.191379|Alex Kudinov|Well, the problem...|1772496341.077149|`
- Thread_ts in reply (`1772496341.077149`) matches parent id — `getThreadParent` SHOULD find it

### What's NOT working
The agent container still says: "I don't have access to my previous draft in this thread. The database system isn't available yet."

### Key clue: "The database system isn't available yet"
The agent mentions the DB not being available. This is likely about `better-sqlite3` inside the container, NOT about the message DB on the host. The Sales Closer CLAUDE.md has `node -e "const Database = require('better-sqlite3')..."` commands for reading lead records from `business.db`. Recent commits tried to fix this:
- `9fb8eab fix: add @types/better-sqlite3 to container devDependencies`
- `14c0b11 fix: dynamic import better-sqlite3 to avoid container TS compilation failure`
- `766e452 fix: use createRequire for better-sqlite3 to bypass TS module resolution`

**Container image may NOT have been rebuilt since these commits.** Check with:
```bash
ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204 'export PATH=/opt/homebrew/bin:$PATH; colima start && CONTAINER_RUNTIME=docker docker images nanoclaw-agent --format "{{.CreatedAt}}"'
```

### Root cause hypotheses (priority order)

1. **Thread context IS being sent to the agent, but agent is confused/ignoring it.** The `[SALES REVIEW]` is prepended via `getThreadParent`. It appears in the `<messages>` XML. But the agent might see a message from "Mr Gru" (itself) and not recognize it as "its own draft" from a previous session. Need to verify by checking the actual prompt the agent receives.

2. **`getThreadParent` works in DB but something fails in `processGroupMessages`.** Maybe `lastAgentTimestamp` for the thread composite key is set in a way that `getMessagesSince` returns 0 messages, short-circuiting before `getThreadParent` runs. Need to add logging.

3. **Session key mismatch.** The initial `[SALES REVIEW]` was processed under `sales||root` session. The thread reply creates `sales||{thread_ts}` — a brand new session. The agent has no prior context. If the prompt's `<messages>` block is the ONLY context and it IS there, the agent should still work. But if the `<messages>` block is somehow empty or missing the parent, that's the bug.

### Debugging next steps

1. **Check the actual prompt sent to the container.** Add a `logger.info({ prompt }, 'Sending prompt to container')` in `processGroupMessages` right after `formatMessages`, rebuild, redeploy, and test. This will confirm if the parent message is actually in the prompt.

2. **Alternatively, check the container logs** — the agent's log shows what prompt it received:
   ```bash
   ssh Mac Mini 'ls -lt ~/dev/NanoClaw/groups/sales/logs/ | head -5'
   # then cat the most recent log
   ```

3. **Rebuild container image** — if `better-sqlite3` is broken inside the container, the agent panics about DB unavailability and might not properly read the prompt context.
   ```bash
   ssh Mac Mini 'export PATH=/opt/homebrew/bin:$PATH; cd ~/dev/NanoClaw && colima start && CONTAINER_RUNTIME=docker ./container/build.sh'
   ```

## Decisions & Reasoning

### storeOutbound approach (confirmed correct)
Store bot messages proactively in `SlackChannel.sendMessage` immediately after `chat.postMessage` returns. Uses `INSERT OR REPLACE` so it's idempotent if the bot_message event also fires. This is better than storing in the IPC watcher because the Slack channel knows the actual `result.ts` (needed for `getThreadParent` lookup), whereas the IPC watcher would need a synthetic ID.

### Rejected: Changing SendMessageFn to return ts
Would require changing the type signature everywhere. The Slack channel approach is more targeted.

## Architecture Notes

### Thread handling flow
1. User replies in thread → Slack event with `thread_ts`
2. Message loop groups by `chatJid||threadTs` → `processGroupMessages(chatJid, threadTs)`
3. `getMessagesSince(chatJid, cursor, "Gru", "sales", threadTs)` — gets thread messages excluding agent's own
4. `getThreadParent(chatJid, threadTs)` — looks up `WHERE id = threadTs` (parent's Slack ts = thread_ts of replies)
5. Parent prepended to `messagesToFormat`
6. `formatMessages` wraps in `<messages>` XML with `thread_ts` attributes
7. New container spawned with session key `sales||{threadTs}` (separate from `sales||root`)

### IPC message flow
Agent → `mcp__nanoclaw__send_message` → IPC file → IPC watcher → `channel.sendMessage` → Slack API → `storeOutbound` (NEW) → DB

## Open Items
1. **Sales Closer thread context** — parent is in DB but agent still can't read it (see Active Problem)
2. **Container image rebuild** — may be needed for better-sqlite3 inside container
3. **Unstaged changes** — formatting + storeOutbound fix need to be committed
4. **groups/newsroom/** — untracked directory, purpose unknown
5. **Architecture doc stale** — CF Access refs, rate limit
6. **Scheduler Minion** — knowledge file sync automation

## Next Steps
1. Check container logs for Marcus Webb sales run — see what prompt the agent actually received
2. If parent IS in prompt: issue is CLAUDE.md instructions or session confusion — update Sales Closer CLAUDE.md to explicitly say "your previous draft is in the <messages> block above"
3. If parent is NOT in prompt: add logging to `processGroupMessages` thread parent lookup path
4. Rebuild container image if `better-sqlite3` is broken inside container
5. Commit storeOutbound fix + other changes

## Gotchas Discovered
- **Slack Socket Mode bot_message delivery is unreliable.** Bot messages posted by the app via `chat.postMessage` may never trigger a `bot_message` event back to the same app. Any feature that depends on bot messages being in the DB must store them proactively at send time, not rely on events. The `storeOutbound` pattern in `SlackChannel` is the canonical fix.
- **IPC handoff messages have `storeMessageDirect`; normal IPC messages did NOT** — now fixed by `storeOutbound` in the channel layer, which is more correct (uses real Slack ts as ID).
- **Container image staleness** — committing container fixes doesn't rebuild the image. Need explicit `./container/build.sh` on Mac Mini after any container code changes.

## Environment Notes
- Mac Mini SSH: `ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204`
- Mac Mini npm: `export PATH=/opt/homebrew/bin:$PATH`
- Colima: `colima start` then `CONTAINER_RUNTIME=docker ./container/build.sh`
- Webhook secret: `ed43647461a200485b69ec48c2e00b243941a859ac678307`
- Inbox channel: `slack:C0AHDHWMSKH` (#gru-inbox)
- Sales channel: `slack:C0AHV1SGT6W` (#gru-sales)
- Test webhook: `curl -X POST http://100.115.115.204:8088/hook/contact-form -H "Content-Type: application/json" -H "X-Webhook-Secret: ed43647461a200485b69ec48c2e00b243941a859ac678307" -d '{"name":"...","email":"...","message":"...","submitted_at":"..."}'`
