# Procurement Scout Database Schema Reference

## PostgreSQL (nanoclaw_business)

Read `/workspace/extra/agent_docs/nanoclaw-business-pg-schema.md` before writing any psql query.

Common queries: `/workspace/extra/agent_docs/business-pg-queries.md`

## Control plane (migration 114)

New CaleProcure/email intake is host-owned:

- `public.procurement_source_runs` records whether a source run completed;
- `public.procurement_observations` is the immutable source-evidence ledger;
- `public.procurement_review_cards` binds a host-generated Slack card to one
  opportunity version and action epoch;
- `public.procurement_opportunities.source_key` identifies normalized work;
- `public.v_procurement_review_queue` exposes bounded actionable rows;
- `public.fn_record_procurement_observation(...)` and
  the review-card record/apply functions are callable only by the host
  administrator role.
- row-level security limits the Procurement database role's legacy direct
  access to source-keyless Bonfire rows; it cannot read or mutate source-keyed
  CaleProcure/email rows.

Use `mcp__nanoclaw__procurement_caleprocure_ingest` for bounded public result
batches, `mcp__nanoclaw__procurement_queue` to list review work, and
`mcp__nanoclaw__procurement_review_card` to request human review. Do not write
control-plane rows with direct SQL or emit a human `DECIDE` command. Legacy
rows have no `source_key` and are intentionally excluded until a separate
audited migration.
