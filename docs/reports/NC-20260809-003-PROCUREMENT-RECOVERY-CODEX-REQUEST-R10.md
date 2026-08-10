# NC-20260809-003 Procurement Recovery — Codex Request R10

## Objective

Review the complete response to Claude R9: all three blocking procedure edits,
the portal-native stable-identity workflow, and closure of the release-owned
knowledge integrity gap. Decide whether this delta is safe to commit, build as
an immutable release, deploy collection-only, and exercise with one fourth
natural CaleProcure positive-control canary.

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R10.md`

Do not edit source, tests, scripts, procedures, prompts, continuity files, or
any other artifact in this round.

## Authority and boundaries

Use the R9 request/response as the immediate specification:

- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R9.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R9.md`

Also apply `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
`docs/CHANGE-PROTOCOL.md`, `docs/ENGINEERING-CHANGELOG.md`,
`docs/RELEASE-INTEGRITY.md`, and `groups/procurement/CLAUDE.md` in authority
order.

Never read or transmit `.env*`, credentials, OAuth/session/browser-profile
state, databases or row content, task result payloads, local MCP settings, or
other secret/restricted material. The user authorized the non-secret source and
documentation named here. Commercial decisions and every `DECIDE`/`ADVANCE`
command remain named-human-only. Review stays off.

## Files to inspect

- `knowledge/agents/procurement/procedures/scan-caleprocure.md`
- `src/container-runner.ts`
- `src/container-runner.test.ts`
- `scripts/build-release.mjs`
- `docs/RELEASE-INTEGRITY.md`
- `docs/ACTIVE-WORK.md`
- `docs/PROJECT-MAP.md`
- `docs/ENGINEERING-CHANGELOG.md`
- this request

Inspect the complete working-tree diff from commit
`ba726e7cbda03e35cf63d7d1b732ced5339f95e4`, including R9 request/response.
Do not reopen accepted migration 115, the deployed receipt-correlation source,
or blocked migration-116 proposal work unless this delta contradicts them.

## R9 blocking dispositions

### B-1 — payload contract

Step 4 now defines `observed_units` only as planned keywords for which the agent
clicked the visible Search button and then read a visible result/no-result state
for that exact keyword. Page load alone is explicitly not observation. Failed
proof is omitted even when the page loaded.

### B-2 — visible selection

Step 2 now requires `agent-browser snapshot -i` refs for visible controls and
the accessibility snapshot for the visible summary/grid, never an unqualified
text match. Multiple candidates or inability to establish visibility makes the
unit ambiguous and omitted.

### B-3 — partial retry

`failed` may be retried once only with byte-identical evidence. `partial` must
stop: same evidence reproduces missing units and corrected evidence conflicts
with the task-bound batch hash. An operator rerun issues a new token.

## Stable identity reproduced by Codex

The R9 review correctly predicted that a visible positive row without a
business unit would fail partial. Codex then found a public, portal-native,
reproducible path:

1. CaleProcure's visible `Look up businessUnit` control opens a visible table of
   business-unit codes and department names.
2. The exact visible row `3820 SF Bay Conservation Commission` is unique.
3. Opening `https://caleprocure.ca.gov/event/3820/0000039985` yields a visible
   `Event Details` page that repeats event ID `0000039985`, department
   `SF Bay Conservation Commission`, title `NOTICE OF INTENT TO AWARD`, and
   close `08/13/2026 3:00PM PDT`.

The procedure generalizes this without inference: require exactly one visible
lookup row whose department exactly equals the result agency; treat its code as
a candidate; construct the clean URL; accept only if the visible detail page
repeats the exact event ID and department (and title when present). Zero or
multiple lookup matches, or detail mismatch, is partial.

## Release-owned knowledge integrity

R9 verified that `groups/` was archive-covered while the delegated
`knowledge/` procedure was not. The delta now:

1. adds tracked `knowledge/` to `scripts/build-release.mjs` archive inputs;
2. adds `planReleaseOwnedInstructionMounts` to `container-runner`;
3. when `knowledge/agents/<safe-group>` exists in `NANOCLAW_CODE_ROOT`, mounts
   it directly and read-only at `/workspace/extra/knowledge`;
4. removes any configured additional mount targeting container path
   `knowledge`, so mutable operations bytes cannot shadow release bytes;
5. passes all remaining operational mounts through the unchanged external
   allowlist;
6. retains the configured knowledge mount only for older releases whose code
   root lacks that per-group directory, preserving rollback; and
7. documents the release identity and fallback in `RELEASE-INTEGRITY.md`.

No secrets or operational knowledge writes are introduced. The packaged tree
is tracked source; `FILES.sha256` covers every archive file.

## Codex verification already run under exact Node 22.23.2

- `npm run typecheck` — pass
- `vitest run src/container-runner.test.ts` — 1 file / 24 tests, pass
- `npm run format:check` — pass after deterministic Prettier formatting
- `npm run docs:continuity-check` — pass, 48 rows / 44 entries
- `git diff --check` — pass before the latest documentation additions; rerun is
  required below

The three new regressions cover release-owned precedence plus configured-mount
suppression, old-release fallback, and unsafe group-folder rejection.

## Required review

Return `GO`, `CHANGES REQUIRED`, or `BLOCKED`, then:

1. verify B-1, B-2, and B-3 exactly;
2. audit the lookup-plus-detail identity workflow for false pairing, duplicate
   agency names, stale rows, and mismatch handling;
3. audit whether all nine observed units now require explicit search actions
   and visible exact-keyword state at both browse and payload boundaries;
4. review the release-owned mount plan for traversal, symlink, shadowing,
   allowlist bypass, read/write, missing-directory, main/non-main, older-release
   rollback, and duplicate mount-target behavior;
5. verify the builder and `FILES.sha256` cover the knowledge files actually
   mounted by the active release;
6. determine whether the tests/docs are sufficient or specify exact additions;
7. decide whether immutable build/deployment and one collection-only natural
   positive-control canary may proceed with review disabled; and
8. report exact commands, environment limitations, remaining owner decisions,
   elapsed time, and exact round cost if observable.

Convergence requires the next natural run either to discover and stably identify
event `0000039985` or fail partial for a concrete visible identity reason. A
complete nine-zero run while that event remains visible is forbidden. The
active container must consume the same procedure bytes attested by the release
archive rather than mutable checkout bytes.
