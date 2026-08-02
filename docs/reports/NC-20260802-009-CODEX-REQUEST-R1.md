# NC-20260802-009 — Codex request for Claude C5 exact-diff review R1

## Objective

Perform an adversarial, read-only C5 review of the complete uncommitted
`NC-20260802-009` delta in
`/private/tmp/nanoclaw-sequence.oUOHVX/worktree`. Decide whether it is safe to
commit, package, activate on the production Mac Mini, and follow with one
host-selected internal Gmail transport canary.

The target outcome is narrow: every parseable human-approved Sales or Chief
email becomes one host-issued action bound to the exact approved subject/body,
approval thread, and intended recipient; the Gmail boundary can be claimed at
most once; Gmail acceptance produces a durable receipt; and any ambiguous,
blocked, executing, or uncertain action fails closed rather than automatically
resending.

## Non-objectives and owner boundaries

- Do not edit implementation, continuity, prompt, or configuration files.
- You may create only the requested review report.
- Do not stage, commit, build a release archive, activate a release, restart a
  service, inspect production data, post to Slack, or send email.
- Do not read or transmit `.env*`, OAuth/token material, local Claude settings,
  `store/`, database dumps, browser/session data, or unrelated private files.
- Do not invent named-operator, nonce, or approval-expiry semantics. Those
  remain an explicitly recorded Company-OS follow-up.
- Procurement remains dark.

## Authority and review base

Read these tracked sources in order:

1. `CLAUDE.md`
2. `docs/PROJECT-MAP.md`, especially “Approved-email delivery assurance”
3. `docs/ACTIVE-WORK.md`, task `NC-20260802-009`
4. `docs/CHANGE-PROTOCOL.md`
5. the `NC-20260802-009` entry in `docs/ENGINEERING-CHANGELOG.md`
6. `docs/SECURITY.md`, `docs/RELEASE-INTEGRITY.md`, and the relevant roadmap
7. `groups/mailman/CLAUDE.md` and the new tracked
   `groups/mailman/OUTBOUND-EMAIL.md`
8. running source, schemas, and tests in the current worktree

Base commit: `177de7b`. Review every path reported by `git status --short`,
including untracked `src/email-action.ts` and
`groups/mailman/OUTBOUND-EMAIL.md`. The dirty operational checkout at
`/Users/xbohdpukc/dev/NanoClaw` is evidence only and must not be touched.

## Incident facts accepted for this review

The July 28–31 incident was a chain, not one defect: a model printed a handoff
instead of routing it; a cross-group bot row could fail to wake Mailman;
PostgreSQL `bigint` values arrived as strings while an execution check expected
numbers; mocks used unrealistic numeric values; “queued” was mistaken for
delivered; and source, compiled runtime, ignored procedure text, and deployment
evidence drifted. A fix that covers only one link is insufficient.

## Review questions

1. **Identity and immutability.** Can model input mint, overwrite, guess, or
   retarget an action, recipient, approval thread, subject, or body? Are parsing,
   hashing, normalization, and legacy-row behavior consistent across every
   path?
2. **Single execution.** Does every Mailman `gmail_send`/`gmail_reply` require
   exactly one action and one atomic `approved -> executing` claim? Can parallel
   IPC files, replay, same-recipient actions, confirmation replay, restart, or a
   changed payload cause a second Gmail call?
3. **Crash windows.** Analyze separately: crash before claim; after claim before
   Gmail; after Gmail accepts before receipt commit; after receipt commit before
   message/business logging; and Slack-status failure. The correct response to
   ambiguity is hold/reconcile, never blind retry. Do not claim distributed
   exactly-once delivery where it is impossible.
4. **Final host boundary.** Are recipient, Party, content, Gmail resource, CC,
   and bigint-string checks still enforced at execution? Can the action layer
   accidentally bypass or weaken an existing host guard?
5. **Visibility and recovery.** Are blocked/uncertain/confirmed states durable
   and correctly posted to the originating approval thread when one exists?
   Are ambiguous/unbound legacy requests visible enough for an operator, with
   no misleading “sent” statement?
6. **Schema and migration.** Is the additive SQLite migration restart-safe for
   existing `pending_sends` rows? Are indexes, constraints, transition
   predicates, append-only events, timestamps, and terminal-state queries
   correct? Identify race, coercion, or state-regression risks.
7. **Agent/tool contract.** Do the runner schema, Mailman prompt, tracked
   procedure, handoff grammar, and release packaging agree? Verify Unicode is
   preserved and that “queued” is explicitly non-final.
8. **Release gate and canary boundary.** Does `release:build` really execute the
   critical suite against a clean exact commit before compiling? Is a separate
   production transport canary to a host-configured internal test destination,
   with no business-record write, a truthful complement rather than proof of
   the full customer action path?
9. **Documentation truth.** Reconcile claims across the task row, changelog,
   project map, security model, roadmap, release procedure, prompts, and code.
10. **Regression/scope.** Check that NC-006/008 Sales thread behavior, direct
    non-Mailman host email flows, test routing, and unrelated systems were not
    silently changed.

Pay special attention to `src/ipc.ts`, `src/db.ts`,
`src/gmail-ipc-handlers.ts`, `src/send-watchdog.ts`, the runner MCP schema, and
the new procedure. Trace real call order rather than accepting test names.

## Codex verification already completed

Under exact Node `22.23.2`:

- `npm run typecheck` — pass
- `npm run build` — pass
- `npm run test:email-critical` — 7 files / 170 tests pass serially
- full serial `npm test` — 144 files / 1,834 tests pass
- `container/agent-runner`: build and 3 files / 22 tests pass
- `npm run format:check` — pass for all `src/**/*.ts`
- `npm run docs:continuity-check` — pass; schema self-test included
- `git diff --check` — pass

Reproduce the highest-risk focused checks you consider necessary. If local
policy prevents exact Node 22, report that limitation rather than substituting
an unexplained runtime.

## Required response

Write only:

`docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R1.md`

Include:

- exact model/session, review root/base, elapsed time, and read-only limits;
- verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `CHANGES REQUIRED`;
- P0/P1 commit blockers and separate deploy blockers;
- answers to all ten review questions with file/line evidence;
- independently reproduced checks and exact counts;
- explicit analysis of all five crash windows;
- residual risks/follow-ups with owner and suggested task disposition;
- a final statement whether commit, release build, activation, and the bounded
  internal transport canary may proceed.

Treat a missing or ambiguous safety property as a blocker. Do not soften a
finding merely because the suite is green.
