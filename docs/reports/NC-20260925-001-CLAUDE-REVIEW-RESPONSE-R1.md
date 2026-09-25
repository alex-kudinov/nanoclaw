# NC-20260925-001 narrow recipient-boundary review — response

## Verdict

PASS

## Reasoning

The patch's alias branch in `verifyPartyRecipient` only returns `ok: true` with
`partyId: null` when both `opts.allowApprovedThreadParticipantAlias` is true
**and** `checkRecipient(to, new Set([normalizeRecipient(to)]))` succeeds — a
singleton self-check that still rejects reserved/placeholder domains. This
diff does not show the call site that computes
`allowApprovedThreadParticipantAlias`, but the three new/changed tests
exercise the real, unmocked `handleGmailReply` and confirm the exact boundary
the question asks about:

- Exact action-ID + matching Gmail-derived/approved recipient → single
  `replyToThread` call, `onSendConfirmed` fires with the correct recipient,
  message is stored once.
- Missing action-ID, or an action-ID whose approved recipient does not match
  the Gmail-derived `to` → blocked before the alias branch can apply ("no
  host-resolved party" / "does not match approved recipient"), no interaction
  logged.
- A reserved/placeholder Gmail-derived address, even with a matching
  action-ID → blocked by the singleton `checkRecipient` domain check.

`handleGmailSend` is explicitly hardened in the same diff to reject
`partyId === null`, so the alias exception cannot be reached from a
standalone send — only from a reply already bound to a durable, host-claimed
action and thread. No dedup/claim logic is touched by this diff (that lives
upstream in `ipc.ts`, already verified), so no duplicate-send path is
introduced. The null-party skip of `logOutboundEmailInteraction` (replaced
with a `logger.warn`) does not gate `onSendConfirmed` or `storeMessageDirect`,
so there is no post-Gmail receipt failure — confirmation and storage still
happen unconditionally on send success.

No material counterexample found. No correction required.
