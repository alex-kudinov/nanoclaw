# NC-20260803-003 Codex request R2 — convergence check

## Objective

Independently decide whether the current uncommitted NC-20260803-003 diff is
safe to deploy for forwarded inbound email recovery. Return `CONVERGED` or
`CHANGES REQUIRED`. This is a fresh bounded check because the R1 Opus session
completed its analysis but its response-file tool stalled.

## Boundaries

- Do not send email, post Slack messages, deploy, commit, restart services, or
  touch production data.
- Do not inspect secrets, auth/session files, database dumps, or live customer
  content.
- Write only the response artifact named below.
- An inbound replay may route work to Sales, but it may not send a customer
  reply without the existing operator approval and Gmail-confirmed receipt.

## Read

Read `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md` task
NC-20260803-003, `docs/CHANGE-PROTOCOL.md`, the complete working-tree diff,
`docs/reports/NC-20260803-003-CODEX-REQUEST-R1.md`, and these current surfaces:

- `src/classify-rules-runner.ts` and test
- `src/classify-ipc-handlers.ts` and test
- `src/gmail-parser.ts` and test
- `src/channels/gmail.ts` and test
- `src/host-router.ts` and test
- `src/db.ts` (`storeMessageDirect`, `getNewMessages`)
- `src/gmail-ipc-policy.ts`
- `src/ipc.ts` handoff resource propagation
- `src/channels/slack.ts` split behavior
- `groups/chief/CLAUDE.md`

## R1 counterexamples now repaired

The R1 Opus stream independently demonstrated:

1. `Fwd:Level 1` and `RE:x` bypassed the subject guard because whitespace was
   required after the colon. The guard now accepts optional whitespace around
   the colon while remaining anchored to `Re`, `Fw`, or `Fwd`.
2. Inside an explicit forward, a nested `On ... wrote:` marker could introduce
   the original customer's actual question. The parser now stops on that
   marker only outside an explicit forward and has a regression preserving the
   quoted original inquiry.
3. A full 10,000-character Chief handoff could split into multiple Slack rows,
   while model-authored Gmail resource propagation occurs only after Slack
   delivery. Chief escalations now cap the structured body at 2,500 characters,
   declare `Body-Complete: yes|no`, always retain exact Thread-ID and Message-ID,
   remain below 4,000 characters in a 10,000-character regression, and the
   trusted host grants Chief the exact Gmail resources before writing the IPC
   handoff.

The current diff also persists the exact Gmail message before any direct
actionable route, prevents same-group wake on that durable row, falls through
to ordinary Mailman delivery if persistence or route fails, filters future
probation rules, and auto-creates sender rules only for auto-archive taxonomy.

## Required verdict checks

Confirm with code evidence:

1. no realistic `Re/Fw/Fwd` form or nested forwarded-reply form used in the new
   regressions still loses the inquiry or enables a sender-only action rule;
2. the pre-route durable row cannot wake Mailman, but remains available as the
   latest inbound and is safely replaced on fallthrough;
3. persistence precedes routing and failure paths neither lose nor duplicate a
   downstream handoff;
4. every Chief fallback has a pre-delivery exact Gmail grant, a single
   Slack-sized handoff, exact identifiers, and canonical exact-read guidance;
5. no authority is widened beyond the single host-assigned Gmail resources;
6. the safest production replay is idempotent with respect to the already
   manually created CRM party/pipeline work and cannot send customer email;
7. any remaining deployment blocker or material missing regression.

Independent Codex verification after the R1 repairs: exact Node 22.23.2,
5 focused files, 122/122 tests passed. Earlier on the same worktree, typecheck,
the full suite under required loopback/subprocess permissions, continuity,
Prettier, and whitespace checks passed; those will be rerun after convergence.

## Required response

Write only:

`docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R2.md`

Include verdict, blocking findings first, answers to all seven checks, files and
commands inspected, replay recommendation, and any non-blocking hardening notes.
