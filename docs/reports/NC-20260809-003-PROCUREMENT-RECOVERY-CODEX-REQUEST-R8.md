# NC-20260809-003 Procurement Recovery — Codex Request R8

## Objective

Review the implementation of every determinate R7 collection-canary finding.
Decide whether the follow-up is safe to commit, build as an immutable release,
deploy collection-only, and exercise with one third natural CaleProcure canary.

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R8.md`

Do not edit source, tests, migrations, prompts, continuity files, or any other
artifact in this round.

## Authority and boundaries

The R7 request and response are the immediate specification:

- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R7.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R7.md`

Also apply `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
`docs/CHANGE-PROTOCOL.md`, `docs/ENGINEERING-CHANGELOG.md`, and
`groups/procurement/CLAUDE.md` in their normal authority order.

Never read or transmit `.env*`, credentials, OAuth/session/browser-profile
state, databases or row content, task result payloads, local MCP settings, or
other secret/restricted material. The user authorized the non-secret source and
documentation named here. Commercial decisions and every `DECIDE`/`ADVANCE`
command remain named-human-only. Review stays off in this round.

## Files to inspect

- `src/procurement-task-run.ts` (new)
- `src/procurement-task-completion.ts` (new)
- `src/procurement-task-completion.test.ts` (new)
- `src/procurement-ipc-handlers.ts`
- `src/procurement-ipc-handlers.test.ts`
- `src/task-scheduler.ts`
- `src/task-scheduler.test.ts`
- `src/db.ts`
- `src/types.ts`
- `src/index.ts`
- `scripts/register-procurement.ts`
- `knowledge/agents/procurement/procedures/scan-caleprocure.md`
- `docs/ACTIVE-WORK.md`
- `docs/PROJECT-MAP.md`
- `docs/ENGINEERING-CHANGELOG.md`

Inspect the complete diff from commit `9aa23b4e7c394145487baabb64873beb5d321617`
but do not reopen the already accepted migration-115 design or the separately
blocked migration-116 proposal work.

## R7 dispositions implemented

1. Legal active-work status is now `deployed_unverified`.
2. `src/procurement-task-run.ts` derives bounded token
   `t.<taskId>.<startTimeMs>` and maintains a host-only active token per group.
3. The CaleProcure IPC branch overrides the model key while that scheduled task
   is active and warns on mismatch.
4. The validator recomputes the exact token; queries only its row with a
   post-start guard; requires `caleprocure-browser-v2`; requires JSONB set
   equality and equal cardinality to the release-owned nine planned units; and
   still requires terminal complete/observed-count/missing-count consistency.
5. Prompt classification now includes daily scan, bare `rescan`, and targeted
   CaleProcure; exempts only exact Bonfire-only; and fails closed with a warning
   on any other Procurement scan-shaped/CaleProcure wording.
6. The scheduler dependency is required, begins/ends the host token around the
   container, buffers receipt-required final text, validates after the
   container, sends success only afterward, and sends only the fixed failure
   correction on rejection. Non-receipt task streaming remains unchanged.
7. Every due task uses a SQLite compare-and-swap against the exact `next_run`
   read by the poller. A lost race returns without running.
8. Startup marks `once` + active + null-next-run + null-last-run rows `error`,
   records a fixed `last_result`, logs, and sends a fixed no-rerun alert.
9. The procedure records the host run-key override and the verified
   CaleProcure identity/visibility/load rules.
10. Project-map, active-work, and changelog state distinguish live 115,
    rejected natural canaries, operator-assisted adapter proof, uncommitted
    correction, and pending natural proof.

## Codex independent verification already run

Using exact Node 22.23.2:

- `npm run typecheck` — pass
- focused tests for completion, scheduler, intake, IPC, and review — 5 files,
  46 tests, pass
- `npm run format:check` — pass
- `npm run docs:continuity-check` — pass
- `git diff --check` — pass

The focused tests include:

- no model-complete channel message on missing receipt;
- exactly one final message after successful validation, with invocation order;
- active host token overrides the model key;
- bare/drifted scans require receipts and Bonfire-only is exempt;
- foreign planned-unit set and stale adapter are rejected;
- deferred queue dedupe plus CAS produces one container run;
- restart-orphaned one-time work becomes visible `error` without rerun.

## Required review

Return `GO`, `CHANGES REQUIRED`, or `BLOCKED`, then:

1. verify every R7 F-1 through F-10 disposition with exact evidence;
2. audit token lifetime, collision/length failure, IPC override, retry, and
   multi-daemon/CAS behavior;
3. audit every task state across invalid folder, lost CAS, container error,
   missing receipt, valid receipt, success-message delivery failure, daemon
   restart, cron, interval, and once;
4. validate the PostgreSQL JSONB predicate and parameter order against the
   actual schema/adapter contract;
5. identify any remaining false-positive or false-negative completion path;
6. determine whether tests/docs are sufficient or specify exact additions;
7. state whether a verified immutable release and third natural canary may
   proceed while review remains disabled;
8. report exact commands run, any environment limitation, remaining owner
   decisions, elapsed time, and cost.

Convergence requires causal receipt attribution, no pre-validation final
success, no silent one-time loss/replay, unchanged ordinary-task behavior, and
no expansion of human-only authority.
