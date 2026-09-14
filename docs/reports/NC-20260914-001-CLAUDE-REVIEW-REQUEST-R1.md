# NC-20260914-001 bounded D3 identity-safety review

## Decision requested

Review only the load-bearing safety and consistency of the one-shot Heartbeat
aggregate snapshot preparation, validation, and PostgreSQL import. Report only
material defects that could allow stale/changed/private evidence, non-idempotent
replay, incomplete evidence to look complete, canonical identity/access drift,
or a provider attempt/write. Cite the exact file and line or SQL contract.

Write the response only to
`docs/reports/NC-20260914-001-CLAUDE-REVIEW-RESPONSE-R1.md`. Do not edit source,
tests, configuration, program state, or any other file.

## Authority and accepted boundary

- The owner authorized D3 after D2 live proof. D3 may write only an adapter
  registration, one full reconciliation run and aggregate snapshot items, one
  desired control projection, one blocked command, and one unavailable
  readback in migration-167 tables.
- D3 must not create/merge Party, bind refs/auth, resolve a person, change
  access/enrollment/entitlement/customer state, attempt/write Heartbeat or any
  provider, send communications, or install a provider credential on Mini.
- The source is two complete Heartbeat main API censuses collected through the
  established toolbox plus one webhook inventory. Only provider UUIDs, counts,
  hashes, timestamps, and false privacy/authority flags survive minimization.
- Current accepted aggregate facts: both censuses have 1,694 users, 79 groups,
  4,202 membership edges, identical user/group hashes, zero missing or duplicate
  emails and zero groupless users; webhook inventory has 22 registrations.
  The privacy-minimized artifact canonical SHA-256 is
  `f6e9e057ea609d3bba25d9aff7b2cd0a4bf22f305a8f510bdf9d00d7a1b69a35`.
- The aggregate census does not expose the per-user identity graph. The only
  truthful result is blocked with
  `INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE`; no person-level conclusion or repair
  is admissible.
- D2 is already live and must remain unchanged. Migration 167 already exists
  in production and structurally prohibits provider attempts.

## Review paths

Read only these implementation and contract files in addition to this packet:

1. `src/identity-control-plane/d3-heartbeat-snapshot.ts`
2. `src/identity-control-plane/d3-heartbeat-reconciliation.ts`
3. `src/identity-control-plane/d3-heartbeat-reconciliation-cli.ts`
4. `scripts/prepare-tandem-identity-d3-heartbeat-snapshot.mjs`
5. `scripts/validate-tandem-identity-d3-production.mjs`
6. `src/identity-control-plane/d3-heartbeat-snapshot.test.ts`
7. `src/identity-control-plane/d2-student-lifecycle-shadow.disposable.test.ts`
8. `data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql`

Do not inspect `.env`, credentials, auth stores, the private live artifact,
toolbox configuration, unrelated repository files, or external systems.

## Evidence already obtained

- TypeScript typecheck passes.
- Focused suite: 3 files, 9 tests pass, including a real disposable PostgreSQL
  D2-to-D3 lifecycle and exact replay.
- Disposable first import: 82 minimized snapshot items in the live-sized case
  by contract (79 groups plus three aggregates), one desired control projection,
  one blocked command, one unavailable readback, zero attempts and zero
  Party/ref/auth/resolution or D2 drift.
- Exact replay returns `duplicate` and inserts zero items, projections,
  commands, readbacks, or attempts.
- The private artifact is mode 0600, 16,797 bytes. A literal scan finds no
  group-name, filter, destination, URL, password, secret, token, or API-key
  fields; `email` occurs only in the two aggregate quality counters and the
  explicit `containsEmails: false` declaration.

## Acceptance format

Return either `No material findings` or a short ordered list. For each finding,
state consequence, exact evidence, and the smallest correction/test. Do not
propose broader identity migration, provider integration, attendance, Zoom,
access repair, or product work, and do not reopen accepted owner decisions.
