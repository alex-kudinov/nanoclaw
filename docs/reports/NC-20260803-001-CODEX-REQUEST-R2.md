# NC-20260803-001 Codex request R2 — implementation review

- Reviewer: resume Claude session `74a9751a-7355-4943-b2fe-623f98149b71`
- Review mode: adversarial C5 implementation review; do not edit source
- Base: `fb8ed9e`
- Response path: `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R2.md`

## Objective

Re-review the complete uncommitted incident repair after Codex reconciled every
R1 blocking finding (F1-F4), supporting findings (F5-F7), and the specified
regressions. Determine whether this exact diff is safe to commit, build, and
activate before recovery of the held Justin Mangum reply.

## R1 reconciliation

1. Review validation now gates on `isSalesReviewCard()` alone. A missing
   Email, fenced Subject, or body is never posted for approval, is quarantined,
   is returned to the exact Sales queue work unit, and produces a lead-keyed
   mechanical Slack rejection. Both footer-free and embedded-handoff malformed
   cards are tests.
2. Every host email formatter adds bare `Lead Email:` alongside the display-name
   envelope. The Gmail parser preserves `Reply-To`, and both direct rule routing
   and post-classification routing use its bare address for the customer lead
   anchor while retaining the relay `From:` as envelope evidence.
3. `hostWorkUnitThreadTs` is accepted only when the stored work root and
   outgoing message derive the same lead. The cross-lead refusal and matching
   positive path are tests.
4. Runner-owned `source_container` is stamped on all five Gmail tools. Async
   reads and denials go through `GroupQueue.sendMessage`, so they are targeted,
   acknowledged, and dead-letter tracked. If the exact container has exited,
   the result is not offered to a sibling; the host logs and posts a mechanical
   hold. Same-group concurrent result binding and exited-origin behavior are
   tests.
5. Sales `threadPerMessage` is persisted at startup and asserted fail-closed.
   A one-time cursor migration seeds only roots at/before the legacy cursor and
   preserves any newer per-root cursor, avoiding both replay and rollback.
6. The canonical Sales prompt/template now contains the required fenced
   Subject line and documents pre-approval rejection. Mailman documents
   session-addressed results.
7. `test:email-critical` now includes the routing and host-router regressions.

## Independent evidence so far

- Exact Node 22.23.2 focused incident suite: 6 files / 225 tests passed.
- Exact Node 22.23.2 expanded `test:email-critical`: 14 files / 404 tests passed.
- Exact Node 22.23.2 `npm run typecheck`: passed.
- `npm run docs:continuity-check`: passed, 40 active/ready rows and 36
  changelog entries.
- `git diff --check`: passed.
- Agent-runner build and 3 files / 22 tests passed. The full serial run passed
  143 files in the restricted environment; the two files blocked by local
  child-process/loopback permissions then passed with those permissions, for a
  reconciled 145 files / 1,856 tests.
- No production mutation and no customer send occurred in this task.

## Review questions

1. Can any malformed approval still reach Slack or arm an action?
2. Can any Gmail async result/denial cross same-group sessions, disappear
   without a visible signal, or bypass dead-letter tracking in the production
   wiring?
3. Can Sales activation replay already consumed roots, skip a genuinely newer
   root, merge two leads, or still split one new work item across containers?
4. Is the startup config/cursor migration repeatable and safe on the exact
   deployed predecessor state?
5. Do formatter/prompt changes preserve exact content and avoid broadening
   email authority?
6. Identify missing release-blocking tests or documentation.
7. Give one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or
   `CHANGES REQUIRED`, with blockers separated from follow-ups.

## Recovery boundary

Do not inspect or reproduce customer body text. R2 is source review only. The
held action remains unsent. The original card had no approved subject; Codex
will not silently invent one. Assess code/release readiness separately from the
customer recovery decision.
