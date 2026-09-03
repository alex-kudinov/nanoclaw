# NC-20260903-001 — Implementation review R2

Review the bounded implementation diff in
`docs/reports/NC-20260903-001-IMPLEMENTATION-DIFF-R1.patch` against the accepted
design and protected email boundaries. Report only material correctness,
security, durability, or rollout findings. Do not restate the patch or propose
unrelated improvements.

## Required outcome

- One typed Mailman classification action drives durable persistence and all
  host routing.
- Support/refund customer-response work reaches Sales; Chief never owns reply
  drafting.
- Unknown/disabled/low-confidence labels cannot be persisted as valid routed
  work.
- Missing classifications and valid `routed_at IS NULL` rows recover once after
  grace/restart; a late model result cannot duplicate a routed host fallback.
- `auto_archive` controls inbox cleanup only, never owner routing.
- An unapproved inbound-classification Gmail attempt remains denied without a
  false Chief customer-work alert. Genuine approved-action failures retain the
  prior alert/fail-closed behavior.
- Thread-ID alone is never customer identity. Existing Action-ID, exact-card,
  recipient/CC, Gmail execution, idempotency, and confirmed-receipt guards are
  unchanged.

## Verification completed

- Pinned Node 22.23.2 typecheck and root build pass.
- Focused routing/classification/Gmail/prompt/run/reaper suites passed 169/169
  before the later archive/routing separation; the affected Gmail/router subset
  then passed 117/117.
- Email replay passed 13/13.
- Email-critical passed 750/750 after retaining the inert historical Chief
  parser fixture.
- Independent runner build/tests passed 45/45.
- Full root: 3,407 passed / 32 skipped / two failures. Both exact failures are
  the unchanged base failures already documented on `58bfa985`: CNPC wrapper
  literal assertion and date-stale Trafft projection fixture. This patch adds
  13 passing tests.
- Documentation continuity and capability matrix checks pass.
- No production migration, release, Slack recovery work, approval, or Gmail
  send has occurred.

## Review boundary

Read only:

1. this request;
2. `docs/reports/NC-20260903-001-IMPLEMENTATION-DIFF-R1.patch`;
3. the prior design response
   `docs/reports/NC-20260903-001-CLAUDE-DESIGN-RESPONSE-R1.md` only if needed to
   verify a required change.

Write only
`docs/reports/NC-20260903-001-CLAUDE-IMPLEMENTATION-RESPONSE-R2.md`.

No credentials, runtime databases, customer data, web, Bash, MCP, edits, tests,
or deployment. End with `GO`, `GO WITH REQUIRED CHANGES`, or `STOP`.
