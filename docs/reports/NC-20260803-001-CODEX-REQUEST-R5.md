# NC-20260803-001 Codex request R5 — R4 blocker reconciliation

- Reviewer: resume Claude session `74a9751a-7355-4943-b2fe-623f98149b71`
- Review mode: adversarial C5 delta review; do not edit source
- Base: `fb8ed9e`
- Response path: `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R5.md`

## Objective

Review only the R4 reconciliation plus its interaction with the already
reviewed incident diff. Decide whether R4-1 through R4-6 are closed and whether
the exact tree is safe to pass broad gates, commit, build, and deploy before the
separately authorized recovery.

## R4 reconciliation

1. R4-1: `observeApprovalCard()` wraps `recordApproval()`. If the marker matches
   but parsing returns null, it posts one group-appropriate `[APPROVAL CARD
   REJECTED]` notice and mints no action. The host approval listener uses this
   function and continues to post `[EMAIL ACTION]` only for a real action ID.
   The focused test proves a malformed approval posts the visible `NOT sent`
   notice and records zero rows.
2. R4-2: `docs/RELEASE-INTEGRITY.md` now makes compare/copy plus source and
   destination hashes for every changed tracked group instruction an explicit
   correctness gate before or atomically with host activation, never after. It
   names all five changed instruction files for this release.
3. R4-3: `groups/chief/SUPPORT-REPLY.md` is staged. `git ls-files
   --error-unmatch` now succeeds, so release packaging will include it.
4. R4-4: malformed cards use the group-neutral quarantine family
   `approval-card-malformed`; the Chief regression verifies that filename.
5. R4-5: the fail-closed option is implemented. `SlackChannel.sendMessage`
   detects an approval marker before splitting. Above 4,000 characters it posts
   one visible rejection in the resolved work thread, stores that rejection,
   logs the refusal, and never posts any original fragment. The prior long-card
   test now proves exactly one rejection and no tail content.
6. R4-6: runner-before-host ordering remains an explicit activation gate and
   will be recorded with the resolved image digest and refreshed snapshot paths.

## Independent evidence

- Exact Node 22.23.2 focused R4 reconciliation: 4 files / 179 tests passed.
- Exact Node 22.23.2 `test:email-critical`: 14 files / 417 tests passed.
- Exact Node 22.23.2 typecheck: passed.
- The broad gates will run only after this delta converges, before commit and
  again through the clean-commit release builder where applicable.
- Production remains on `e1fa93e`; no production mutation or customer send has
  occurred in this task.

## Review questions

1. Can a malformed backlog card now fail silently or mint an action?
2. Can an overlong approval card be split into separately approvable rows or
   can any original fragment reach Slack?
3. Does the activation contract now guarantee the reviewed template and all
   other changed instructions reach the actual operational `GROUPS_DIR` before
   the new host depends on them?
4. Are R4-3 and R4-4 factually closed?
5. Did this reconciliation create a new blocker or exact-bytes risk?
6. Give one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or
   `CHANGES REQUIRED`, separating blockers from nonblocking follow-ups.

## Recovery boundary

Do not inspect or reproduce customer body text. Recovery remains last. It will
construct a corrected card only from the stored exact recipient/body and the
existing Gmail-thread subject, require a fresh approval through the deployed
normal path, and require a durable Gmail receipt before the reply is called
sent.
