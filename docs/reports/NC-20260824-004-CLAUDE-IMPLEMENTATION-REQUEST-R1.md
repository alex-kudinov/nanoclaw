# NC-20260824-004 — Claude implementation review R1

## Objective

Independently review the completed local Community-only student-lifecycle dark
foundation against the accepted decision, reconciled plan, current live-base
source, and tests. Report only material correctness, security, privacy,
identity, idempotency, replay, state, SQL/migration, n8n, release-packaging, or
authority-boundary findings.

## Authority and accepted boundaries

1. `.program/decisions/decision-student-lifecycle-community-dark-foundation-2026-08-24.json`
2. `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
3. `docs/STUDENT-LIFECYCLE-IMPLEMENTATION-PLAN.md`, reconciled after Claude
   plan review R1
4. Current implementation on verified-live-base branch
   `codex/student-lifecycle-dark-foundation-20260824` from `778545b3`

Do not reopen:

- Community only. Circle is prohibited until a later owner authorization.
- Local source/tests/migration design/inactive n8n export only.
- No production migration/data, provider registration, n8n import/activation,
  deployment/restart, legacy cutover, credential access/rotation, lifecycle
  action/message, certificate action, or minion authority.
- Heartbeat public webhooks expose 11 actions and no lesson/progress action.
- The path must be deterministic and never invoke an LLM.
- Raw name/email/content/credentials/callback paths must not persist.
- Existing unrelated n8n credential literals are outside scope and must not be
  inspected or reproduced.

## Allowed read paths

Read only these task-owned or directly modified paths:

- `.program/decisions/decision-student-lifecycle-community-dark-foundation-2026-08-24.json`
- `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
- `docs/STUDENT-LIFECYCLE-IMPLEMENTATION-PLAN.md`
- `src/student-lifecycle*.ts`
- `src/webhook-server.ts`, `src/webhook-server.test.ts`
- `src/webhook-inbox.ts`, `src/webhook-inbox-reaper.ts`,
  `src/webhook-inbox-reaper.test.ts`
- `src/config.ts`, `src/index.ts`, `.env.example`
- `data/business/migrations/nanoclaw-v2/134_student_lifecycle_community_dark.sql`
- `data/business/migrations/nanoclaw-v2/rollback_134_student_lifecycle_community_dark.sql`
- `setup/n8n/student-lifecycle-community-dark-workflow.json`
- `scripts/build-release.mjs`
- the task-owned hunks in `docs/PROJECT-MAP.md`, `docs/SECURITY.md`,
  `docs/WEBHOOK-RELIABILITY.md`, `docs/ACTIVE-WORK.md`,
  `docs/ENGINEERING-CHANGELOG.md`,
  `agent_docs/nanoclaw-business-pg-schema.md`, and the migration README.

Do not read `.env`, `data/webhooks.json`, other n8n workflows, credentials,
auth/session stores, runtime databases/logs, student records, browser state,
other branches/worktrees, or unrelated history/source.

## Implementation summary

- Migration 134: seven Community-only/admin-only relations, two aggregate
  views, immutable source fields/history, independent state axes, guarded
  rollback, no seeds/grants/actions.
- Pure contract: 11 actions, stable source keys, HMAC/timestamp, keyed identity
  fingerprint, prepared-envelope replay validation, independent reducer.
- Store: exact identity link/email match, exact catalog resolution,
  normalized event, CAS projection/history, durable exceptions, health, replay.
- Reconciliation: injected fixture-only registry/catalog/membership/progress
  completeness, stable hashes, watermark refusal.
- Webhook: exact default-off configured path, streaming 64 KiB bound, HMAC,
  minimize then archive, post-archive identity attempt, async mechanical store.
- Reaper: explicit lifecycle early return before webhooks/group/prompt/agent.
- n8n: inactive placeholder path, runtime env references, exact body HMAC,
  allowlisted fields, disabled execution retention, bounded host retry.
- Release: migration and rollback explicitly packaged.

## Verification evidence

- pinned Node 22.23.2 typecheck: pass;
- focused lifecycle/webhook/reaper/inbox suite: 125/125 pass (ordinary run has
  two opt-in integration tests skipped);
- disposable PostgreSQL store integration: 2/2 pass;
- migration disposable proof: apply, 0 non-admin grants, empty rollback,
  reapply, populated-history rollback refusal all pass;
- n8n code-node body/signature executes locally and is accepted by host HMAC
  and parser;
- documentation continuity/capability check: pass;
- build and format check: pass;
- full suite: 3,156 pass, 14 skipped, one pre-existing unrelated failure in
  `src/cnpc-prompt-contract.test.ts` expecting implementation literals in the
  now-wrapper `scripts/register-cnpc.ts`;
- `git diff --check`: pass;
- no Circle runtime setting, live provider ID/path, credential literal, host
  IP, action/message/certificate/minion node, production write, or deployment.

## Required review questions

1. Can any request reach lifecycle processing without a valid current HMAC or
   exceed the byte bound before rejection?
2. Can raw email/name/content/header secrets persist in inbox/event/exception/
   logs/n8n execution data or replay?
3. Can initial or replay processing ever reach webhooks.json, a group, prompt,
   channel, callback, `runAgent`, or action consumer?
4. Are source-event keys, duplicate handling, post-archive identity, catalog
   ambiguity, enrollment episodes, independent axes, CAS/history, exception
   reopening, and replay correct under concurrency/out-of-order delivery?
5. Are migration constraints/FKs/triggers/views/privileges/rollback safe and
   compatible with the current migration-133 live base?
6. Does the n8n export compute the byte-identical HMAC expected by the host and
   avoid credentials/PII persistence?
7. Is default-off/Circle exclusion fail-closed at config, route, payload,
   schema, n8n, test, and authority layers?
8. Are implementation/release/test/docs surfaces complete enough to commit
   without implying migration/deployment/live proof?

## Required output

Write only:

`docs/reports/NC-20260824-004-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

Use:

1. verdict: `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`;
2. findings ordered P0/P1/P2, with exact file/line evidence, consequence, and
   minimal correction;
3. explicit answers to the eight questions;
4. explicit confirmation that Circle and all external/production boundaries
   remain excluded.

Do not edit implementation, run Bash, use web/MCP, produce a broad backlog,
restate the implementation, or invent authority. Ignore cosmetic/style issues.
