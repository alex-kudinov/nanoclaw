# AgenticFlow Integration (subproject)

Wiring NanoClaw into the **AgenticFlow.ai** account (large existing workspace) so minions
can trigger AgenticFlow agents, workflows, and its 2,500+ MCP integrations.

- **Docs:** https://docs.agenticflow.ai/
- **Status:** ✅ Access layer live & verified (2026-06-13). 4 toolbox tools working against the
  real account (10 agents, 5 workflows enumerated). `run-agent` round-trips. Next: decide which
  AgenticFlow assets to wire into NanoClaw minions (Phase 1/2 in INVESTIGATION.md).
- **Owner doc:** [`INVESTIGATION.md`](INVESTIGATION.md) — verified API reference, capability map, integration plan, open questions.
- **Account inventory:** [`account-inventory.md`](account-inventory.md) — the 10 agents + 5 workflows in the account.

## Architecture decision (settled)

Access AgenticFlow through a **toolbox toolset** (`~/dev/toolbox/shared/agenticflow/`), invoked
on demand via `mcp__toolbox__run_tool`. We do **not** register `mcp.agenticflow.ai` as a raw MCP
server in the NanoClaw MCP registry.

**Why:** a raw MCP registration loads its tool schemas into every agent turn even when unused —
the exact context-bloat problem the toolbox's lazy `list_tools` / `tool_help` / `run_tool` proxy
exists to solve. AgenticFlow's own agents/workflows already compose the 2,500 integrations
internally; our toolbox tools just trigger them and read results.

## Toolset

`tool run agenticflow/<tool>` (via `mcp__toolbox__run_tool`):

| Tool | Purpose | Verified |
|------|---------|----------|
| `list-agents` | List agents in the workspace/project | ✅ |
| `list-workflows` | List workflows (where the 2,500 integrations get composed) | ✅ |
| `run-agent` | Send a message to an agent, collect the streamed reply | ✅ |
| `create-agent` | Author a new agent (name, model, system prompt, optional workflow binding) | ✅ |
| `update-agent` | Patch an agent's name/model/system-prompt/description | ✅ |
| `delete-agent` | Delete an agent by id | ✅ |
| `trigger-webhook` | Invoke an agent webhook trigger with a JSON payload | built, not live-tested |

**Authoring is Claude's job, not yours** — describe the agent you want and I create/edit it via the
`*-agent` tools. CRUD verified end-to-end against the live account (throwaway agents created + deleted).
Workflow authoring (node graphs) is the remaining surface — see INVESTIGATION.md open Q5.

Toolset source: `~/dev/toolbox/shared/agenticflow/`. Registered via `include_shared` in the
**bizmgr** and **NanoClaw** project registries (`.toolbox/registry.json`).

Config (in `~/dev/toolbox/.env` — the toolbox's own secret store, NOT `.env.shared`; never committed):
- `TOOLBOX_AGENTICFLOW_API_KEY` ✅ (project-scoped key)
- `TOOLBOX_AGENTICFLOW_WORKSPACE_ID` ✅ `8afc03de-…`
- `TOOLBOX_AGENTICFLOW_PROJECT_ID` ✅ `01K7DZFP67YDRCFQBGSPWMAWAX`

Callable now via `mcp__toolbox__run_tool` (the proxy reads the registry dynamically — verified live,
no reload needed). Example: `run_tool agenticflow/run-agent {agent-id, message}`.
