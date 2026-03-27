# Knowledge Directory

Agent knowledge store for NanoClaw. All source files live in `shared/`. Each
agent folder under `agents/` contains copies of exactly the files that agent
needs — no more. The agent folder is bind-mounted read-only into the container
at `/workspace/knowledge`.

## How Knowledge Works

**Agents only read KNOWLEDGE.md.** It is the single source of truth, always
complete, always current. Lessons from human feedback are automatically merged
into KNOWLEDGE.md — agents never read LEARNED.md directly.

### Pipeline

```
                                   ┌─────────────────────┐
  Human lesson ──→ chief routes ──→│ LEARNED.md (per-agent)│
  via Slack        via IPC         │ append-only patch log │
                                   └─────────┬───────────┘
                                             │
                              merge-lessons.sh (claude --print)
                                             │
                                             ▼
                                   ┌─────────────────────┐
  llms-full.txt ──→ generate- ───→│  KNOWLEDGE.md        │──→ agents read this
  (weekly)          knowledge.sh   │  (shared, complete)  │
                                   └─────────────────────┘
```

### Two merge triggers

1. **Immediate** — When a lesson is added via IPC (`learn_lesson` or `route_lesson`),
   `merge-lessons.sh` runs automatically in the background, merging all lessons into
   KNOWLEDGE.md and propagating to agent folders.

2. **Weekly** — `validate-knowledge.sh --regenerate` copies fresh `llms-full.txt`
   from tandemweb, regenerates KNOWLEDGE.md from scratch via `generate-knowledge.sh`,
   and re-applies all non-redundant lessons.

### Redundancy detection

During weekly regeneration, each lesson is checked against raw `llms-full.txt`.
If the source material now independently covers a lesson's content, the lesson
is flagged with `<!-- status: redundant {date} -->` in LEARNED.md and excluded
from future merges. Flagged lessons are not deleted — human review.

## Source files (shared/)

| File | Content | Updated by |
|------|---------|-----------|
| `KNOWLEDGE.md` | Tandem facts + lessons merged in | `merge-lessons.sh` / `generate-knowledge.sh` |
| `SCHEDULE.md` | Upcoming cohort dates (auto-generated) | `calendar_ctas.py` → Scheduler Minion |
| `LEARNED.md` | Shared lessons (placeholder) | Gru approval flow |
| `LEARNED-{agent}.md` | Per-agent lesson copies | `route_lesson` IPC handler (best-effort sync) |
| `llms-full.txt` | Full tandemcoach.co site text (~766 KB) | Weekly via tandemweb pipeline |
| `merge.log` | Merge pipeline activity log | `merge-lessons.sh` / `generate-knowledge.sh` |

**Per-agent lesson source of truth:** `knowledge/agents/*/LEARNED.md` (written by IPC handlers).
The `shared/LEARNED-*.md` files are best-effort copies.

## Agent files (agents/{name}/)

Each folder is mounted at `/workspace/knowledge` inside that agent's container.
Agent list is dynamic — `validate-knowledge.sh --update` discovers agents via directory glob.

| Agent | Gets | Reason |
|-------|-----|--------|
| `inbox` | KNOWLEDGE, SCHEDULE, LEARNED, llms-full.txt | Full context to classify and qualify |
| `sales` | KNOWLEDGE, SCHEDULE, LEARNED | Program/pricing/scheduling + self-lessons |
| `mailman` | KNOWLEDGE, LEARNED | Email processing + delivery lessons |
| `chief` | KNOWLEDGE (+ all-knowledge mount) | Oversight + knowledge coordination |
| `certifier` | KNOWLEDGE | Certificate issuance |
| `contador` | KNOWLEDGE | Payment processing |
| `archivista` | KNOWLEDGE | Document management |

## Scripts

| Script | Purpose |
|--------|---------|
| `tools/collect-lessons.sh` | Collect + dedup lessons from all agents to stdout |
| `tools/merge-lessons.sh` | Merge lessons into KNOWLEDGE.md (claude --print) |
| `tools/generate-knowledge.sh` | Regenerate KNOWLEDGE.md from llms-full.txt + lessons |
| `tools/validate-knowledge.sh` | Validate prices/URLs, propagate copies, --regenerate |

## Keeping copies fresh

Copies are propagated automatically by `validate-knowledge.sh --update` (called by
merge-lessons.sh and generate-knowledge.sh). Manual copy is no longer needed for
KNOWLEDGE.md.

For SCHEDULE.md and llms-full.txt, manual copy or Scheduler Minion (when built):

```bash
# SCHEDULE.md — inbox and sales
cp knowledge/shared/SCHEDULE.md knowledge/agents/inbox/SCHEDULE.md
cp knowledge/shared/SCHEDULE.md knowledge/agents/sales/SCHEDULE.md

# llms-full.txt — inbox only
cp ~/dev/tandemweb/llms-full.txt knowledge/shared/llms-full.txt
cp knowledge/shared/llms-full.txt knowledge/agents/inbox/llms-full.txt
```

## Adding a new agent

1. Create `knowledge/agents/{name}/`
2. Copy KNOWLEDGE.md from `shared/` (or wait — next merge propagates it automatically)
3. Document it in the table above
4. Add `additionalMounts` to the group's DB record:
   ```json
   { "hostPath": "~/dev/NanoClaw/knowledge/agents/{name}", "containerPath": "knowledge", "readonly": true }
   ```
5. Restart NanoClaw

The mount allowlist (`~/.config/nanoclaw/mount-allowlist.json` on Mac Mini) already
allows `~/dev/NanoClaw/knowledge/` — no changes needed for new agents under it.
