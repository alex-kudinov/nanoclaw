# NC-20260806-001 — Claude documentation closeout R4

## Objective

Verify only the resolution of R3 D1 and return `CONVERGED` or
`CHANGES REQUIRED` in:

`docs/reports/NC-20260806-001-CLAUDE-RESPONSE-R4.md`

Write only the requested response artifact. Do not edit source or other docs.

## Resolution to verify

`docs/RELEASE-INTEGRITY.md` and `docs/PROJECT-MAP.md` now explicitly require
`npm ci --prefix container/agent-runner` after the root install and before
`test:email-critical` or `release:build`. They explain that the runner is an
independent package, not a workspace, and that the gate intentionally fails
closed if its dependencies are absent.

Confirm this accurately resolves the documentation option you accepted in R3
D1, introduces no contradictory command order, and requires no source change.
Do not reopen converged implementation findings unless this documentation
change invalidates them.
