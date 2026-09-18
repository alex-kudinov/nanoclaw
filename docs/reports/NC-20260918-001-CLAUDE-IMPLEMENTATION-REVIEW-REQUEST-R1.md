# NC-20260918-001 bounded implementation review

## Review question

Does the implementation safely make an exact action-bound human-approved email
card sufficient authority for its ordered CC list, without allowing a model,
unapproved request, malformed address, replay, or field drift to widen
recipients?

Report only material security, privacy, authorization, idempotency, or delivery
findings, ordered by consequence with exact file/line evidence. If there is no
material finding, write `PASS` and name the decisive invariants checked. Do not
restate the task or create a backlog.

## Accepted decision

Fresh necessity review returned `KEEP`: do not add Party widening, an address
resolver, schema, state, a queue, or an exception workflow. The exact
operator-visible card, explicit approval, durable Action-ID, stored/execution
CC equality, and one-time claim are the authority. An approved CC may be outside
the lead Party and latest Gmail envelope.

## Required behavior

- Exact approved off-Party CC succeeds for standalone send and threaded reply.
- Execution CC must equal host-rehydrated approved CC in normalized order.
- Without action-bound approved CC, the existing Party allowlist remains.
- Malformed/reserved addresses, BCC, duplicate CC, primary-recipient reuse, and
  more than ten CC recipients remain blocked.
- Primary To/Party/thread, exact content hash, Action-ID, one-time claim, replay,
  Gmail receipt, and test-routing boundaries are unchanged.
- Sales may use exact bare addresses stated by Alex/Cherie in the current work
  thread; no name-to-address inference.
- No customer send or synthetic external canary is part of verification.

## Changed implementation

- `src/gmail-ipc-handlers.ts`
- `src/gmail-ipc-handlers.test.ts`
- `groups/sales/WORKFLOWS.md`
- `groups/mailman/OUTBOUND-EMAIL.md`

Supporting unchanged authority to inspect only as needed:

- `src/approved-send-handoff.ts`
- `src/approved-email-execution.ts`
- `src/send-watchdog.ts`

Do not inspect other source paths, runtime data, `.env`, credentials, logs, or
customer content.

## Verification already completed

- Focused recipient/parser/execution/prompt tests: 121/121 pass.
- Pinned Node 22.23.2 typecheck: pass.
- Email-critical gate: 808/808 host tests plus 45/45 runner tests pass.
- Full suite: 4,508 pass, 34 skip, three unrelated predecessor failures; the
  same Capacity, CNPC wrapper-literal, and date-sensitive Trafft failures were
  reproduced on exact live base `e5b30966`.
- Documentation continuity/capability checks: pass.

Write the response only to
`/Users/xbohdpukc/dev/NanoClaw/.worktrees/owner-directed-cc-20260918/docs/reports/NC-20260918-001-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.

