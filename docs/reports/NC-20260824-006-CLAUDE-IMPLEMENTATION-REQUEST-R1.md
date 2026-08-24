# NC-20260824-006 Claude implementation review request R1

## Objective

Review the completed Community-only student-lifecycle shadow provider
implementation across NanoClaw and the shared toolbox. Report only material
findings that could make the four-action shadow unsafe, non-idempotent,
privacy-leaking, incomplete, unrecoverable, or inconsistent with authority.

Write the verdict and findings to:

`/private/tmp/nanoclaw-student-lifecycle-shadow/docs/reports/NC-20260824-006-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

Do not edit any other file. Do not run provider mutations, network calls,
database writes, git operations, builds, tests, n8n/Heartbeat operations, or
read `.env`, credentials, auth/session stores, browser state, logs, or live
customer/student data.

## Authority and accepted facts

1. Repository instructions and running code/schema outrank design evidence.
2. Accepted provider authorization:
   `/private/tmp/nanoclaw-student-lifecycle-shadow/.program/decisions/decision-student-lifecycle-community-shadow-provider-2026-08-24.json`
3. Accepted architecture:
   `/private/tmp/nanoclaw-student-lifecycle-shadow/docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
4. Exact rollout/runbook:
   `/private/tmp/nanoclaw-student-lifecycle-shadow/docs/STUDENT-LIFECYCLE-SHADOW-RUNBOOK.md`
5. Dark substrate release `7364accd53ae...` is live, migration 134 is empty and
   admin-only, and lifecycle is disabled before this rollout.
6. Refreshed main Community state: 18 Heartbeat registrations, 58 courses, 142
   groups; the exact protected registration baseline is tracked only as IDs,
   actions, filters, destination hostnames, and URL SHA-256. Circle was not
   queried.
7. Refreshed n8n state: version 2.9.4, 24 workflows / 23 active, execution data
   and configuration are PostgreSQL-backed; existing Heartbeat workflows remain
   unchanged.
8. The initial exact pilot is Mentor Coaching Foundation: one verified
   Community/group/course/cohort mapping, 143 current group members.
9. The configured Heartbeat API credential succeeds for v0 registrations,
   courses, groups, and users but the current cohort-progress endpoint returns
   HTTP 401. The implementation must fail closed and cannot infer progress.

## Hard boundaries

- Community main workspace only. No Circle read or write.
- New registrations only: `USER_JOIN`, `USER_UPDATE`, `GROUP_JOIN`, and
  `COURSE_COMPLETED`, empty filters, one exact new n8n destination.
- Preserve every existing Heartbeat/n8n/WordPress/Pabbly/native receiver.
- No legacy cutover, other seven actions, user/group/course mutations,
  manufactured Heartbeat student events, lifecycle actions/messages/
  certificates, Encharge, minion authority, or destructive rollback.
- No callback path, credential value, raw email/name/content, or student-level
  snapshot may enter Git, CLI output, logs, n8n execution retention, or review.
- Transport canaries use reserved fixture UUIDs sent directly to n8n and retain
  immutable receipts; they never create a Heartbeat event or person.

## NanoClaw paths to inspect

- `facts/catalogs/student-lifecycle-community-shadow-v1.json`
- `facts/catalogs/student-lifecycle-community-provider-baseline-v1.json`
- `src/student-lifecycle-shadow-manifest.ts`
- `src/student-lifecycle-shadow-catalog.ts`
- `src/student-lifecycle-provider-registry.ts`
- `src/student-lifecycle-reconciliation.ts`
- `src/student-lifecycle-reconciliation-cli.ts`
- `src/student-lifecycle-store.ts` (only changed duplicate/conflict logic)
- `src/student-lifecycle-health.ts`
- `src/index.ts` (only changed lifecycle health wiring)
- `setup/n8n/student-lifecycle-community-shadow-workflow.json`
- `scripts/render-student-lifecycle-shadow-workflow.mjs`
- `scripts/build-release.mjs` (only new exact paths)
- all matching new/changed `src/student-lifecycle*.test.ts`

## Toolbox paths to inspect

Toolbox root: `/private/tmp/toolbox-n8n-lifecycle`

- `shared/n8n/registry.json`
- `shared/n8n/lib/n8n-ssh.sh`
- `shared/n8n/tools/n8n/*.sh`
- `shared/n8n/tests/test-n8n.sh`
- `shared/heartbeat/lib/api.sh` (only safe key loading change)
- `shared/heartbeat/tools/heartbeat/{inventory-webhooks,ensure-webhook,delete-webhook,snapshot-cohort-state,snapshot-group-membership}.sh`
- `shared/heartbeat/tests/test-webhook-guards.sh`
- `shared/heartbeat/registry.json` (only the new tool entries)

## Current verification

- NanoClaw Node 22.23.2 typecheck and build pass.
- Focused lifecycle: 83/83 pass; disposable production-shape PostgreSQL
  integration passes 4/4 after updating its fixture to the live schema.
- Full root suite: 3,180 pass / 15 skip / one unchanged pre-existing CNPC
  wrapper-literal failure.
- Documentation continuity, capability matrix, format, and diff checks pass.
- Toolbox new tests: Heartbeat 14/14; n8n 9/9; core suite 65/65; both registries
  strict-validate; read-only n8n inventory, safe Heartbeat inventory, exact
  baseline comparison, membership snapshot, and renderer/import dry-run pass.
- Progress snapshot returns a classified authentication failure and writes no
  watermark or provider state.

## Material review questions

1. Can any manifest/catalog path accept inferred mapping, Circle, another
   action, mutable same-key drift, or misleading exact replay?
2. Does event/reconciliation duplicate handling reject conflicting evidence?
3. Does registry comparison protect all 18 legacy registrations and allow only
   exactly four same-destination additions?
4. Do membership/progress snapshots prove completeness, minimize identity, and
   freeze on authentication/pagination/shape failure?
5. Can any n8n/Heartbeat tool expose a callback/secret, overwrite an existing
   workflow, restart with active executions, mutate without confirmation, or
   fail after partial mutation without a truthful rollback path?
6. Is the n8n relay byte-identical with host HMAC, four-action-only, minimum
   field, inactive-first, no-credential, and no-retention?
7. Can health monitoring block startup, leak errors/PII, or imply consumers or
   Circle are active?
8. Are release inputs, tests, runbook order, and rollback sufficient before
   credential/provider/deployment execution?

## Response contract

Use one of:

- `NO MATERIAL FINDINGS`
- `MATERIAL FINDINGS`

For each material finding provide severity, exact file/line evidence,
consequence, and the smallest safe correction. Do not restate the design,
propose unrelated enhancements, or treat the known progress 401/14-day natural
shadow gate as an implementation defect unless this code falsely bypasses it.
