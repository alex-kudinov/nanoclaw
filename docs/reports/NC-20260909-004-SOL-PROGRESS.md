---
date: 2026-09-10
time: 02:59 UTC
project: NanoClaw
slug: student-enrollment-production-pilot
status: active
branch: codex/student-enrollment-production-pilot-20260909
head: 3b8ac46b996ac1c5b9accf29076403cdf39301f8
topics: [student-enrollment, production-pilot, stripe, roster, heartbeat]
files_touched: [src/student-enrollment-foundation.ts, data/business/migrations/nanoclaw-v2, docs, facts/catalogs, scripts, src]
external_state: read-only
blockers: [production-not-drained, implementation-incomplete, provider-preflights-incomplete]
program_id: program:company-os
program_charter_version: 1.0.0
program_charter_sha256: 38b36c42358ff7c9ec919bfee0d06064cb52e9f9f1623fd4622c933f95b53c6a
program_state_revision: 281
program_work_item: work:student-enrollment-production-admission-pilot
---

# Handoff: Student enrollment production pilot

## Objective and User Intent

Execute only the owner-authorized NC-20260909-004 one-event pilot: one future natural, undiscounted USD 3,996 paid-in-full settled self-purchase for `supervision-inaugural` v1 and delivery block `supervision:2026-10-07`, capacity 15. Preserve accounting, use one writer claim, project immediately to CSS and Heartbeat, then disarm. No historical/repaired/synthetic/second event, broader payment family, Encharge/Plutio action, communication, certificate, or unrelated mutation.

## Program Alignment

- Contribution: promote the reviewed local admission/store/projection foundation through one bounded production event with exact canonical and provider readback.
- Authority: accepted owner decision `.program/decisions/decision-student-enrollment-production-admission-pilot-2026-09-09.json`; active claim is NC-20260909-004 through 2026-09-11T02:44:46Z.
- Invariants: current live lineage first; ten preflights before mutation; SERIALIZABLE one-writer ownership; independent accounting; no blind retry after uncertain provider acceptance; receipt-owned compensation only.
- Portfolio change this episode: none. Root owns `.program`; Sol made no state edit.
- Strategy candidates this episode: none.

## Current State

- Worktree: `/Users/xbohdpukc/dev/NanoClaw-enrollment-production-pilot-20260909`.
- Branch is still at registration commit `3b8ac46b`; the branch was clean/pushed before the task-owned integration files below were restored into the worktree.
- Live read-only health at 2026-09-10 02:49 UTC: verified `00d66184c62767a7ad8a2904c3911c130aaf1ede`, source tree `d1b8086476e18e818751cd97b8e58b59ff380c59`, artifact `ce51f7fc428f6ddf11dffc667063fbd8ad069ba1b7ce207f46f40b2f66587060`, Node 22.23.2, matching code root, Gmail/Slack connected.
- Production was not drain-safe: one unrelated Certifier conversation was active. No production/provider/config/database mutation was attempted.
- Active overlap: NC-20260909-003 Adyen is `ready_for_deploy`; revalidate live ancestry immediately before release and do not deploy over a newer live lineage.

## Completed and Verified

- Read mandatory repository, model-routing, Claude-convergence, Bizmgr, handoff, and program-lifecycle instructions plus the accepted owner decision.
- Program `validate` returned `VALID: no findings`; `status` showed revision 281 with only this work item active and none eligible.
- Exact packet source remains `codex/student-enrollment-pilot-preparation-20260909@44098313`; reviewed source remains `codex/student-enrollment-projection-foundation-20260909@d9e29856`.
- Restored the reviewed source/evidence files without replacing current live-lineage Stripe/Adyen entry points or shared continuity authorities.
- `./scripts/with-pinned-node.sh node scripts/validate-student-enrollment-production-rollout.mjs` passed: 186 omission-guarded paths, ten preflights, three migrations, nine mutations; packet remains preparation-only by design.
- Migration hashes exactly match the packet: 146 source `3162275b...`, rollback `2dee44c8...`; 147 source `b0ace849...`, rollback `be7400d2...`; 148 source `274eafee...`, rollback `3539f228...`.
- The focused Vitest invocation did not start because this isolated worktree has no installed `vitest` package/node_modules. This is a dependency-install prerequisite, not a test failure.

## Changes Made

Task-owned dirty paths (83 before adding this checkpoint):

```text
src/student-enrollment-foundation.ts
data/business/migrations/nanoclaw-v2/{146,147,148}_*.sql and all three rollback files
docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md
docs/STUDENT-ENROLLMENT-{INGRESS-ADAPTERS,TRANSACTIONAL-STORE,AUTHENTICATED-ADMISSION,PROJECTION-FOUNDATION}.md
docs/STUDENT-LIFECYCLE-STRATEGY.md
docs/programs/company-os/evidence/NC-20260906-{006,007,008,009}-*.md
docs/programs/company-os/evidence/NC-20260909-{001,002}-*.md
docs/reports/NC-20260906-006-* (9 files)
docs/reports/NC-20260906-007-* (5 files)
docs/reports/NC-20260906-008-* (3 files)
docs/reports/NC-20260906-009-* (6 files)
docs/reports/NC-20260907-004-B1-STUDENT-ROSTER-SNAPSHOT.json
docs/reports/NC-20260909-001-* (4 files)
docs/reports/NC-20260909-002-* (4 files)
docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.{json,md,schema.json}
facts/catalogs/student-enrollment-projection-targets-v1.{json,schema.json}
scripts/enrollment-admission-fixtures.{mjs,d.mts}
scripts/student-enrollment-{store,admission,projection}-disposable-worker.ts
scripts/validate-student-enrollment-production-rollout.{mjs,d.mts}
scripts/verify-student-enrollment-{store,projection}-disposable.{mjs,d.mts}
src/bookkeeper-enrollment-contract.{ts,test.ts}
src/student-enrollment-ingress.{ts,test.ts}
src/student-enrollment-store.ts
src/student-enrollment-store-mapping.ts
src/student-enrollment-store.test.ts
src/student-enrollment-admission.{ts,test.ts}
src/student-enrollment-projection.ts
src/student-enrollment-projection-store.ts
src/student-enrollment-projection.{test.ts,catalog.test.ts,disposable.test.ts,migration.test.ts}
src/student-enrollment-production-rollout.test.ts
```

This checkpoint is the 84th task-owned dirty path. No pre-existing dirty primary file was touched.

## Decisions and Reasoning

- Integrate only exact reviewed enrollment artifacts onto the live descendant. Do not merge or deploy `d9e29856` wholesale because it would regress intervening live Catalog, Sales, and Adyen work.
- Preserve current `src/webhook-server.ts`, `src/webhook-inbox-reaper.ts`, `src/stripe-payment-host.ts`, and `tools/contador/process-payment.cjs` until the production facade is deliberately implemented against the current lineage.
- Keep the pinned NC-002 packet immutable/preparation-only; the owner authorization lives in the accepted `.program` decision and NC-004 implementation/evidence.
- Production runtime must not import the disposable store entry points. Add an explicit production facade/guard while retaining disposable guards and tests.

## Open Items and Blockers

- Implementation is incomplete: native Stripe evidence resolver, production transaction facade, atomic one-event budget, accounting-only legacy mode, CSS and Heartbeat drivers, health/observability, and two-path host wiring are not yet written.
- `node_modules` is absent in this isolated worktree; install with the pinned runtime before interpreting tests.
- P03 is currently blocked by one active Certifier conversation; drain must be freshly proven before backup/migration/deploy.
- P07/P08 remain unproved. CSS Editor write/readback and header preimage are pending. Installed Heartbeat toolbox lacks guarded remove and full exact-ID/invariant readback; reviewed remove commit `8d996ddd...` exists in a separate clean Toolbox worktree but is not installed here.
- No database backup, migration, release, provider, Sheet, group, membership, writer, payment, or student mutation has occurred.

## Verification Needed

- Install dependencies under Node 22.23.2; run focused admission/store/projection/rollout suites and full typecheck/tests.
- Revalidate live release/branch ancestry, active work, queues/listener/channels, exact packet and migration hashes, schema 142-145 prerequisites, provider identities, CSS header, Heartbeat group/course state, and all ten preflights before first external mutation.
- Run fresh bounded Claude Sonnet/high file-only review after implementation; fix and re-review material findings.

## Immediate Next Action

On root approval to resume, install repository dependencies with `./scripts/with-pinned-node.sh npm ci`, run the restored focused baseline, then implement the NC-004 production facade and current-lineage Stripe integration locally only. Continue to forbid external mutations until review and a fresh P01-P10 preflight checkpoint pass.

## Gotchas and Environment Notes

- The dirty primary `/Users/xbohdpukc/dev/NanoClaw` is preserved and must remain untouched except for read-only `.program` and live-authority inspection owned by root.
- Toolbox primary is heavily dirty and must not be used as an edit target. The reviewed Heartbeat removal commit is isolated at `/Users/xbohdpukc/dev/toolbox-heartbeat-remove-group-20260906`.
- The first restored packet validation failed only because two referenced evidence files had not yet been restored; after restoring them, validation passed exactly.
