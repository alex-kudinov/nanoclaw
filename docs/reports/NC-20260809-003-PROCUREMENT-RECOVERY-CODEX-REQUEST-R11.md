# NC-20260809-003 Procurement Recovery — Codex Request R11

## Objective

Review the exact response to Claude R10's sole blocker and its three accepted
procedure recommendations. Decide whether the complete uncommitted delta from
live commit `ba726e7cbda03e35cf63d7d1b732ced5339f95e4` is safe to commit, build
as an immutable release, deploy collection-only, and exercise with one fourth
natural CaleProcure positive-control canary.

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R11.md`

Do not edit any other artifact.

## Authority and boundaries

Use the R10 request/response as the immediate specification:

- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R10.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R10.md`

Apply the repository authority chain named in R10. Never read or transmit
`.env*`, credentials, OAuth/session/browser-profile state, databases or row
content, task result payloads, local MCP settings, or other restricted
material. The user authorized the non-secret source and documentation named
here. Review remains off. Commercial decisions and every `DECIDE`/`ADVANCE`
command remain named-human-only.

## R10 blocker disposition

`planReleaseOwnedInstructionMounts` now resolves a configured target with the
same `containerPath || basename(hostPath)` rule as `mount-security`, prefixes a
slash, applies `path.posix.normalize`, removes trailing slashes, and compares
the resulting target to `/knowledge`. This suppresses all four equivalent
spellings under review: `knowledge`, `knowledge/`, `./knowledge`, and an empty
target whose host-path basename is `knowledge`.

The first attempted regression correctly exposed two test-design/implementation
details: the empty case's host path must actually have basename `knowledge`,
and Node preserves a normalized trailing slash. Codex corrected both rather
than weakening the assertions.

`src/container-runner.test.ts` now has three explicit alias cases in addition
to the original exact-target precedence test. All 27 focused tests pass under
the pinned Node 22.23.2 runtime.

## R10 non-blocking recommendations incorporated

1. The procedure now resolves fresh interactive snapshot refs before any
   Clear/fill/Search action, rather than introducing the ref rule after those
   actions.
2. Business-unit lookup uses the portal's own filter/search, requires a visible
   reported count of exactly one, and otherwise requires proof across every
   lookup page or fails ambiguous.
3. Department equality permits only trim, internal-whitespace collapse, and
   case-insensitivity. Substring, fuzzy, abbreviation, inferred, hidden-only,
   and off-page-unchecked matches are forbidden.

## Files to inspect

- `src/container-runner.ts`
- `src/container-runner.test.ts`
- `knowledge/agents/procurement/procedures/scan-caleprocure.md`
- `scripts/build-release.mjs`
- `docs/RELEASE-INTEGRITY.md`
- `docs/ACTIVE-WORK.md`
- `docs/PROJECT-MAP.md`
- `docs/ENGINEERING-CHANGELOG.md`
- R9 and R10 request/response files
- this request

Inspect the complete diff from `ba726e7cbda03e35cf63d7d1b732ced5339f95e4`.
Do not reopen accepted migration 115 or blocked migration-116 proposal work
unless the delta contradicts them.

## Verification already run under Node 22.23.2

- `npm run typecheck` — pass
- `vitest run src/container-runner.test.ts` — 1 file / 27 tests, pass
- deterministic Prettier formatting — pass
- `npm run docs:continuity-check` — 48 rows / 44 entries, pass
- `git diff --check` — pass

## Required verdict

Return `GO`, `CHANGES REQUIRED`, or `BLOCKED`. Verify the alias suppression
against actual mount resolution, the new regressions, the instruction ordering,
lookup-wide uniqueness and normalization rules, and the complete release-owned
knowledge boundary. State whether commit, immutable build/deployment, and one
collection-only natural canary may proceed while review stays disabled. Record
any owner decision separately; do not convert a recommendation into a blocker
without an exact reachable failure path.

The next natural run must either discover and stably identify public event
`0000039985` with business unit `3820`, or fail partial for a concrete visible
search/identity reason. A complete nine-zero run while that event remains
visible is forbidden. The active container must consume the procedure bytes
attested by the release archive.
