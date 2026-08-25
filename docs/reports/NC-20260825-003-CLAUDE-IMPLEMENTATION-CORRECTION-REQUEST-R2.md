# NC-20260825-003 — Relationship Context implementation correction review R2

Review only closure of implementation R1 findings 1–3 and resolve R1's two
packet-boundary source ambiguities.

Read only:

- `docs/reports/NC-20260825-003-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`
- `data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql`
- `data/business/migrations/nanoclaw-v2/rollback_137_relationship_context_dark.sql`
- `src/relationship-context-registry.ts`
- `src/relationship-context-reference-adapter.ts`
- `src/relationship-context-store.ts`
- `src/relationship-context.ts`
- `src/relationship-context-ipc.ts`

Check exactly:

1. every recorded query has separate, truthful, one-way
   `pending -> delivered|failed` transport status; oversized and undeliverable
   packs cannot retain false delivery success;
2. a previously unresolved observation replayed after unique identity resolution
   links `current_party_id` exactly once, refuses different-Party conflict, and
   remains eligible for later merge lineage;
3. query-time unresolved external refs report `ambiguous` when a matching open
   ambiguity exception exists and otherwise `needs_identity`, while unknown
   direct Party IDs remain `not_found`;
4. rollback 137 preserves non-legacy evidence and only removes exact migration-
   created legacy compatibility refs while the legacy columns remain;
5. registry/reference-adapter code actually enforces duplicate/version/fact/
   privacy/scope/conformance/circuit and no-network/no-credential boundaries.

Do not read other files, edit implementation, use Bash/web/MCP/provider tools,
or reopen accepted design choices. Write only
`docs/reports/NC-20260825-003-CLAUDE-IMPLEMENTATION-CORRECTION-RESPONSE-R2.md`
with `NO MATERIAL FINDINGS` or only unresolved material findings with exact
evidence and bounded corrections.
