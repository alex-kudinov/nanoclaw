# Handoff — 2026-03-02 (Session 8)

## Session Summary
- Resolved rebase conflict in `src/container-runner.ts` (kept proxy-based `readSecrets()` from upstream)
- Connected GravityForms to n8n webhook — full end-to-end pipeline now live
- Added header auth (httpHeaderAuth) to n8n webhook node — rejects 403 without correct `X-Webhook-Secret`
- Fixed n8n sanitize node: GF sends message in field `10`, not `3` — added `10` to field patterns
- Fixed Inbox Commander CLAUDE.md: "CNPC.coach" → "Tandem Coaching", added Knowledge section pointing to `/workspace/knowledge/KNOWLEDGE.md`, expanded qualification criteria to include ICF certification, mentor coaching, coaching supervision, ACSTH/ACTP programs
- Tested full pipeline: GF form → n8n webhook → sanitize → Mac Mini webhook → Inbox Commander container → Slack `#gru-inbox` — working end-to-end

## Current State
- Branch: main, 7 commits ahead of upstream
- Uncommitted: `groups/inbox/CLAUDE.md` (already pushed to Mac Mini via scp)
- Last commit: efe8dd1 — Session 7 knowledge mounts
- n8n workflow "Contact Form → Gru Inbox" active with header auth
- GravityForms configured to POST to `webhooks.tandemcoach.co/webhook/contact-form`

## Architecture Decisions

### n8n Webhook Auth
- Used n8n's native `headerAuth` on the webhook node (not an IF node)
- Rejects at entry point with 403 before workflow starts
- Credential: `httpHeaderAuth` ID `ivREfplHdZ5oMTwG` ("GravityForms Webhook Secret")
- Secret: `ed43647461a200485b69ec48c2e00b243941a859ac678307`

### GF Field Mapping
- GF sends: `1.3` (first name), `1.6` (last name), `2` (email), `10` (message), `date_created`
- Also sends: `form_id`, `id`, `status`, `ip`, `source_url`, `user_agent`, `9048`/`9148` (tracking)
- Sanitize node checks multiple patterns for each field — handles both GF numeric IDs and human-readable names

### Inbox Commander Knowledge Integration
- Agent reads `/workspace/knowledge/KNOWLEDGE.md` before qualifying — knows all TC services
- Qualification bias: if in doubt, qualify — Sales Closer handles program matching
- Agent told never to guess — use KNOWLEDGE.md as source of truth

## Open Items
1. **Sales Closer CLAUDE.md** — not yet written, qualified leads queue to `inbox-to-sales/` but nothing picks them up
2. **Inbox Commander 2-step format** — intake receipt works, but the queue/DB write parts haven't been tested (no `business.db` or queue dirs verified on Mac Mini)
3. **Architecture doc stale** — `docs/business-agents-architecture.md` still references CF Access on ops.tandemcoach.co (removed in session 7). Lines 76-83, 295-296, 457 need updating. Rate limit is 30/min not 60.
4. **`memory/vps-infrastructure.md`** — referenced in session 7 handoff but never created
5. **Scheduler Minion** — automate knowledge file copies + llms-full.txt sync
6. **n8n test URL** — n8n editor base URL still set to ops.tandemcoach.co, test webhook URL in UI won't work. Editor accessed via Tailscale (http://100.115.115.15:5678). Low priority.
7. **Syncthing not syncing NanoClaw** — scp was needed to push CLAUDE.md to Mac Mini. May need to add NanoClaw dir to Syncthing or verify config.

## Next Steps (priority order)
1. Commit inbox CLAUDE.md changes
2. Run a real GF submission end-to-end (user submits → agent qualifies → check Slack output quality)
3. Verify business.db and queue dirs exist on Mac Mini for DB write / queue drop
4. Build Sales Closer CLAUDE.md + register group
5. Update architecture doc (CF Access removal, rate limit correction)

## Gotchas Discovered
- **n8n workflow updates don't take effect while active** — must deactivate/reactivate (POST /workflows/1/deactivate then /activate with versionId)
- **n8n activate endpoint requires versionId** — POST body `{"versionId": "..."}` or it returns validation error
- **n8n execution data uses indexed array format** — not nested JSON. Values like `"4"` are indexes into a flat array. Need recursive deref to read execution details.
- **GF field IDs vary per form** — the contact form uses field 10 for message, not 3. Always check a real submission's body before finalizing the sanitize node.
- **GF preview submissions may not trigger webhooks** — real form submits do.
- **Syncthing may not cover NanoClaw dir** — files didn't sync automatically between Mac Studio and Mac Mini.

## Environment Notes
- n8n editor: http://100.115.115.15:5678 (Tailscale)
- n8n login: info@tandemcoach.co / Gru2026ops
- n8n docker compose: /home/tca/n8n/docker-compose.yml
- VPS SSH: ssh -i ~/Sync/Keys/byteberry/tandem_vps -p 2225 tca@100.115.115.15
- Mac Mini SSH: ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204
- NanoClaw DB: store/messages.db
- NanoClaw logs: /Users/xbohdpukc/dev/NanoClaw/logs/nanoclaw.log (on Mac Mini)
- n8n cookie jar (this session): /tmp/n8n-cookies.txt
