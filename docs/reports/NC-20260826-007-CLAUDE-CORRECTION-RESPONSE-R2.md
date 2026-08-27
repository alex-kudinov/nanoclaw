# NC-20260826-007 bounded enforcement correction review R2 — response

NO MATERIAL FINDINGS.

## Invariants checked

1. **`approvalCardSemanticIssue` parses only the structured header, bounded by
   the first `DRAFT_HEADING`/`FENCE` line** (`src/approved-send-handoff.ts:59-90`,
   `:63-67`). Customer draft body text after that boundary is never scanned for
   `Route:` lines, so an approved/quoted customer message cannot forge a route
   directive into the semantic check.

2. **Three invalid combinations are rejected, and only those three:**
   - `[SALES REVIEW]` + any `Route: SERVICE` line → rejected
     (`approved-send-handoff.ts:73-76`).
   - `[SALES REVIEW]` with no numeric `Lead #` → rejected (`:77-79`).
   - `[CLIENT SUPPORT REVIEW]` without exactly one `Route: SERVICE` line →
     rejected (`:82-87`).
   `[SUPPORT-DRAFT]` and `[FOLLOW-UP #N]` markers never match either literal
   compared string (`marker === '[SALES REVIEW]'` /
   `marker === '[CLIENT SUPPORT REVIEW]'`), so both remain exempt exactly per
   accepted boundary 3. Confirmed by
   `send-watchdog.test.ts:166-171` (`SUPPORT-DRAFT`/`CLIENT SUPPORT REVIEW`
   tracked) and `send-watchdog.test.ts:279-295` (`SUPPORT-DRAFT` with no Route
   line arms cleanly).

3. **All three enforcing boundaries call the same function and fail closed
   identically:**
   - IPC admission — `ipc.ts:602-638` rejects before the card ever reaches
     Slack, quarantines the file, and returns a `[approval_card REJECTED]`
     input to the source container without unlinking the card content into any
     other message.
   - Slack defense-in-depth — `slack.ts:1093,1115-1121` recomputes
     `approvalCardSemanticIssue` on every `sendMessageRouted` call (the single
     path all outbound text — new, retried, or queue-flushed — passes through),
     so a card that bypassed IPC admission (e.g. a host-side reaction/approval
     call) is still caught before `chat.postMessage`.
   - Approval arming — `send-watchdog.ts:196-197` (`recordApproval`) and
     `:250-273` (`observeApprovalCard`) refuse to mint a `PendingSend`/action
     for a semantically invalid card and post the same rejection text, so a
     ✅ on an existing or split Slack card cannot arm a send action even if it
     slipped past the earlier two gates.
   Each boundary's rejection substitutes `approvalCardRejectedText(...)` for
   the outbound text — the fenced draft/body is never included in the
   rejection message (verified: `slack.ts:1108-1129` builds `outboundText`
   from the reason string only, never from `parsedApprovalCard`).

4. **No path exposes customer body text or arms a send action on a rejected
   card.** Confirmed in both directions: `channels/slack.test.ts:2608-2640`
   (posted rejection excludes `'Exact support response.'`) and
   `ipc-handoff-echo.test.ts:408-444` (routed rejection excludes the same
   string, and the malformed/invalid file is quarantined, not delivered).
   `buildApprovedHandoff` remains reachable for historical/execution
   rehydration independent of the semantic gate (`approved-send-handoff.test.ts:26-42`
   shows a semantically-invalid card still parses via `buildApprovedHandoff`
   for reconciliation, per accepted boundary 4).

5. **Tests are sufficient at each boundary for the two documented invalid
   combinations that caused the live canary** (`Route: SERVICE` mislabeled as
   `[SALES REVIEW]`): unit (`approved-send-handoff.test.ts:26-55`), IPC
   admission (`ipc-handoff-echo.test.ts:408-444`), Slack defense-in-depth
   (`channels/slack.test.ts:2608-2640`), and arming
   (`send-watchdog.test.ts:269-277`). The third combination (`[CLIENT SUPPORT
   REVIEW]` without exactly one `Route: SERVICE`) has unit coverage
   (`approved-send-handoff.test.ts:44-55`) but no corresponding IPC/Slack/arming
   integration test — not a defect, since all three boundaries call the same
   shared function already exercised end-to-end for the sibling combination,
   but noted for completeness since it is the one accepted-boundary case
   without integration-level coverage.

No database, Gmail, permission, schema, credential, customer-send, approval,
or Relationship Context change was found or made. No implementation, test,
prompt, or other doc was edited during this review.
