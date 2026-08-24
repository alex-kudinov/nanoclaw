# Community Student Lifecycle Dark Foundation — Implementation Plan

Status: reconciled after Claude Sonnet/high review R1; ready for source work
Task: `NC-20260824-004`
Program item: `work:student-lifecycle-community-dark-foundation`
Date: 2026-08-24

## 1. Outcome

Implement the local, dark, Community-only foundation from
`docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md` without changing Circle or any live
provider/runtime state.

The completed slice must provide:

- an ordered, reversible, admin-only `business_v2` schema;
- a deterministic host parser, HMAC relay gate, privacy minimizer, identity and
  catalog resolver, event ledger, multi-axis enrollment projection, history,
  exceptions, retry/replay path, fixtures-only reconciliation runner, and
  health surface;
- sanitized fixtures and exhaustive contract/security/state/recovery tests;
- an inactive n8n Community workflow template containing only runtime
  credential references;
- no LLM/minion dispatch and no lifecycle action/outbox/message capability.

## 2. Authority and exclusions

Authority is the accepted decision
`.program/decisions/decision-student-lifecycle-community-dark-foundation-2026-08-24.json`.

Explicitly excluded:

- every Circle API call, identifier, catalog entry, webhook, workflow, test
  canary, credential, or configuration;
- production migration/data write, release, deployment, restart, or schedule;
- n8n import/activation and Heartbeat webhook create/delete/update;
- legacy WordPress/Pabbly/n8n/Heartbeat-native receiver changes;
- Encharge, email, Slack, notification, certificate, action-runtime, or minion
  behavior;
- credential access, copying, rotation, or reproduction of existing literals.

The implementation must fail closed unless the workspace is exactly
`community`. Circle will require a later migration and separately authorized
work item after Community is live-verified.

## 3. Baseline and worktree

- Dirty primary: `/Users/xbohdpukc/dev/NanoClaw`; continuity/program files only.
- Isolated implementation worktree:
  `/private/tmp/nanoclaw-student-lifecycle-dark`.
- Branch: `codex/student-lifecycle-dark-foundation-20260824`.
- Base: verified live release `778545b353b22d63329d906505546a45ffb6a04a`.
- Node: repository pin 22.23.2 through `scripts/with-pinned-node.sh`.
- Next ordered migration: `134` after deployed migration 133.

No task-owned source edit begins until Claude's plan response is reconciled.

## 4. Target request path

The lifecycle endpoint is separate from generic agent webhooks:

1. exact configured path matches only when
   `STUDENT_LIFECYCLE_ENABLED=true` and all required settings exist;
2. read the exact raw body under a strict byte limit;
3. verify timestamp and `v1` HMAC over `timestamp + '.' + raw_body` using
   constant-time comparison and a five-minute skew window;
4. parse schema version 1 and require `workspace='community'`;
5. validate one of the 11 official Heartbeat action envelopes;
6. create a minimized prepared envelope in memory by discarding name/content,
   replacing normalized email with a keyed fingerprint, and retaining only
   the documented opaque Heartbeat identifiers needed for replay;
7. archive the prepared envelope in `webhook_inbox` with stable source
   event identity;
8. only after archive, transiently use the current request's normalized email
   to resolve an exact party where possible; retry from the prepared envelope
   uses an existing Heartbeat identity link or creates/reopens a durable
   `needs_identity` exception rather than requiring raw email;
9. return duplicate immediately or durably record the normalized fact and
   projection mechanically;
10. mark handled with normalized-event identity, or failed for deterministic
   reaper retry;
11. never resolve a group, spawn an agent, send a message, or invoke a consumer.

The stored prepared envelope is sufficient for lossless delivery/event replay
without raw email, but it does not retain enough information to repeat an
email-to-party lookup. This is intentional: the control-plane design's proposed
seven-day failed-identity staging class is narrowed in this dark slice to the
keyed fingerprint + Heartbeat user ID + durable exception. No encrypted/raw
email staging table is created. A later operator-approved exact Heartbeat
identity binding makes replay resolvable without retaining extra PII.

## 5. Exact source plan

### 5.1 Ordered database migration

Add:

- `data/business/migrations/nanoclaw-v2/134_student_lifecycle_community_dark.sql`
- `data/business/migrations/nanoclaw-v2/rollback_134_student_lifecycle_community_dark.sql`
- `src/student-lifecycle-migration.test.ts`

Migration tables:

1. `student_lifecycle_catalog_entries`
   - version/hash-bound Community group/course/cohort/offer/program mappings;
   - no Circle value accepted;
   - no live seed rows in this slice.
2. `student_lifecycle_identity_links`
   - exact `(workspace, heartbeat_user_id)` to `party_id` binding;
   - Community-only; append-safe source/evidence metadata.
3. `student_lifecycle_events`
   - append-only normalized facts, source key uniqueness, authenticity,
     mapping, bounded facts, inbox/run evidence, and processing state.
4. `student_lifecycle_enrollments`
   - versioned current projection per explicit enrollment episode;
   - independent access, activation, learning, grading, feedback, certificate,
     finance, marketing-consent, and contact-suppression axes.
5. `student_lifecycle_state_history`
   - append-only axis transitions with event/run, policy/catalog, reason, and
     compare-and-swap version evidence.
6. `student_lifecycle_reconciliation_runs`
   - catalog/registry/membership/progress scan receipts and completeness.
7. `student_lifecycle_exceptions`
   - stable privacy-minimal owner-visible conflicts/quarantines.

Add aggregate/admin-only health and exception views if they expose no direct
student identity. Revoke PUBLIC and grant only `nanoclaw_admin`. Do not grant a
group/minion role. Rollback must refuse once any lifecycle row exists.

### 5.2 Pure contract and projection logic

Add:

- `src/student-lifecycle.ts`
- `src/student-lifecycle.test.ts`

Responsibilities:

- official action and payload validation;
- Community-only workspace enforcement;
- raw-body byte limit and HMAC/timestamp verification helpers;
- deterministic source-event keys;
- keyed email fingerprint and minimized prepared envelope;
- stable treatment classification for all 11 actions;
- pure multi-axis projection reducer;
- no database, network, filesystem, provider, channel, container, or LLM use.

### 5.3 Host store

Add:

- `src/student-lifecycle-store.ts`
- `src/student-lifecycle-store.test.ts`

Responsibilities inside an admin transaction:

- exact identity-link lookup, then unique normalized-email party lookup only
  during initial preparation;
- exact versioned catalog resolution with explicit unknown/ambiguous states;
- idempotent normalized event insert;
- compare-and-swap enrollment creation/update;
- exactly one append-only history row per changed axis;
- stable exception ensure/reopen/verified-close mechanics;
- replay of minimized prepared envelopes;
- aggregate health read;
- no party creation/merge, catalog inference, provider call, action, or message.

Tests use injected/fake clients or disposable PostgreSQL; they never require
production credentials.

### 5.4 Fixtures-only reconciliation runner

Add:

- `src/student-lifecycle-reconciliation.ts`
- `src/student-lifecycle-reconciliation.test.ts`

Responsibilities:

- pure/injected reducers for webhook-registry, catalog, membership, and cohort
  progress snapshots;
- expected-versus-observed scope, completeness, source hash, new/unchanged/
  conflicting/quarantined counts, and watermark decisions;
- write reconciliation-run receipts through an injected store interface;
- refuse partial pagination/scope and retain the prior watermark;
- no Heartbeat/API/toolbox/network call, schedule, credential, or live catalog
  in this dark slice.

### 5.5 Webhook and reaper wiring

Modify:

- `src/config.ts`
- `.env.example`
- `src/webhook-server.ts`
- `src/webhook-server.test.ts`
- `src/webhook-inbox-reaper.ts`
- `src/webhook-inbox-reaper.test.ts`
- `src/index.ts`

Configuration:

- `STUDENT_LIFECYCLE_ENABLED=false` by default;
- blank `STUDENT_LIFECYCLE_WEBHOOK_PATH`;
- blank `STUDENT_LIFECYCLE_RELAY_SECRET`;
- blank host-only `STUDENT_LIFECYCLE_IDENTITY_SECRET`, distinct from the relay
  secret so relay rotation cannot change durable identity fingerprints;
- no Circle setting;
- enabled state fails closed unless the path is valid and both secrets are at
  least 32 characters and unequal.

Wiring contract:

- dedicated route before generic webhook/group lookup;
- a lifecycle-only bounded body reader that terminates and returns 413 as soon
  as the configured byte ceiling is exceeded; the existing unbounded shared
  `readBody()` must not be used for this route;
- exact prepared envelope archived, never raw Heartbeat payload;
- mechanical processor plus an explicit `student-lifecycle` reaper early-return
  branch before `data/webhooks.json`, group, prompt, or agent lookup;
- no `runAgent`, `enqueueAgentTask`, `sendMessage`, callback, or group lookup;
- health reports configuration and counters only, with no student identifiers;
- default-off code has no runtime/provider side effect.

The reaper test must cover lifecycle rows selected as `received`, `failed`, and
stale `dispatched`, and assert `runAgent` remains zero for every case.

### 5.6 Inactive n8n export

Add:

- `setup/n8n/student-lifecycle-community-dark-workflow.json`
- `src/student-lifecycle-n8n-contract.test.ts`

Requirements:

- `active: false`;
- Community only, no Circle strings or IDs;
- public webhook path is an obvious disabled placeholder, not a production
  capability path;
- host URL and HMAC secret come from runtime environment/credential references;
- exact body and timestamp signature match the host contract;
- allowlist 11 actions, normalize only documented fields, enforce limits;
- successful execution data disabled; error output contains reason codes only;
- retry/backoff configured for host delivery;
- no inline credential, digest, token, host IP, student fixture, or provider ID;
- no Slack, Encharge, email, certificate, action, or minion node.

### 5.7 Authoritative documentation

In the isolated worktree, update only the implemented-mechanics sections of:

- `docs/WEBHOOK-RELIABILITY.md`
- `docs/PROJECT-MAP.md`
- `docs/SECURITY.md`
- `agent_docs/nanoclaw-business-pg-schema.md` with a structure-only migration
  overlay if the generated snapshot cannot be refreshed without production.

Primary program continuity remains in `docs/ACTIVE-WORK.md`,
`docs/ENGINEERING-CHANGELOG.md`, `.program/state.json`, and this plan.

## 6. Core behavior matrix

| Action | Dark foundation result |
| --- | --- |
| `USER_JOIN` | identity/activation observation; apply only to exact existing enrollment(s) |
| `USER_UPDATE` | normalized reconciliation request, no direct axis transition |
| `GROUP_JOIN` | access observation only after exact catalog mapping |
| `COURSE_COMPLETED` | learning completion only; no grading/certificate/finance/consent effect |
| `ABANDONED_CART` | signal event/exception only; never a message eligibility decision |
| `EVENT_RSVP` | supplementary RSVP fact only; never attendance |
| `EVENT_CREATE` | catalog refresh signal only |
| `THREAD_CREATE` | normalized non-lifecycle/no projection |
| `MENTION` | normalized non-lifecycle/no projection |
| `DIRECT_MESSAGE` | normalized IDs only; no content/no projection |
| `DOCUMENT_CREATE` | normalized non-lifecycle/no projection |

Unknown actions fail validation. Unknown additive fields are ignored after
bounded parsing; required-field changes fail closed.

## 7. Verification plan

### Focused

- all 11 action fixtures, required/optional filters, unknown/additive fields;
- Community accepted and every Circle spelling/value rejected;
- missing/invalid/expired/replayed HMAC, body mutation, timestamp skew,
  constant-time path, invalid JSON/content type, and an oversize stream that is
  rejected before full buffering/JSON/HMAC work;
- raw name/email/message/header/callback data absent from prepared/archive,
  event, exception, log, and n8n fixtures;
- stable keys, duplicate receipts, out-of-order facts, unknown/ambiguous
  identity/catalog, shared group, progress regression, completion-before-start,
  and independent-axis invariants;
- replay/no-change and failed/dead-letter branches;
- received/failed/stale-dispatched reaper cases prove the lifecycle branch never
  reaches webhook config, group lookup, prompt rendering, or `runAgent`;
- fixtures-only registry/catalog/membership/progress reconciliation proves
  completeness refusal, stable hashes, watermark retention, and run receipts;
- migration structure, constraints, privileges, append-only behavior, empty
  rollback, populated rollback refusal;
- inactive n8n/no-credential/no-side-effect contract.

### Repository

Run from the isolated worktree:

```bash
./scripts/with-pinned-node.sh npm ci
./scripts/with-pinned-node.sh npm run typecheck
./scripts/with-pinned-node.sh npm test
./scripts/with-pinned-node.sh npm run docs:continuity-check
git diff --check
```

If `container/agent-runner` is untouched, document that runner verification is
not applicable; otherwise run its build and tests.

### Independent review

After implementation, send a bounded diff/evidence packet to Claude Sonnet/high.
Codex verifies every finding, fixes all material issues, reruns checks, and
returns only load-bearing corrections for a second bounded review.

## 8. Stop conditions and external gates

This local work is complete only when reviewed source and tests satisfy the
dark-foundation condition with no unresolved material findings. Stop before:

- production migration or database access;
- n8n import/activation;
- Heartbeat provider registration;
- runtime build/release/deployment/restart;
- natural/synthetic provider canary;
- legacy receiver change;
- Circle work;
- any lifecycle action, message, certificate, or minion work.

Those boundaries remain under `work:student-lifecycle-control-plane-build`,
`work:student-lifecycle-action-runtime-build`,
`work:student-lifecycle-minion-build`, and
`work:student-lifecycle-circle-rollout`.

## 9. Claude reconciliation questions

Claude should report only material issues that could make this plan unsafe,
non-idempotent, non-replayable, privacy-leaking, insufficiently testable, or
inconsistent with the accepted design/current live source. In particular:

1. Is pre-archive transient identity resolution compatible with archive-first
   reliability when the stored prepared envelope must be replayable without
   raw email?
2. Is the seven-table split proportionate, or should any table/function be
   combined without weakening authority or auditability?
3. Can the dedicated default-off webhook path be added without breaking generic
   webhook behavior or creating an unauthenticated path?
4. Are event identity and enrollment-episode semantics sufficient for
   duplicate, rejoin/reset, and out-of-order cases?
5. Does the inactive n8n template prove the signature contract without storing
   credential material or execution PII?
6. Are any required design completion conditions missing from the file/test
   plan?

## 10. Claude reconciliation receipt

Claude Sonnet/high R1 returned `APPROVED WITH MATERIAL CORRECTIONS` in
`docs/reports/NC-20260824-004-CLAUDE-PLAN-RESPONSE-R1.md`. Codex independently
verified and incorporated all four findings:

1. fixtures-only reconciliation runner and tests added to the plan;
2. pure minimization/archive now precedes any database identity lookup, and the
   dark slice explicitly uses fingerprint + user ID + exception instead of raw
   failed-identity staging;
3. lifecycle route requires a dedicated streaming byte-limited body reader;
4. lifecycle reaper requires an explicit mechanical early return and three
   trigger-state no-agent tests.

No second plan-review round is required because the corrections are direct,
load-bearing plan edits whose source evidence is mechanically verifiable.
