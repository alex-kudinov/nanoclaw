# Knowledge Directory

Agent knowledge store for NanoClaw. All source files live in `shared/`. Each
agent folder under `agents/` contains copies of exactly the files that agent
needs — no more. The agent folder is bind-mounted read-only into the container
at `/workspace/knowledge`.

## Source files (shared/)

| File | Content | Updated by |
|------|---------|-----------|
| `KNOWLEDGE.md` | Tandem facts: programs, pricing, instructors, FAQs | Manual edit |
| `SCHEDULE.md` | Upcoming cohort dates (auto-generated) | `calendar_ctas.py` → Scheduler Minion |
| `LEARNED.md` | Gru-curated Q&As from real inquiries | Gru approval flow |
| `llms-full.txt` | Full tandemcoach.co site text (766 KB) | Weekly via Scheduler Minion |

## Agent files (agents/{name}/)

Each folder is mounted at `/workspace/knowledge` inside that agent's container.

| Agent | Gets | Reason |
|-------|-----|--------|
| `inbox` | KNOWLEDGE, SCHEDULE, LEARNED, llms-full.txt | Inbox Commander needs full context to classify and qualify |
| `sales` | KNOWLEDGE, SCHEDULE | Sales Closer answers program/pricing/scheduling questions |
| `chief` | KNOWLEDGE | Oversight only — escalation target, doesn't need schedule or learned |

## Keeping copies fresh

After updating any file in `shared/`, copy it to the relevant agent folders:

```bash
# Update a specific file for all agents that use it
cp knowledge/shared/KNOWLEDGE.md knowledge/agents/inbox/KNOWLEDGE.md
cp knowledge/shared/KNOWLEDGE.md knowledge/agents/sales/KNOWLEDGE.md
cp knowledge/shared/KNOWLEDGE.md knowledge/agents/chief/KNOWLEDGE.md

# SCHEDULE.md — inbox and sales
cp knowledge/shared/SCHEDULE.md knowledge/agents/inbox/SCHEDULE.md
cp knowledge/shared/SCHEDULE.md knowledge/agents/sales/SCHEDULE.md

# LEARNED.md — inbox only
cp knowledge/shared/LEARNED.md knowledge/agents/inbox/LEARNED.md

# llms-full.txt — inbox only (copy from tandemweb)
cp ~/dev/tandemweb/llms-full.txt knowledge/shared/llms-full.txt
cp knowledge/shared/llms-full.txt knowledge/agents/inbox/llms-full.txt
```

The Scheduler Minion will automate these copies once built.

## Adding a new agent

1. Create `knowledge/agents/{name}/`
2. Copy the files it needs from `shared/`
3. Document it in the table above
4. Add `additionalMounts` to the group's DB record:
   ```json
   { "hostPath": "~/dev/NanoClaw/knowledge/agents/{name}", "containerPath": "knowledge", "readonly": true }
   ```
5. Restart NanoClaw

The mount allowlist (`~/.config/nanoclaw/mount-allowlist.json` on Mac Mini) already
allows `~/dev/NanoClaw/knowledge/` — no changes needed for new agents under it.
