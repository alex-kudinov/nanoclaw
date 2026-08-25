# NC-20260825-003 — Relationship Context implementation review R1

## Objective

Independently review the completed local dark foundation. Report only material
defects that could cause identity confusion/data leakage, unauthorized context,
schema/merge corruption, non-idempotent evidence, unbounded/private storage,
provider execution, unsafe rollback, or inability to satisfy the accepted dark
completion condition.

## Authority and non-negotiable boundary

- `business_v2.parties.id` is the internal join; provider IDs remain native
  authorities; email/shared identifiers never select the first Party.
- Exact scoped external ref wins; one unique verified claim may bind it;
  missing/shared identity is held as an exception with no projection.
- New providers stop at one tracked adapter/manifest/fact boundary. No adapter
  credential, network, direct DB write, Party merge, projection mutation,
  capability grant, provider write, or action authority.
- All persisted JSON is bounded at 8,192 bytes; returned packs at 32 KiB;
  receipts omit returned context values and unnecessary identifiers.
- `party_context_get` is globally off by default and requires one exact
  one-shot host grant bound to directory group, host run/container, host-derived
  work, purpose, subject, sections, max age, and expiry. The model cannot supply
  work ID. Context never grants an action.
- Plutio planning is pure/dry-run only with no provider/tool/execute/outbox path.
- No production migration/provider/customer/credential/Plutio/Booking/minion/
  communication/deployment/runtime state change is authorized or claimed.

## Allowed read paths

The implementation is large because migration, identity store, policy, and
query receipts are inseparable security boundaries. Read only these eight
artifacts; do not perform broad repository archaeology:

- `docs/RELATIONSHIP-CONTEXT-IMPLEMENTATION-PLAN.md`
- `data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql`
- `src/relationship-context-contract.ts`
- `src/relationship-context-policy.ts`
- `src/relationship-context-store.ts`
- `src/relationship-context.ts`
- `src/relationship-context-ipc.ts`
- `src/relationship-context-plutio.ts`

Do not read `.env*`, credentials, sessions/auth stores, runtime databases,
customer data, other worktrees, unrelated files, or prior Claude responses.
Do not use Bash, web, MCP, or provider tools. Do not edit implementation files.

## Integration surfaces not in the read packet

Codex separately verified the bounded integration edits:

- runner tool has no work ID, stamps group/run/container outside model schema,
  requires exactly one Party or full scoped-ref subject, and only queues;
- host IPC recognizes the typed request before generic handling, dispatches
  with directory group, delivers only to the source container, and quarantines
  denial/error;
- migration and rollback are packaged by `scripts/build-release.mjs`;
- `RELATIONSHIP_CONTEXT_ENABLED=0` is the only new environment setting;
- no group config/prompt/capability grant was changed.

If a material claim depends on those files, report the source ambiguity rather
than reading outside the allowed packet.

## Verification evidence

- focused relationship/adjacent IPC: 11 files / 70 tests pass; one opt-in file
  skipped;
- opt-in disposable PostgreSQL store: 1/1 pass;
- disposable migration: apply, legacy backfill/replay/conflict refusal,
  oversized JSON refusal, merge lineage, actual store/query, zero non-admin
  grants, populated rollback refusal, and empty rollback pass; DBs removed;
- pinned Node 22 format, typecheck, and build pass;
- full root: 298 files / 3,268 tests pass, 10 files / 24 tests skip, one
  unrelated pre-existing `cnpc-prompt-contract` wrapper-literal failure;
- runner build and full suite: 8 files / 45 tests pass;
- docs continuity/capability check and staged diff check pass;
- targeted likely-secret scan returns no result.

## Required review questions

1. Can merge/backfill/immutability/rollback lose lineage or create a second
   identity authority?
2. Can a malformed/new adapter bypass catalog/privacy/size/scope rules or write
   provider/core state?
3. Can exact-ref/claim resolution attach one person's fact or query pack to
   another Party, especially on replay or ambiguity?
4. Can grants be forged, widened, replayed, expired late, or used without
   feature enablement/host work identity?
5. Can observations/projections/query receipts conflict, duplicate, mutate
   core evidence, or leak returned values?
6. Can the Plutio planner execute, overwrite unreceipted/operator drift, or
   confuse uncertain/no-change states?
7. Does any implementation cross the prohibited external boundary or make an
   unsupported live/completion claim?

## Response contract

Write only:
`docs/reports/NC-20260825-003-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.

Use:

- Verdict: `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`.
- Findings ordered by consequence with exact file/line evidence, a concrete
  failure path, and bounded correction.
- Do not restate the implementation or create a speculative backlog.
