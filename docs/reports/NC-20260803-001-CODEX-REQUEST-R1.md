# NC-20260803-001 Codex request to Claude — incident design review R1

## Objective

Independently audit the first natural approved-customer failure after
NC-20260802-009 and propose the smallest complete repair. Focus on three
interacting defects: malformed approvable Sales cards, cross-session Gmail IPC
result theft, and one Sales work item being processed by separate root- and
thread-scoped containers.

Write your response to
`docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R1.md`. Do not edit source code in
this round.

## Authority and required sources

Read, in order:

1. `CLAUDE.md`
2. `docs/PROJECT-MAP.md`
3. `docs/ACTIVE-WORK.md`, especially NC-20260803-001 and NC-20260802-006/008/009
4. `docs/CHANGE-PROTOCOL.md`
5. The NC-20260802-009 and NC-20260802-003/006/008 changelog and review records
6. `groups/sales/CLAUDE.md`, `groups/sales/WORKFLOWS.md`, and
   `groups/mailman/OUTBOUND-EMAIL.md`
7. Current code/tests named below

Implemented mechanics and tests outrank design prose. The immutable production
release is commit `e1fa93e`; this incident branch starts from documentation tip
`fb8ed9e` and therefore contains that exact code plus its deployment record.

## Accepted incident facts

- Production identity was read-only verified: release/code root
  `e1fa93e09f6dedf363c9a8c0be1723583563f533`, Node 22.23.2, PID 68877.
- Two distinct approved Sales workflows overlapped. One received a Gmail
  receipt at 09:04:59.421. The other issued an unbound `gmail_reply` at
  09:04:56.375 and was quarantined without a Gmail send.
- The unsent workflow's Sales card omitted a parseable `Subject:` within the
  fenced draft. The host allowed the card to be posted and rejected it only
  after operator approval as `[EMAIL APPROVAL NOT ARMED]`.
- Two Mailman containers were active concurrently. Gmail IPC payloads do not
  carry the runner's `source_container`; `writeDeniedGmailInput()` writes an
  untargeted shared-group input. The runner correctly filters
  `target_container` when it exists, but this path did not set one.
- Sales runtime `registered_groups.container_config` has
  `suppressFinalText:true` but no `threadPerMessage`. A root Sales item uses the
  `||root` container/session while a later human thread reply uses `||<root-ts>`,
  allowing two containers to act on the same work item.
- No customer body text, credentials, `.env`, browser state, or raw database
  content is needed for review. Do not inspect those sources.

## Candidate repair to challenge

1. Stamp `source_container` on every Gmail MCP request, not only ordinary
   `send_message` IPC.
2. Carry that provenance through `GmailIpcPayload`; every asynchronous Gmail
   result or denial written to a group input must set the corresponding
   `target_container`. Untargeted legacy behavior may remain only when the host
   genuinely has no originating container, with an explicit observable log.
3. Validate `[SALES REVIEW]` cards with the same canonical parser used to arm
   approved email actions before Slack posts them. Reject malformed cards as
   non-approvable, deliver a targeted correction to the originating Sales
   container, and place only a mechanical rejection inside the host-owned work
   thread so the failure cannot be silent.
4. Make Sales root posts first-class per-message work units (`threadPerMessage`)
   so the root and every later reply share one queue key/container/session.
   Decide whether this should be an enforced host invariant, a tracked runtime
   migration plus startup assertion, or another mechanism that cannot silently
   drift back to `||root`.
5. Recover the stuck email only from exact operator-approved bytes. A missing
   subject means the original card cannot create an action; recovery must bind a
   subject from trustworthy conversation authority without inventing one, or
   require a corrected card and explicit reapproval. Challenge whether the
   owner's current instruction is sufficient authority for exact recovery.

## Files to inspect

- `container/agent-runner/src/ipc-mcp-stdio.ts`
- `container/agent-runner/src/index.ts`
- `container/agent-runner/src/ipc-input-filter.ts`
- `src/ipc.ts`, `src/ipc-gmail-auth.test.ts`, `src/ipc-handoff-echo.test.ts`
- `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-handlers.test.ts`
- `src/index.ts`, `src/group-queue.ts`, and their tests
- `src/approved-send-handoff.ts`, `src/send-watchdog.ts`, and tests
- `src/channels/slack.ts` and `src/channels/slack.test.ts`
- `src/db.ts` only as needed for action/work-unit state

## Required response

For each candidate repair, state `accept`, `change`, or `reject` with concrete
code-level reasoning. Identify any path that could send the wrong or duplicate
email, orphan a targeted result, split a Sales work item, or make a failure
silent. Specify exact regression tests and the safe production/recovery order.
Separate implementation, configuration mutation, deployment, and customer-send
side effects. End with one of `APPROVE DESIGN`, `CHANGES REQUIRED`, or
`OWNER DECISION`, plus elapsed time and unresolved issues.

Do not disclose hidden chain-of-thought. Provide concise findings and testable
reasoning only.
