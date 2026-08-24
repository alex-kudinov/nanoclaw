# NC-20260824-007 live-lineage bounded review R2 — response

## Scope reviewed

The eight allowed artifacts only: the request, `/private/tmp/nc007-live-lineage-review.patch`,
`src/index.ts`, `src/student-lifecycle-store.ts`, `src/student-lifecycle-shadow-catalog.ts`,
`src/student-lifecycle-provider-registry.ts`,
`setup/n8n/student-lifecycle-community-shadow-workflow.json`, `src/checkout-recovery.ts`.

## Findings

### Composition with checkout recovery (`src/index.ts`)

The diff adds `studentLifecycleHealth` (a `StudentLifecycleHealthMonitor`), refreshes it once
at startup before `webhookServer.start()`, exposes its cached status under
`studentLifecycle.store` in `/health`, and starts a 60s refresh interval gated on
`STUDENT_LIFECYCLE_ENABLED`. The `checkoutRecovery` block in both `getHealth()` and the
`WebhookServer` deps is byte-for-byte unchanged by this diff. `runCheckoutRecoveryShadowTick`
and the rest of the checkout-recovery wiring are untouched. No naming, ordering, or control-flow
interaction between the two features was found — the composition is additive only.

`studentLifecycleHealth.refresh()` catches its own errors internally (sets `state: 'error'`),
so a Postgres outage at boot cannot throw out of `main()` before checkout recovery or any other
subsystem initializes. `getStatus()` returns a cached, `structuredClone`d value — the `/health`
endpoint does not trigger a live query per request.

### Idempotency / conflict detection (`src/student-lifecycle-store.ts`)

Both `insertEvent`'s `ON CONFLICT (source_event_key) DO NOTHING` fallback and
`recordReconciliationRun`'s `ON CONFLICT (run_key) DO NOTHING` fallback now re-read the existing
row and throw (`student_lifecycle_source_event_conflict` /
`student_lifecycle_reconciliation_run_conflict`) if any of the durable fields differ from the
new attempt, instead of silently returning the old row as a duplicate. This satisfies the
"refuse, never silently deduplicate" invariant for same-key/different-payload collisions.

### Provider registry (`src/student-lifecycle-provider-registry.ts`)

`compareLifecycleProviderRegistry` checks every baseline registration is present in `current`
with byte-identical canonical JSON, and rejects (`student_lifecycle_legacy_registry_drift`) on
any missing or mutated legacy entry. Shadow-phase validation requires exactly the four
`STUDENT_LIFECYCLE_SHADOW_ACTIONS`, each with an empty filter object and the expected shadow
destination host / URL hash — matching the "exactly four new empty-filter actions" and
"Circle untouched" invariants as far as this file's inputs are concerned.

### Catalog (`src/student-lifecycle-shadow-catalog.ts`)

`apply` mode takes a `pg_advisory_xact_lock` before planning, serializing concurrent applies.
`planStudentLifecycleCatalog` throws `student_lifecycle_catalog_conflict:<key>` on any mismatch
between an existing row and the expected manifest-derived row, so no in-place mutation of an
already-inserted catalog entry can pass silently. Inserts use `ON CONFLICT (entry_key) DO
NOTHING`, and the post-insert re-plan re-validates consistency.

### n8n workflow (`setup/n8n/student-lifecycle-community-shadow-workflow.json`)

`active: false` (create-only/inactive import, matching the invariant). The Code node's
`allowedFields` allowlist covers exactly `USER_JOIN`, `USER_UPDATE`, `COURSE_COMPLETED`,
`GROUP_JOIN`; unrecognized actions throw `unsupported_heartbeat_action`. HMAC signing, a 300s
timestamp header, a 64KB payload cap, and `saveDataErrorExecution`/`saveDataSuccessExecution:
"none"` are all present, matching the earlier-accepted lifecycle-only review.

### Checkout recovery (`src/checkout-recovery.ts`)

Not touched by the patch. Full read confirms state machine, signature verification, and email
hashing logic (`emailDigest` via HMAC, never raw) are unaffected by this rebase.

## NO MATERIAL FINDINGS
