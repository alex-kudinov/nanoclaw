# NC-20260918-001 bounded implementation review — response (R1)

## Verdict

PASS

## Decisive invariants checked (with evidence)

1. **Card-time recipient shape is closed before an Action-ID can exist.**
   `parseApprovalCardRecipientHeaders` / `normalizeAddressList` reject a Bcc
   line, more than one `To`/`Email` or `Cc` line, a malformed address (strict
   `BARE_EMAIL` anchor, no whitespace/CR-LF/angle-bracket chars — no header-
   injection surface), a duplicate CC, primary-recipient reuse in CC, and any
   CC list over 10 entries — all before `buildApprovedHandoff` can return a
   non-null result.
   (`src/approved-send-handoff.ts:106-149`)

2. **Approval-time and execution-time CC are the same deterministic
   function of the same stored card text.** `recordApproval` stores
   `approvedCc` from `buildApprovedHandoff(cardText)` at approval
   (`src/send-watchdog.ts:207-245`); `buildHostApprovedEmailExecution`
   re-parses the same `cardText` at execution and rejects on any hash,
   subject, recipient, or CC mismatch against the stored action row
   (`src/approved-email-execution.ts:77-116`). A Slack-edited card after
   approval fails closed here rather than silently sending drifted content.

3. **The IPC boundary enforces exact, ordered equality between what the
   calling tool claims and what the host stamped from the approved card,
   and only trusts the approved list when an Action-ID is present.**
   `verifyAdditionalRecipients` compares `recipients` (from `data.cc`) against
   `approved` (from `data.approvedCc`) by length and per-index value; any
   difference is rejected before Party/Gmail-envelope membership is ever
   consulted (`src/gmail-ipc-handlers.ts:283-333`). When `data.actionId` is
   absent, `approvedCc` is forced to `undefined`
   (`src/gmail-ipc-handlers.ts:481-483, 694-696`), so the existing Party
   allowlist governs CC exactly as required — an approved CC never leaks
   authority onto an unapproved request.

4. **An approved CC still passes a live deliverability check, independent of
   the equality check.** Even a CC that matches the approved list byte-for-
   byte goes through `checkRecipient` again (`src/gmail-ipc-handlers.ts:311-319`),
   confirmed by test: a reserved/placeholder address that equals the approved
   CC is still blocked (`src/gmail-ipc-handlers.test.ts:807-823`).

5. **The Gmail-thread-participant alias exception is scoped to the primary
   reply recipient only and never extended to CC or to standalone sends.**
   `verifyPartyRecipient`'s `allowApprovedThreadParticipantAlias` branch only
   ever widens the primary-recipient membership set
   (`src/gmail-ipc-handlers.ts:242-256`); CC verification always goes through
   `verifyAdditionalRecipients` with the approved-CC equality gate above.
   Tests confirm the alias exception does not apply to `gmail_send`
   (`src/gmail-ipc-handlers.test.ts:925-941`).

6. **Model drift and mailman verbatim-copy trust are structurally
   irrelevant to authority.** `buildHostApprovedEmailExecution` overwrites
   `payload.cc`/`payload.approvedCc` from the host-parsed `approved` object,
   discarding whatever the calling tool/model supplied
   (`src/approved-email-execution.ts:125-146`); this matches the documented
   contract that the host "ignores model drift in recipient, CC, subject,
   body, thread, Action-ID... and only then applies... approved-CC equality
   checks" (`groups/mailman/OUTBOUND-EMAIL.md:79-88`), and matches the sales
   producer contract restricting CC to sender-requested reply-all addresses
   from `Reply-All-Candidates` or exact Alex/Cherie-stated bare addresses,
   with explicit prohibition on name-to-address inference and on including
   the primary recipient (`groups/sales/WORKFLOWS.md:169-199`).

7. **Test-routing removes CC entirely rather than test-routing it,** so a
   sandboxed run cannot exercise the widened-CC path against a real address
   (`src/gmail-ipc-handlers.ts:588-615`, confirmed
   `src/gmail-ipc-handlers.test.ts:207-216, 943-968`).

## Scope note (not a finding)

Replay/one-time-claim enforcement (`findAction`/`markActionHandoff` atomic
claim, content-hash-keyed action lookup) lives in code this review was
directed not to inspect beyond `send-watchdog.ts`'s call sites, which
delegate the actual store/claim semantics elsewhere. Nothing observed in the
in-scope files bypasses that claim before a Gmail call. `rescueUnhandedSends`
(`src/send-watchdog.ts:536-639`) checks only recipient equality against the
freshly re-parsed card before emitting a host-authored handoff, not CC
equality — but that handoff still passes through the same
`buildHostApprovedEmailExecution` hash/CC equality gate before Gmail is ever
called, so a card edited between approval and rescue fails closed rather than
sending a widened CC.
