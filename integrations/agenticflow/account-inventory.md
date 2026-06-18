# AgenticFlow Account Inventory

Enumerated live 2026-06-13 via `agenticflow/list-agents` + `agenticflow/list-workflows`.
Workspace **Tandem Coaching** (`8afc03de-…`) · project **General** (`01K7DZFP67YDRCFQBGSPWMAWAX`)
· owner info@tandemcoaching.academy. One workspace, one (default) project, one API key.

## Agents (10)

| Agent | Model | Vis | Notes |
|-------|-------|-----|-------|
| **tandem-consult-followup** | deepseek-v3.2 | private | Pass-through → workflow `trafft-list-consults`. Parses date intent, returns consult list (schema `tandem.consult-followup-due.v1`). |
| **ACC Support Agent** | openai/gpt-5 | **public** | Support agent for the ACC class. Only public-visibility agent. |
| **Sophia, the SEO Mastermind** | gpt-4o-mini | private | SEO strategy assistant. |
| **Tandem Testimonials** | pixelml/gpt-4o | private | Testimonials. |
| **Tandem Scraper** | gpt-4o-mini | private | Scrapes tandemcoach.co, stores content. |
| **Podcast Finder** | gemini-2.0-flash | private | Finds latest podcast episode. |
| **DS 3.2** | gpt-4o-mini | private | Throwaway/test agent (no description) — safe smoke-test target. |
| Ethan, the Ecommerce Manager | gpt-4o-mini | private | Stock AgenticFlow template (unmodified). |
| Mason, the Social Media Manager | gpt-4o-mini | private | Stock template. |
| Chloe, the Event Manager | gpt-4o-mini | private | Stock template. |

Agent IDs captured in the toolset's enumeration output (`/tmp/af_agents_full.json` at scan time);
re-run `agenticflow/list-agents` for current IDs.

## Workflows (5)

| Workflow | id | Notes |
|----------|-----|-------|
| **trafft-list-consults** | `e809d804-8a05-4839-835a-de12ee315ef1` | Auths to Trafft, lists approved Consultation Call appointments, filters + dedups by email. Credentials pre-configured + hidden. Base `booking.admin.tandemcoach.co`. |
| Email Classification | `85165100-3d57-483b-85df-b3362a8c57fb` | Experiment/test — ignore. |
| create wp articles | `463c61cb-8aec-4929-bab8-bfe92eff35c5` | Experiment/test — ignore. |
| Tandem Web Scraper | `a5d197ad-c710-407a-b655-a840815971d4` | Experiment/test — ignore. |
| Untitled workflow | `33fbe534-e1f5-4f8f-8bf2-1732106f0f01` | Empty/draft. |

Only **trafft-list-consults** is a live production asset (run 33×). The rest are scratch experiments.

## How agents bind workflows

Agent `tools[]` entries carry `{run_behavior:"auto_run", workflow_id, description, input_config}`.
`tandem-consult-followup` auto-runs `trafft-list-consults` with `input_config.trafft_base_url` baked in
and credentials hidden server-side. So an agent = a thin NL front-end over a workflow; the toolset's
`run-agent` is enough to drive these — no need to call workflows directly.

## Production vs scratch

`trafft-list-consults` (+ its `tandem-consult-followup` agent) is the only live production asset.
Everything else in the account is experimental/test work and can be ignored — no reconciliation needed.
