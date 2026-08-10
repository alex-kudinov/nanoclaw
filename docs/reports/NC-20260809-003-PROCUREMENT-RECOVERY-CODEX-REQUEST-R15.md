# NC-20260809-003 — Final collector delta review, Codex R15

- Date: 2026-08-10
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Base/live commit: `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`
- Claude session: preserve exact session `58fde579-483e-42ca-a516-434971d3ad07`
- Response file: `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R15.md`

## Authorization and boundaries

The owner asked Codex and Claude to work together and authorized non-secret
NanoClaw source/documentation exchange. Read only repository source, tests, and
the R12-R15 request/response chain. Do not read `.env*`, credentials, sessions,
browser profiles, logs, databases, task payloads, or production state. Do not
browse or use the network. Write only the named R15 response file. Do not edit
implementation files, commit, deploy, or perform external actions.

## Delta after R14

R14 returned `GO for commit and shadow deployment` and recommended that the
remaining count/row reconciliation mismatch become a per-unit failure before
live. Codex implemented that recommendation before freezing the commit:

- `CaleProcureUnitDiagnostic.error` now includes
  `reconciliation_failed`.
- Structurally invalid metadata (unsafe/negative result count or invalid page
  count) still aborts the whole run as untrustworthy transport state.
- A safe non-negative result count that does not equal the number of extracted
  visible rows now records a failed unit diagnostic and continues to later
  independently observable units. It contributes no rows and no coverage.
- The old rejection test is replaced by a three-unit regression proving the
  first and third units remain observed while the mismatched second unit is
  excluded and diagnosed.
- Continuity documentation now records the deterministic collector, retired
  container/Bonfire path, shadow gates, and unchanged human/review boundaries.

No other implementation changed after R14.

## Verification on the final delta

- Exact Node 22.23.2 focused gate: 6 files / 47 tests pass.
- Exact Node 22.23.2 complete repository suite outside the process/socket
  sandbox: 157 files / 2,006 tests pass.
- Exact Node 22.23.2 host build and typecheck: pass.
- Formatting, documentation continuity, and `git diff --check`: pass.
- Independent runner build and 4 files / 29 tests: pass.

## Required review

Read the R14 response and exact post-R14 diff. Report:

1. `GO`, `CHANGES REQUIRED`, or `NO-GO` for commit and immutable shadow
   deployment.
2. Whether this closes R14 M-6 without making coverage, receipts, or diagnostics
   misleading.
3. Whether invalid metadata should remain a global abort while a count/row
   mismatch is per-unit.
4. Any blocker/high regression introduced by the code or documentation delta.
5. Confirm that R14's empirical shadow/live gates remain unchanged, including
   first proving that the CLI exits on its own without terminating host Chrome.

Record commands, files read, limitations, elapsed time, exact CLI cost if the
wrapper exposes it, and confirm that exactly one response file was created.
