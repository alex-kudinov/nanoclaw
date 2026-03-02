# Handoff — 2026-03-01 (Session 7)

## Session Summary
- Built `knowledge/` directory system — per-agent knowledge mounts with copy-based distribution
- Committed TandemWeb `calendar_ctas.py` update (writes SCHEDULE.md to `knowledge/shared/`, copies to agent folders, best-effort wrapper)
- Committed NanoClaw `knowledge/` structure + .gitignore + prettier install
- Wired up mounts on Mac Mini: allowlist, DB container_config for inbox/sales/chief, copied llms-full.txt
- Fixed expired SSL cert (Cloudflare SSL mode → Full)
- Set up n8n on VPS: fresh install, owner account, "Contact Form → Gru Inbox" workflow
- Fixed n8n issues: N8N_EDITOR_BASE_URL, N8N_PROXY_HOPS, N8N_SECURE_COOKIE, pgcrypto extension
- Resolved n8n editor access: Tailscale direct bypasses broken LiteSpeed cookie proxy
- Added Cloudflare rate limiting (30 req/min on /rest/*)
- Cleaned up Cloudflare: removed all ops.tandemcoach.co Access apps (editor via Tailscale only)
- Tested full pipeline: n8n webhook → sanitize → Mac Mini → Gru agent → Slack

## Current State
- Branch: main, diverged from upstream (6 vs 8 commits)
- Working tree clean
- Last commit: caff1a3 — knowledge/ directory + prettier

## Architecture Decisions

### Knowledge Mount System
- `knowledge/shared/` = source of truth (KNOWLEDGE.md, SCHEDULE.md, LEARNED.md, llms-full.txt)
- `knowledge/agents/{name}/` = per-agent copies, mounted read-only at /workspace/knowledge
- Copy-based, no symlinks. README.md documents how to add agents.
- Scheduler Minion will automate copies; manual for now.

### n8n Access Model
- Editor: Tailscale only (http://100.115.115.15:5678) — WireGuard-encrypted, no public exposure
- Webhooks: public via webhooks.tandemcoach.co (LiteSpeed proxy, works for POST)
- OAuth callbacks: public via ops.tandemcoach.co (LiteSpeed proxy, works for redirects)
- Cloudflare Access: REMOVED from ops.tandemcoach.co — incompatible with n8n SPA
- Security: n8n email/password auth + Cloudflare rate limiting + Tailscale-only editor

### n8n Workflow: Contact Form → Gru Inbox
- Webhook: https://webhooks.tandemcoach.co/webhook/contact-form
- Nodes: GravityForms Webhook → Sanitize & Extract (JS) → POST to Gru Inbox
- Handles multiple GF field name patterns
- POSTs clean {name, email, company, message, submitted_at} to Mac Mini webhook

## Open Items
1. **GravityForms webhook config** — point GF at webhooks.tandemcoach.co/webhook/contact-form
2. **LiteSpeed cookie bug** — needs sudo on VPS. Low priority (Tailscale works).
3. **SSL cert renewal** — expired *.tandemcoach.co. Low priority (Cloudflare SSL=Full).
4. **Inbox Commander 2-step format** — intake receipt never appears
5. **Sales Closer CLAUDE.md** — not yet written
6. **Scheduler Minion** — automate knowledge file copies + llms-full.txt sync
7. **"Create agent" skill** — automate folder/DB/knowledge/CLAUDE.md setup

## Next Steps (priority order)
1. Configure GravityForms to POST to n8n webhook
2. Test with a real GF submission end-to-end
3. Build Sales Closer CLAUDE.md
4. Fix Inbox Commander 2-step output

## Gotchas Discovered
- **n8n `user-management:reset` leaves ghost user** — empty email but global:owner role. DELETE from user table manually.
- **Express trust proxy required behind LiteSpeed** — N8N_PROXY_HOPS=2, else X-Forwarded-For kills requests.
- **LiteSpeed mangles n8n auth cookies** — root cause unknown, no sudo. Workaround: Tailscale.
- **pgcrypto extension needed** — not in postgres:16-alpine by default. CREATE EXTENSION pgcrypto.
- **N8N_SECURE_COOKIE=false required** for HTTP Tailscale access.
- **docker compose restart does NOT reload env vars** — must full down/up.
- **CF Access incompatible with n8n SPA** — intercepts API calls, corrupts session state.
- **Rule: check if you can do it before asking the user.**

## Environment Notes
- n8n editor: http://100.115.115.15:5678 (Tailscale)
- n8n login: info@tandemcoach.co / Gru2026ops
- VPS SSH: ssh -i ~/Sync/Keys/byteberry/tandem_vps -p 2225 tca@100.115.115.15
- Mac Mini SSH: ssh -i ~/Sync/keys/xbohdpukc xbohdpukc@100.115.115.204
- NanoClaw DB: store/messages.db (NOT data/nanoclaw.db)
- Full infrastructure ref: memory/vps-infrastructure.md
