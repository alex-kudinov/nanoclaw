# NC-20260802-009 convergence state

- Topic: exact, durable, Gmail-receipted approved-email actions
- Status: converged
- Current round: R4 deployment-record review approved with follow-ups
- Claude project path: `/Users/xbohdpukc/dev/NanoClaw`
- Current Claude session UUID: `b361d68b-688c-4dd0-bba0-a43188673962`
- Prior Claude session UUIDs: `20f83173-4353-4b8c-9a19-c3661df32899`
- Native handoff path: none
- Latest Codex request:
  `docs/reports/NC-20260802-009-CODEX-REQUEST-R4.md`
- Latest Claude response:
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R4.md`
- Verified agreements: queued is not delivered; model prompts are not an
  execution boundary; production Gmail acceptance must have a durable receipt;
  replay under uncertainty must hold for reconciliation
- Open defects: none blocking the implementation, corrected release,
  activation, canary, or deployment-record commit. R2 residuals N1-N5 plus R4
  runbook residuals D1/D2 are NC-20260802-010 N1-N6; broader
  migration-convergence follow-ups F1-F3 are NC-20260802-011.
- Owner decisions: typed approval's long-term listener scope remains an NC-010
  decision; owner authorized NC-009 implementation, review, commit, production
  activation, and one controlled internal canary, but no customer email,
  business-record mutation, prompt-authored recipient, OAuth change, or
  unrelated cleanup
- Last independent checks: post-R1 exact Node 22.23.2 typecheck/build,
  email-critical 10 files / 294 tests, full serial suite 145 files / 1,845
  tests, runner build and 3 files / 22 tests, continuity/schema self-test, and
  source formatting pass. Claude R2 independently verified the critical state
  transitions, legacy upgrade, old-schema precondition, canary isolation, and
  release-gate parity. Final exact-Node typecheck/build, email-critical 10 files
  / 294 tests, runner build and 3 files / 22 tests, continuity, formatting, and
  diff-integrity gates passed before commit.
- Production activation evidence: target `d1bfcce` verified but failed on
  `no such column: action_id`; rollback health and prior prompts were restored;
  no canary or customer email ran in that attempt. Claude R3 independently
  reproduced the committed failure and proved the corrected legacy/fresh/
  partial/idempotent paths with the real schema function. Corrected commit
  `e1fa93e` then passed local/remote artifact verification, zero-row preflight,
  prompt verification, dry-run, activation, schema, and converged health. The
  single internal canary returned and re-read receipt `19fc4d33ccf3061e`
  without customer, action-ledger, Slack, business, or OAuth mutation.
- Final correction checks on Node 22.23.2: typecheck/build, email-critical 10
  files / 295 tests, full serial suite 145 files / 1,846 tests, runner build and
  3 files / 22 tests, continuity, formatting, and diff integrity pass.
- Elapsed/cost notes: Claude Opus 5 R1 used exact session
  `b361d68b-688c-4dd0-bba0-a43188673962`, completed in 1,166,403 ms, and
  reported `$17.02075475` cost.
  R2 resumed that exact session, completed in 628,826 ms, and reported
  `$10.71533850` cost.
  R3 resumed that exact session, completed in 441,163 ms, and reported
  `$8.57938450` cost.
  R4 resumed that exact session, completed in 297,574 ms, and reported
  `$8.251385` cost.
