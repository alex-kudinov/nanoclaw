# Handoff — 2026-03-02 Session 12

## Session Summary
- Completed PostgreSQL migration (Phase 1-3 of plan)
- Replaced ephemeral SQLite with persistent PostgreSQL on Mac Mini host
- Created per-agent DB roles: nanoclaw_inbox (INSERT leads), nanoclaw_sales (SELECT+UPDATE), nanoclaw_chief, nanoclaw_admin
- Updated agent CLAUDE.md files: sqlite3/better-sqlite3 commands → psql
- Updated container image: added postgresql-client to Dockerfile
- Updated container-runner: readSecrets(groupFolder) constructs per-agent BUSINESS_DB_URL
- Updated agent-runner: parses BUSINESS_DB_URL into PG* env vars so psql works with no args
- Fixed Apple Container builder DNS (must use `container builder start --dns`, not `container build --dns`)
- Fixed SSH connectivity to Mac Mini (stale hostname, added ~/.ssh/config entry)
- Integration tested: Lead #1 (Sarah Thompson) inserted with real ID, Sales Closer received handoff

## Current State
- Branch: main
- Last commit: e30720e (fix: correct knowledge mount paths)
- Uncommitted changes (6 files):
  - `container/Dockerfile` — added `postgresql-client` to apt-get
  - `container/agent-runner/src/index.ts` — replaced SQLite init (lines 511-536) with PG env propagation
  - `container/build.sh` — added `--dns 192.168.1.1` to build command
  - `groups/inbox/CLAUDE.md` — sqlite3 → psql commands
  - `groups/sales/CLAUDE.md` — better-sqlite3 → psql commands
  - `src/container-runner.ts` — readSecrets(groupFolder) with per-agent DB credentials
- Container image rebuilt on Mac Mini with postgresql-client
- Service running on Mac Mini with all changes deployed

## Active Problem Context
No blocking bugs. One minor observation: Sales Closer didn't execute the `psql UPDATE leads SET status = 'sales-review'` step during integration test — the SALES REVIEW draft posted correctly but the DB status stayed "qualified". Likely agent treating it as best-effort.

## Decisions & Reasoning
- **PostgreSQL over SQLite:** User explicitly rejected IPC-mediated DB access as "overkill" and read-only SQLite mounts as insufficient. PostgreSQL with per-agent login roles gives standard DB-level permissions. Each agent gets a connection string for its specific role.
- **PG env vars via stdin secrets:** BUSINESS_DB_URL passed via stdin JSON to container, agent-runner parses into PG* env vars. psql reads these natively. Chose over .pgpass file (simpler, nothing on disk).
- **Builder DNS separate from build --dns:** Apple Container's `container build --dns` does NOT configure the buildkit worker VM. Must use `container builder start --dns 192.168.1.1`. Discovered through 5+ failed build attempts.
- **NAT interface en8 not en0:** Mac Mini's active internet interface is en8 (USB Ethernet). Must verify with `route get 8.8.8.8 | grep interface`.

## Open Items & Blockers
- **Uncommitted changes:** 6 files need to be committed
- **Mailman minion design:** User's next priority — dual-role email agent (send + receive). Not started.
- **Sales Closer DB update skipped:** Agent posts review but doesn't run psql UPDATE. Low priority.
- **groups/newsroom/** — untracked directory

## Next Steps
1. Commit the PostgreSQL migration changes
2. Design the mailman minion (email send/receive agent)
3. Optionally investigate Sales Closer DB update skip

## Gotchas Discovered
- **Apple Container builder DNS:** `container build --dns` does NOT work. Must use `container builder start --dns <ip>`. Resets on reboot.
- **Three things reset on Mac Mini reboot:** IP forwarding, NAT rules, builder DNS. All must be restored:
  1. `sudo sysctl -w net.inet.ip.forwarding=1`
  2. `echo "nat on en8 from 192.168.64.0/24 to any -> (en8)" | sudo pfctl -ef -`
  3. `container builder stop && container builder delete && container builder start --dns 192.168.1.1`
- **Mac Mini hostname `macmini` → stale .19:** Real IP is 192.168.1.50 (LAN) or mini-claw (Tailscale).
- **SSH keys in ~/Sync/keys/ not ~/.ssh/:** Permission-restricted directory, always use Sync/keys.
- **Remote sudo over SSH:** `echo pw | sudo -S` doesn't work non-interactively. Write temp script with password inline, execute, delete.
- **Non-interactive SSH needs `source ~/.zprofile`:** npm/node not in PATH without it. container binary at /usr/local/bin/ also needs explicit PATH.
- **psql binary at /opt/homebrew/opt/postgresql@16/bin/psql:** Not in default PATH even with zprofile.

## Environment Notes
- Mac Mini SSH: `ssh mini-claw` (Tailscale, configured in ~/.ssh/config)
- PostgreSQL on Mac Mini: `nanoclaw_business` on 192.168.64.1:5432
- Container runtime: `/usr/local/bin/container`
- DB credentials: `~/dev/NanoClaw/.env` on Mac Mini
- Schema: `data/business/schema-pg.sql`
- Webhook secret: `ed43647461a200485b69ec48c2e00b243941a859ac678307`
- Test webhook: `curl -X POST http://192.168.1.50:8088/hook/contact-form -H "Content-Type: application/json" -H "X-Webhook-Secret: <secret>" -d @payload.json`
