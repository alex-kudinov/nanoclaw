# NC-20260803-001 Codex request R4 — R3 reconciliation review

- Reviewer: resume Claude session `74a9751a-7355-4943-b2fe-623f98149b71`
- Review mode: adversarial C5 implementation review; do not edit source
- Base: `fb8ed9e`
- Response path: `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R4.md`

## Objective

Review the current uncommitted tree after Codex reconciled R3-1 through R3-5
and the three required tests. Decide whether this exact diff is safe to commit,
build, deploy in runner-before-host order, and then use for the separately
authorized exact recovery of the held reply.

## R3 reconciliation

1. R3-1: `.gitignore` now admits `groups/chief/SUPPORT-REPLY.md`; the file is
   tracked authority and its `[SUPPORT-DRAFT]` example uses `DRAFT RESPONSE:`,
   a `---` fence, and `Subject:` inside the fence. A regression reads that exact
   tracked file, extracts its marked template, substitutes inert placeholders,
   and proves `buildApprovedHandoff` parses it.
2. Validation and arming use identical mechanics, not merely identical marker
   detection: `recordApproval` now returns null when `buildApprovedHandoff`
   returns null, so an unparseable card cannot arm the watchdog.
3. Rejected cards receive `[APPROVAL CARD REJECTED]` and name the originating
   group. A Chief-specific regression proves the message does not instruct
   Sales to repost.
4. R3-2: queue payloads carry `chat_cursor_recoverable`; the container-exit
   sweep emits a warning when it removes an unacknowledged targeted ephemeral
   payload. A direct regression covers the log.
5. R3-3: `docs/RELEASE-INTEGRITY.md` makes rebuilding the container image and
   refreshing every operational `agent-runner-src` an ordered precondition
   before host activation.
6. R3-4: the unrelated `docs/ARCHITECTURE.md` table reflow was removed; its diff
   contains only the five incident-specific additions.
7. R3-5: Slack root-shape validation is extracted to
   `recordedSalesWorkRoot()` and shared by strict binding and divergence
   logging.

## Independent evidence

- Exact Node 22.23.2 focused post-R3 suite: 6 files / 218 tests passed.
- Exact Node 22.23.2 `test:email-critical`: 14 files / 416 tests passed.
- Exact Node 22.23.2 TypeScript build-project no-emit check: passed.
- Broad pre-R3 evidence: complete reconciled 145 files / 1,869 tests, root
  build, runner build and 3 files / 22 tests, continuity, formatting, and
  whitespace. Broad gates will be rerun on the converged snapshot before the
  release is constructed.
- No production mutation and no customer send occurred in this task.

## Review questions

1. Does the tracked Chief template now pass through the exact same parse and
   arming boundary as Sales cards without widening the parser surface?
2. Can any malformed card among the three approval markers still reach Slack
   as approvable or arm a watchdog row?
3. Is an unacknowledged ephemeral result now both excluded from cursor rollback
   and visibly logged if an exit sweep removes it?
4. Is runner-before-host ordering explicit enough to prevent the legacy
   untargeted fallback during rolling activation?
5. Did the R3 reconciliation introduce any new blocker, false authority claim,
   or exact-bytes risk?
6. Give one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or
   `CHANGES REQUIRED`, separating blockers from nonblocking follow-ups.

## Recovery boundary

Do not inspect or reproduce customer body text. This round is source review
only. After convergence and verified activation, recovery will reconstruct a
corrected card from the stored exact recipient/body and the existing Gmail
thread subject, then require a fresh approval through the normal path. It will
not regenerate customer-facing content, change recipients, or bypass the
action/receipt ledger.
