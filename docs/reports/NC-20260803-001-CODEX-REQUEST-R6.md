# NC-20260803-001 Codex request R6 — rejected-approval claim delta

- Reviewer: resume Claude session `74a9751a-7355-4943-b2fe-623f98149b71`
- Review mode: adversarial C5 delta review; do not edit source
- Base: `fb8ed9e`
- Response path: `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R6.md`

## Objective

Review one Codex-found control-flow gap after the R5 approval. Decide whether
the exact delta prevents a malformed marked approval from reaching the normal
agent approval path while leaving a valid armed card's behavior unchanged.

## Finding and reconciliation

R5 verified that `observeApprovalCard()` visibly rejected a malformed card and
minted no action. The host listener in `src/index.ts`, however, still always
returned `false`. Slack listener semantics define `false` as unclaimed, so the
same rejected approval could continue into the normal agent message pipeline.
That contradicted the fail-closed outcome even though the host had posted a
rejection.

The delta makes `observeApprovalCard()` return both `pending` and an explicit
`rejected` flag. The host listener claims only the rejected case by returning
`true`; valid armed cards still return `false` so the agent receives the
approval and performs the normal handoff. Unmarked messages also remain
unclaimed. The focused tests assert both halves.

## Independent evidence

- Exact Node 22.23.2 focused delta: 4 files / 180 tests passed.
- Exact Node 22.23.2 typecheck: passed.
- Production remains on `e1fa93e`; no production mutation or customer send has
  occurred in this task.

## Review questions

1. Does a malformed marked card now post one rejection, mint zero actions, and
   suppress the normal agent approval path?
2. Does a valid armed card remain unclaimed so the existing agent path runs?
3. Can the tagged result create a new duplicate-send, silent-failure, listener
   ordering, or exact-bytes risk?
4. Give one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or
   `CHANGES REQUIRED`, separating blockers from nonblocking follow-ups.

## Recovery boundary

Do not inspect or reproduce customer body text. Recovery remains last and still
requires the deployed normal path, a fresh approval, and a durable Gmail
receipt.
