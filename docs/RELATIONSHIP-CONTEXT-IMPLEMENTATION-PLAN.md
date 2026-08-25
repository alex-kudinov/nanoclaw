# Relationship Context Dark Foundation — Implementation Plan

Status: local dark implementation complete; broad verification and independent implementation review in progress for `NC-20260825-003`
Base: `683d61208e1c6c2d8bb8579441503c355c4df17a`
Branch: `codex/relationship-context-dark-foundation-20260825`
Authority: accepted decision
`decision:relationship-context-dark-foundation-2026-08-25`

## 1. Outcome and hard boundary

Implement the provider-neutral local dark foundation described by
`docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` without contacting or changing a
real provider, production database/runtime/configuration, credentials, customer
record, Plutio field/data, Booking production behavior, minion activation,
communication, deployment, restart, or business outcome.

The source is complete only when it has reversible schema, deterministic host
mechanics, fixture-only adapter proof, deny-by-default capability enforcement,
focused/full tests, independent Claude review, synchronized authority docs, and
one committed/pushed exact branch. It remains dark and unconfigured.

## 2. Source and schema shape

### 2.1 Migration 137

Add:

- `data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql`
- `data/business/migrations/nanoclaw-v2/rollback_137_relationship_context_dark.sql`
- `src/relationship-context-migration.test.ts`
- package both files in `scripts/build-release.mjs`

Tables:

1. `party_external_refs`
   - provider/source scope/entity type/external ID identity;
   - one active owner Party per exact scoped external identity;
   - adapter and schema version, verification/first/last-seen/status, source
     receipt hash;
   - no raw provider payload or credential.

Migration 137 performs one idempotent compatibility backfill in the same
transaction: every active Party with nonblank legacy
`parties.source_provider/source_id` receives one scoped
`party_external_refs` row with scope `legacy-primary`, entity type matching the
Party, adapter/schema version `legacy-party-source@1`, first/last seen from the
Party timestamps, and a deterministic provenance receipt hash. `ON CONFLICT`
must make replay a no-op and a conflicting pre-existing scoped identity must
abort the migration rather than silently change ownership. The migration does
not clear or deprecate the legacy columns; their later write freeze/removal
remains separately reviewed after caller migration proof. 2. `party_identifier_claims`

- Party, identifier kind, HMAC/fingerprint, optional restricted value only
  where later resolution requires it, source evidence, validity interval,
  verification/confidence/status;
- shared identifier remains representable and never selects a Party by
  itself.

3. `party_identity_exceptions`
   - stable fingerprint, source ref/fact evidence hashes, reason/status,
     optional current canonical Party, bounded candidate Party IDs, owner and
     resolution receipt;
   - no raw names/messages/payloads.
4. `party_context_adapter_registrations`
   - tracked manifest identity/version/hash, source scope, declared reference/
     fact/projection/privacy modes, enabled=false, conformance receipt/status,
     health/circuit metadata;
   - no credential value.
5. `party_context_observations`
   - immutable versioned fact envelope: adapter/source/fact identity, original
     and current canonical Party, related Party IDs, content-minimized value,
     source/effective/observed/verified/fresh times, confidence/conflict/privacy,
     schema and payload hash;
   - unique source fact identity and content-conflict refusal.
6. `party_context_projections`
   - one versioned current typed section/key per Party plus source watermarks,
     value hash/value, freshness/conflict/missing codes and CAS version;
   - no raw provider payload.

Every JSON object/array persisted by migration 137 has a database byte bound.
Adapter manifest/config-declaration JSON, observation values, projection
values/missing/conflict codes, requested/returned section arrays, version/
watermark maps, and proposed Plutio field metadata are each bounded to 8,192
UTF-8 bytes with `octet_length(...::text) <= 8192` plus the expected JSON type.
Source-contract validators use the same or stricter bound before SQL. Oversized
values fail closed and are not truncated. The transport batch envelope is
separately bounded to 262,144 UTF-8 bytes so a valid multi-fact batch is not
mistaken for one persisted JSON value; every value inside it retains the
8,192-byte persistence limit. 7. `party_context_query_receipts`

- immutable request/result receipt: host request/run/container/work binding,
  group/purpose/Party or candidate fingerprint, requested/returned sections,
  projection versions/watermarks, policy/result/error, response hash and
  duration;
- no returned values, email address, provider payload, or message body.
- query resolution and source-container delivery are separate: one receipt
  starts `pending` and transitions exactly once to `delivered` or `failed`
  with a bounded transport error, so an oversized/undelivered pack can never
  remain a false immutable success.

8. `party_context_plutio_projection_receipts`
   - dry-run plan only: Party/reference, projection version/hash, proposed task-
     owned field hash/count, status/conflict/uncertainty, no provider response or
     executable outbox.

Merge/guard contract:

- add merged-Party write guards to all active/current Party-scoped records;
- add an `AFTER UPDATE OF merged_into` trigger on `parties` rather than replacing
  the existing `fn_merge_parties` body from potentially stale source;
- move active external refs and claims to the survivor after exact duplicate
  collapse; update current canonical Party fields in observations/query/
  Plutio receipts while retaining original Party evidence; merge or conflict
  current projections deterministically;
- never leave an active ref/claim/projection attached only to a tombstoned
  loser; preserve immutable evidence lineage.

Security and rollback:

- admin owner, `REVOKE ALL ... FROM PUBLIC`, no non-admin grant;
- append-only/immutable triggers for observations and query receipts;
- rollback refuses if any relationship-context row exists; empty rollback drops
  views/triggers/functions/tables in dependency order;
- structure-only tests and a disposable PostgreSQL integration script exercise
  apply, empty rollback, reapply, idempotent legacy-pair backfill/replay,
  legacy-pair backfill conflict refusal (a pre-existing scoped external ref
  owned by another Party aborts migration), oversized JSON refusal,
  claim-resolution ambiguity, merge, populated rollback refusal, and zero
  non-admin grants.

### 2.2 Host contracts

Add:

- `src/relationship-context-contract.ts`
  - bounded types, validators, canonical hashing, manifest/fact/observation/
    query schemas, no provider-specific switch;
- `src/relationship-context-registry.ts`
  - tracked manifest and fact-catalog registry, duplicate/version/privacy/
    target refusal, independent circuit state;
- `src/relationship-context-reference-adapter.ts`
  - fixture-only `PersonEnrichmentAdapterV1`, no network/credential/provider;
- `src/relationship-context-store.ts`
  - repository interface, in-memory test repository, PostgreSQL repository,
    exact ref resolution, ambiguity-safe claims, idempotent observation,
    CAS projection, immutable query/dry-run receipts;
- `src/relationship-context.ts`
  - core resolver and service: exact scoped ref -> unique verified claim ->
    `ambiguous|needs_identity|not_found`; purpose-filtered sections; explicit
    current/stale/partial/conflicting/unknown/denied/unavailable results;
- `src/relationship-context-policy.ts`
  - feature default off, static group/purpose/section matrix, run/container/
    subject grants containing a host-derived work ID, bounded process-local
    grant registry for dark tests, deny on any mismatch, no action authority;
- `src/relationship-context-ipc.ts`
  - validate directory-derived group plus host-bound run/container/work/subject,
    dispatch service, write bounded content-minimized follow-up to exact source;
- `src/relationship-context-plutio.ts`
  - pure deterministic dry-run plan/hash/conflict function only; no toolbox,
    environment credential, provider call, or write mode.

Tests:

- `src/relationship-context-contract.test.ts`
- `src/relationship-context-registry.test.ts`
- `src/relationship-context-store.test.ts`
- `src/relationship-context.test.ts`
- `src/relationship-context-policy.test.ts`
- `src/relationship-context-ipc.test.ts`
- `src/relationship-context-plutio.test.ts`
- `src/relationship-context-migration.test.ts`
- `src/relationship-context-store.integration.test.ts` only when disposable
  PostgreSQL is available; otherwise an explicit opt-in script plus contract
  test follows the existing lifecycle pattern.

### 2.3 Container/IPC surface

Modify:

- `container/agent-runner/src/ipc-mcp-stdio.ts`
  - add `party_context_get` with bounded purpose, exact subject selector,
    requested sections and max ages; the model-visible schema has no work ID;
  - stamp `groupFolder`, `source_container`, and host-minted `run_id` outside
    the model-writable schema;
  - return only “queued; wait for host receipt,” never context synchronously.
- `src/ipc.ts`
  - recognize the new typed payload before generic handling;
  - dispatch using directory-derived group and the exact source input writer;
  - quarantine/notify on authorization or validation failure; never fall
    through to another capability.

No group receives a grant/configuration in this task. With feature off and no
host grant, every real request is denied. Tests create and consume exact
process-local grants only.

`work_item_id` is never trusted from the model and is not carried in the MCP
tool schema. A host grant is created only after a future authorized caller
resolves one current durable Company Work/pipeline/case record and binds its
canonical work ID to the exact directory-derived group, host-minted run ID,
source container, purpose, subject, allowed sections, and expiry. Dispatch
looks up and consumes that grant, then copies its host-derived work ID into the
query receipt. No trusted host work record means no grant and therefore denial.

### 2.4 Documentation and release authority

Modify:

- `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` with implemented-dark status and
  exact remaining gates;
- `docs/PROJECT-MAP.md`, `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, and
  `docs/SECURITY.md` with provider-neutral dark mechanics and no-live claims;
- `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`, and
  `docs/programs/company-os/evidence/NC-20260825-003-relationship-context-dark-foundation.md`;
- `data/business/CLAUDE.md` and structure-only schema references only after the
  migration is proven; never include rows.

## 3. Implementation order

1. Validate this plan with Claude Sonnet/high and correct material findings.
2. Implement pure contract, registry, reference adapter, policy, and tests.
3. Implement migration/rollback and structure/integration tests.
4. Implement store/service/projection/receipt mechanics and tests.
5. Implement dry-run Plutio planner and tests.
6. Implement host/container IPC with exact binding and negative tests.
7. Run focused tests; correct product defects before broad verification.
8. Update authoritative docs and structure-only schema references.
9. Run pinned Node 22 typecheck, build, full root suite, container runner build/
   tests, continuity, format, capability/diff/secret checks, and disposable DB
   proof.
10. Send a bounded implementation packet to fresh Claude Sonnet/high; fix and
    re-review load-bearing findings.
11. Independently rerun final verification, commit, and push the exact branch.

## 4. Acceptance tests

### Adapter and identity

- duplicate or undeclared manifests/facts/privacy/projection targets fail;
- reference adapter adds no core/provider-specific branch and has no network or
  credential surface;
- exact scoped external ref resolves one Party;
- shared/unverified claim returns ambiguity/hold, never first-row selection;
- merge preserves original evidence and moves current authority safely;
- merge tests cover conflicting identifier claims, duplicate scoped external
  refs, open identity exceptions, rollback, and retry, and prove separately
  that observations, current projections, query receipts, and Plutio projection
  receipts retain original evidence while no active/current authority in any
  of those four tables references only a tombstoned loser Party;
- source fact replay is idempotent; same key/different content conflicts.

### Projection and query

- effective/observed/verified/fresh times remain distinct;
- deterministic projection CAS and source watermarks converge;
- stale/conflicting/partial/unknown/unavailable are section-scoped;
- group/purpose/section/max-age policy can narrow but never widen;
- query receipt contains hashes/status/versions only, no context values or
  identifiers unnecessary for audit.

### Capability/security

- default off; no grant; wrong group/purpose/section/Party/work/run/container;
  expired/replayed grant; missing source container/run ID all deny;
- the request has no model-writable work ID; the query receipt's work ID comes
  only from the exact consumed host grant;
- one grant is exact and consumable at most once;
- denial cannot reach the repository or leak another Party;
- accepted context remains read-only and grants no send/provider/DB mutation;
- unrelated IPC paths and container tools remain unchanged.

### Plutio and rollback

- planner is deterministic/idempotent, returns conflict/uncertainty states, and
  exposes no execute/provider function;
- populated database rollback refuses; empty rollback succeeds;
- migration has no non-admin grants, live rows, credentials, or write-enabled
  provider outbox.

## 5. Explicit exclusions

- real Trafft/Gmail/Stripe/Plutio/Heartbeat/Encharge/Chaos/LMS/API access;
- production PostgreSQL or SQLite access/migration/backfill;
- provider field creation, data write, sync, or readback;
- Booking identity-path change or ambiguity quarantine activation;
- minion prompt/config/capability enablement;
- customer communication, Slack post, email, task/schedule change;
- credential/configuration change, release activation, deployment, restart,
  production/live verification, or business-outcome claim.
