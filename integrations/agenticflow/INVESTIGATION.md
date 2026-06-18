# AgenticFlow Investigation

Live-verified findings (probed 2026-06-13). Doc prose on docs.agenticflow.ai is
model-rendered and was partly inaccurate (e.g. one page said `api.agenticflow.com`);
everything below marked **[verified]** was confirmed against the live API with our key.

## What AgenticFlow is

No-code AI automation platform. Four programmable layers sit on the account:

1. **Agents** — interactive AI assistants (visual config, tool/MCP attachments).
2. **Workflows** — drag-and-drop automation, 193+ node types.
3. **Workforce** — multi-agent team orchestration (flagship).
4. **Integrations** — **2,500+ external tools via MCP** (Slack, Sheets, Gmail, Salesforce, Stripe, …).
   Multi-provider models (OpenAI, Claude, Gemini, Perplexity, DeepSeek). Credit-based billing.

## REST API — [verified]

- **Base:** `https://api.agenticflow.ai/v1`
- **Auth:** `Authorization: Bearer <API_KEY>` — **[verified]** our key authenticates.
- **Trailing slash REQUIRED.** `/v1/agents` → `307` redirect to `http://…/agents/` (note: redirects to
  plain HTTP — always call the slashed HTTPS path directly to avoid the downgrade hop). **[verified]**
- **Key is project-scoped.** `/v1/agents/` returns `400 {"message":"Project ID must be provided for
  project-scoped resource access"}` — auth passed, scoping missing. **[verified]**
- **Account-level endpoints reject the API-key token.** `/v1/workspaces/`, `/v1/users/me/` →
  `401 {"detail":"Error decoding token"}`. These expect a session JWT, not an API key. So the API key
  **cannot self-discover** its own workspace/project IDs — they must come from the UI. **[verified]**
- `/v1/me/`, `/v1/projects/`, `/v1/workflows/`, `/v1/account/`, `/v1/api-keys/` → `404`. **[verified]**

### Endpoint map ([verified] live 2026-06-13)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/agents/?workspace_id=…&project_id=…` | List agents **[verified]** |
| GET | `/agents/{id}/` | Agent details (incl. `tools[]` → `workflow_id`) **[verified]** |
| POST | `/agents/{id}/stream` | Run agent, stream reply **[verified]** — see body contract below |
| GET | `/workspaces/{ws}/projects/` | List projects (API key works here) **[verified]** |
| GET | `/workspaces/{ws}/workflows/?project_id=…` | List workflows **[verified]** |
| POST | `/agents/?workspace_id=…` | Create agent **[verified]** — body needs `project_id`, `name`, `model`, `system_prompt`, **and `tools` (required, use `[]`)** |
| PUT | `/agents/{id}` | Update agent **[verified]** — partial body OK |
| DELETE | `/agents/{id}/` | Delete agent **[verified]** |
| POST | `/agents/webhook/{path}/trigger` | Fire a webhook trigger with a JSON body (built, not live-tested) |
| GET | `/agents/anonymous/{id}` | Public agent info (no auth) |

`403 Forbidden` on cross-project access. Rate limit ~100 req/min/IP (self-hosted figure).

### Trailing-slash gotcha [verified]

**Collection** endpoints (`/agents/`) are slash-canonical; **item** endpoints (`/agents/{id}`) are
**no-slash**-canonical. Hitting an item path WITH a trailing slash (or any path with a `?query`)
triggers a 307 that **drops a PUT/POST body** → server replies `422 body Field required`. Rule:
- list/create → `/agents/` (slash) + `?workspace_id=…`
- update/get-one → `/agents/{id}` (NO slash, NO `-L`) so the body survives.
DELETE tolerates the redirect (no body). Agent authoring (create/update/delete) verified by
creating + editing + deleting throwaway agents through `agenticflow/*-agent` tools.

### `/agents/{id}/stream` contract [verified]

Body **must** include a thread `id` that is a valid **UUID** (the conversation thread; reuse to
continue, new UUID to start fresh) plus `messages`:

```json
{"id": "<uuid>", "messages": [{"role": "user", "content": "…"}]}
```

Omitting `id` → `500 UNEXPECTED_ERROR`; non-UUID `id` → `400 thread_id must be a valid UUID`.
Response is the **Vercel AI SDK data-stream**: `2:[thread_info]`, `f:{messageId}`, `0:"<text chunk>"`
(text), `e:{…}` (end). The toolset concatenates the `0:`-prefixed chunks.

**IDs [verified] (stored in `~/dev/toolbox/.env`):** workspace `8afc03de-a0cf-4151-a156-6a4cced3bea2`,
project `01K7DZFP67YDRCFQBGSPWMAWAX`.

### Workflow access [verified]

Workflows ARE reachable via REST at `/v1/workspaces/{ws}/workflows/?project_id={proj}` (despite
`/v1/workflows/` 404-ing). 5 workflows in the account — see `account-inventory.md`. The
2,500-integration catalog itself is still MCP-server-surfaced, not confirmed on `/v1` REST.

## MCP server (gateway to the 2,500 integrations)

- **Endpoint:** `https://mcp.agenticflow.ai/mcp` — transport **Streamable HTTP**.
- **Auth:** OAuth (zero-config), or headers `Authorization: Bearer <KEY>` + `x-workspace-id` + `x-project-id`.
- **Exposes ~13 meta-tools:** list/search/create/edit/**run workflows**, list/get/create agents,
  generate system prompts, **list/search/get external MCP apps** (← the 2,500 integrations), transform data.

We are **not** registering this as a raw MCP (see README architecture decision). If workflow execution
or integration discovery proves REST-unreachable, we'll reach the MCP server *from inside a toolbox tool*
via a one-shot JSON-RPC call — still lazy-loaded, no per-turn schema bloat.

## CLI

`AgenticFlow CLI` exists (build agents, deploy workflows/workforces, automate from the shell).
Install/auth details not yet pulled. Lower priority than REST/MCP for NanoClaw's use.

## Integration plan

- **Phase 0 — access layer (this subproject):** toolbox toolset `agenticflow/`
  (`list-agents`, `run-agent`, `trigger-webhook`). Built; verifies once IDs are set.
- **Phase 1 — enumerate the account:** run `list-agents`, capture every agent/workflow/integration in
  use → fill `account-inventory.md`. Decide what's worth triggering from NanoClaw.
- **Phase 2 — wire to minions:** expose the highest-value AgenticFlow workflows to the relevant Gru
  minions (sales / certifier / procurement / courses) as toolbox calls.
- **Phase 3 — decide REST vs MCP for workflows/integrations** based on Phase 1 reachability findings.

## Open questions

1. ~~Workspace ID + Project ID~~ — **RESOLVED**, stored in `toolbox/.env`.
2. ~~Workflows REST-reachable?~~ — **RESOLVED**: `/v1/workspaces/{ws}/workflows/?project_id=…`.
3. ~~Stream response format~~ — **RESOLVED**: thread-`id` UUID + `messages`; `0:`-chunk parsing shipped.
4. **One key / one project.** Key is project-scoped to "General". If we ever add projects, each needs its own key. Today: one project, one key — fine.
5. **Can a workflow be RUN (not just listed) via REST?** Not yet found. Current pattern: wrap a workflow in a thin agent and call `run-agent` (as `tandem-consult-followup` does). Confirm whether `/v1/workspaces/{ws}/workflows/{id}/run` (or similar) exists, else MCP-server `run_workflow` is the path.
6. **2,500-integration catalog** — only confirmed via the MCP server's `list/search external MCP apps`. If we want to browse it from the toolset, add a tool that does a one-shot JSON-RPC call to `mcp.agenticflow.ai/mcp`.
7. **Webhook triggers** — `trigger-webhook` tool built but not live-tested (needs a configured trigger path). Verify when a webhook trigger exists.

## Provenance

Every **[verified]** line traces to a live `curl` probe on 2026-06-13. Unmarked lines are from
docs.agenticflow.ai and are pending live confirmation.
