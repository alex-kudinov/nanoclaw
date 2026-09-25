# NC-20260925-001 bounded safety review request

## Objective and authority

Review only the load-bearing patch in
`docs/reports/NC-20260925-001-LOAD-BEARING-DIFF-R1.txt`. Codex owns the final
implementation and release. Use the checked-in release-base code as authority;
the running production release was verified as
`d034f80b144b196b9ad6f7766ad3ae68b01cd5ad` before this isolated branch.
Do not edit source, send email, contact providers, query customer systems, or
inspect credentials. Write only the response artifact named below.

The intended behavior is narrow: an exact, human-approved `gmail_reply` may
reach Gmail even if the correspondent has no CRM Party, provided the host has
rehydrated the approved action's recipient, subject, body, and Gmail thread,
claimed that Action-ID once, and Gmail derives the same external reply target
from that thread. Standalone sends and unbound replies still require the
existing Party check. A support approval card containing one plain
triple-backtick email block with `Subject:` first may be parsed without
including operator context in the email; canonical `DRAFT RESPONSE:` and
`---` cards continue to work. Rejections now name the failing field.

## Observed incident and limits

- Natural support reply: the live `gmail_reply` was blocked at the final
  recipient check with `no host-resolved party`; the durable action is
  `blocked/recipient_guard` with no Gmail message receipt. The approved card
  had an exact recipient and Gmail thread. No Party or alias is being created.
- Natural invoice-confirmation thread: the live action ledger has no Action-ID.
  Quarantined cards repeatedly lacked a first-line Sales Lead or support Route,
  and the one support card with correct Route/Email/Thread-ID used a single plain
  triple-backtick draft instead of the documented `DRAFT RESPONSE:`/`---`
  envelope. A private exact-byte, non-sending replay of that card now parses
  one recipient and its thread; its subject/body pass content and fact guards.
  The raw card, names, addresses, and invoice content are deliberately excluded
  from this packet.
- Fresh-context minimum-sufficient reviewer returned `KEEP`: change only the
  existing parser and final guard; skip Party-only tracking/interaction when no
  Party exists. No schema, worker, queue, scheduler, new dependency, second
  send path, automatic customer send, or CRM identity inference.

## Read scope and questions

Read the diff artifact first. Read only these supporting files if needed:
`src/approved-email-execution.ts`, `src/gmail-api.ts` (`replyToThread` and its
`prepareSend` point), `src/email-recipient-guard.ts`, and the relevant changed
functions in `src/approved-send-handoff.ts`, `src/gmail-ipc-handlers.ts`,
`src/ipc.ts`, `src/channels/slack.ts`. Do not search the full repository.

Report only material findings with file/line evidence, focused on:

1. Whether any model-controlled payload, mismatched thread/recipient, missing
   action, or prior/duplicate action can reach the new no-Party exception.
2. Whether the alternate draft parser can accidentally treat body text as a
   recipient/header or send content outside the approved fenced block; whether
   canonical card behavior was unintentionally changed.
3. Whether the no-Party post-send path can falsely report delivery, crash after
   Gmail acceptance, or silently drop a required durable receipt.

Focused changed-file tests pass 241/241; the serial email-critical gate passes
815 host tests and 45 independent runner tests. Pinned Node 22.23.2 typecheck
and host build pass. The full root suite has 4,311 passes, 112 failures, 165
skips; its failing files are unrelated and include sandbox-denied disposable
PostgreSQL sockets and missing cross-repository fixture paths. No changed test
file fails. No deployment or customer email has occurred in this task.

Write `docs/reports/NC-20260925-001-CLAUDE-REVIEW-RESPONSE-R1.md` with a clear
`PASS` or `FINDINGS` verdict. Give only material findings and the smallest
correction; do not restate the entire design or propose future features.

Archive note: the original review input was a generated `.patch`; it was
renamed `.txt` and whitespace-only context lines were normalized after the
interrupted round so the tracked artifact passes `git diff --check`. The
substantive source diff is unchanged.
