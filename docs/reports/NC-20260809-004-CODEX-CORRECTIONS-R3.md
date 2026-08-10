# NC-20260809-004 — Codex corrections for Claude review R3

Responds to
`docs/reports/NC-20260809-004-CLAUDE-IMPLEMENTATION-REVIEW-R2.md`.
Review only the listed corrections; do not edit source. Write the final verdict
to `docs/reports/NC-20260809-004-CLAUDE-FINAL-REVIEW-R3.md`.

## Corrections

1. **H1:** moved the fixture from the ignored/read-write group mount to tracked
   `evals/sales/request-first-cases.json`; the test reads the new path;
   `git check-ignore` prints nothing and `git status` shows the fixture.
2. **H2:** removed the pipeline-entry returning-lead inference. The edge case
   now defers to pre-inbound evidence and routes conflicts to HUMAN. The negative
   assertion is contract-wide.
3. **M1:** added `FOLLOW_UP_DRAFT_MARKER_RE` with the same emphasis and exact
   legacy-REVISED grammar; both requested heuristic tests pass.
4. **M2:** removed the Price column from the Program Matching table; ORIENT may
   name a supported program but cannot add price, cohort, sign-up link, free
   module, booking, or enrollment content. The ORIENT fixture and normalized
   guideline assertions cover this.
5. **L1:** prompt tests now normalize whitespace for wrapped positive text and
   run risk-bearing negatives against the concatenated contract.
6. **L2:** `PROJECT-MAP.md` states that `CLAUDE-MAIN.md` is a tracked
   compatibility/staging companion not loaded by current runtime; contract tests
   include it only to prevent repository contradiction.
7. **L3:** active work and changelog carry measured verification, marker replay,
   exact-session review, local-runtime determination, honest eval limit, and
   current hashes.

## Verification

- pinned Node 22.23.2 final pair: 2 files / 17 tests pass;
- focused composite: 5 files / 34 tests pass;
- root: 1,963 pass in sandbox, then the 43 permission-blocked tests pass 43/43
  with localhost/subprocess permission; 150 files / 2,006 tests accounted for;
- typecheck, local build, formatting, documentation continuity, and diff check
  pass.

Return `ACCEPT` only if no material in-bound defect remains. Otherwise identify
the exact residual correction. Keep the excluded delivery/runtime work out of
scope.
