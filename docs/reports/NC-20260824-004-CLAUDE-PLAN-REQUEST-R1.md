# NC-20260824-004 — Claude implementation-plan review R1

## Objective

Independently review the Community-only student-lifecycle dark-foundation
implementation plan before any source edit. Report only material findings that
could cause incorrect authority, security, privacy, identity, idempotency,
replay, state, migration, n8n, test, or current-source integration behavior.

## Authority order

1. Current owner instruction and accepted decision:
   `/Users/xbohdpukc/dev/NanoClaw/.program/decisions/decision-student-lifecycle-community-dark-foundation-2026-08-24.json`
2. Accepted target design:
   `/Users/xbohdpukc/dev/NanoClaw/docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
3. Plan under review:
   `/Users/xbohdpukc/dev/NanoClaw/docs/STUDENT-LIFECYCLE-IMPLEMENTATION-PLAN.md`
4. Verified-live-base source in the isolated worktree.

## Accepted facts; do not reopen

- Worktree base is verified live release `778545b3`; the dirty primary source
  is 258 commits behind and must not be used for implementation.
- Only Community local/dark source, tests, ordered migration design, and an
  inactive n8n export are authorized.
- Circle is completely excluded until Community is ready and a later owner
  authorization exists.
- Production migration/data, n8n import/activation, Heartbeat registrations,
  deployment/restart, legacy cutover, credentials/rotation, action consumers,
  messages, certificates, and minion capability are not authorized.
- Heartbeat exposes 11 official external webhook actions but no lesson/progress
  webhook. Snapshot collectors are future mechanics; this slice builds the
  durable substrate without a live schedule/provider call.
- The lifecycle path must be deterministic and must never dispatch an LLM.
- Existing tracked n8n credential literals are a separate inactive remediation
  item. Do not inspect or reproduce them.

## Allowed read paths

Read only:

1. `/Users/xbohdpukc/dev/NanoClaw/docs/STUDENT-LIFECYCLE-IMPLEMENTATION-PLAN.md`
2. `/Users/xbohdpukc/dev/NanoClaw/docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
3. `/private/tmp/nanoclaw-student-lifecycle-dark/CLAUDE.md`
4. `/private/tmp/nanoclaw-student-lifecycle-dark/src/webhook-server.ts`
5. `/private/tmp/nanoclaw-student-lifecycle-dark/src/webhook-inbox.ts`
6. `/private/tmp/nanoclaw-student-lifecycle-dark/src/webhook-inbox-reaper.ts`
7. `/private/tmp/nanoclaw-student-lifecycle-dark/data/business/migrations/nanoclaw-v2/133_contador_payment_fulfillment_cases.sql`
8. `/private/tmp/nanoclaw-student-lifecycle-dark/data/business/migrations/nanoclaw-v2/rollback_133_contador_payment_fulfillment_cases.sql`

Do not read `.env*`, `data/webhooks.json`, n8n workflow files, credentials,
auth/session stores, runtime databases, logs, student records, browser state,
or any unrelated source/history.

## Required response

Write only:

`/Users/xbohdpukc/dev/NanoClaw/docs/reports/NC-20260824-004-CLAUDE-PLAN-RESPONSE-R1.md`

Use this structure:

1. verdict: `APPROVED`, `APPROVED WITH MATERIAL CORRECTIONS`, or
   `CHANGES REQUIRED`;
2. material findings ordered by consequence, each with exact plan/source
   evidence and a concrete correction;
3. answers to the six questions in plan section 9;
4. corrected file/slice/test map if required;
5. explicit statement that Circle and external/production boundaries remain
   excluded.

Do not restate the plan, create a speculative backlog, edit implementation
files, run Bash, use the web, or invent owner decisions. If there is no material
finding, say so and stop.
