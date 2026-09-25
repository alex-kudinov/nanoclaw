# NC-20260925-001 narrow recipient-boundary review

The prior packet was stopped after fifteen Read calls without a response. This
packet narrows the same review to the only load-bearing trust decision. Read
this file and `docs/reports/NC-20260925-001-RECIPIENT-DIFF-R1B.txt` only.
Do not open other source files, search the repository, edit source, use Bash,
contact external services, or read secrets. Write only
`docs/reports/NC-20260925-001-CLAUDE-REVIEW-RESPONSE-R1.md`.

## Question

Does the patch permit a CRM-unknown correspondent only for an exact,
human-approved reply to the recipient Gmail derives from the approved thread,
without opening an agent-controlled recipient bypass, a duplicate send, or a
post-Gmail receipt failure? Report only a material counterexample with the
smallest correction, or `PASS`. If the supplied upstream evidence is inadequate,
say exactly which fact is missing and return `NEEDS_EVIDENCE`; do not expand the
file scope.

## Upstream boundary already verified by Codex

- Production runs release `d034f80b144b196b9ad6f7766ad3ae68b01cd5ad`.
- `src/ipc.ts` resolves a durable action before Mailman execution, rehydrates
  execution with `buildHostApprovedEmailExecution`, and claims that Action-ID
  once before dispatch. Blocked, confirmed, and uncertain claims are not sent
  again. The host overwrites model-supplied action, To, CC, subject, body,
  thread, Party hint, and rendering with the approved-card values.
- `src/approved-email-execution.ts` refuses missing action identity, changed
  approved content hash, recipient, CC, subject, or a reply without a durable
  Gmail thread. For `gmail_reply` it assigns the action's `gmailThreadId` to
  the executable payload and removes model-supplied To and `leadId`.
- `src/gmail-api.ts::replyToThread` reads Gmail thread metadata and derives
  the newest addressable external Reply-To/From (or external To fallback). It
  calls `prepareSend({to,cc,...})` before constructing or sending raw MIME.
- The handler compares that Gmail-derived `to` against the host-stamped
  `approvedRecipient` before calling the changed `verifyPartyRecipient`.
- The live incident was a `gmail_reply` with a durable action, exact approved
  recipient/thread, no Party, `recipient_guard` block, and no Gmail receipt.
  The change adds no CRM identity, persistent state, queue, or new send path.

## Focused evidence

The changed-file tests pass 241/241. The serial email-critical suite passes
815 host tests and 45 agent-runner tests. Node 22.23.2 typecheck/build pass.
The full root suite has unrelated environment failures in files outside this
diff. No customer email has been sent by this task.

Archive note: the original review input was a generated `.patch`; it was
renamed `.txt` and whitespace-only context lines were normalized after review
so the tracked artifact passes `git diff --check`. The substantive source diff
is unchanged.
