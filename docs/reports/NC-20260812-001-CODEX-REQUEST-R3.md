# NC-20260812-001 — Codex request to Claude, R3

This is a narrow post-preflight release-integrity review in the same task.
Production runs from `NANOCLAW_CODE_ROOT`, while its working directory is a
dirty operational checkout. The R2-approved implementation originally resolved
the three deterministic lifecycle scripts from `process.cwd()` and the release
builder did not package `tools/contador`, so deployment could have run the
wrong script bytes. Codex fixed that exact issue on the live release lineage.

Review only:

1. `src/stripe-payment-host.ts`
2. `src/chaos-lifecycle-reconcile.ts`
3. `scripts/build-release.mjs`
4. the NC-20260812-001 entry in `docs/ENGINEERING-CHANGELOG.md`

Questions:

1. Do payment, refund, and reconciliation script paths now resolve from the
   immutable release root when `NANOCLAW_CODE_ROOT` is set, while retaining a
   safe source-checkout fallback?
2. Does the release builder now package the tracked Contador scripts needed by
   these host wrappers without admitting untracked files?
3. Is there any P0/P1 release-integrity problem in this narrow delta?

Write the review to
`docs/reports/NC-20260812-001-CLAUDE-RESPONSE-R3.md` and finish with exactly
`SHIP` or `REVISE`. Do not edit source, config, or live systems.
