# NC-20260802-009 — Codex request for Claude C5 blocker-closure review R2

Resume the exact R1 session and perform a read-only review of the complete
current delta in `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`, using the
same authority, forbidden-source, and no-side-effect boundaries in
`docs/reports/NC-20260802-009-CODEX-REQUEST-R1.md`.

R1 report:
`docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R1.md` (`CHANGES REQUIRED`).

## Objective

Decide whether every R1 blocker is now closed without a new duplicate-send,
approval-confusion, thread-noise, migration, or canary hazard. Review the full
diff, not only the reconciliation files. Do not edit source or continuity
documents. Write only the requested R2 report.

## Reconciliation to verify

1. **P0-1 / crash ambiguity.** `markPendingSendAlerted` maps `executing` to
   `uncertain`, atomically appends only a real transition, and never reopens the
   claim predicate. The alert explicitly says the email may have sent and says
   not to resend. Tests cover executing → alert → held and confirmed → no false
   event.
2. **P0-2 / typed and malformed approvals.** Slack recognizes only a whole
   check-mark or exact whole-message `Approved` in a thread, resolves the latest
   bot draft in that same channel/thread, invokes existing approval listeners,
   and still wakes the agent when no listener claims it. The host records the
   exact draft, posts the Action-ID in that approval thread, and immediately
   blocks/posts a malformed card rather than allowing NULL recipient/hash to
   execute. Unbound/unknown/ambiguous IPC is also denied and surfaced to Chief.
3. **P0-3 / canary.** Action-bound Mailman sends block before claim whenever
   global `GMAIL_TEST_RECIPIENT` is active. A separate host-only
   `email:transport-canary` has no recipient argument, targets only the
   configured monitored mailbox, uses fixed text, omits BCC, writes no
   customer/action/business/Slack state, retrieves the exact Gmail receipt, and
   identifies itself honestly as transport/OAuth evidence only. The command is
   gated by an exact confirmation phrase and documented.
4. **P1-2 / activation migration.** The pending-send conflict fills only a NULL
   legacy `action_id` with `COALESCE`, never overwrites an existing identity,
   and has a regression test. Release instructions require an aggregate-only
   empty `pending_sends` precondition for the first NC-009 activation and a
   nonterminal-state drain thereafter.
5. **P1-1 / live Action-ID path.** The host posts `[EMAIL ACTION] Action-ID` in
   the approval thread before the agent approval wake continues. Sales/Chief
   procedures require passthrough, Mailman passes it to the runner, and the host
   still recovers by exact content if the status post is unavailable.
6. **P1-3 / NULL recipient.** A malformed approval is moved to `blocked` before
   an agent handoff can execute; a later request carrying that action is held.
   Verify there is no remaining route to Gmail acceptance followed by failed
   confirmation because the stored recipient is NULL.
7. **P1-4/P2.** Runner results now say queued is not a receipt; false alert
   events are gated on `changes`; stale comments are corrected; parsed `Body:`
   is anchored after `---END-ORIGINAL---`; and the low-volume action/event
   retention choice is explicitly recorded as an intentional no-auto-prune
   safety policy.

## Adversarial questions

- Can a typed `Approved` in one thread bind a draft from another channel/thread,
  a human message, a mechanical status line, or a superseded draft?
- Does posting `[EMAIL ACTION]` before the agent wake preserve the NC-006/008
  one-root rule and remain in the approval thread for root and reply drafts?
- Can listener or Slack-post failure create a silent approved send, double
  action, or customer-facing partial state?
- Can any stale watchdog list result regress `confirmed`, `blocked`, or
  `uncertain`?
- Is global test routing checked before the execution claim and Gmail call?
- Does the dedicated canary have any path to a customer address, BCC, Party or
  business record, action ledger, Slack post, or model input? Is its immediate
  receipt retrieval/retry guidance safe after Gmail acceptance?
- Is the first-activation drain precondition executable against the old schema,
  and does it avoid reading customer rows?
- Does the expanded release gate exactly match `test:email-critical`?

## Independent Codex checks after R1 reconciliation

Exact Node 22.23.2:

- typecheck and production build pass;
- `test:email-critical`: 10 files / 294 tests pass serially;
- full serial suite: 145 files / 1,845 tests pass;
- container runner build and 3 files / 22 tests pass;
- continuity/schema self-test and all-source formatting pass.

The final canary error wording changed after those runs; reproduce the focused
gate/typecheck before relying on the counts. Final continuity/diff checks will
run again after review evidence is reconciled.

## Required response

Write only:

`docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R2.md`

Include exact session/model/root/base, elapsed/cost, read-only limits, one
verdict, blocker-by-blocker disposition, answers to the adversarial questions,
reproduced checks/counts, residual risks with explicit task disposition, and a
final separate decision for commit, release build, production activation, and
the one bounded internal transport canary. No action is approved merely because
tests pass.
